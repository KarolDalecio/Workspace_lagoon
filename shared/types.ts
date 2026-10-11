import type { DeskClaim, MapEdit, SpaceMap } from './map';

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Ação contínua do avatar, visível para todos (ex.: fumando). */
export type PlayerAction = 'smoke';
export const PLAYER_ACTIONS: PlayerAction[] = ['smoke'];

export interface Avatar {
  skin: string;
  hair: string;
  shirt: string;
  hairStyle: number;
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
}

export type ChatScope = 'everyone' | 'nearby';

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
  players: PlayerState[];
  chat: ChatMessage[];
  map: SpaceMap;
  /** Hash público do clientKey; comparado com DeskClaim.owner para achar a própria mesa. */
  ownerTag: string;
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
}

export interface ClientToServer {
  join: (req: JoinRequest, ack: (res: JoinResponse) => void) => void;
  move: (m: { x: number; y: number; dir: Dir }) => void;
  chat: (m: { text: string; scope: ChatScope }) => void;
  emote: (emoji: string) => void;
  media: (m: { audio: boolean; video: boolean }) => void;
  action: (a: PlayerAction | null) => void;
  'rtc:signal': (s: { to: string; data: SignalData }) => void;
  'map:edit': (edit: MapEdit) => void;
  'map:reset': () => void;
  /** Substitui o mapa do espaço por um exportado antes (backup .json). */
  'map:import': (map: unknown) => void;
  'desk:claim': (key: string) => void;
  'desk:release': () => void;
}

export const AVATAR_OPTIONS = {
  skin: ['#f6d3b3', '#e8b48a', '#c68642', '#8d5524', '#5c3a21'],
  hair: ['#2b1d14', '#5a3825', '#c58b3c', '#e8d18a', '#9b9b9b', '#d9534f', '#6f42c1'],
  shirt: ['#5b6ee1', '#e15b64', '#2fb380', '#f0a73a', '#8c5bd6', '#3fb6d6', '#4a4a4a', '#f2f2f2'],
  hairStyles: 4,
};

export const EMOTES = ['👋', '❤️', '😂', '👍', '🎉'];
