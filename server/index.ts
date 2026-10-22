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
  fullAgainst,
  isAllowed,
  isSpaceMap,
  isWalkable,
  lockedAgainst,
  migrateMap,
  objectAt,
  spawnTiles,
  tileKey,
  type AreaMeta,
  type MapEdit,
  type PlacedObject,
  type Room,
  type SpaceMap,
} from '../shared/map';
import { findPath, type Point } from '../shared/path';
import { canHear } from '../shared/proximity';
import { authMode, bearer, publicAuthConfig, verifyToken, type AuthUser } from './auth';
import { createStore, type SpaceMeta } from './store';
import {
  EMOTES,
  cleanAvatar,
  PLAYER_ACTIONS,
  type ChatMessage,
  type ClientToServer,
  type Dir,
  type Fx,
  type IceServer,
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
  meta: SpaceMeta;
  /** Vitrolas tocando: objeto → início (ms). */
  music: Map<string, number>;
  /** Contador de pescarias (define formato e cor do próximo peixe). */
  fishCount: number;
  saveTimer?: NodeJS.Timeout;
}

/**
 * STUN/TURN para o WebRTC. Sem TURN, conexões entre redes com CGNAT (comum em
 * internet residencial e 4G) podem não fechar e o áudio não chega.
 * ICE_SERVERS = JSON com a lista completa, ou TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL.
 */
function iceServers(): IceServer[] {
  const list: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  try {
    if (process.env.ICE_SERVERS) return JSON.parse(process.env.ICE_SERVERS);
  } catch {
    console.error('ICE_SERVERS não é um JSON válido; usando só STUN.');
  }
  const urls = process.env.TURN_URLS?.split(',').map(u => u.trim()).filter(Boolean);
  if (urls?.length) list.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return list;
}
const ICE = iceServers();
if (ICE.length === 1) console.warn('ℹ️  Sem TURN configurado: áudio/vídeo podem falhar entre redes com CGNAT. Veja TURN_URLS no README.');

const FISH_COLORS = ['#f0a73a', '#e5483a', '#3fb6d6', '#f4d35e', '#8c5bd6', '#2fb380', '#e86a8a', '#5b6ee1'];

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código curto e fácil de ditar (sem 0/O, 1/I/L). */
async function newCode() {
  for (;;) {
    const bytes = randomBytes(6);
    const code = [...bytes].map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
    if (!(await store.findSpaceByCode(code))) return code;
  }
}

/** Chave da pessoa para membros e perfis ("dev" quando o login está desligado). */
function personKey(user: AuthUser | undefined) {
  return user ? user.person.trim().toLowerCase() : 'dev';
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
    store.saveSpace(id, space.map, space.chat, space.meta).catch(err => console.error('Falha ao salvar espaço', id, err));
  }, 1000);
}

// ---------- Pets que passeiam (Hachi) ----------

const PET_STEP_MS = 380;
/** Descanso depois de cada passeio (~2 min, com uma variação para não parecer robô). */
const PET_REST_MS = () => 110_000 + Math.random() * 20_000;
const PET_WALK = 7;

interface PetState {
  path: Point[];
  restUntil: number;
}
const pets = new WeakMap<PlacedObject, PetState>();

/** Tiles onde o pet pode pisar: dentro da mesma área privada, sem água nem móveis (a caminha pode). */
function petCanStep(room: Room, area: string, dog: PlacedObject) {
  return (x: number, y: number) => {
    if (areaAt(room, x, y) !== area || room.floor[y]?.[x] === 'water') return false;
    const o = objectAt(room, x, y);
    return !o || o === dog || o.type === 'dogbed' || o.type === 'rug';
  };
}

function petTick(id: string, space: Space, now: number) {
  for (const room of Object.values(space.map.rooms))
    for (const dog of room.objects) {
      if (dog.type !== 'dog') continue;
      const area = areaAt(room, dog.x, dog.y);
      if (!area) continue; // só passeia dentro de uma sala (ex.: Sala do Guilherme)
      let st = pets.get(dog);
      if (!st) pets.set(dog, (st = { path: [], restUntil: now + 5_000 + Math.random() * 10_000 }));
      if (st.path.length === 0) {
        if (now < st.restUntil) continue;
        const canStep = petCanStep(room, area, dog);
        const bed = room.objects.find(o => o.type === 'dogbed' && areaAt(room, o.x, o.y) === area);
        // de vez em quando volta para a caminha; senão escolhe um lugar perto
        let target: Point | null = bed && Math.random() < 0.3 && (bed.x !== dog.x || bed.y !== dog.y) ? { x: bed.x, y: bed.y } : null;
        for (let tries = 0; !target && tries < 20; tries++) {
          const t = { x: dog.x + Math.round((Math.random() * 2 - 1) * PET_WALK), y: dog.y + Math.round((Math.random() * 2 - 1) * PET_WALK) };
          if ((t.x !== dog.x || t.y !== dog.y) && isWalkable(room, t.x, t.y) && canStep(t.x, t.y)) target = t;
        }
        st.path = target ? findPath(room, dog.x, dog.y, target.x, target.y, false, canStep).slice(0, PET_WALK * 2) : [];
        if (st.path.length === 0) st.restUntil = now + 15_000;
        continue;
      }
      const next = st.path.shift()!;
      if (!isWalkable(room, next.x, next.y) || areaAt(room, next.x, next.y) !== area) {
        st.path = [];
        st.restUntil = now + 15_000;
        continue;
      }
      // o cachorro só tem perfil para os lados: vira para onde está andando
      if (next.x !== dog.x) dog.rot = next.x > dog.x ? 1 : 3;
      dog.x = next.x;
      dog.y = next.y;
      io.to(id).emit('npc:move', { room: room.id, id: dog.id, x: dog.x, y: dog.y, rot: dog.rot });
      if (st.path.length === 0) {
        st.restUntil = now + PET_REST_MS();
        scheduleSave(id, space);
      }
    }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, space] of spaces) if (space.players.size > 0) petTick(id, space, now);
}, PET_STEP_MS).unref();

/**
 * Carrega um espaço. Se não existir, só cria quando `createAs` (nome) é passado;
 * senão retorna null (ninguém cria espaço só por digitar uma URL).
 */
async function getSpace(id: string, createAs?: string): Promise<Space | null> {
  const loaded = spaces.get(id);
  if (loaded) return loaded;
  let pending = loading.get(id);
  if (!pending) {
    pending = (async () => {
      const saved = await store.loadSpace(id);
      if (!saved && !createAs) return null as unknown as Space;
      const meta = saved?.meta ?? { name: createAs ?? id, code: await newCode() };
      const space: Space = {
        players: new Map(),
        chat: saved?.chat.slice(-CHAT_HISTORY) ?? [],
        map: restoreMap(saved?.map),
        meta,
        music: new Map(),
        fishCount: 0,
      };
      spaces.set(id, space);
      const migrated = saved ? migrateMap(space.map) : false;
      if (migrated) {
        Object.values(space.map.rooms).forEach(fillWhiteboards);
        console.log(`Espaço "${id}" migrado para a versão ${space.map.version}`);
      }
      // Espaço novo ou antigo sem nome/código: grava na hora (o código já precisa ser encontrável).
      if (!saved || !saved.meta) await store.saveSpace(id, space.map, space.chat, space.meta);
      else if (migrated) scheduleSave(id, space);
      return space;
    })().finally(() => loading.delete(id));
    loading.set(id, pending);
  }
  return (await pending) ?? null;
}

/** Login da requisição HTTP (ou a pessoa "dev" quando o login está desligado). */
async function requireUser(req: express.Request, res: express.Response) {
  if (authMode === 'disabled') return { person: 'dev', user: undefined as AuthUser | undefined };
  if (authMode === 'misconfigured') {
    res.status(503).json({ error: 'Login não configurado.' });
    return null;
  }
  const user = await verifyToken(bearer(req.headers.authorization));
  if (!user) {
    res.status(401).json({ error: 'Faça login.' });
    return null;
  }
  return { person: personKey(user), user };
}

function cleanText(v: unknown, max: number) {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanSpaceId(v: unknown) {
  const id = cleanText(v, 40).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return id || 'principal';
}

/** Hash público da chave do navegador: identifica o dono da mesa sem expor a chave. */
function ownerTagFor(clientKey: unknown) {
  const key = typeof clientKey === 'string' && clientKey.length >= 16 ? clientKey.slice(0, 100) : randomUUID();
  return createHash('sha256').update(key).digest('base64url').slice(0, 16);
}

/** Com login, a identidade é a pessoa (as várias contas dela compartilham salas e mesa). */
function personTag(person: string) {
  return createHash('sha256').update(`person:${person.trim().toLowerCase()}`).digest('base64url').slice(0, 16);
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

// Express 4 não trata erros de rotas async: sem isto, uma falha no banco deixa a
// requisição sem resposta (ou derruba o processo). Encaminha para o handler de erro.
for (const method of ['get', 'post', 'put', 'delete'] as const) {
  const original = app[method].bind(app) as (...args: unknown[]) => unknown;
  (app as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
    if (args.length < 2) return original(...args); // app.get('setting')
    return original(
      ...args.map(h =>
        typeof h === 'function' && h.length < 4
          ? (req: express.Request, res: express.Response, next: express.NextFunction) => {
              try {
                const out = h(req, res, next);
                if (out && typeof (out as Promise<unknown>).catch === 'function') (out as Promise<unknown>).catch(next);
              } catch (err) {
                next(err);
              }
            }
          : h,
      ),
    );
  };
}
process.on('unhandledRejection', err => console.error('Erro não tratado:', err));
const server = createServer(app);
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, { user?: AuthUser }>(server, {
  cors: { origin: true },
  maxHttpBufferSize: 5e6,
});

/** Só entra no espaço quem tem login válido e está na lista (quando o login está ativo). */
io.use(async (socket, next) => {
  if (authMode === 'disabled') return next();
  if (authMode === 'misconfigured') return next(new Error('auth-misconfigured'));
  const user = await verifyToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = user;
  next();
});

app.get('/api/config', (_req, res) => {
  res.json(publicAuthConfig());
});

app.get('/api/me', async (req, res) => {
  if (authMode === 'disabled') {
    res.json({ auth: 'disabled', avatar: await store.loadProfile('dev') });
    return;
  }
  const user = await verifyToken(bearer(req.headers.authorization));
  if (!user) {
    res.status(401).json({ error: 'Acesso não autorizado para este e-mail.' });
    return;
  }
  // Sem conseguir ler o avatar no banco, a pessoa ainda entra (com o avatar local).
  const avatar = await store.loadProfile(personKey(user)).catch(err => {
    console.error('Falha ao carregar perfil', err);
    return null;
  });
  res.json({ ...user, avatar });
});

app.put('/api/me/avatar', express.json({ limit: '10kb' }), async (req, res) => {
  const who = await requireUser(req, res);
  if (!who) return;
  const avatar = cleanAvatar(req.body?.avatar);
  await store.saveProfile(who.person, avatar);
  res.json({ avatar });
});

/** Espaços visitados recentemente pela pessoa (com quantos estão online agora). */
app.get('/api/spaces', async (req, res) => {
  const who = await requireUser(req, res);
  if (!who) return;
  const list = await store.listMemberships(who.person);
  res.json(list.map(m => ({ id: m.spaceId, name: m.name, code: m.code, lastVisited: m.lastVisited, online: spaces.get(m.spaceId)?.players.size ?? 0 })));
});

/** Cria um espaço novo (com o escritório padrão) e já torna a pessoa membro. */
app.post('/api/spaces', express.json({ limit: '10kb' }), async (req, res) => {
  const who = await requireUser(req, res);
  if (!who) return;
  const name = cleanText(req.body?.name, 40);
  if (!name) {
    res.status(400).json({ error: 'Dê um nome ao espaço.' });
    return;
  }
  const slug = cleanSpaceId(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')).slice(0, 28);
  const id = `${slug}-${randomBytes(3).toString('hex')}`;
  const space = await getSpace(id, name);
  await store.touchMembership(who.person, id);
  res.json({ id, name: space!.meta.name, code: space!.meta.code });
});

/** Entrar com código: descobre o espaço e torna a pessoa membro. */
app.post('/api/spaces/join', express.json({ limit: '1kb' }), async (req, res) => {
  const who = await requireUser(req, res);
  if (!who) return;
  const code = cleanText(req.body?.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const id = code ? ([...spaces.entries()].find(([, s]) => s.meta.code === code)?.[0] ?? (await store.findSpaceByCode(code))) : null;
  const space = id ? await getSpace(id) : null;
  if (!id || !space) {
    res.status(404).json({ error: 'Nenhum espaço com esse código.' });
    return;
  }
  await store.touchMembership(who.person, id);
  res.json({ id, name: space.meta.name, code: space.meta.code });
});

const dist = path.join(ROOT, 'dist');
app.get('/health', async (_req, res) => {
  const database = await Promise.race([store.ping(), new Promise<boolean>(r => setTimeout(() => r(false), 4000))]);
  res.json({ ok: database, storage: store.kind, persistent: store.persistent, database, spaces: spaces.size, uptime: Math.round(process.uptime()) });
});

/** Envio de imagens (fundo/primeiro plano das salas e interações de imagem), até 3 MB. */
app.post('/api/upload', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '3mb' }), async (req, res) => {
  if (authMode !== 'disabled' && !(await verifyToken(bearer(req.headers.authorization)))) {
    res.status(401).json({ error: 'Faça login para enviar imagens.' });
    return;
  }
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
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Erro na requisição:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Erro interno no servidor.' });
});

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

  /** Desce do patinete: ele fica estacionado onde a pessoa está. */
  function parkVehicle(space: Space, p: PlayerState) {
    const v = p.vehicle;
    if (!v) return;
    p.vehicle = null;
    const room = space.map.rooms[p.room];
    const id = room?.objects.some(o => o.id === v.id) ? `${v.id}-${Date.now().toString(36)}` : v.id;
    const applied = room && applyEdit(space.map, { kind: 'obj-add', room: room.id, obj: { id, type: 'scooter', x: p.x, y: p.y, color: v.color, rot: 0 } });
    if (applied) io.to(spaceId!).emit('map:edited', applied.op);
    io.to(spaceId!).emit('player:updated', { id: p.id, vehicle: null });
    scheduleSave(spaceId!, space);
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
    const user = socket.data.user;
    const person = personKey(user);
    let space: Space | null;
    try {
      // Sem login (desenvolvimento) qualquer espaço é criado ao entrar; com login, só existentes.
      space = await getSpace(id, authMode === 'disabled' ? id : undefined);
      if (!space) {
        ack({ error: 'Espaço não encontrado. Confira o link ou o código.' });
        return;
      }
      if (authMode !== 'disabled' && !(await store.isMember(person, id))) {
        const code = cleanText(req?.code, 12).toUpperCase();
        // Membro novo: precisa do código. Espaço antigo sem nenhum membro aceita o primeiro.
        if (code !== space.meta.code && (await store.hasMembers(id))) {
          ack({ error: 'Este espaço é privado: entre pelo link de convite ou com o código.' });
          return;
        }
      }
      await store.touchMembership(person, id);
      if (user) await store.saveProfile(person, cleanAvatar(req?.avatar));
    } catch (err) {
      console.error('Falha ao carregar espaço', id, err);
      socket.disconnect();
      return;
    }
    if (spaceId || !socket.connected) return;
    spaceId = id;
    ownerTag = user ? personTag(user.person) : ownerTagFor(req?.clientKey);
    const room = space.map.entry;
    const pos = findSpawn(space, room);
    const player: PlayerState = {
      id: socket.id,
      // Com login, o nome é o da pessoa da conta (é ele que vale nas salas trancadas).
      name: user ? user.person : cleanText(req?.name, 24) || 'Convidado',
      avatar: cleanAvatar(req?.avatar),
      room,
      tag: ownerTag,
      x: pos.x,
      y: pos.y,
      dir: 'down',
      audio: !!req?.audio,
      video: !!req?.video,
      action: null,
      vehicle: null,
    };
    space.players.set(socket.id, player);
    socket.join(spaceId);
    ack({
      selfId: socket.id,
      space: spaceId,
      spaceName: space.meta.name,
      code: space.meta.code,
      players: [...space.players.values()],
      chat: space.chat,
      map: space.map,
      ownerTag,
      music: Object.fromEntries(space.music),
      iceServers: ICE,
      serverTime: Date.now(),
    });
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
    const full = dist === 1 ? fullAgainst(room, x, y, p.id, space.players.values()) : null;
    if (full) {
      socket.emit('player:moved', { id: p.id, room: p.room, x: p.x, y: p.y, dir: p.dir });
      socket.emit('notice', `🚫 "${full}" já está ocupada.`);
      return;
    }
    p.dir = dir;
    // Portal: só dispara ao pisar nele (chegar num portal pelo outro lado não te manda de volta).
    const portal = dist === 1 ? room.portals[tileKey(x, y)] : undefined;
    if (portal && space.map.rooms[portal.room]) {
      const dest = space.map.rooms[portal.room];
      const lockedDest = lockedAgainst(dest, portal.x, portal.y, who()) ?? fullAgainst(dest, portal.x, portal.y, p.id, space.players.values());
      if (lockedDest) {
        socket.emit('player:moved', { id: p.id, room: p.room, x: p.x, y: p.y, dir: p.dir });
        socket.emit('notice', `🔒 O portal leva para "${lockedDest}", que está trancada ou lotada.`);
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

  socket.on('avatar', a => {
    const p = me();
    if (!p || !spaceId) return;
    p.avatar = cleanAvatar(a);
    io.to(spaceId).emit('player:updated', { id: p.id, avatar: p.avatar });
    if (socket.data.user) void store.saveProfile(personKey(socket.data.user), p.avatar).catch(() => {});
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

  /** Sobe num patinete ao lado: o objeto sai do mapa e vira o veículo da pessoa. */
  socket.on('vehicle:mount', objectId => {
    const p = me();
    const space = current();
    if (!p || !space || !spaceId || p.vehicle || typeof objectId !== 'string') return;
    const room = space.map.rooms[p.room];
    const obj = room?.objects.find(o => o.id === objectId && o.type === 'scooter');
    if (!room || !obj || Math.max(Math.abs(obj.x - p.x), Math.abs(obj.y - p.y)) > 1) return;
    const applied = applyEdit(space.map, { kind: 'obj-remove', room: room.id, id: obj.id });
    if (!applied) return;
    io.to(spaceId).emit('map:edited', applied.op);
    p.vehicle = { type: 'scooter', color: obj.color, id: obj.id };
    io.to(spaceId).emit('player:updated', { id: p.id, vehicle: p.vehicle });
    scheduleSave(spaceId, space);
  });

  socket.on('vehicle:dismount', () => {
    const p = me();
    const space = current();
    if (p && space && spaceId) parkVehicle(space, p);
  });

  /** Pega um objeto da sala da pessoa que esteja colado nela (inclusive na diagonal). */
  function objectNear(objectId: unknown, accept: (o: { type: string; interaction?: { kind: string } }) => boolean) {
    const p = me();
    const space = current();
    if (!p || !space || typeof objectId !== 'string') return null;
    const room = space.map.rooms[p.room];
    const obj = room?.objects.find(o => o.id === objectId && accept(o));
    return obj && Math.max(Math.abs(obj.x - p.x), Math.abs(obj.y - p.y)) <= 1 ? { p, space, room: room!, obj } : null;
  }

  let lastFx = 0;
  function emitFx(space: Space, fx: Omit<Fx, 'id'>) {
    const now = Date.now();
    if (now - lastFx < 500) return; // evita enxurrada de efeitos
    lastFx = now;
    io.to(spaceId!).emit('fx', { ...fx, id: randomUUID() });
  }

  socket.on('music:toggle', objectId => {
    const hit = objectNear(objectId, o => o.interaction?.kind === 'music');
    if (!hit) return;
    const { space, obj } = hit;
    const playing = space.music.has(obj.id);
    if (playing) space.music.delete(obj.id);
    else space.music.set(obj.id, Date.now());
    io.to(spaceId!).emit('music:state', { id: obj.id, startedAt: playing ? null : space.music.get(obj.id)! });
  });

  socket.on('fish', pos => {
    const p = me();
    const space = current();
    const room = p && space ? space.map.rooms[p.room] : undefined;
    if (!p || !space || !room || !pos || !Number.isInteger(pos.x) || !Number.isInteger(pos.y)) return;
    if (room.floor[pos.y]?.[pos.x] !== 'water' || Math.max(Math.abs(pos.x - p.x), Math.abs(pos.y - p.y)) > 1) return;
    const n = space.fishCount++;
    // formato e cor mudam a cada pescaria (ciclos de tamanhos diferentes para não repetir o par)
    emitFx(space, { kind: 'fish', room: room.id, x: pos.x, y: pos.y, variant: n % 4, color: FISH_COLORS[(n * 3) % FISH_COLORS.length] });
  });

  socket.on('pet', objectId => {
    const hit = objectNear(objectId, o => o.type === 'dog');
    if (hit) emitFx(hit.space, { kind: 'heart', room: hit.room.id, x: hit.obj.x, y: hit.obj.y, variant: 0, color: '#e5483a' });
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

  socket.on('map:import', data => {
    const space = current();
    if (!space || !spaceId || !me()) return;
    if (Object.values(space.map.rooms).some(r => Object.values(r.areaMeta).some(m => !isAllowed(m, who())))) {
      socket.emit('notice', '🔒 Só quem tem acesso a todas as áreas trancadas pode importar um mapa.');
      return;
    }
    // Aceita tanto o mapa puro quanto o arquivo { map, chat } salvo em disco.
    const raw = data && typeof data === 'object' && 'map' in data && !('rooms' in data) ? (data as { map: unknown }).map : data;
    if (!isSpaceMap(raw)) {
      socket.emit('notice', 'Este arquivo não parece ser um mapa da Praça.');
      return;
    }
    const next = restoreMap(raw);
    migrateMap(next);
    space.map = next;
    io.to(spaceId).emit('map:replaced', space.map);
    for (const p of space.players.values()) if (!space.map.rooms[p.room]) relocate(space, p, space.map.entry);
    evictLocked(space);
    socket.emit('notice', '✅ Mapa importado e salvo.');
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
    const leaving = space.players.get(socket.id);
    if (leaving?.vehicle) parkVehicle(space, leaving);
    space.players.delete(socket.id);
    io.to(spaceId).emit('player:left', socket.id);
    // O mapa fica salvo em disco; descarrega da memória só depois de gravar.
    if (!space.players.size && !space.chat.length && !space.saveTimer) spaces.delete(spaceId);
  });
});

/** Num deploy o container recebe SIGTERM: grava o que estiver pendente antes de sair. */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  const pending = [...spaces.entries()].filter(([, s]) => s.saveTimer);
  console.log(`${signal}: gravando ${pending.length} espaço(s) antes de sair…`);
  await Promise.allSettled(
    pending.map(([id, s]) => {
      clearTimeout(s.saveTimer);
      s.saveTimer = undefined;
      return store.saveSpace(id, s.map, s.chat, s.meta);
    }),
  );
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

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
