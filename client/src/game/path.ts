import { isWalkable, type Room } from '../../../shared/map';

export interface Point {
  x: number;
  y: number;
}

const STEPS: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * BFS em grade. Se o destino não for caminhável (ou `adjacent` for true),
 * para no vizinho caminhável mais próximo. Retorna os passos sem a origem.
 */
export function findPath(
  map: Room,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  adjacent = false,
  canStep: (x: number, y: number) => boolean = () => true,
): Point[] {
  const key = (x: number, y: number) => y * map.width + x;
  const walkable = (x: number, y: number) => isWalkable(map, x, y) && canStep(x, y);
  const goals = new Set<number>();
  if (!adjacent && walkable(tx, ty)) goals.add(key(tx, ty));
  else for (const s of STEPS) if (walkable(tx + s.x, ty + s.y)) goals.add(key(tx + s.x, ty + s.y));
  if (!goals.size || goals.has(key(sx, sy))) return [];

  const prev = new Map<number, number>([[key(sx, sy), -1]]);
  const queue: Point[] = [{ x: sx, y: sy }];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const s of STEPS) {
      const nx = cur.x + s.x;
      const ny = cur.y + s.y;
      const k = key(nx, ny);
      if (prev.has(k) || !walkable(nx, ny)) continue;
      prev.set(k, key(cur.x, cur.y));
      if (goals.has(k)) {
        const path: Point[] = [];
        for (let c = k; c !== key(sx, sy); c = prev.get(c)!) path.push({ x: c % map.width, y: Math.floor(c / map.width) });
        return path.reverse();
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return [];
}
