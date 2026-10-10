import { io, type Socket } from 'socket.io-client';
import type {
  ChatMessage,
  ChatScope,
  ClientToServer,
  JoinRequest,
  JoinResponse,
  PlayerAction,
  PlayerState,
  ServerToClient,
} from '../../shared/types';

export type AppSocket = Socket<ServerToClient, ClientToServer>;

/** Estado do jogador + posição renderizada (interpolada). */
export interface PlayerView extends PlayerState {
  rx: number;
  ry: number;
  walk: number;
}

/**
 * Estado compartilhado do espaço. Posições mudam a cada frame e são lidas
 * direto pelo canvas; o resto (entrada/saída, chat, mídia) dispara notify()
 * para o React re-renderizar.
 */
export class World {
  players = new Map<string, PlayerView>();
  chat: ChatMessage[];
  emotes = new Map<string, { emoji: string; until: number }>();
  disconnected = false;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(
    public socket: AppSocket,
    public selfId: string,
    public space: string,
    res: JoinResponse,
  ) {
    for (const p of res.players) this.add(p);
    this.chat = res.chat;

    socket.on('player:joined', p => {
      this.add(p);
      this.notify();
    });
    socket.on('player:left', id => {
      this.players.delete(id);
      this.emotes.delete(id);
      this.notify();
    });
    socket.on('player:moved', ({ id, x, y, dir }) => {
      const p = this.players.get(id);
      if (!p) return;
      p.x = x;
      p.y = y;
      p.dir = dir;
    });
    socket.on('player:updated', patch => {
      const p = this.players.get(patch.id);
      if (!p) return;
      Object.assign(p, patch);
      this.notify();
    });
    socket.on('chat:message', m => {
      this.chat = [...this.chat, m];
      this.notify();
    });
    socket.on('emote', ({ id, emoji }) => {
      this.emotes.set(id, { emoji, until: performance.now() + 3000 });
    });
    socket.on('disconnect', () => {
      this.disconnected = true;
      this.notify();
    });
  }

  get self() {
    return this.players.get(this.selfId)!;
  }

  private add(p: PlayerState) {
    this.players.set(p.id, { ...p, rx: p.x, ry: p.y, walk: 0 });
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = () => this.version;

  notify = () => {
    this.version++;
    this.listeners.forEach(fn => fn());
  };

  sendChat(text: string, scope: ChatScope) {
    this.socket.emit('chat', { text, scope });
  }

  sendEmote(emoji: string) {
    this.emotes.set(this.selfId, { emoji, until: performance.now() + 3000 });
    this.socket.emit('emote', emoji);
  }

  /** Liga/desliga uma ação contínua do avatar (ex.: Alt+F para fumar). */
  toggleAction(action: PlayerAction) {
    const me = this.self;
    me.action = me.action === action ? null : action;
    this.socket.emit('action', me.action);
    this.notify();
  }

  setMedia(audio: boolean, video: boolean) {
    const me = this.self;
    if (me.audio === audio && me.video === video) return;
    me.audio = audio;
    me.video = video;
    this.socket.emit('media', { audio, video });
    this.notify();
  }

  leave() {
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}

export function joinSpace(req: JoinRequest): Promise<World> {
  return new Promise((resolve, reject) => {
    const socket: AppSocket = io({ reconnection: false });
    const fail = (msg: string) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Tempo esgotado ao conectar ao servidor.'), 8000);
    socket.once('connect_error', () => fail('Não foi possível conectar ao servidor.'));
    socket.once('connect', () => {
      socket.emit('join', req, res => {
        clearTimeout(timer);
        resolve(new World(socket, res.selfId, res.space, res));
      });
    });
  });
}
