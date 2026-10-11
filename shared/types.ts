import type { DeskClaim, MapEdit, SpaceMap } from './map';

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Ação contínua do avatar, visível para todos (ex.: fumando). */
export type PlayerAction = 'smoke';
export const PLAYER_ACTIONS: PlayerAction[] = ['smoke'];

/**
 * Visual do boneco. Os números são índices das listas de AVATAR_STYLES e as cores
 * vêm das paletas de AVATAR_OPTIONS. Avatares antigos (só skin/hair/shirt/hairStyle)
 * continuam valendo: o resto é completado com o padrão.
 */
export interface Avatar {
  skin: string;
  hair: string;
  hairStyle: number;
  facialHair: number;
  /** Parte de cima: estilo + cor. */
  top: number;
  shirt: string;
  /** Parte de baixo: estilo + cor. */
  bottom: number;
  pants: string;
  shoes: string;
  hat: number;
  hatColor: string;
  glasses: number;
}

/** Veículo em que a pessoa está (o objeto sai do mapa enquanto ela anda nele). */
export interface Vehicle {
  type: 'scooter';
  color: number;
  /** Id do objeto do mapa, para ele voltar ao estacionar. */
  id: string;
}

export interface PlayerState {
  id: string;
  name: string;
  avatar: Avatar;
  /** Sala (andar) em que a pessoa está. */
  room: string;
  /** Identificador público do navegador (hash), usado em mesas e salas trancadas. */
  tag: string;
  x: number;
  y: number;
  dir: Dir;
  audio: boolean;
  video: boolean;
  action: PlayerAction | null;
  vehicle?: Vehicle | null;
}

export type ChatScope = 'everyone' | 'nearby';

/** Espaço na tela inicial (visitados recentemente). */
export interface SpaceSummary {
  id: string;
  name: string;
  code: string;
  lastVisited: number;
  online: number;
}

/** Efeito visual passageiro (peixe pulando do lago, coração do pet). */
export interface Fx {
  id: string;
  kind: 'fish' | 'heart';
  room: string;
  x: number;
  y: number;
  /** Formato do peixe (muda a cada pescaria). */
  variant: number;
  color: string;
}

/** Servidor ICE para o WebRTC (STUN/TURN). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
  scope: ChatScope;
}

export interface SessionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalData = { sdp: SessionDescription } | { candidate: IceCandidate } | { hangup: true };

export interface JoinRequest {
  space: string;
  /** Código de convite (link ou digitado) para quem ainda não é membro. */
  code?: string;
  name: string;
  avatar: Avatar;
  audio: boolean;
  video: boolean;
  /** Identificador persistente do navegador (localStorage), usado para saber de quem é cada mesa. */
  clientKey: string;
}

export interface JoinResponse {
  selfId: string;
  space: string;
  /** Nome e código do espaço (o código vai no link de convite). */
  spaceName: string;
  code: string;
  players: PlayerState[];
  chat: ChatMessage[];
  map: SpaceMap;
  /** Hash público do clientKey; comparado com DeskClaim.owner para achar a própria mesa. */
  ownerTag: string;
  /** Músicas tocando: objeto (vitrola) → quando começou (ms). */
  music: Record<string, number>;
  /** STUN/TURN para as conexões de áudio e vídeo. */
  iceServers: IceServer[];
  /** Relógio do servidor (ms), para sincronizar a música entre todos. */
  serverTime: number;
}

export interface ServerToClient {
  'player:joined': (p: PlayerState) => void;
  'player:left': (id: string) => void;
  'player:moved': (m: { id: string; room: string; x: number; y: number; dir: Dir }) => void;
  'player:updated': (p: Partial<PlayerState> & { id: string }) => void;
  'chat:message': (m: ChatMessage) => void;
  emote: (e: { id: string; emoji: string }) => void;
  'rtc:signal': (s: { from: string; data: SignalData }) => void;
  'map:edited': (edit: MapEdit) => void;
  'map:replaced': (map: SpaceMap) => void;
  'map:claims': (claims: Record<string, DeskClaim>) => void;
  /** Aviso curto para mostrar à pessoa (ex.: sala trancada, edição negada). */
  notice: (text: string) => void;
  'music:state': (m: { id: string; startedAt: number | null }) => void;
  fx: (e: Fx) => void;
  /** Pet andando sozinho (não passa pelo histórico de edições do mapa). */
  'npc:move': (m: { room: string; id: string; x: number; y: number; rot: number }) => void;
}

export interface ClientToServer {
  join: (req: JoinRequest, ack: (res: JoinResponse | { error: string }) => void) => void;
  /** Troca o avatar durante a sessão (fica salvo na conta). */
  avatar: (avatar: Avatar) => void;
  move: (m: { x: number; y: number; dir: Dir }) => void;
  chat: (m: { text: string; scope: ChatScope }) => void;
  emote: (emoji: string) => void;
  media: (m: { audio: boolean; video: boolean }) => void;
  action: (a: PlayerAction | null) => void;
  'vehicle:mount': (objectId: string) => void;
  'vehicle:dismount': () => void;
  /** Liga/desliga a música de uma vitrola ao lado. */
  'music:toggle': (objectId: string) => void;
  /** Pesca no tile de água ao lado. */
  fish: (pos: { x: number; y: number }) => void;
  /** Faz carinho no pet ao lado. */
  pet: (objectId: string) => void;
  'rtc:signal': (s: { to: string; data: SignalData }) => void;
  'map:edit': (edit: MapEdit) => void;
  'map:reset': () => void;
  /** Substitui o mapa do espaço por um exportado antes (backup .json). */
  'map:import': (map: unknown) => void;
  'desk:claim': (key: string) => void;
  'desk:release': () => void;
}

const CLOTH = [
  '#e5483a', '#f0a73a', '#f4d35e', '#5d7a3a', '#2fb380', '#2a7a6a', '#3fb6d6', '#5b6ee1',
  '#8c5bd6', '#d94fc0', '#e86a8a', '#a0603a', '#e2cfa8', '#f2f2f2', '#8a8fa3', '#2d3247',
];

/** Paletas de cor de cada parte do avatar (no estilo do editor do Gather). */
export const AVATAR_OPTIONS = {
  skin: ['#ffe0c7', '#f6d3b3', '#e8b48a', '#c68642', '#a0603a', '#8d5524', '#5c3a21', '#3d2616'],
  hair: ['#d9d9d9', '#2b1d14', '#5a3825', '#a0603a', '#8a7a3a', '#e8b84a', '#8a3b2e', '#e8742a', '#f28fb1', '#8c5bd6', '#4f7fc2', '#7fae5a', '#9b9b9b', '#d9534f', '#6f42c1', '#c58b3c', '#e8d18a'],
  shirt: CLOTH,
  pants: CLOTH,
  shoes: CLOTH,
  hatColor: CLOTH,
  hairStyles: 10,
};

/** Nomes dos estilos (a ordem é o índice salvo no avatar). */
export const AVATAR_STYLES = {
  hairStyle: ['Curto', 'Longo', 'Coque', 'Raspado', 'Black power', 'Cacheado', 'Rabo de cavalo', 'Espetado', 'Franja', 'Tranças'],
  facialHair: ['Nenhuma', 'Bigode', 'Barba', 'Cavanhaque'],
  top: ['Camiseta', 'Moletom', 'Listrada', 'Vestido', 'Terno', 'Jaqueta'],
  bottom: ['Calça', 'Bermuda', 'Saia'],
  hat: ['Nenhum', 'Boné', 'Gorro', 'Quepe', 'Chapéu de bruxo', 'Fone de ouvido'],
  glasses: ['Nenhum', 'Redondo', 'Quadrado', 'Escuro'],
};

export const DEFAULT_AVATAR: Avatar = {
  skin: '#f6d3b3',
  hair: '#2b1d14',
  hairStyle: 0,
  facialHair: 0,
  top: 0,
  shirt: '#5b6ee1',
  bottom: 0,
  pants: '#2d3247',
  shoes: '#2d3247',
  hat: 0,
  hatColor: '#5b6ee1',
  glasses: 0,
};

/** Completa e valida um avatar (vindo do navegador, do banco ou de uma versão antiga). */
export function cleanAvatar(a: Partial<Avatar> | undefined | null): Avatar {
  const color = (list: string[], v: unknown, fallback: string) => (typeof v === 'string' && list.includes(v) ? v : fallback);
  const style = (list: string[], v: unknown) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < list.length ? n : 0;
  };
  const o = AVATAR_OPTIONS;
  const d = DEFAULT_AVATAR;
  return {
    skin: color(o.skin, a?.skin, d.skin),
    hair: color(o.hair, a?.hair, d.hair),
    hairStyle: style(AVATAR_STYLES.hairStyle, a?.hairStyle),
    facialHair: style(AVATAR_STYLES.facialHair, a?.facialHair),
    top: style(AVATAR_STYLES.top, a?.top),
    // camisas antigas usavam cores fora da paleta nova: aceita qualquer cor da paleta antiga também
    shirt: color([...o.shirt, '#4a4a4a', '#f2f2f2'], a?.shirt, d.shirt),
    bottom: style(AVATAR_STYLES.bottom, a?.bottom),
    pants: color(o.pants, a?.pants, d.pants),
    shoes: color(o.shoes, a?.shoes, d.shoes),
    hat: style(AVATAR_STYLES.hat, a?.hat),
    hatColor: color(o.hatColor, a?.hatColor, d.hatColor),
    glasses: style(AVATAR_STYLES.glasses, a?.glasses),
  };
}

export function randomAvatar(): Avatar {
  const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];
  const idx = (l: string[]) => Math.floor(Math.random() * l.length);
  const o = AVATAR_OPTIONS;
  return {
    skin: pick(o.skin),
    hair: pick(o.hair.slice(1, 12)),
    hairStyle: idx(AVATAR_STYLES.hairStyle),
    facialHair: Math.random() < 0.75 ? 0 : idx(AVATAR_STYLES.facialHair),
    top: idx(AVATAR_STYLES.top),
    shirt: pick(o.shirt),
    bottom: idx(AVATAR_STYLES.bottom),
    pants: pick(o.pants),
    shoes: pick(['#2d3247', '#f2f2f2', '#a0603a', '#e5483a']),
    hat: Math.random() < 0.6 ? 0 : idx(AVATAR_STYLES.hat),
    hatColor: pick(o.hatColor),
    glasses: Math.random() < 0.7 ? 0 : idx(AVATAR_STYLES.glasses),
  };
}

export const EMOTES = ['👋', '❤️', '😂', '👍', '🎉'];
