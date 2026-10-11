import { useEffect, useRef } from 'react';
import type { Avatar, Dir } from '../../../shared/types';
import { drawAvatar } from '../game/avatar';

/** Miniatura do avatar. A área desenhada tem folga em cima para chapéus altos. */
export function AvatarPreview({ avatar, size = 96, dir = 'down', scooter }: { avatar: Avatar; size?: number; dir?: Dir; scooter?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    const s = (size / 40) * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, 40, 40);
    drawAvatar(ctx, 4, 8, avatar, dir, 0, false, { scooter });
  }, [avatar, size, dir, scooter]);

  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
