import { CATALOG } from './catalog';

export const TILE = 32;

export const FLOORS = ['grass', 'wood', 'carpet', 'carpet2', 'tile', 'path', 'water', 'rug', 'stone', 'dark'] as const;
export type Floor = (typeof FLOORS)[number];

/** Efeitos de tile marcados por presença (como no Gather, cada um é uma camada independente). */
export const FLAG_EFFECTS = ['impassable', 'spawn', 'spotlight'] as const;
export type FlagEffect = (typeof FLAG_EFFECTS)[number];
export type EffectKind = FlagEffect | 'private' | 'portal';

export const INTERACTION_KINDS = ['embed', 'video', 'image', 'link', 'note'] as const;

/** O que acontece ao apertar X perto de um objeto. */
export interface Interaction {
  kind: (typeof INTERACTION_KINDS)[number];
  title: string;
  url?: string;
  text?: string;
}

export interface PlacedObject {
  id: string;
  type: string;
  x: number;
  y: number;
  color: number;
  rot: number;
  interaction?: Interaction;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortalTarget {
  room: string;
  x: number;
  y: number;
}

export interface AreaMeta {
  /** Área de mesa: pode ser ocupada por uma pessoa. */
  desk: boolean;
}

/** Mesa ocupada. `owner` é um identificador público (hash), nunca a chave do navegador. */
export interface DeskClaim {
  owner: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  width: number;
  height: number;
  floor: Floor[][];
  objects: PlacedObject[];
  impassable: Record<string, 1>;
  spawn: Record<string, 1>;
  spotlight: Record<string, 1>;
  /** tile → nome da área privada. Tiles com o mesmo nome formam uma só área, mesmo separados. */
  privateAreas: Record<string, string>;
  areaMeta: Record<string, AreaMeta>;
  portals: Record<string, PortalTarget>;
  background: string | null;
  foreground: string | null;
}

export interface SpaceMap {
  rooms: Record<string, Room>;
  order: string[];
  /** Sala onde as pessoas entram. */
  entry: string;
  /** "sala:área" → dono. */
  claims: Record<string, DeskClaim>;
}

type Tiles<T> = { x: number; y: number; value: T }[];

export type MapEdit =
  | { kind: 'floor'; room: string; tiles: Tiles<Floor> }
  | { kind: 'obj-add'; room: string; obj: PlacedObject }
  | { kind: 'obj-update'; room: string; id: string; patch: Partial<Omit<PlacedObject, 'id' | 'type' | 'interaction'>> & { interaction?: Interaction | null } }
  | { kind: 'obj-remove'; room: string; id: string }
  | { kind: 'flag'; room: string; effect: FlagEffect; tiles: Tiles<boolean> }
  | { kind: 'private'; room: string; tiles: Tiles<string | null> }
  | { kind: 'portal'; room: string; tiles: Tiles<PortalTarget | null> }
  | { kind: 'area-meta'; room: string; name: string; meta: AreaMeta | null }
  | { kind: 'room-add'; room: Room; index?: number }
  | { kind: 'room-remove'; id: string }
  | { kind: 'room-update'; room: string; patch: { name?: string; background?: string | null; foreground?: string | null } }
  | { kind: 'batch'; ops: MapEdit[] };

const MAX_ROOMS = 12;
const MAX_ROOM_SIDE = 120;
const MAX_OBJECTS = 4000;
const MAX_BATCH = 3000;

export const tileKey = (x: number, y: number) => `${x},${y}`;
export const claimKey = (room: string, area: string) => `${room}:${area}`;

export function parseKey(key: string) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

// ---------------------------------------------------------------- consultas

export function inBounds(room: Room, x: number, y: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < room.width && y < room.height;
}

export function isWalkable(room: Room, x: number, y: number) {
  return inBounds(room, x, y) && !room.impassable[tileKey(x, y)];
}

export function areaAt(room: Room, x: number, y: number): string | null {
  return room.privateAreas[tileKey(Math.round(x), Math.round(y))] ?? null;
}

export function onSpotlight(room: Room, x: number, y: number) {
  return !!room.spotlight[tileKey(Math.round(x), Math.round(y))];
}

export function deskAreaAt(room: Room, x: number, y: number) {
  const name = areaAt(room, x, y);
  return name && room.areaMeta[name]?.desk ? name : null;
}

export function footprint(o: Pick<PlacedObject, 'type' | 'x' | 'y'>) {
  const def = CATALOG[o.type];
  return { x: o.x, y: o.y, w: def?.w ?? 1, h: def?.h ?? 1 };
}

/** Objeto mais acima (o último desenhado) que cobre o tile. */
export function objectAt(room: Room, x: number, y: number) {
  for (let i = room.objects.length - 1; i >= 0; i--) {
    const f = footprint(room.objects[i]);
    if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return room.objects[i];
  }
  return null;
}

/** Objeto interativo ao alcance de quem está em (x, y): encostado ou em cima, inclusive na diagonal. */
export function interactionNear(room: Room, x: number, y: number) {
  let best: PlacedObject | null = null;
  for (const o of room.objects) {
    if (!o.interaction) continue;
    const f = footprint(o);
    const dx = Math.max(f.x - x, 0, x - (f.x + f.w - 1));
    const dy = Math.max(f.y - y, 0, y - (f.y + f.h - 1));
    if (dx <= 1 && dy <= 1) best = o;
  }
  return best;
}

export function areaBounds(room: Room, name: string) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [key, n] of Object.entries(room.privateAreas)) {
    if (n !== name) continue;
    const { x, y } = parseKey(key);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function areaNames(room: Room) {
  return [...new Set(Object.values(room.privateAreas))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export function spawnTiles(room: Room) {
  return Object.keys(room.spawn).map(parseKey);
}

// ---------------------------------------------------------------- construção de salas

function emptyRoom(id: string, name: string, width: number, height: number, floor: Floor): Room {
  return {
    id,
    name,
    width,
    height,
    floor: Array.from({ length: height }, () => Array<Floor>(width).fill(floor)),
    objects: [],
    impassable: {},
    spawn: {},
    spotlight: {},
    privateAreas: {},
    areaMeta: {},
    portals: {},
    background: null,
    foreground: null,
  };
}

/** Ajuda a montar os modelos de sala com a mesma semântica do editor. */
class Builder {
  room: Room;
  private n = 0;

  constructor(id: string, name: string, w: number, h: number, floor: Floor) {
    this.room = emptyRoom(id, name, w, h, floor);
  }

  floor(x: number, y: number, w: number, h: number, f: Floor) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.room.floor[yy][xx] = f;
  }

  flag(effect: FlagEffect, x: number, y: number, w = 1, h = 1) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.room[effect][tileKey(xx, yy)] = 1;
  }

  put(type: string, x: number, y: number, opts: { color?: number; rot?: number; interaction?: Interaction } = {}) {
    const def = CATALOG[type];
    const obj: PlacedObject = { id: `${this.room.id}-${(this.n++).toString(36)}`, type, x, y, color: opts.color ?? 0, rot: opts.rot ?? def.rotations?.[0] ?? 0 };
    if (opts.interaction) obj.interaction = opts.interaction;
    this.room.objects.push(obj);
    if (def.blocks) this.flag('impassable', x, y, def.w, def.h);
    return obj;
  }

  wallH(x1: number, x2: number, y: number, color = 0) {
    for (let x = x1; x <= x2; x++) this.put('wall', x, y, { color });
  }

  wallV(x: number, y1: number, y2: number, color = 0) {
    for (let y = y1; y <= y2; y++) this.put('wall', x, y, { color });
  }

  /** Abre passagem: remove paredes e bloqueio do tile. */
  open(x: number, y: number, w = 1) {
    for (let xx = x; xx < x + w; xx++) {
      this.room.objects = this.room.objects.filter(o => !(o.type === 'wall' && o.x === xx && o.y === y));
      delete this.room.impassable[tileKey(xx, y)];
    }
  }

  area(name: string, x: number, y: number, w: number, h: number, desk = false) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.room.privateAreas[tileKey(xx, yy)] = name;
    this.room.areaMeta[name] = { desk };
  }

  portal(x: number, y: number, target: PortalTarget) {
    this.room.portals[tileKey(x, y)] = target;
  }
}

export type RoomTemplate = 'office' | 'auditorium' | 'blank';

export const ROOM_TEMPLATES: { id: RoomTemplate; name: string; description: string }[] = [
  { id: 'blank', name: 'Sala em branco', description: 'Retângulo com piso de madeira e paredes, para montar do zero.' },
  { id: 'office', name: 'Escritório', description: 'Mesas ocupáveis, salas de reunião, cabines, cozinha e lounge.' },
  { id: 'auditorium', name: 'Auditório', description: 'Palco com holofote para falar com a sala toda e plateia.' },
];

function blankRoom(id: string, name: string) {
  const b = new Builder(id, name, 24, 16, 'wood');
  b.wallH(0, 23, 0, 1);
  b.wallH(0, 23, 15, 1);
  b.wallV(0, 1, 14, 1);
  b.wallV(23, 1, 14, 1);
  b.flag('spawn', 10, 7, 4, 2);
  return b.room;
}

const WELCOME: Interaction = {
  kind: 'note',
  title: 'Mural de boas-vindas',
  text:
    'Bem-vindo à Praça!\n\n' +
    '• Chegue perto de alguém para conversar.\n' +
    '• Salas de reunião e cabines são áreas privadas.\n' +
    '• Entre numa área de mesa e aperte X para ocupar a sua.\n' +
    '• A porta à esquerda leva ao Auditório — lá, quem sobe no palco é ouvido por todos.\n' +
    '• O martelo abre o Mapmaker para editar o espaço.',
};

function officeRoom(id: string, name: string, auditorium?: string) {
  const b = new Builder(id, name, 50, 36, 'grass');

  // Prédio: interior x 4..45, y 4..25
  b.floor(3, 3, 44, 24, 'wood');
  b.wallH(3, 46, 3);
  b.wallH(3, 46, 26);
  b.wallV(3, 4, 25);
  b.wallV(46, 4, 25);

  // Fileira de salas no topo
  b.floor(4, 4, 10, 8, 'carpet');
  b.floor(15, 4, 10, 8, 'carpet2');
  b.floor(36, 4, 10, 8, 'tile');
  b.wallV(14, 4, 11);
  b.wallV(25, 4, 11);
  b.wallV(35, 4, 11);
  b.wallH(4, 45, 12);
  b.open(9, 12, 2);
  b.open(19, 12, 2);
  b.open(30, 12);
  b.open(40, 12, 2);

  const meetingRoom = (ox: number, label: string) => {
    for (const [dx, dy] of [[3, 7], [5, 7], [3, 8], [5, 8]]) b.put('table', ox + dx, dy);
    for (let x = ox + 3; x <= ox + 6; x++) {
      b.put('chair', x, 6, { rot: 0, color: 1 });
      b.put('chair', x, 9, { rot: 2, color: 1 });
    }
    for (const y of [7, 8]) {
      b.put('chair', ox + 2, y, { rot: 3, color: 1 });
      b.put('chair', ox + 7, y, { rot: 1, color: 1 });
    }
    b.put('whiteboard', ox + 4, 4, { interaction: { kind: 'embed', title: `Quadro — ${label}`, url: '' } });
    b.put('plant', ox, 4);
    b.put('plant', ox + 9, 4);
    b.area(label, ox, 4, 10, 8);
  };
  meetingRoom(4, 'Sala de Reunião A');
  meetingRoom(15, 'Sala de Reunião B');

  // Biblioteca
  for (const x of [26, 28, 30, 32]) b.put('bookshelf', x, 4);
  b.put('plant', 34, 4, { color: 2 });
  b.floor(28, 7, 5, 3, 'rug');
  b.put('sofa', 29, 6, { color: 1 });
  b.put('roundtable', 30, 8);
  b.put('armchair', 28, 8, { rot: 3, color: 1 });
  b.put('armchair', 32, 8, { rot: 1, color: 1 });
  b.put('document', 31, 10, {
    interaction: { kind: 'note', title: 'Recomendações de leitura', text: 'Deixe aqui as recomendações de leitura do time. Edite pelo Mapmaker.' },
  });
  b.put('plant', 26, 11);
  b.put('plant', 34, 11);

  // Cozinha
  for (let x = 36; x <= 41; x++) b.put('counter', x, 4);
  b.put('fridge', 42, 4);
  b.put('watercooler', 44, 4);
  b.put('plant', 45, 4);
  for (const [x, y] of [[39, 7], [41, 7], [39, 8], [41, 8]]) b.put('table', x, y, { color: 1 });
  for (let x = 39; x <= 42; x++) {
    b.put('chair', x, 6, { rot: 0, color: 4 });
    b.put('chair', x, 9, { rot: 2, color: 4 });
  }
  b.put('plant', 36, 11);
  b.put('plant', 45, 11);

  // Escritório aberto: cada lugar (cadeira + mesa) é uma área de mesa ocupável
  let desk = 1;
  for (const cx of [5, 12, 19, 26]) {
    b.put('desk', cx, 15);
    b.put('desk', cx + 2, 15);
    b.put('desk', cx, 16);
    b.put('desk', cx + 2, 16);
    for (let x = cx; x < cx + 4; x++) {
      b.put('chair', x, 14, { rot: 0 });
      b.put('chair', x, 17, { rot: 2 });
      b.area(`Mesa ${desk++}`, x, 14, 1, 2, true);
      b.area(`Mesa ${desk++}`, x, 16, 1, 2, true);
    }
  }
  b.put('tallplant', 4, 13);
  b.put('tallplant', 33, 13);
  b.put('cabinet', 33, 18);
  b.put('printer', 32, 18);

  // Lounge com TV
  b.floor(37, 14, 8, 5, 'rug');
  b.put('tv', 38, 13, { interaction: { kind: 'video', title: 'TV do lounge', url: 'https://www.youtube.com/embed/jfKfPfyJRdk' } });
  b.put('sofa', 38, 18, { rot: 2 });
  b.put('sofa', 40, 18, { rot: 2 });
  b.put('coffeetable', 39, 16);
  b.put('fishbowl', 42, 14);
  b.put('armchair', 37, 16, { rot: 3 });
  b.put('armchair', 42, 16, { rot: 1 });
  b.put('cat', 44, 17, { color: 1 });
  b.put('plant', 45, 13);
  b.put('plant', 45, 19);
  b.area('Lounge', 37, 14, 8, 5);

  // Cabines de foco
  b.wallH(4, 18, 21);
  b.wallV(8, 22, 25);
  b.wallV(13, 22, 25);
  b.wallV(18, 22, 25);
  [4, 9, 14].forEach((px, i) => {
    b.floor(px, 22, 4, 4, 'carpet2');
    b.open(px + 1, 21);
    b.put('desk', px + 1, 25);
    b.put('chair', px + 1, 24, { rot: 0, color: 2 });
    b.put('lamp', px + 3, 25);
    b.put('plant', px + 3, 22);
    b.area(`Cabine de Foco ${i + 1}`, px, 22, 4, 4);
  });

  // Recepção / lobby
  b.floor(26, 21, 10, 4, 'rug');
  for (let x = 21; x <= 24; x++) b.put('counter', x, 22, { color: 2 });
  b.put('board', 19, 21, { interaction: WELCOME });
  b.put('tallplant', 25, 21);
  b.put('plant', 19, 25);
  b.put('plant', 45, 25);
  b.put('plant', 45, 21);
  b.put('screen', 37, 21, { color: 1 });
  b.flag('spawn', 27, 22, 8, 3);

  // Entrada e área externa
  b.open(30, 26, 2);
  b.floor(30, 26, 2, 1, 'wood');
  b.floor(30, 27, 2, 9, 'path');
  b.floor(16, 31, 14, 1, 'path');
  b.floor(8, 29, 8, 5, 'water');
  b.flag('impassable', 8, 29, 8, 5);
  for (const [x, y] of [[1, 1], [8, 1], [16, 0], [25, 1], [34, 1], [42, 0], [48, 2], [1, 10], [1, 26], [48, 12], [48, 24], [20, 29], [40, 29], [44, 33], [24, 33], [36, 32], [2, 34], [48, 34], [17, 34]])
    b.put('tree', x, y, { color: (x + y) % 5 === 0 ? 2 : 0 });
  for (const [x, y] of [[6, 28], [16, 29], [7, 34], [26, 28]]) b.put('bush', x, y);
  for (const [x, y] of [[34, 28], [35, 29], [27, 30], [17, 30], [5, 31]]) b.put('flowers', x, y, { color: (x + y) % 3 });
  b.put('rock', 7, 31);
  b.put('rock', 16, 33, { color: 1 });

  // Porta lateral para o Auditório
  if (auditorium) {
    b.open(3, 18);
    b.open(3, 19);
    b.put('door', 3, 18);
    b.put('door', 3, 19);
    b.portal(3, 18, { room: auditorium, x: 14, y: 19 });
    b.portal(3, 19, { room: auditorium, x: 15, y: 19 });
  }
  return b.room;
}

function auditoriumRoom(id: string, name: string, office?: string) {
  const b = new Builder(id, name, 30, 22, 'carpet2');
  b.wallH(0, 29, 0, 1);
  b.wallH(0, 29, 21, 1);
  b.wallV(0, 1, 20, 1);
  b.wallV(29, 1, 20, 1);
  b.floor(7, 1, 16, 6, 'wood');
  for (const x of [9, 11, 13, 15, 17, 19]) b.put('tv', x, 1, { color: 1 });
  b.put('podium', 14, 3);
  b.flag('spotlight', 12, 4, 6, 2);
  b.put('plant', 7, 1);
  b.put('plant', 22, 1);
  b.put('lamp', 7, 6);
  b.put('lamp', 22, 6);
  for (let y = 9; y <= 17; y += 2)
    for (let x = 4; x <= 25; x++) if (x !== 14 && x !== 15) b.put('chair', x, y, { rot: 2, color: 5 });
  for (const [x, y] of [[1, 1], [28, 1], [1, 20], [28, 20]]) b.put('tallplant', x, y);
  b.flag('spawn', 13, 19, 4, 1);
  if (office) {
    b.open(14, 21, 2);
    b.floor(14, 21, 2, 1, 'wood');
    b.put('door', 14, 21);
    b.put('door', 15, 21);
    b.portal(14, 21, { room: office, x: 4, y: 18 });
    b.portal(15, 21, { room: office, x: 4, y: 19 });
  }
  return b.room;
}

export function createRoom(template: RoomTemplate, id: string, name: string): Room {
  if (template === 'office') return officeRoom(id, name);
  if (template === 'auditorium') return auditoriumRoom(id, name);
  return blankRoom(id, name);
}

/** Mapa padrão de todo espaço novo: escritório + auditório ligados por portais. */
export function createDefaultMap(): SpaceMap {
  const office = officeRoom('escritorio', 'Escritório', 'auditorio');
  const auditorium = auditoriumRoom('auditorio', 'Auditório', 'escritorio');
  return { rooms: { escritorio: office, auditorio: auditorium }, order: ['escritorio', 'auditorio'], entry: 'escritorio', claims: {} };
}

// ---------------------------------------------------------------- validação

function cleanStr(v: unknown, max: number) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** URLs http(s) ou arquivos enviados ao próprio servidor (/uploads/...). */
export function cleanUrl(v: unknown) {
  const s = cleanStr(v, 600);
  if (/^\/uploads\/[\w.-]+$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch {
    return '';
  }
}

export function cleanInteraction(v: unknown): Interaction | null {
  if (!v || typeof v !== 'object') return null;
  const i = v as Partial<Interaction>;
  if (!INTERACTION_KINDS.includes(i.kind as Interaction['kind'])) return null;
  const title = cleanStr(i.title, 60) || 'Sem título';
  if (i.kind === 'note') {
    const text = typeof i.text === 'string' ? i.text.slice(0, 3000) : '';
    return text ? { kind: 'note', title, text } : null;
  }
  const url = cleanUrl(i.url);
  return { kind: i.kind!, title, url };
}

const ID_RE = /^[\w-]{1,48}$/;

function validTiles<T>(room: Room, tiles: unknown, check: (v: unknown) => v is T): Tiles<T> | null {
  if (!Array.isArray(tiles) || !tiles.length || tiles.length > MAX_BATCH) return null;
  const out: Tiles<T> = [];
  for (const t of tiles) if (t && inBounds(room, t.x, t.y) && check(t.value)) out.push({ x: t.x, y: t.y, value: t.value });
  return out.length ? out : null;
}

function cleanObject(room: Room, v: unknown): PlacedObject | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as PlacedObject;
  const def = CATALOG[o.type];
  if (!def || !ID_RE.test(String(o.id)) || !inBounds(room, o.x, o.y)) return null;
  const color = Number.isInteger(o.color) && o.color >= 0 && o.color < def.colors.length ? o.color : 0;
  const rot = def.rotations?.includes(o.rot) ? o.rot : (def.rotations?.[0] ?? 0);
  const obj: PlacedObject = { id: o.id, type: o.type, x: o.x, y: o.y, color, rot };
  const interaction = o.interaction ? cleanInteraction(o.interaction) : null;
  if (interaction) obj.interaction = interaction;
  return obj;
}

function isFloor(v: unknown): v is Floor {
  return FLOORS.includes(v as Floor);
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isAreaName(v: unknown): v is string | null {
  return v === null || (typeof v === 'string' && v.trim().length > 0 && v.length <= 40);
}

/** Sanitiza uma sala inteira (vinda do disco, de um cliente ao criar sala, ou do desfazer). */
export function cleanRoom(v: unknown): Room | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Room;
  if (!ID_RE.test(String(r.id))) return null;
  const width = Number(r.width);
  const height = Number(r.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || width > MAX_ROOM_SIDE || height > MAX_ROOM_SIDE) return null;
  if (!Array.isArray(r.floor) || r.floor.length !== height) return null;
  const room = emptyRoom(r.id, cleanStr(r.name, 40) || 'Sala', width, height, 'wood');
  for (let y = 0; y < height; y++) {
    const row = r.floor[y];
    if (!Array.isArray(row) || row.length !== width) return null;
    for (let x = 0; x < width; x++) room.floor[y][x] = isFloor(row[x]) ? row[x] : 'wood';
  }
  const ids = new Set<string>();
  for (const o of Array.isArray(r.objects) ? r.objects.slice(0, MAX_OBJECTS) : []) {
    const obj = cleanObject(room, o);
    if (obj && !ids.has(obj.id)) {
      ids.add(obj.id);
      room.objects.push(obj);
    }
  }
  const keyOk = (k: string) => {
    const { x, y } = parseKey(k);
    return inBounds(room, x, y);
  };
  for (const effect of FLAG_EFFECTS)
    for (const k of Object.keys(r[effect] ?? {})) if (keyOk(k)) room[effect][k] = 1;
  for (const [k, n] of Object.entries(r.privateAreas ?? {})) if (keyOk(k) && isAreaName(n) && n) room.privateAreas[k] = n.trim();
  for (const name of new Set(Object.values(room.privateAreas))) room.areaMeta[name] = { desk: !!r.areaMeta?.[name]?.desk };
  for (const [k, t] of Object.entries(r.portals ?? {}))
    if (keyOk(k) && t && ID_RE.test(String(t.room)) && Number.isInteger(t.x) && Number.isInteger(t.y)) room.portals[k] = { room: t.room, x: t.x, y: t.y };
  room.background = r.background ? cleanUrl(r.background) || null : null;
  room.foreground = r.foreground ? cleanUrl(r.foreground) || null : null;
  return room;
}

export function isSpaceMap(v: unknown): v is SpaceMap {
  const m = v as SpaceMap;
  return !!m && typeof m.rooms === 'object' && Array.isArray(m.order) && typeof m.entry === 'string' && !!m.rooms[m.entry];
}

// ---------------------------------------------------------------- edição

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Remove ocupações e portais que deixaram de fazer sentido após uma edição. */
function prune(map: SpaceMap) {
  for (const key of Object.keys(map.claims)) {
    const i = key.indexOf(':');
    const room = map.rooms[key.slice(0, i)];
    if (!room || !room.areaMeta[key.slice(i + 1)]?.desk) delete map.claims[key];
  }
  for (const room of Object.values(map.rooms)) {
    for (const [k, t] of Object.entries(room.portals)) if (!map.rooms[t.room]) delete room.portals[k];
    for (const name of Object.keys(room.areaMeta)) if (!Object.values(room.privateAreas).includes(name)) delete room.areaMeta[name];
  }
}

export interface Applied {
  /** Edição normalizada (o que o servidor repassa aos outros). */
  op: MapEdit;
  /** Edição que desfaz esta. */
  inverse: MapEdit;
}

/**
 * Valida e aplica uma edição, devolvendo também o inverso (para desfazer).
 * Roda igual no servidor (fonte da verdade) e no cliente (aplicação otimista).
 */
export function applyEdit(map: SpaceMap, edit: MapEdit, depth = 0): Applied | null {
  const result = applyOne(map, edit, depth);
  if (result) prune(map);
  return result;
}

function applyOne(map: SpaceMap, edit: MapEdit, depth: number): Applied | null {
  if (!edit || typeof edit !== 'object') return null;

  if (edit.kind === 'batch') {
    if (depth > 0 || !Array.isArray(edit.ops) || edit.ops.length > MAX_BATCH) return null;
    const ops: MapEdit[] = [];
    const inverses: MapEdit[] = [];
    for (const sub of edit.ops) {
      const r = applyOne(map, sub, depth + 1);
      if (r) {
        ops.push(r.op);
        inverses.unshift(r.inverse);
      }
    }
    return ops.length ? { op: { kind: 'batch', ops }, inverse: { kind: 'batch', ops: inverses } } : null;
  }

  if (edit.kind === 'room-add') {
    const room = cleanRoom(edit.room);
    if (!room || map.rooms[room.id] || map.order.length >= MAX_ROOMS) return null;
    map.rooms[room.id] = room;
    const index = Number.isInteger(edit.index) ? Math.max(0, Math.min(map.order.length, edit.index!)) : map.order.length;
    map.order.splice(index, 0, room.id);
    return { op: { kind: 'room-add', room: clone(room), index }, inverse: { kind: 'room-remove', id: room.id } };
  }

  if (edit.kind === 'room-remove') {
    const room = map.rooms[edit.id];
    if (!room || edit.id === map.entry) return null;
    const index = map.order.indexOf(edit.id);
    const before = clone(room);
    delete map.rooms[edit.id];
    map.order = map.order.filter(id => id !== edit.id);
    return { op: { kind: 'room-remove', id: edit.id }, inverse: { kind: 'room-add', room: before, index } };
  }

  const room = map.rooms[(edit as { room: string }).room];
  if (!room) return null;
  const roomId = room.id;

  switch (edit.kind) {
    case 'floor': {
      const tiles = validTiles(room, edit.tiles, isFloor);
      if (!tiles) return null;
      const prev = tiles.map(t => ({ x: t.x, y: t.y, value: room.floor[t.y][t.x] }));
      for (const t of tiles) room.floor[t.y][t.x] = t.value;
      return { op: { kind: 'floor', room: roomId, tiles }, inverse: { kind: 'floor', room: roomId, tiles: prev } };
    }
    case 'flag': {
      if (!FLAG_EFFECTS.includes(edit.effect)) return null;
      const tiles = validTiles(room, edit.tiles, isBool);
      if (!tiles) return null;
      const layer = room[edit.effect];
      const prev = tiles.map(t => ({ x: t.x, y: t.y, value: !!layer[tileKey(t.x, t.y)] }));
      for (const t of tiles) {
        if (t.value) layer[tileKey(t.x, t.y)] = 1;
        else delete layer[tileKey(t.x, t.y)];
      }
      return { op: { kind: 'flag', room: roomId, effect: edit.effect, tiles }, inverse: { kind: 'flag', room: roomId, effect: edit.effect, tiles: prev } };
    }
    case 'private': {
      const tiles = validTiles(room, edit.tiles, isAreaName);
      if (!tiles) return null;
      const prev = tiles.map(t => ({ x: t.x, y: t.y, value: room.privateAreas[tileKey(t.x, t.y)] ?? null }));
      for (const t of tiles) {
        if (t.value) {
          const name = t.value.trim();
          room.privateAreas[tileKey(t.x, t.y)] = name;
          room.areaMeta[name] ??= { desk: false };
        } else delete room.privateAreas[tileKey(t.x, t.y)];
      }
      return { op: { kind: 'private', room: roomId, tiles }, inverse: { kind: 'private', room: roomId, tiles: prev } };
    }
    case 'portal': {
      const isTarget = (v: unknown): v is PortalTarget | null => {
        if (v === null) return true;
        const t = v as PortalTarget;
        return !!t && !!map.rooms[t.room] && inBounds(map.rooms[t.room], t.x, t.y);
      };
      const tiles = validTiles(room, edit.tiles, isTarget);
      if (!tiles) return null;
      const prev = tiles.map(t => ({ x: t.x, y: t.y, value: room.portals[tileKey(t.x, t.y)] ?? null }));
      for (const t of tiles) {
        if (t.value) room.portals[tileKey(t.x, t.y)] = { room: t.value.room, x: t.value.x, y: t.value.y };
        else delete room.portals[tileKey(t.x, t.y)];
      }
      return { op: { kind: 'portal', room: roomId, tiles }, inverse: { kind: 'portal', room: roomId, tiles: prev } };
    }
    case 'area-meta': {
      const name = cleanStr(edit.name, 40);
      if (!name || !Object.values(room.privateAreas).includes(name)) return null;
      const prev = room.areaMeta[name] ?? null;
      const meta = edit.meta ? { desk: !!edit.meta.desk } : { desk: false };
      room.areaMeta[name] = meta;
      return { op: { kind: 'area-meta', room: roomId, name, meta }, inverse: { kind: 'area-meta', room: roomId, name, meta: prev } };
    }
    case 'obj-add': {
      const obj = cleanObject(room, edit.obj);
      if (!obj || room.objects.length >= MAX_OBJECTS || room.objects.some(o => o.id === obj.id)) return null;
      room.objects.push(obj);
      return { op: { kind: 'obj-add', room: roomId, obj: clone(obj) }, inverse: { kind: 'obj-remove', room: roomId, id: obj.id } };
    }
    case 'obj-remove': {
      const i = room.objects.findIndex(o => o.id === edit.id);
      if (i < 0) return null;
      const [removed] = room.objects.splice(i, 1);
      return { op: { kind: 'obj-remove', room: roomId, id: edit.id }, inverse: { kind: 'obj-add', room: roomId, obj: removed } };
    }
    case 'obj-update': {
      const obj = room.objects.find(o => o.id === edit.id);
      if (!obj || !edit.patch || typeof edit.patch !== 'object') return null;
      const next = cleanObject(room, {
        ...obj,
        ...edit.patch,
        interaction: edit.patch.interaction === undefined ? obj.interaction : edit.patch.interaction ?? undefined,
      });
      if (!next) return null;
      const prevPatch: Extract<MapEdit, { kind: 'obj-update' }>['patch'] = {};
      const patch: Extract<MapEdit, { kind: 'obj-update' }>['patch'] = {};
      for (const k of ['x', 'y', 'color', 'rot'] as const)
        if (edit.patch[k] !== undefined) {
          prevPatch[k] = obj[k];
          patch[k] = next[k];
        }
      if (edit.patch.interaction !== undefined) {
        prevPatch.interaction = obj.interaction ?? null;
        patch.interaction = next.interaction ?? null;
      }
      Object.assign(obj, { x: next.x, y: next.y, color: next.color, rot: next.rot });
      if (next.interaction) obj.interaction = next.interaction;
      else delete obj.interaction;
      return { op: { kind: 'obj-update', room: roomId, id: obj.id, patch }, inverse: { kind: 'obj-update', room: roomId, id: obj.id, patch: prevPatch } };
    }
    case 'room-update': {
      const patch: { name?: string; background?: string | null; foreground?: string | null } = {};
      const prev: typeof patch = {};
      if (edit.patch?.name !== undefined) {
        const name = cleanStr(edit.patch.name, 40);
        if (!name) return null;
        prev.name = room.name;
        patch.name = room.name = name;
      }
      for (const layer of ['background', 'foreground'] as const)
        if (edit.patch?.[layer] !== undefined) {
          const url = edit.patch[layer] ? cleanUrl(edit.patch[layer]) || null : null;
          prev[layer] = room[layer];
          patch[layer] = room[layer] = url;
        }
      if (!Object.keys(patch).length) return null;
      return { op: { kind: 'room-update', room: roomId, patch }, inverse: { kind: 'room-update', room: roomId, patch: prev } };
    }
  }
  return null;
}
