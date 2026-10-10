import { useEffect, useRef } from 'react';
import type { Avatar, Dir } from '../../../shared/types';
import { drawAvatar } from '../game/avatar';

export function AvatarPreview({ avatar, size = 96, dir = 'down' }: { avatar: Avatar; size?: number; dir?: Dir }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    const s = (size / 32) * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, 32, 32);
    drawAvatar(ctx, 0, 1, avatar, dir, 0, false);
  }, [avatar, size, dir]);

  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
