import { useEffect } from 'react';
import { areaAt } from '../../shared/map';
import { assetUrl } from './base';
import type { World } from './world';

/** Sem área privada, a música alcança quem está até esta distância (em tiles). */
const OPEN_RANGE = 8;

/**
 * Toca a música das vitrolas ligadas para quem está na mesma sala privada que elas
 * (ex.: só dentro da Sala do Guilherme). Todos ouvem o mesmo trecho: a posição vem
 * do instante em que a vitrola foi ligada no servidor.
 */
export function useMusic(world: World, onBlocked: () => void) {
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.55;
    let playingKey: string | null = null;
    let src = '';

    const tick = () => {
      const me = world.players.get(world.selfId);
      const room = me ? world.map.rooms[me.room] : undefined;
      let pick: { key: string; url: string; startedAt: number } | null = null;
      if (me && room)
        for (const [id, startedAt] of world.music) {
          const obj = room.objects.find(o => o.id === id);
          if (obj?.interaction?.kind !== 'music' || !obj.interaction.url) continue;
          const area = areaAt(room, obj.x, obj.y);
          const inside = area ? areaAt(room, me.x, me.y) === area : Math.hypot(obj.x - me.x, obj.y - me.y) <= OPEN_RANGE;
          if (inside) {
            pick = { key: `${id}:${startedAt}`, url: assetUrl(obj.interaction.url), startedAt };
            break;
          }
        }

      if (!pick) {
        if (!audio.paused) audio.pause();
        playingKey = null;
        return;
      }
      if (playingKey === pick.key && !audio.paused) return;
      if (src !== pick.url) {
        src = pick.url;
        audio.src = src;
      }
      const startedAt = pick.startedAt;
      const seek = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0)
          audio.currentTime = (Math.max(0, Date.now() + world.clockSkew - startedAt) / 1000) % audio.duration;
      };
      if (audio.readyState >= 1) seek();
      else audio.addEventListener('loadedmetadata', seek, { once: true });
      playingKey = pick.key;
      audio.play().catch((err: DOMException) => {
        playingKey = null; // tenta de novo no próximo tick
        if (err.name === 'NotAllowedError') onBlocked();
      });
    };

    const timer = setInterval(tick, 400);
    tick();
    return () => {
      clearInterval(timer);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [world, onBlocked]);
}
