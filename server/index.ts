import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { MAP, isWalkable } from '../shared/map';
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

interface Space {
  players: Map<string, PlayerState>;
  chat: ChatMessage[];
}

const spaces = new Map<string, Space>();

function getSpace(id: string) {
  let s = spaces.get(id);
  if (!s) {
    s = { players: new Map(), chat: [] };
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

function findSpawn(space: Space) {
  const { x, y, w, h } = MAP.spawn;
  const occupied = new Set([...space.players.values()].map(p => `${p.x},${p.y}`));
  const free: { x: number; y: number }[] = [];
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) if (isWalkable(xx, yy) && !occupied.has(`${xx},${yy}`)) free.push({ x: xx, y: yy });
  return free.length ? free[Math.floor(Math.random() * free.length)] : { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) };
}

const app = express();
const server = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(server, { cors: { origin: true } });

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.get('/health', (_req, res) => {
  res.json({ ok: true, spaces: spaces.size });
});
app.use(express.static(dist));
app.get('*', (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => err && next()));

io.on('connection', socket => {
  let spaceId: string | null = null;
  const current = () => (spaceId ? spaces.get(spaceId) : undefined);
  const me = () => current()?.players.get(socket.id);

  socket.on('join', (req, ack) => {
    if (spaceId || typeof ack !== 'function') return;
    spaceId = cleanSpaceId(req?.space);
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
    ack({ selfId: socket.id, space: spaceId, players: [...space.players.values()], chat: space.chat });
    socket.to(spaceId).emit('player:joined', player);
  });

  socket.on('move', m => {
    const p = me();
    if (!p || !spaceId || !m) return;
    const { x, y, dir } = m;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !DIRS.has(dir)) return;
    const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (dist > 1 || (dist === 1 && !isWalkable(x, y))) {
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
        if (other.id === p.id || canHear(p, other)) io.to(other.id).emit('chat:message', msg);
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
    if (!space.players.size && !space.chat.length) spaces.delete(spaceId);
  });
});

server.listen(PORT, () => {
  console.log(`Praça rodando em http://localhost:${PORT}`);
});
