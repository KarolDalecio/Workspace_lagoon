import { areaAt } from './map';

/** Distância (em tiles) até onde duas pessoas fora de áreas privadas se ouvem. */
export const PROX_RADIUS = 3;

interface Pos {
  x: number;
  y: number;
}

export function canHear(a: Pos, b: Pos, radius = PROX_RADIUS) {
  const areaA = areaAt(a.x, a.y);
  const areaB = areaAt(b.x, b.y);
  if (areaA || areaB) return areaA?.id === areaB?.id;
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}

/** Volume do áudio remoto: cheio de perto, diminuindo até a borda do raio. */
export function volumeFor(a: Pos, b: Pos) {
  if (areaAt(a.x, a.y)) return 1;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d <= 1.5) return 1;
  const max = PROX_RADIUS + 1;
  return Math.max(0.15, 1 - ((d - 1.5) / (max - 1.5)) * 0.85);
}
