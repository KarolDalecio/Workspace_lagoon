export const TILE = 32;

export type Floor = 'grass' | 'wood' | 'carpet' | 'carpet2' | 'tile' | 'path' | 'water' | 'rug';
export type Obj =
  | 'wall'
  | 'desk'
  | 'chair'
  | 'plant'
  | 'tree'
  | 'sofa'
  | 'table'
  | 'counter'
  | 'whiteboard'
  | 'bookshelf';

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

export interface GameMap {
  width: number;
  height: number;
  floor: Floor[][];
  objects: (Obj | null)[][];
  areas: Area[];
  spawn: Rect;
}

const BLOCKING = new Set<Obj>(['wall', 'desk', 'plant', 'tree', 'sofa', 'table', 'counter', 'whiteboard', 'bookshelf']);

function buildMap(): GameMap {
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

  // Lounge
  setF(37, 14, 8, 5, 'rug');
  setO(38, 14, 4, 1, 'sofa');
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

  // Recepção / lobby
  setF(26, 21, 10, 4, 'rug');
  setO(21, 22, 4, 1, 'counter');
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

  const areas: Area[] = [
    { id: 'meeting-a', name: 'Sala de Reunião A', x: 4, y: 4, w: 10, h: 8 },
    { id: 'meeting-b', name: 'Sala de Reunião B', x: 15, y: 4, w: 10, h: 8 },
    { id: 'pod-1', name: 'Cabine de Foco 1', x: 4, y: 22, w: 4, h: 4 },
    { id: 'pod-2', name: 'Cabine de Foco 2', x: 9, y: 22, w: 4, h: 4 },
    { id: 'pod-3', name: 'Cabine de Foco 3', x: 14, y: 22, w: 4, h: 4 },
  ];

  return { width: W, height: H, floor, objects, areas, spawn: { x: 27, y: 22, w: 8, h: 3 } };
}

export const MAP = buildMap();

export function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < MAP.width && y < MAP.height;
}

export function isWalkable(x: number, y: number) {
  if (!inBounds(x, y)) return false;
  if (MAP.floor[y][x] === 'water') return false;
  const o = MAP.objects[y][x];
  return !(o && BLOCKING.has(o));
}

export function areaAt(x: number, y: number): Area | null {
  const tx = Math.round(x);
  const ty = Math.round(y);
  return MAP.areas.find(a => tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h) ?? null;
}
