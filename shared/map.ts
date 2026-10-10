import { CATALOG } from './catalog';

export const TILE = 32;

export const FLOORS = ['grass', 'wood', 'darkwood', 'carpet', 'carpet2', 'tile', 'hex', 'path', 'sand', 'water', 'rug', 'darkrug', 'stone', 'dark', 'moss'] as const;
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
  /** Texto de placas e letreiros. */
  label?: string;
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

/**
 * Pessoa com acesso a uma área trancada. `tag` é o hash público do navegador;
 * enquanto for null, a vaga está reservada pelo nome e se prende ao primeiro
 * navegador com esse nome que entrar.
 */
export interface AllowedPerson {
  name: string;
  tag: string | null;
}

export interface AreaMeta {
  /** Área de mesa: pode ser ocupada por uma pessoa. */
  desk: boolean;
  /** Área trancada: só quem está em `allowed` entra (e edita o que tem dentro). */
  locked?: boolean;
  allowed?: AllowedPerson[];
}

/** Quem está tentando entrar/editar. */
export interface Who {
  tag: string;
  name: string;
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

/** Se a pessoa consta na lista da área (pelo navegador; ou pelo nome, se a vaga ainda não foi presa). */
export function isAllowed(meta: AreaMeta | undefined, who: Who) {
  if (!meta?.locked) return true;
  return !!meta.allowed?.some(a => (a.tag ? a.tag === who.tag : a.name.toLowerCase() === who.name.trim().toLowerCase()));
}

/** Área trancada em que o tile fica, se a pessoa não tiver acesso a ela. */
export function lockedAgainst(room: Room, x: number, y: number, who: Who) {
  const name = areaAt(room, x, y);
  if (!name) return null;
  return isAllowed(room.areaMeta[name], who) ? null : name;
}

export function canEnter(room: Room, x: number, y: number, who: Who) {
  return isWalkable(room, x, y) && !lockedAgainst(room, x, y, who);
}

/** Tiles que uma edição toca (para proteger o conteúdo de áreas trancadas). */
function touchedTiles(map: SpaceMap, op: MapEdit): { room: Room; tiles: { x: number; y: number }[] }[] {
  if (op.kind === 'batch') return op.ops.flatMap(o => touchedTiles(map, o));
  if (op.kind === 'room-add' || op.kind === 'room-remove' || op.kind === 'room-update') return [];
  const room = map.rooms[op.room];
  if (!room) return [];
  const rect = (r: Rect) => {
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
    return out;
  };
  switch (op.kind) {
    case 'floor':
    case 'flag':
    case 'private':
    case 'portal':
      return [{ room, tiles: Array.isArray(op.tiles) ? op.tiles : [] }];
    case 'obj-add':
      return op.obj ? [{ room, tiles: rect(footprint(op.obj)) }] : [];
    case 'obj-remove':
    case 'obj-update': {
      const obj = room.objects.find(o => o.id === op.id);
      if (!obj) return [];
      const tiles = rect(footprint(obj));
      if (op.kind === 'obj-update' && (op.patch?.x !== undefined || op.patch?.y !== undefined))
        tiles.push(...rect(footprint({ ...obj, x: op.patch.x ?? obj.x, y: op.patch.y ?? obj.y })));
      return [{ room, tiles }];
    }
    case 'area-meta':
      return [];
  }
  return [];
}

/**
 * Se a pessoa pode fazer esta edição: ninguém mexe dentro de uma área trancada,
 * nem nas regras dela, sem estar na lista. Retorna o motivo quando não pode.
 */
export function editDenied(map: SpaceMap, op: MapEdit, who: Who): string | null {
  if (op.kind === 'batch') {
    for (const o of Array.isArray(op.ops) ? op.ops : []) {
      const reason = editDenied(map, o, who);
      if (reason) return reason;
    }
    return null;
  }
  if (op.kind === 'room-remove') {
    const room = map.rooms[op.id];
    if (room && Object.values(room.areaMeta).some(m => !isAllowed(m, who))) return 'Esta sala tem áreas trancadas que você não pode apagar.';
    return null;
  }
  if (op.kind === 'area-meta') {
    const room = map.rooms[op.room];
    if (!room) return null;
    if (!isAllowed(room.areaMeta[op.name], who)) return `Só quem tem acesso a "${op.name}" pode mudar as regras dela.`;
    if (op.meta?.locked && !isAllowed(cleanMeta(op.meta), who)) return 'Inclua você mesmo na lista antes de trancar.';
    return null;
  }
  if (op.kind === 'portal' && Array.isArray(op.tiles))
    for (const t of op.tiles) {
      const target = t?.value ? map.rooms[t.value.room] : null;
      const name = target && lockedAgainst(target, t.value!.x, t.value!.y, who);
      if (name) return `O destino fica dentro de "${name}", que está trancada.`;
    }
  if (op.kind === 'private' && Array.isArray(op.tiles)) {
    const room = map.rooms[op.room];
    for (const t of op.tiles)
      if (room && typeof t?.value === 'string' && !isAllowed(room.areaMeta[t.value.trim()], who)) return `"${t.value}" está trancada.`;
  }
  for (const { room, tiles } of touchedTiles(map, op))
    for (const t of tiles) {
      const name = lockedAgainst(room, t.x, t.y, who);
      if (name) return `"${name}" está trancada — só quem tem acesso pode editar lá dentro.`;
    }
  return null;
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

  put(type: string, x: number, y: number, opts: { color?: number; rot?: number; interaction?: Interaction; label?: string } = {}) {
    const def = CATALOG[type];
    const obj: PlacedObject = { id: `${this.room.id}-${(this.n++).toString(36)}`, type, x, y, color: opts.color ?? 0, rot: opts.rot ?? def.rotations?.[0] ?? 0 };
    if (opts.interaction) obj.interaction = opts.interaction;
    if (def.label !== undefined) obj.label = opts.label ?? def.label;
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

  area(name: string, x: number, y: number, w: number, h: number, desk = false, allowedNames?: string[]) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.room.privateAreas[tileKey(xx, yy)] = name;
    this.room.areaMeta[name] = allowedNames ? { desk, locked: true, allowed: allowedNames.map(n => ({ name: n, tag: null })) } : { desk };
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
    '• A porta "All Hands" no topo leva ao Auditório — lá, quem sobe no palco é ouvido por todos.\n' +
    '• O martelo abre o Mapmaker para editar o espaço.',
};

/**
 * Escritório no layout do modelo de escritório remoto do Gather (refeitório à esquerda,
 * faixa de foco/zen/lounge no topo, pátio com ilhas de mesas, salas à direita e embaixo).
 */
function officeRoom(id: string, name: string, auditorium?: string) {
  const b = new Builder(id, name, 64, 41, 'grass');
  const OUTER = 5;
  const FACE = 4;
  /** Troca a parede do tile por outro objeto (janela, porta, quadro na parede). */
  const swap = (type: string, x: number, y: number, opts: Parameters<Builder['put']>[3] = {}) => {
    const def = CATALOG[type];
    for (let i = 0; i < def.w; i++) b.open(x + i, y);
    return b.put(type, x, y, opts);
  };

  // Casca do prédio
  b.floor(2, 3, 60, 36, 'wood');
  b.wallH(1, 62, 2, OUTER);
  b.wallH(1, 62, 39, OUTER);
  b.wallV(1, 3, 38, OUTER);
  b.wallV(62, 3, 38, OUTER);
  b.wallH(2, 61, 3, FACE);
  // Saída lateral esquerda para o jardim
  for (let y = 27; y <= 30; y++) {
    b.open(1, y);
    b.floor(1, y, 1, 1, 'wood');
  }
  b.put('railing', 0, 26);

  // ---------------- Refeitório e cozinha (esquerda)
  b.floor(2, 4, 16, 17, 'darkwood');
  b.wallV(18, 4, 7, FACE);
  b.put('console', 18, 8);
  swap('frame', 3, 3);
  for (let x = 4; x <= 8; x++) swap('window', x, 3);
  b.put('plant', 10, 4);
  b.put('fridge', 12, 4);
  for (let x = 13; x <= 16; x++) b.put('counter', x, 4);
  b.put('counter', 17, 4, { color: 1 });
  for (let x = 14; x <= 17; x++) {
    b.put('counter', x, 7, { color: 1 });
    b.put('stool', x, 8);
  }
  const dining = (rx: number, ry: number, sides: boolean) => {
    b.floor(rx, ry, 5, 5, 'darkrug');
    const tx = rx + 1;
    const ty = ry + 1;
    b.put('diningtable', tx, ty);
    for (let x = tx; x < tx + 3; x++) {
      b.put('chair', x, ty - 1, { rot: 0, color: 6 });
      b.put('chair', x, ty + 2, { rot: 2, color: 6 });
    }
    if (sides)
      for (const y of [ty, ty + 1]) {
        b.put('chair', tx - 1, y, { rot: 3, color: 6 });
        b.put('chair', tx + 3, y, { rot: 1, color: 6 });
      }
  };
  dining(3, 5, true);
  dining(10, 10, false);
  dining(3, 12, true);
  dining(11, 16, false);
  b.put('coffeecart', 8, 20);
  b.put('watercooler', 7, 21);
  for (let x = 3; x <= 17; x++) if (x < 7 || x > 9) b.put('railing', x, 21, { rot: 0 });
  for (let y = 14; y <= 21; y++) b.put('railing', 18, y, { rot: 1 });
  b.put('standsign', 2, 22, { label: 'i', interaction: WELCOME });

  // ---------------- Faixa do topo
  swap('board', 20, 3, { color: 2 });
  swap('board', 22, 3, {
    color: 1,
    interaction: {
      kind: 'note',
      title: 'Mapa do escritório',
      text: 'Refeitório à esquerda · Foco, jardim zen e lounge no topo · Mesas no pátio · Salas de reunião à direita · All Hands pela porta do topo.',
    },
  });
  for (let x = 25; x <= 27; x++) b.put('locker', x, 4);
  b.put('printer', 28, 4);
  b.put('watercooler', 30, 4);
  b.put('plant', 31, 4);
  b.put('cabinet', 32, 4, { color: 1 });
  swap('door', 34, 3);
  swap('door', 35, 3);
  b.put('plaque', 34, 4, { label: 'ALL HANDS' });
  b.put('bookshelf', 37, 4);
  b.put('screen', 39, 4, { color: 1 });
  b.put('lamp', 42, 4);
  swap('stairs', 43, 3);
  if (auditorium) {
    b.portal(34, 3, { room: auditorium, x: 14, y: 19 });
    b.portal(35, 3, { room: auditorium, x: 15, y: 19 });
  }

  // Sala de foco: 6 cabines
  b.floor(22, 5, 6, 6, 'dark');
  for (const y of [5, 7, 9]) {
    b.put('smalldesk', 23, y);
    b.put('smalldesk', 26, y);
    b.put('chair', 22, y, { rot: 3 });
    b.put('chair', 27, y, { rot: 1 });
  }
  b.flag('impassable', 24, 5, 2, 6);
  b.put('plaque', 24, 7, { label: 'FOCUS' });
  b.area('Foco', 22, 5, 6, 6);

  // Jardim zen
  b.floor(29, 5, 5, 5, 'sand');
  b.put('rock', 30, 6);
  b.put('rock', 32, 7);
  b.put('rock', 30, 8, { color: 1 });
  b.put('plant', 33, 9);
  b.flag('impassable', 29, 5, 5, 5);

  // Lounge azul
  b.floor(37, 5, 6, 6, 'carpet');
  b.put('sofa', 39, 5, { rot: 0 });
  b.put('sofa', 39, 10, { rot: 2 });
  b.put('sofaside', 37, 6, { rot: 3 });
  b.put('sofaside', 42, 6, { rot: 1 });
  b.put('coffeetable', 39, 7, { color: 1 });
  b.put('plant', 37, 9, { color: 2 });
  b.area('Lounge', 37, 5, 6, 6);

  // ---------------- Pátio com ilhas de mesas
  b.floor(21, 12, 25, 16, 'grass');
  let desk = 1;
  const pod = (x0: number, y0: number) => {
    b.floor(x0 - 1, y0 - 1, 11, 6, 'moss');
    for (let i = 0; i < 3; i++) {
      const dx = x0 + i * 3;
      b.put('desklong', dx, y0 + 1);
      b.put('desklong', dx, y0 + 2);
      b.put('chair', dx + 1, y0, { rot: 0, color: 7 });
      b.put('chair', dx + 1, y0 + 3, { rot: 2, color: 7 });
      b.area(`Mesa ${desk++}`, dx, y0, 3, 2, true);
      b.area(`Mesa ${desk++}`, dx, y0 + 2, 3, 2, true);
    }
  };
  pod(23, 14);
  pod(35, 14);
  pod(23, 22);
  pod(35, 22);
  for (const [x, y] of [[22, 12], [44, 12], [22, 26], [44, 26]]) b.put('tree', x, y);
  b.put('arrowsign', 27, 27, { rot: 1, label: 'TEAM GAMES' });
  b.put('arrowsign', 35, 27, { rot: 3, label: 'MEETINGS' });
  b.put('cat', 21, 23);
  for (const x of [17, 18, 19]) b.put('scooter', x, 27, { color: x % 2 });
  b.put('standsign', 20, 27, { label: 'P' });
  b.flag('spawn', 24, 29, 18, 2);

  // ---------------- Salas da direita (Karol e Guilherme), trancadas para os dois
  const OWNERS = ['Karol', 'Guilherme'];
  b.wallV(47, 3, 13, OUTER);
  b.wallV(54, 3, 12, OUTER);
  swap('door', 54, 8); // passagem entre as duas salas
  b.floor(48, 4, 6, 9, 'darkwood');
  b.floor(55, 4, 7, 9, 'darkwood');
  b.wallH(47, 61, 13, FACE);
  for (const x of [50, 51, 57, 58]) swap('door', x, 13);

  // Sala da Karol (CTO): TV com videogame, setup de 3 monitores, mesa e fliperamas
  swap('doorsign', 52, 13, { label: 'CTO' });
  b.floor(48, 6, 5, 5, 'carpet');
  b.put('tv', 48, 4, { interaction: { kind: 'video', title: 'TV da Karol', url: 'https://www.youtube.com/embed/jfKfPfyJRdk' } });
  b.put('videogame', 48, 5);
  b.put('sofa', 48, 7, { rot: 2, color: 4 });
  b.put('workstation3', 51, 4);
  b.put('chair', 52, 5, { rot: 2, color: 5 });
  b.put('table', 50, 10);
  b.put('arcade', 53, 10);
  b.put('arcade', 53, 11, { color: 2 });
  b.put('plant', 48, 12);
  b.area('Sala da Karol', 48, 4, 6, 9, false, OWNERS);

  // Sala do Guilherme: vitrola, quadros, setup de 5 monitores, Hachi, 3 luminárias e laguinho de pesca
  for (const x of [56, 58, 60]) swap('frame', x, 3, { color: x === 58 ? 1 : 0 });
  b.put('turntable', 55, 4);
  b.put('workstation5', 58, 4);
  b.put('chair', 59, 5, { rot: 2, color: 0 });
  b.put('lamp', 61, 4);
  b.put('lamp', 55, 7, { color: 1 });
  b.put('lamp', 55, 12);
  b.put('dog', 57, 9, { label: 'Hachi' });
  b.floor(59, 10, 3, 3, 'water');
  b.flag('impassable', 59, 10, 3, 3);
  b.put('rock', 61, 9, { color: 1 });
  b.put('fishingrod', 58, 11, { interaction: { kind: 'note', title: 'Laguinho de pesca', text: '🎣 Pescaria do Guilherme. O Hachi sempre fica de olho nos peixes.' } });
  b.put('flowers', 58, 12);
  b.area('Sala do Guilherme', 55, 4, 7, 9, false, OWNERS);
  b.put('cabinet', 61, 14, { color: 1 });

  // Sala de reunião grande
  b.wallV(47, 16, 28, OUTER);
  b.wallH(48, 61, 16, FACE);
  b.wallH(48, 61, 28, FACE);
  for (const x of [54, 55]) {
    swap('door', x, 16);
    swap('door', x, 28);
  }
  b.floor(48, 17, 14, 11, 'hex');
  for (const x of [48, 49, 51, 52, 57, 58, 59, 61]) b.put('console', x, 17, { color: x % 2 });
  for (const y of [19, 20, 21]) b.put('barrel', 48, y);
  b.put('barrel', 48, 24, { color: 1 });
  b.put('cabinet', 49, 27);
  b.put('console', 61, 19);
  b.put('lamp', 61, 23, { color: 1 });
  b.put('conftable', 52, 22, { interaction: { kind: 'embed', title: 'Telão da sala de reunião', url: '' } });
  for (let x = 52; x <= 56; x++) {
    b.put('chair', x, 21, { rot: 0, color: 1 });
    b.put('chair', x, 26, { rot: 2, color: 1 });
  }
  for (let y = 22; y <= 25; y++) {
    b.put('chair', 51, y, { rot: 3, color: 1 });
    b.put('chair', 57, y, { rot: 1, color: 1 });
  }
  b.area('Sala de Reunião', 48, 17, 14, 11);

  // ---------------- Faixa de baixo
  b.wallH(2, 61, 31, FACE);
  b.wallV(19, 31, 38, OUTER);
  b.wallV(47, 31, 38, OUTER);
  for (const x of [5, 8, 11, 14]) swap('window', x, 31);
  for (let x = 21; x <= 45; x++) if (x < 30 || x > 35) swap('window', x, 31, { color: 1 });
  for (const x of [17, 32, 33, 54, 55]) swap('door', x, 31);

  // Jogos do time
  b.floor(2, 32, 17, 7, 'carpet2');
  for (const [x, c] of [[3, 0], [4, 1], [5, 2], [6, 0]] as const) b.put('arcade', x, 32, { color: c });
  b.put('roundtable', 13, 35);
  b.put('chair', 13, 34, { rot: 0, color: 4 });
  b.put('chair', 13, 36, { rot: 2, color: 4 });
  b.put('chair', 12, 35, { rot: 3, color: 4 });
  b.put('chair', 14, 35, { rot: 1, color: 4 });
  b.put('sofa', 4, 37, { rot: 2, color: 3 });
  b.put('plant', 18, 38);
  b.area('Jogos do Time', 2, 32, 17, 7);

  // Reuniões pequenas
  b.floor(20, 32, 27, 7, 'tile');
  b.put('plant', 20, 32);
  b.put('plant', 46, 32);
  for (const [x0, label] of [[23, 'Reunião 3'], [37, 'Reunião 4']] as const) {
    b.put('diningtable', x0 + 1, 34, { color: 2 });
    for (let x = x0 + 1; x <= x0 + 3; x++) {
      b.put('chair', x, 33, { rot: 0, color: 1 });
      b.put('chair', x, 36, { rot: 2, color: 1 });
    }
    b.put('whiteboard', x0 + 1, 38, { interaction: { kind: 'embed', title: `Quadro — ${label}`, url: '' } });
  }
  b.area('Reunião 3', 20, 32, 12, 7);
  b.area('Reunião 4', 34, 32, 13, 7);

  // Biblioteca
  b.floor(48, 32, 14, 7, 'darkwood');
  for (const x of [48, 50, 52, 57, 59]) b.put('bookshelf', x, 32);
  b.put('plant', 61, 32);
  for (const cx of [50, 59]) {
    b.put('roundtable', cx, 35);
    b.put('armchair', cx - 1, 35, { rot: 3, color: 1 });
    b.put('armchair', cx + 1, 35, { rot: 1, color: 1 });
  }
  b.put('document', 58, 37, {
    interaction: { kind: 'note', title: 'Recomendações de leitura', text: 'Deixe aqui as recomendações de leitura do time. Edite pelo Mapmaker.' },
  });
  b.put('lamp', 61, 38);

  // ---------------- Jardim em volta
  for (const [x, y] of [[0, 5], [0, 12], [0, 19], [0, 33], [63, 6], [63, 15], [63, 24], [63, 34], [10, 40], [30, 40], [50, 40]]) b.put('bush', x, y);
  for (const [x, y] of [[5, 0], [14, 1], [26, 0], [52, 0], [58, 1], [0, 39], [63, 40]]) b.put('tree', x, y);
  b.put('flowers', 0, 28, { color: 1 });
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
    b.portal(14, 21, { room: office, x: 34, y: 4 });
    b.portal(15, 21, { room: office, x: 35, y: 4 });
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
  if (def.label !== undefined) obj.label = typeof o.label === 'string' ? o.label.trim().slice(0, 24) : def.label;
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
  for (const name of new Set(Object.values(room.privateAreas))) room.areaMeta[name] = cleanMeta(r.areaMeta?.[name]);
  for (const [k, t] of Object.entries(r.portals ?? {}))
    if (keyOk(k) && t && ID_RE.test(String(t.room)) && Number.isInteger(t.x) && Number.isInteger(t.y)) room.portals[k] = { room: t.room, x: t.x, y: t.y };
  room.background = r.background ? cleanUrl(r.background) || null : null;
  room.foreground = r.foreground ? cleanUrl(r.foreground) || null : null;
  return room;
}

function cleanMeta(v: unknown): AreaMeta {
  const m = (v ?? {}) as AreaMeta;
  const meta: AreaMeta = { desk: !!m.desk };
  if (m.locked) {
    meta.locked = true;
    meta.allowed = (Array.isArray(m.allowed) ? m.allowed : [])
      .filter(a => a && typeof a.name === 'string' && a.name.trim())
      .slice(0, 30)
      .map(a => ({ name: a.name.trim().slice(0, 24), tag: typeof a.tag === 'string' ? a.tag.slice(0, 32) : null }));
  }
  return meta;
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
      const meta = cleanMeta(edit.meta);
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
      if (edit.patch.label !== undefined && next.label !== undefined) {
        prevPatch.label = obj.label ?? '';
        patch.label = next.label;
      }
      if (edit.patch.interaction !== undefined) {
        prevPatch.interaction = obj.interaction ?? null;
        patch.interaction = next.interaction ?? null;
      }
      Object.assign(obj, { x: next.x, y: next.y, color: next.color, rot: next.rot });
      if (next.label !== undefined) obj.label = next.label;
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
