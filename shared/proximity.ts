import { areaAt, onSpotlight, type SpaceMap } from './map';

/** Distância (em tiles) até onde duas pessoas fora de áreas privadas se ouvem. */
export const PROX_RADIUS = 3;

interface Pos {
  room: string;
  x: number;
  y: number;
}

/**
 * Se duas pessoas devem estar em conversa: mesma sala e
 * - uma delas no holofote (é ouvida pela sala toda), ou
 * - mesma área privada, ou
 * - ambas fora de áreas privadas e perto.
 */
export function canHear(map: SpaceMap, a: Pos, b: Pos, radius = PROX_RADIUS) {
  if (a.room !== b.room) return false;
  const room = map.rooms[a.room];
  if (!room) return false;
  if (onSpotlight(room, a.x, a.y) || onSpotlight(room, b.x, b.y)) return true;
  const areaA = areaAt(room, a.x, a.y);
  const areaB = areaAt(room, b.x, b.y);
  if (areaA || areaB) return areaA === areaB;
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}

/** Volume do áudio remoto: cheio de perto, diminuindo até a borda do raio. */
export function volumeFor(map: SpaceMap, me: Pos, other: Pos) {
  const room = map.rooms[me.room];
  if (!room || areaAt(room, me.x, me.y) || onSpotlight(room, other.x, other.y)) return 1;
  const d = Math.hypot(me.x - other.x, me.y - other.y);
  if (d <= 1.5) return 1;
  const max = PROX_RADIUS + 1;
  return Math.max(0.15, 1 - ((d - 1.5) / (max - 1.5)) * 0.85);
}
