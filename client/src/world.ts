import { io, type Socket } from 'socket.io-client';
import { applyEdit, editDenied, type MapEdit, type SpaceMap, type Who } from '../../shared/map';
import type {
  Avatar,
  ChatMessage,
  ChatScope,
  ClientToServer,
  Fx,
  IceServer,
  JoinRequest,
  JoinResponse,
  PlayerAction,
  PlayerState,
  ServerToClient,
} from '../../shared/types';
import { apiPath } from './base';

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
  map: SpaceMap;
  /** Nome e código de convite do espaço. */
  spaceName: string;
  code: string;
  /** Hash público deste navegador, comparado com o dono de cada mesa. */
  ownerTag: string;
  /** Incrementa a cada mudança no mapa, para o motor redesenhar o cenário. */
  mapVersion = 0;
  /** Avisos do servidor (sala trancada, edição negada…). */
  onNotice?: (text: string) => void;
  /** Vitrolas tocando: objeto → início (ms, relógio do servidor). */
  music = new Map<string, number>();
  /** Diferença relógio do servidor − relógio local, estimada no join. */
  clockSkew = 0;
  iceServers: IceServer[];
  /** Efeitos passageiros na tela (peixe, coração), com o instante local em que começaram. */
  fx: (Fx & { born: number })[] = [];
  /** Edições inversas para desfazer/refazer (só as feitas por esta pessoa). */
  private undoStack: MapEdit[] = [];
  private redoStack: MapEdit[] = [];
  /** Inversos acumulados durante um gesto (ex.: uma pincelada vira um único desfazer). */
  private group: MapEdit[] | null = null;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(
    public socket: AppSocket,
    public selfId: string,
    public space: string,
    res: JoinResponse,
  ) {
    this.spaceName = res.spaceName;
    this.code = res.code;
    for (const p of res.players) this.add(p);
    this.chat = res.chat;
    this.map = res.map;
    this.ownerTag = res.ownerTag;
    this.iceServers = res.iceServers ?? [];
    if (res.serverTime) this.clockSkew = res.serverTime - Date.now();
    for (const [id, at] of Object.entries(res.music ?? {})) this.music.set(id, at);

    socket.on('music:state', ({ id, startedAt }) => {
      if (startedAt === null) this.music.delete(id);
      else this.music.set(id, startedAt);
      this.notify();
    });
    socket.on('fx', e => {
      this.fx.push({ ...e, born: performance.now() });
      if (this.fx.length > 30) this.fx.shift();
    });
    // Pet passeando: move o objeto sem redesenhar o cenário (ele é desenhado à parte).
    socket.on('npc:move', ({ room, id, x, y, rot }) => {
      const obj = this.map.rooms[room]?.objects.find(o => o.id === id);
      if (!obj) return;
      obj.x = x;
      obj.y = y;
      obj.rot = rot;
    });

    socket.on('map:edited', edit => {
      applyEdit(this.map, edit);
      this.mapChanged();
    });
    socket.on('map:replaced', map => {
      this.map = map;
      this.undoStack = [];
      this.redoStack = [];
      this.mapChanged();
    });
    socket.on('notice', text => this.onNotice?.(text));
    socket.on('map:claims', claims => {
      this.map.claims = claims;
      this.mapChanged();
    });

    socket.on('player:joined', p => {
      this.add(p);
      this.notify();
    });
    socket.on('player:left', id => {
      this.players.delete(id);
      this.emotes.delete(id);
      this.notify();
    });
    socket.on('player:moved', ({ id, room, x, y, dir }) => {
      const p = this.players.get(id);
      if (!p) return;
      p.x = x;
      p.y = y;
      p.dir = dir;
      if (p.room !== room) {
        // Mudou de sala (portal): sem animação de caminhada entre salas.
        p.room = room;
        p.rx = x;
        p.ry = y;
        this.notify();
      }
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

  /** Esta pessoa, para checar acesso a áreas trancadas. */
  get who(): Who {
    return { tag: this.ownerTag, name: this.self.name };
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

  private mapChanged() {
    this.mapVersion++;
    this.notify();
  }

  /**
   * Aplica localmente na hora (otimista) e envia ao servidor, que repassa aos outros.
   * `record` diz em qual pilha guardar o inverso: nova edição limpa o refazer.
   */
  editMap(edit: MapEdit, record: 'new' | 'undo' | 'redo' = 'new') {
    const denied = editDenied(this.map, edit, this.who);
    if (denied) {
      this.onNotice?.(`🔒 ${denied}`);
      return false;
    }
    const applied = applyEdit(this.map, edit);
    if (!applied) return false;
    this.socket.emit('map:edit', applied.op);
    if (record === 'redo') this.redoStack.push(applied.inverse);
    else if (record === 'new' && this.group) {
      this.group.unshift(applied.inverse);
      this.redoStack = [];
    } else {
      this.undoStack.push(applied.inverse);
      if (this.undoStack.length > 200) this.undoStack.shift();
      if (record === 'new') this.redoStack = [];
    }
    this.mapChanged();
    return true;
  }

  /** Começa um gesto: as edições até endGroup() viram uma única entrada de desfazer. */
  beginGroup() {
    this.endGroup();
    this.group = [];
  }

  endGroup() {
    const ops = this.group;
    this.group = null;
    if (!ops?.length) return;
    this.undoStack.push(ops.length === 1 ? ops[0] : { kind: 'batch', ops });
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.notify();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Desfaz a última edição própria; pula as que ficaram inválidas por edições de outras pessoas. */
  undo() {
    this.endGroup();
    while (this.undoStack.length) if (this.editMap(this.undoStack.pop()!, 'redo')) return true;
    this.notify();
    return false;
  }

  redo() {
    while (this.redoStack.length) if (this.editMap(this.redoStack.pop()!, 'undo')) return true;
    this.notify();
    return false;
  }

  resetMap() {
    this.socket.emit('map:reset');
  }

  /** Mesa ocupada por este navegador: sala e nome da área. */
  get myDesk() {
    const key = Object.entries(this.map.claims).find(([, c]) => c.owner === this.ownerTag)?.[0];
    if (!key) return null;
    const i = key.indexOf(':');
    return { room: key.slice(0, i), area: key.slice(i + 1) };
  }

  /** Ocupa a área de mesa em que a pessoa está agora. */
  claimDesk(area: string) {
    this.socket.emit('desk:claim', area);
  }

  releaseDesk() {
    this.socket.emit('desk:release');
  }

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

  /** Troca o avatar durante a sessão (o servidor salva na conta e avisa os outros). */
  setAvatar(avatar: Avatar) {
    this.self.avatar = avatar;
    this.socket.emit('avatar', avatar);
    this.notify();
  }

  /** Link de convite: quem abre entra no espaço mesmo sem ser membro ainda. */
  get inviteUrl() {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('space', this.space);
    url.searchParams.set('code', this.code);
    return url.toString();
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

/** Chave persistente deste navegador; é ela que "possui" a mesa ocupada. */
function clientKey() {
  try {
    let key = localStorage.getItem('praca:key');
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem('praca:key', key);
    }
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

/** Erro de conexão por falta de login (o App volta para a tela de login). */
export class UnauthorizedError extends Error {}

export function joinSpace(partial: Omit<JoinRequest, 'clientKey'>, token?: string): Promise<World> {
  const req: JoinRequest = { ...partial, clientKey: clientKey() };
  return new Promise((resolve, reject) => {
    const socket: AppSocket = io({ reconnection: false, path: apiPath('socket.io'), auth: token ? { token } : {} });
    const fail = (msg: string) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Tempo esgotado ao conectar ao servidor.'), 8000);
    socket.once('connect_error', err => {
      if (err.message === 'unauthorized' || err.message === 'auth-misconfigured') {
        clearTimeout(timer);
        socket.disconnect();
        reject(new UnauthorizedError(err.message === 'unauthorized' ? 'Sua sessão expirou ou não tem acesso. Entre de novo.' : 'O login não está configurado no servidor.'));
        return;
      }
      fail('Não foi possível conectar ao servidor.');
    });
    socket.once('connect', () => {
      socket.emit('join', req, res => {
        clearTimeout(timer);
        if ('error' in res) {
          socket.disconnect();
          reject(new Error(res.error));
          return;
        }
        resolve(new World(socket, res.selfId, res.space, res));
      });
    });
  });
}
