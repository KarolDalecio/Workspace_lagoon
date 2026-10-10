export const TILE = 32;

export const FLOORS = ['grass', 'wood', 'carpet', 'carpet2', 'tile', 'path', 'water', 'rug'] as const;
export const OBJECTS = [
  'wall',
  'desk',
  'chair',
  'plant',
  'tree',
  'sofa',
  'table',
  'counter',
  'whiteboard',
  'bookshelf',
  'tv',
  'board',
] as const;

export type Floor = (typeof FLOORS)[number];
export type Obj = (typeof OBJECTS)[number];

/** Área privada: quem está dentro só conversa com quem está na mesma área. */
export interface Area {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** O que acontece ao apertar X perto de um objeto. */
export interface Interaction {
  kind: 'embed' | 'note' | 'link';
  title: string;
  url?: string;
  text?: string;
}

/** Mesa ocupada. `owner` é um identificador público (hash) da pessoa, nunca a chave dela. */
export interface DeskClaim {
  owner: string;
  name: string;
}

export interface GameMap {
  width: number;
  height: number;
  floor: Floor[][];
  objects: (Obj | null)[][];
  areas: Area[];
  spawn: Rect;
  /** Chave "x,y" do tile do objeto. */
  interactions: Record<string, Interaction>;
  /** Chave "x,y" da cadeira da mesa. */
  claims: Record<string, DeskClaim>;
}

export type MapEdit =
  | { kind: 'tiles'; tiles: { x: number; y: number; floor?: Floor; object?: Obj | null }[] }
  | { kind: 'area-add'; area: Area }
  | { kind: 'area-remove'; id: string }
  | { kind: 'spawn'; rect: Rect }
  | { kind: 'interaction'; key: string; value: Interaction | null };

export const INTERACTIVE_OBJECTS = new Set<Obj>(['whiteboard', 'tv', 'board', 'bookshelf']);
const BLOCKING = new Set<Obj>(['wall', 'desk', 'plant', 'tree', 'sofa', 'table', 'counter', 'whiteboard', 'bookshelf', 'tv', 'board']);
const MAX_AREAS = 60;

export const tileKey = (x: number, y: number) => `${x},${y}`;

export function parseKey(key: string) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

/** Escritório padrão de todo espaço novo. */
export function createDefaultMap(): GameMap {
  const W = 50;
  const H = 36;
  const floor: Floor[][] = Array.from({ length: H }, () => Array<Floor>(W).fill('grass'));
  const objects: (Obj | null)[][] = Array.from({ length: H }, () => Array<Obj | null>(W).fill(null));

  const setF = (x: number, y: number, w: number, h: number, f: Floor) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) floor[yy][xx] = f;
  };
  const setO = (x: number, y: number, w: number, h: number, o: Obj | null) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) objects[yy][xx] = o;
  };
  const hWall = (x1: number, x2: number, y: number) => setO(x1, y, x2 - x1 + 1, 1, 'wall');
  const vWall = (x: number, y1: number, y2: number) => setO(x, y1, 1, y2 - y1 + 1, 'wall');
  const open = (x: number, y: number, w = 1, h = 1) => setO(x, y, w, h, null);

  // Prédio: interior x 4..45, y 4..25
  setF(3, 3, 44, 24, 'wood');
  hWall(3, 46, 3);
  hWall(3, 46, 26);
  vWall(3, 3, 26);
  vWall(46, 3, 26);

  // Fileira de salas no topo
  setF(4, 4, 10, 8, 'carpet');
  setF(15, 4, 10, 8, 'carpet2');
  setF(36, 4, 10, 8, 'tile');
  vWall(14, 4, 11);
  vWall(25, 4, 11);
  vWall(35, 4, 11);
  hWall(4, 45, 12);
  open(9, 12, 2);
  open(19, 12, 2);
  open(30, 12);
  open(40, 12, 2);

  const meetingRoom = (ox: number) => {
    setO(ox + 3, 7, 4, 2, 'table');
    setO(ox + 3, 6, 4, 1, 'chair');
    setO(ox + 3, 9, 4, 1, 'chair');
    setO(ox + 2, 7, 1, 2, 'chair');
    setO(ox + 7, 7, 1, 2, 'chair');
    setO(ox + 4, 4, 2, 1, 'whiteboard');
    setO(ox, 4, 1, 1, 'plant');
    setO(ox + 9, 4, 1, 1, 'plant');
  };
  meetingRoom(4);
  meetingRoom(15);

  // Biblioteca
  setO(26, 4, 9, 1, 'bookshelf');
  setF(28, 7, 5, 3, 'rug');
  setO(29, 6, 3, 1, 'sofa');
  setO(30, 8, 1, 1, 'table');
  setO(28, 8, 1, 1, 'chair');
  setO(32, 8, 1, 1, 'chair');
  setO(26, 11, 1, 1, 'plant');
  setO(34, 11, 1, 1, 'plant');

  // Cozinha
  setO(36, 4, 10, 1, 'counter');
  setO(39, 7, 4, 2, 'table');
  setO(39, 6, 4, 1, 'chair');
  setO(39, 9, 4, 1, 'chair');
  setO(36, 11, 1, 1, 'plant');
  setO(45, 11, 1, 1, 'plant');

  // Escritório aberto
  for (const cx of [5, 11, 17, 23, 29]) {
    setO(cx, 15, 3, 2, 'desk');
    setO(cx, 14, 3, 1, 'chair');
    setO(cx, 17, 3, 1, 'chair');
  }
  setO(4, 13, 1, 1, 'plant');
  setO(35, 14, 1, 1, 'plant');
  setO(35, 18, 1, 1, 'plant');

  // Lounge com TV
  setF(37, 14, 8, 5, 'rug');
  setO(38, 13, 2, 1, 'tv');
  setO(38, 18, 4, 1, 'sofa');
  setO(39, 16, 2, 1, 'table');
  setO(37, 16, 1, 1, 'chair');
  setO(42, 16, 1, 1, 'chair');
  setO(45, 13, 1, 1, 'plant');
  setO(45, 19, 1, 1, 'plant');

  // Cabines de foco
  hWall(4, 18, 21);
  vWall(8, 21, 25);
  vWall(13, 21, 25);
  vWall(18, 21, 25);
  for (const px of [4, 9, 14]) {
    setF(px, 22, 4, 4, 'carpet2');
    open(px + 1, 21);
    setO(px + 1, 25, 2, 1, 'desk');
    setO(px + 1, 24, 2, 1, 'chair');
    setO(px + 3, 22, 1, 1, 'plant');
  }

  // Recepção / lobby com mural
  setF(26, 21, 10, 4, 'rug');
  setO(21, 22, 4, 1, 'counter');
  setO(19, 21, 2, 1, 'board');
  setO(19, 25, 1, 1, 'plant');
  setO(45, 25, 1, 1, 'plant');
  setO(45, 21, 1, 1, 'plant');

  // Entrada e área externa
  open(30, 26, 2);
  setF(30, 26, 2, 1, 'wood');
  setF(30, 27, 2, 9, 'path');
  setF(16, 31, 14, 1, 'path');
  setF(8, 29, 8, 5, 'water');
  const trees = [
    [1, 1], [8, 1], [16, 0], [25, 1], [34, 1], [42, 0], [48, 2], [1, 10], [1, 20], [48, 12],
    [48, 24], [5, 28], [20, 29], [40, 29], [44, 33], [24, 33], [36, 32], [2, 34], [48, 34], [17, 34],
  ];
  for (const [x, y] of trees) setO(x, y, 1, 1, 'tree');

  const welcome: Interaction = {
    kind: 'note',
    title: 'Mural de boas-vindas',
    text:
      'Bem-vindo à Praça!\n\n• Chegue perto de alguém para conversar.\n• Salas de reunião e cabines são privadas.\n' +
      '• Sente numa cadeira de mesa e aperte X para ocupar a sua mesa.\n• Use o botão de martelo para editar o mapa.',
  };
  const tv: Interaction = { kind: 'embed', title: 'TV do lounge', url: 'https://www.youtube.com/embed/jfKfPfyJRdk' };
  const shelf: Interaction = {
    kind: 'note',
    title: 'Estante',
    text: 'Deixe aqui recomendações de leitura do time. Edite este texto pelo modo de edição.',
  };

  return {
    width: W,
    height: H,
    floor,
    objects,
    areas: [
      { id: 'meeting-a', name: 'Sala de Reunião A', x: 4, y: 4, w: 10, h: 8 },
      { id: 'meeting-b', name: 'Sala de Reunião B', x: 15, y: 4, w: 10, h: 8 },
      { id: 'pod-1', name: 'Cabine de Foco 1', x: 4, y: 22, w: 4, h: 4 },
      { id: 'pod-2', name: 'Cabine de Foco 2', x: 9, y: 22, w: 4, h: 4 },
      { id: 'pod-3', name: 'Cabine de Foco 3', x: 14, y: 22, w: 4, h: 4 },
    ],
    spawn: { x: 27, y: 22, w: 8, h: 3 },
    interactions: {
      [tileKey(19, 21)]: welcome,
      [tileKey(20, 21)]: welcome,
      [tileKey(38, 13)]: tv,
      [tileKey(39, 13)]: tv,
      [tileKey(30, 4)]: shelf,
    },
    claims: {},
  };
}

export function inBounds(map: GameMap, x: number, y: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isWalkable(map: GameMap, x: number, y: number) {
  if (!inBounds(map, x, y)) return false;
  if (map.floor[y][x] === 'water') return false;
  const o = map.objects[y][x];
  return !(o && BLOCKING.has(o));
}

export function areaAt(map: GameMap, x: number, y: number): Area | null {
  const tx = Math.round(x);
  const ty = Math.round(y);
  return map.areas.find(a => tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h) ?? null;
}

const NEIGHBORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Uma cadeira encostada numa mesa de trabalho é uma mesa que pode ser ocupada. */
export function isDesk(map: GameMap, x: number, y: number) {
  if (!inBounds(map, x, y) || map.objects[y][x] !== 'chair') return false;
  return NEIGHBORS.some(([dx, dy]) => map.objects[y + dy]?.[x + dx] === 'desk');
}

/** Tile da mesa onde a cadeira encosta (para desenhar a plaquinha com o nome). */
export function deskTileFor(map: GameMap, x: number, y: number) {
  for (const [dx, dy] of NEIGHBORS) if (map.objects[y + dy]?.[x + dx] === 'desk') return { x: x + dx, y: y + dy };
  return null;
}

/** Objeto interativo ao alcance de quem está em (x, y): no mesmo tile ou vizinho. */
export function interactionNear(map: GameMap, x: number, y: number) {
  for (const [dx, dy] of [[0, 0], ...NEIGHBORS]) {
    const key = tileKey(x + dx, y + dy);
    const value = map.interactions[key];
    if (value) return { key, value };
  }
  return null;
}

function cleanStr(v: unknown, max: number) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function cleanUrl(v: unknown) {
  const s = cleanStr(v, 500);
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
  if (i.kind !== 'embed' && i.kind !== 'note' && i.kind !== 'link') return null;
  const title = cleanStr(i.title, 60) || 'Sem título';
  if (i.kind === 'note') {
    const text = typeof i.text === 'string' ? i.text.slice(0, 2000) : '';
    return text ? { kind: 'note', title, text } : null;
  }
  const url = cleanUrl(i.url);
  return url ? { kind: i.kind, title, url } : null;
}

function cleanRect(map: GameMap, r: unknown): Rect | null {
  if (!r || typeof r !== 'object') return null;
  const { x, y, w, h } = r as Rect;
  if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1) return null;
  if (!inBounds(map, x, y) || !inBounds(map, x + w - 1, y + h - 1)) return null;
  return { x, y, w, h };
}

/** Remove interações e mesas ocupadas que deixaram de fazer sentido após uma edição. */
function prune(map: GameMap) {
  for (const key of Object.keys(map.interactions)) {
    const { x, y } = parseKey(key);
    if (!inBounds(map, x, y) || !map.objects[y][x]) delete map.interactions[key];
  }
  for (const key of Object.keys(map.claims)) {
    const { x, y } = parseKey(key);
    if (!isDesk(map, x, y)) delete map.claims[key];
  }
}

/**
 * Valida e aplica uma edição. Roda igual no servidor (fonte da verdade) e no
 * cliente (aplicação otimista). Retorna a edição normalizada, ou null se inválida.
 */
export function applyEdit(map: GameMap, edit: MapEdit): MapEdit | null {
  if (!edit || typeof edit !== 'object') return null;
  switch (edit.kind) {
    case 'tiles': {
      if (!Array.isArray(edit.tiles) || edit.tiles.length > 400) return null;
      const tiles: { x: number; y: number; floor?: Floor; object?: Obj | null }[] = [];
      for (const t of edit.tiles) {
        if (!t || !inBounds(map, t.x, t.y)) continue;
        const clean: (typeof tiles)[number] = { x: t.x, y: t.y };
        if (t.floor !== undefined) {
          if (!FLOORS.includes(t.floor)) continue;
          clean.floor = t.floor;
          map.floor[t.y][t.x] = t.floor;
        }
        if (t.object !== undefined) {
          if (t.object !== null && !OBJECTS.includes(t.object)) continue;
          clean.object = t.object;
          map.objects[t.y][t.x] = t.object;
        }
        tiles.push(clean);
      }
      if (!tiles.length) return null;
      prune(map);
      return { kind: 'tiles', tiles };
    }
    case 'area-add': {
      const rect = cleanRect(map, edit.area);
      const name = cleanStr(edit.area?.name, 40);
      const id = cleanStr(edit.area?.id, 40);
      if (!rect || !name || !id || map.areas.length >= MAX_AREAS || map.areas.some(a => a.id === id)) return null;
      const area = { id, name, ...rect };
      map.areas.push(area);
      return { kind: 'area-add', area };
    }
    case 'area-remove': {
      const before = map.areas.length;
      map.areas = map.areas.filter(a => a.id !== edit.id);
      return map.areas.length === before ? null : { kind: 'area-remove', id: edit.id };
    }
    case 'spawn': {
      const rect = cleanRect(map, edit.rect);
      if (!rect) return null;
      map.spawn = rect;
      return { kind: 'spawn', rect };
    }
    case 'interaction': {
      const { x, y } = parseKey(String(edit.key));
      if (!inBounds(map, x, y) || !map.objects[y][x]) return null;
      const key = tileKey(x, y);
      if (edit.value === null) {
        delete map.interactions[key];
        return { kind: 'interaction', key, value: null };
      }
      const value = cleanInteraction(edit.value);
      if (!value) return null;
      map.interactions[key] = value;
      return { kind: 'interaction', key, value };
    }
  }
  return null;
}

/** Confere se um JSON carregado do disco tem o formato de um mapa. */
export function isGameMap(v: unknown): v is GameMap {
  const m = v as GameMap;
  return (
    !!m &&
    Number.isInteger(m.width) &&
    Number.isInteger(m.height) &&
    Array.isArray(m.floor) &&
    m.floor.length === m.height &&
    Array.isArray(m.objects) &&
    m.objects.length === m.height &&
    Array.isArray(m.areas) &&
    !!m.spawn &&
    typeof m.interactions === 'object' &&
    typeof m.claims === 'object'
  );
}
