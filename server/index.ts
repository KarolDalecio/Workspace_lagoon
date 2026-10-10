import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import {
  applyEdit,
  createDefaultMap,
  isDesk,
  isGameMap,
  isWalkable,
  parseKey,
  tileKey,
  type GameMap,
} from '../shared/map';
import { canHear } from '../shared/proximity';
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
const DATA_DIR = path.join(ROOT, 'data', 'spaces');

interface Space {
  players: Map<string, PlayerState>;
  chat: ChatMessage[];
  map: GameMap;
  saveTimer?: NodeJS.Timeout;
}

const spaces = new Map<string, Space>();
mkdirSync(DATA_DIR, { recursive: true });

/** Cada quadro branco ganha uma sala própria do Excalidraw (colaborativa). */
function excalidrawRoom() {
  return `https://excalidraw.com/#room=${randomBytes(10).toString('hex')},${randomBytes(16).toString('base64url').slice(0, 22)}`;
}

function newSpaceMap() {
  const map = createDefaultMap();
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (map.objects[y][x] !== 'whiteboard') continue;
      // Tiles vizinhos do mesmo quadro compartilham a mesma sala.
      const left = map.interactions[tileKey(x - 1, y)];
      map.interactions[tileKey(x, y)] =
        map.objects[y][x - 1] === 'whiteboard' && left
          ? left
          : { kind: 'embed', title: 'Quadro branco', url: excalidrawRoom() };
    }
  return map;
}

function mapFile(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

function loadMap(id: string): GameMap {
  try {
    const data = JSON.parse(readFileSync(mapFile(id), 'utf8'));
    if (isGameMap(data)) return data;
  } catch {
    // espaço novo
  }
  return newSpaceMap();
}

function scheduleSave(id: string, space: Space) {
  clearTimeout(space.saveTimer);
  space.saveTimer = setTimeout(() => {
    space.saveTimer = undefined;
    try {
      writeFileSync(mapFile(id), JSON.stringify(space.map));
    } catch (err) {
      console.error('Falha ao salvar mapa', id, err);
    }
  }, 1000);
}

function getSpace(id: string) {
  let s = spaces.get(id);
  if (!s) {
    s = { players: new Map(), chat: [], map: loadMap(id) };
    spaces.set(id, s);
  }
  return s;
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

function findSpawn(space: Space) {
  const { map } = space;
  const { x, y, w, h } = map.spawn;
  const occupied = new Set([...space.players.values()].map(p => tileKey(p.x, p.y)));
  const free: { x: number; y: number }[] = [];
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) if (isWalkable(map, xx, yy) && !occupied.has(tileKey(xx, yy))) free.push({ x: xx, y: yy });
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  for (let yy = 0; yy < map.height; yy++) for (let xx = 0; xx < map.width; xx++) if (isWalkable(map, xx, yy)) return { x: xx, y: yy };
  return { x: 0, y: 0 };
}

const app = express();
const server = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(server, { cors: { origin: true }, maxHttpBufferSize: 1e6 });

const dist = path.join(ROOT, 'dist');
app.get('/health', (_req, res) => {
  res.json({ ok: true, spaces: spaces.size });
});
app.use(express.static(dist));
app.get('*', (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => err && next()));

io.on('connection', socket => {
  let spaceId: string | null = null;
  let ownerTag = '';
  const current = () => (spaceId ? spaces.get(spaceId) : undefined);
  const me = () => current()?.players.get(socket.id);

  socket.on('join', (req, ack) => {
    if (spaceId || typeof ack !== 'function') return;
    spaceId = cleanSpaceId(req?.space);
    ownerTag = ownerTagFor(req?.clientKey);
    const space = getSpace(spaceId);
    const pos = findSpawn(space);
    const player: PlayerState = {
      id: socket.id,
      name: cleanText(req?.name, 24) || 'Convidado',
      avatar: cleanAvatar(req?.avatar),
      x: pos.x,
      y: pos.y,
      dir: 'down',
      audio: !!req?.audio,
      video: !!req?.video,
      action: null,
    };
    space.players.set(socket.id, player);
    socket.join(spaceId);
    ack({
      selfId: socket.id,
      space: spaceId,
      players: [...space.players.values()],
      chat: space.chat,
      map: space.map,
      ownerTag,
    });
    socket.to(spaceId).emit('player:joined', player);
  });

  socket.on('move', m => {
    const p = me();
    const space = current();
    if (!p || !space || !spaceId || !m) return;
    const { x, y, dir } = m;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !DIRS.has(dir)) return;
    const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (dist > 1 || (dist === 1 && !isWalkable(space.map, x, y))) {
      socket.emit('player:moved', { id: p.id, x: p.x, y: p.y, dir: p.dir });
      return;
    }
    p.x = x;
    p.y = y;
    p.dir = dir;
    socket.to(spaceId).emit('player:moved', { id: p.id, x, y, dir });
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

  socket.on('map:edit', edit => {
    const space = current();
    if (!space || !spaceId || !me()) return;
    const claimsBefore = JSON.stringify(space.map.claims);
    const applied = applyEdit(space.map, edit);
    if (!applied) {
      socket.emit('map:replaced', space.map); // cliente aplicou algo inválido: ressincroniza
      return;
    }
    socket.to(spaceId).emit('map:edited', applied);
    if (JSON.stringify(space.map.claims) !== claimsBefore) io.to(spaceId).emit('map:claims', space.map.claims);
    scheduleSave(spaceId, space);
  });

  socket.on('map:reset', () => {
    const space = current();
    if (!space || !spaceId || !me()) return;
    space.map = newSpaceMap();
    io.to(spaceId).emit('map:replaced', space.map);
    scheduleSave(spaceId, space);
  });

  socket.on('desk:claim', key => {
    const p = me();
    const space = current();
    if (!p || !space || !spaceId || typeof key !== 'string') return;
    const { x, y } = parseKey(key);
    const k = tileKey(x, y);
    const taken = space.map.claims[k];
    if (!isDesk(space.map, x, y) || (taken && taken.owner !== ownerTag)) {
      socket.emit('map:claims', space.map.claims);
      return;
    }
    // Uma mesa por pessoa: ocupar outra libera a anterior.
    for (const [ck, c] of Object.entries(space.map.claims)) if (c.owner === ownerTag) delete space.map.claims[ck];
    space.map.claims[k] = { owner: ownerTag, name: p.name };
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

server.listen(PORT, () => {
  console.log(`Praça rodando em http://localhost:${PORT}`);
});
