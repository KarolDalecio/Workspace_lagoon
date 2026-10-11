import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import {
  applyEdit,
  areaAt,
  claimKey,
  cleanRoom,
  createDefaultMap,
  deskAreaAt,
  editDenied,
  isAllowed,
  isSpaceMap,
  isWalkable,
  lockedAgainst,
  migrateMap,
  spawnTiles,
  tileKey,
  type AreaMeta,
  type MapEdit,
  type Room,
  type SpaceMap,
} from '../shared/map';
import { canHear } from '../shared/proximity';
import { createStore } from './store';
import {
  AVATAR_OPTIONS,
  EMOTES,
  PLAYER_ACTIONS,
  type Avatar,
  type ChatMessage,
  type ClientToServer,
  type Dir,
  type PlayerState,
  type ServerToClient,
} from '../shared/types';

// Em dev a API fica fixa na 3001 (o Vite faz proxy); em produção respeita $PORT.
const PORT = process.argv.includes('--dev') ? 3001 : Number(process.env.PORT ?? 3001);
const CHAT_HISTORY = 100;
const DIRS = new Set<Dir>(['up', 'down', 'left', 'right']);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

interface Space {
  players: Map<string, PlayerState>;
  chat: ChatMessage[];
  map: SpaceMap;
  saveTimer?: NodeJS.Timeout;
}

const spaces = new Map<string, Space>();
/** Carregamentos em andamento, para dois joins simultâneos não lerem o banco duas vezes. */
const loading = new Map<string, Promise<Space>>();
const store = createStore(ROOT);

/** Cada quadro branco sem endereço ganha uma sala própria do Excalidraw (colaborativa). */
function excalidrawRoom() {
  return `https://excalidraw.com/#room=${randomBytes(10).toString('hex')},${randomBytes(16).toString('base64url').slice(0, 22)}`;
}

function fillWhiteboards(room: Room) {
  for (const o of room.objects)
    if (o.type === 'whiteboard' && o.interaction?.kind === 'embed' && !o.interaction.url) o.interaction.url = excalidrawRoom();
  return room;
}

function newSpaceMap() {
  const map = createDefaultMap();
  Object.values(map.rooms).forEach(fillWhiteboards);
  return map;
}

/** Sanitiza um mapa salvo; se não der para aproveitar, começa do mapa padrão. */
function restoreMap(data: unknown): SpaceMap {
  try {
    if (isSpaceMap(data)) {
      const rooms: SpaceMap['rooms'] = {};
      for (const rid of data.order) {
        const room = cleanRoom(data.rooms[rid]);
        if (room) rooms[room.id] = room;
      }
      if (rooms[data.entry])
        return {
          rooms,
          order: data.order.filter(r => rooms[r]),
          entry: data.entry,
          claims: data.claims ?? {},
          version: Number.isInteger(data.version) ? data.version : 1,
        };
    }
  } catch {
    // formato inválido
  }
  return newSpaceMap();
}

function scheduleSave(id: string, space: Space) {
  clearTimeout(space.saveTimer);
  space.saveTimer = setTimeout(() => {
    space.saveTimer = undefined;
    store.saveSpace(id, space.map, space.chat).catch(err => console.error('Falha ao salvar espaço', id, err));
  }, 1000);
}

async function getSpace(id: string): Promise<Space> {
  const loaded = spaces.get(id);
  if (loaded) return loaded;
  let pending = loading.get(id);
  if (!pending) {
    pending = store
      .loadSpace(id)
      .then(saved => {
        const space: Space = { players: new Map(), chat: saved?.chat.slice(-CHAT_HISTORY) ?? [], map: restoreMap(saved?.map) };
        spaces.set(id, space);
        if (migrateMap(space.map) && saved) {
          console.log(`Espaço "${id}" migrado para a versão ${space.map.version}`);
          scheduleSave(id, space);
        }
        return space;
      })
      .finally(() => loading.delete(id));
    loading.set(id, pending);
  }
  return pending;
}

function cleanText(v: unknown, max: number) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanSpaceId(v: unknown) {
  const id = cleanText(v, 40).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return id || 'principal';
}

function pick(list: string[], v: unknown) {
  return typeof v === 'string' && list.includes(v) ? v : list[0];
}

function cleanAvatar(a: Partial<Avatar> | undefined): Avatar {
  const style = Number(a?.hairStyle);
  return {
    skin: pick(AVATAR_OPTIONS.skin, a?.skin),
    hair: pick(AVATAR_OPTIONS.hair, a?.hair),
    shirt: pick(AVATAR_OPTIONS.shirt, a?.shirt),
    hairStyle: Number.isInteger(style) && style >= 0 && style < AVATAR_OPTIONS.hairStyles ? style : 0,
  };
}

/** Hash público da chave do navegador: identifica o dono da mesa sem expor a chave. */
function ownerTagFor(clientKey: unknown) {
  const key = typeof clientKey === 'string' && clientKey.length >= 16 ? clientKey.slice(0, 100) : randomUUID();
  return createHash('sha256').update(key).digest('base64url').slice(0, 16);
}

/** Tile livre de Entrada na sala; sem Entrada, qualquer tile caminhável. Nunca dentro de área trancada. */
function findSpawn(space: Space, roomId: string) {
  const room = space.map.rooms[roomId];
  const occupied = new Set([...space.players.values()].filter(p => p.room === roomId).map(p => tileKey(p.x, p.y)));
  const open = (x: number, y: number) => isWalkable(room, x, y) && !room.areaMeta[areaAt(room, x, y) ?? '']?.locked;
  const spawns = spawnTiles(room).filter(t => open(t.x, t.y));
  const free = spawns.filter(t => !occupied.has(tileKey(t.x, t.y)));
  const pool = free.length ? free : spawns;
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) if (open(x, y)) return { x, y };
  return { x: 0, y: 0 };
}

/** Preserva os quadros do Excalidraw (o desenho fica no link) ao restaurar o mapa. */
function keepWhiteboards(from: SpaceMap, to: SpaceMap) {
  for (const room of Object.values(to.rooms)) {
    const old = from.rooms[room.id];
    if (!old) continue;
    for (const o of room.objects) {
      if (o.type !== 'whiteboard' || o.interaction?.kind !== 'embed') continue;
      const prev = old.objects.find(p => p.type === 'whiteboard' && p.x === o.x && p.y === o.y && p.interaction?.url);
      if (prev?.interaction?.url) o.interaction.url = prev.interaction.url;
    }
  }
}

const app = express();
const server = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(server, { cors: { origin: true }, maxHttpBufferSize: 5e6 });

const dist = path.join(ROOT, 'dist');
app.get('/health', (_req, res) => {
  res.json({ ok: true, storage: store.kind, spaces: spaces.size });
});

/** Envio de imagens (fundo/primeiro plano das salas e interações de imagem), até 3 MB. */
app.post('/api/upload', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '3mb' }), async (req, res) => {
  const ext = IMAGE_TYPES[String(req.headers['content-type'])];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
    res.status(400).json({ error: 'Envie uma imagem PNG, JPG, GIF ou WEBP de até 3 MB.' });
    return;
  }
  const name = `${randomUUID()}.${ext}`;
  try {
    await store.saveUpload(name, String(req.headers['content-type']), req.body);
    res.json({ url: `/uploads/${name}` });
  } catch (err) {
    console.error('Falha ao salvar upload', err);
    res.status(500).json({ error: 'Não foi possível salvar a imagem.' });
  }
});
app.get('/uploads/:name', async (req, res) => {
  const upload = /^[\w-]+\.(png|jpg|gif|webp)$/.test(req.params.name) ? await store.getUpload(req.params.name).catch(() => null) : null;
  if (!upload) {
    res.sendStatus(404);
    return;
  }
  res.set({ 'Content-Type': upload.mime, 'Cache-Control': 'public, max-age=2592000, immutable' }).send(upload.data);
});
app.use(express.static(dist));
app.get('*', (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => err && next()));

io.on('connection', socket => {
  let spaceId: string | null = null;
  let ownerTag = '';
  const current = () => (spaceId ? spaces.get(spaceId) : undefined);
  const me = () => current()?.players.get(socket.id);
  const who = () => ({ tag: ownerTag, name: me()?.name ?? '' });

  /**
   * Primeira entrada numa área reservada pelo nome: a vaga passa a ser deste navegador
   * (depois disso, outra pessoa com o mesmo nome não entra).
   */
  function bindReservation(space: Space, p: PlayerState) {
    const room = space.map.rooms[p.room];
    const here = room && areaAt(room, p.x, p.y);
    const pending = (m: AreaMeta | undefined) =>
      m?.locked ? (m.allowed ?? []).findIndex(a => !a.tag && a.name.toLowerCase() === p.name.trim().toLowerCase()) : -1;
    if (!here || pending(room.areaMeta[here]) < 0) return;
    // A reserva pelo nome vale para todas as áreas trancadas do espaço: prende todas a este navegador.
    for (const r of Object.values(space.map.rooms))
      for (const [area, m] of Object.entries(r.areaMeta)) {
        const k = pending(m);
        if (k < 0) continue;
        const allowed = m.allowed!.map((a, j) => (j === k ? { ...a, tag: ownerTag } : a));
        const applied = applyEdit(space.map, { kind: 'area-meta', room: r.id, name: area, meta: { ...m, allowed } });
        if (applied) io.to(spaceId!).emit('map:edited', applied.op);
      }
    scheduleSave(spaceId!, space);
  }

  /** Tira de áreas trancadas quem perdeu o acesso (ex.: alguém trancou com a pessoa dentro). */
  function evictLocked(space: Space) {
    for (const p of space.players.values()) {
      const room = space.map.rooms[p.room];
      if (room && lockedAgainst(room, p.x, p.y, { tag: p.tag, name: p.name })) {
        relocate(space, p, p.room);
        io.to(p.id).emit('notice', 'Esta área foi trancada — você foi levado para a entrada.');
      }
    }
  }

  /** Leva alguém para outra sala (portal, ou sala apagada) e avisa todos. */
  function relocate(space: Space, p: PlayerState, roomId: string, x?: number, y?: number) {
    const pos = x !== undefined && y !== undefined ? { x, y } : findSpawn(space, roomId);
    p.room = roomId;
    p.x = pos.x;
    p.y = pos.y;
    io.to(spaceId!).emit('player:moved', { id: p.id, room: p.room, x: p.x, y: p.y, dir: p.dir });
  }

  socket.on('join', async (req, ack) => {
    if (spaceId || typeof ack !== 'function') return;
    const id = cleanSpaceId(req?.space);
    let space: Space;
    try {
      space = await getSpace(id);
    } catch (err) {
      console.error('Falha ao carregar espaço', id, err);
      socket.disconnect();
      return;
    }
    if (spaceId || !socket.connected) return;
    spaceId = id;
    ownerTag = ownerTagFor(req?.clientKey);
    const room = space.map.entry;
    const pos = findSpawn(space, room);
    const player: PlayerState = {
      id: socket.id,
      name: cleanText(req?.name, 24) || 'Convidado',
      avatar: cleanAvatar(req?.avatar),
      room,
      tag: ownerTag,
      x: pos.x,
      y: pos.y,
      dir: 'down',
      audio: !!req?.audio,
      video: !!req?.video,
      action: null,
    };
    space.players.set(socket.id, player);
    socket.join(spaceId);
    ack({ selfId: socket.id, space: spaceId, players: [...space.players.values()], chat: space.chat, map: space.map, ownerTag });
    socket.to(spaceId).emit('player:joined', player);
  });

  socket.on('move', m => {
    const p = me();
    const space = current();
    if (!p || !space || !spaceId || !m) return;
    const room = space.map.rooms[p.room];
    const { x, y, dir } = m;
    if (!room || !Number.isInteger(x) || !Number.isInteger(y) || !DIRS.has(dir)) return;
    const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (dist > 1 || (dist === 1 && !isWalkable(room, x, y))) {
      socket.emit('player:moved', { id: p.id, room: p.room, x: p.x, y: p.y, dir: p.dir });
      return;
    }
    const locked = dist === 1 ? lockedAgainst(room, x, y, who()) : null;
    if (locked) {
      socket.emit('player:moved', { id: p.id, room: p.room, x: p.x, y: p.y, dir: p.dir });
      socket.emit('notice', `🔒 "${locked}" está trancada.`);
      return;
    }
    p.dir = dir;
    // Portal: só dispara ao pisar nele (chegar num portal pelo outro lado não te manda de volta).
    const portal = dist === 1 ? room.portals[tileKey(x, y)] : undefined;
    if (portal && space.map.rooms[portal.room]) {
      const lockedDest = lockedAgainst(space.map.rooms[portal.room], portal.x, portal.y, who());
      if (lockedDest) {
        socket.emit('player:moved', { id: p.id, room: p.room, x: p.x, y: p.y, dir: p.dir });
        socket.emit('notice', `🔒 O portal leva para "${lockedDest}", que está trancada.`);
        return;
      }
      relocate(space, p, portal.room, portal.x, portal.y);
      bindReservation(space, p);
      return;
    }
    p.x = x;
    p.y = y;
    socket.to(spaceId).emit('player:moved', { id: p.id, room: p.room, x, y, dir });
    bindReservation(space, p);
  });

  socket.on('chat', m => {
    const p = me();
    const space = current();
    const text = cleanText(m?.text, 500);
    if (!p || !space || !spaceId || !text) return;
    const msg: ChatMessage = {
      id: randomUUID(),
      from: p.id,
      name: p.name,
      text,
      ts: Date.now(),
      scope: m.scope === 'nearby' ? 'nearby' : 'everyone',
    };
    if (msg.scope === 'everyone') {
      space.chat.push(msg);
      if (space.chat.length > CHAT_HISTORY) space.chat.shift();
      scheduleSave(spaceId, space);
      io.to(spaceId).emit('chat:message', msg);
    } else {
      for (const other of space.players.values())
        if (other.id === p.id || canHear(space.map, p, other)) io.to(other.id).emit('chat:message', msg);
    }
  });

  socket.on('emote', emoji => {
    const p = me();
    if (p && spaceId && EMOTES.includes(emoji)) socket.to(spaceId).emit('emote', { id: p.id, emoji });
  });

  socket.on('media', m => {
    const p = me();
    if (!p || !spaceId) return;
    p.audio = !!m?.audio;
    p.video = !!m?.video;
    socket.to(spaceId).emit('player:updated', { id: p.id, audio: p.audio, video: p.video });
  });

  socket.on('action', a => {
    const p = me();
    if (!p || !spaceId) return;
    p.action = a && PLAYER_ACTIONS.includes(a) ? a : null;
    socket.to(spaceId).emit('player:updated', { id: p.id, action: p.action });
  });

  socket.on('map:edit', (edit: MapEdit) => {
    const space = current();
    if (!space || !spaceId || !me()) return;
    const denied = editDenied(space.map, edit, who());
    if (denied) {
      socket.emit('notice', `🔒 ${denied}`);
      socket.emit('map:replaced', space.map);
      return;
    }
    const claimsBefore = JSON.stringify(space.map.claims);
    const applied = applyEdit(space.map, edit);
    if (!applied) {
      socket.emit('map:replaced', space.map); // cliente aplicou algo inválido: ressincroniza
      return;
    }
    socket.to(spaceId).emit('map:edited', applied.op);
    if (JSON.stringify(space.map.claims) !== claimsBefore) io.to(spaceId).emit('map:claims', space.map.claims);
    // Quem estava numa sala apagada volta para a entrada.
    for (const p of space.players.values()) if (!space.map.rooms[p.room]) relocate(space, p, space.map.entry);
    evictLocked(space);
    scheduleSave(spaceId, space);
  });

  socket.on('map:reset', () => {
    const space = current();
    if (!space || !spaceId || !me()) return;
    const blocked = Object.values(space.map.rooms).some(r => Object.values(r.areaMeta).some(m => !isAllowed(m, who())));
    if (blocked) {
      socket.emit('notice', '🔒 Só quem tem acesso a todas as áreas trancadas pode restaurar o mapa.');
      return;
    }
    const next = newSpaceMap();
    keepWhiteboards(space.map, next);
    space.map = next;
    io.to(spaceId).emit('map:replaced', space.map);
    for (const p of space.players.values()) relocate(space, p, space.map.entry);
    scheduleSave(spaceId, space);
  });

  socket.on('desk:claim', area => {
    const p = me();
    const space = current();
    if (!p || !space || !spaceId || typeof area !== 'string') return;
    const room = space.map.rooms[p.room];
    // Só dá para ocupar a mesa em que você está.
    if (!room || deskAreaAt(room, p.x, p.y) !== area) {
      socket.emit('map:claims', space.map.claims);
      return;
    }
    const key = claimKey(room.id, area);
    const taken = space.map.claims[key];
    if (taken && taken.owner !== ownerTag) {
      socket.emit('map:claims', space.map.claims);
      return;
    }
    // Uma mesa por pessoa: ocupar outra libera a anterior.
    for (const [ck, c] of Object.entries(space.map.claims)) if (c.owner === ownerTag) delete space.map.claims[ck];
    space.map.claims[key] = { owner: ownerTag, name: p.name };
    io.to(spaceId).emit('map:claims', space.map.claims);
    scheduleSave(spaceId, space);
  });

  socket.on('desk:release', () => {
    const space = current();
    if (!space || !spaceId) return;
    for (const [ck, c] of Object.entries(space.map.claims)) if (c.owner === ownerTag) delete space.map.claims[ck];
    io.to(spaceId).emit('map:claims', space.map.claims);
    scheduleSave(spaceId, space);
  });

  socket.on('rtc:signal', s => {
    const space = current();
    if (!space || !s || typeof s.to !== 'string' || !space.players.has(s.to)) return;
    io.to(s.to).emit('rtc:signal', { from: socket.id, data: s.data });
  });

  socket.on('disconnect', () => {
    const space = current();
    if (!space || !spaceId) return;
    space.players.delete(socket.id);
    io.to(spaceId).emit('player:left', socket.id);
    // O mapa fica salvo em disco; descarrega da memória só depois de gravar.
    if (!space.players.size && !space.chat.length && !space.saveTimer) spaces.delete(spaceId);
  });
});

store
  .init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Praça rodando em http://localhost:${PORT} (armazenamento: ${store.kind})`);
    });
  })
  .catch(err => {
    console.error('Não foi possível iniciar o armazenamento:', err);
    process.exit(1);
  });
