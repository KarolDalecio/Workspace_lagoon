import { TILE } from '../../../shared/map';
import type { Fx } from '../../../shared/types';

type Ctx = CanvasRenderingContext2D;

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Peixe centrado na origem, olhando para +x. Cada variante tem um formato. */
function drawFish(ctx: Ctx, variant: number, color: string) {
  const dark = shade(color, 0.7);
  ctx.fillStyle = color;
  switch (variant) {
    case 1: {
      // comprido e fino (tipo agulha)
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-13, -3.5);
      ctx.lineTo(-12, 0);
      ctx.lineTo(-13, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-3, -4, 5, 1.6);
      break;
    }
    case 2: {
      // baiacu redondo com espinhos
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
        ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-4.5, 0);
      ctx.lineTo(-8, -2.5);
      ctx.lineTo(-8, 2.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 3: {
      // acará-bandeira: alto, com nadadeiras longas
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-1, -4);
      ctx.lineTo(-5, -10);
      ctx.lineTo(2, -4);
      ctx.moveTo(-1, 4);
      ctx.lineTo(-5, 10);
      ctx.lineTo(2, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(0, -6);
      ctx.lineTo(-5, 0);
      ctx.lineTo(0, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(-2, -5, 1.5, 10);
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-8, -3);
      ctx.lineTo(-8, 3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      // peixinho clássico
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.5, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-10, -4);
      ctx.lineTo(-10, 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1, -3.5);
      ctx.lineTo(2, -6);
      ctx.lineTo(3, -3.2);
      ctx.fill();
    }
  }
  // olho
  const ex = variant === 2 ? 2.5 : variant === 1 ? 6 : 3.4;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ex, -1, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(ex + 0.3, -1, 0.65, 0, Math.PI * 2);
  ctx.fill();
}

function ripple(ctx: Ctx, x: number, y: number, t: number) {
  if (t < 0 || t > 1) return;
  ctx.strokeStyle = `rgba(220,240,255,${0.8 * (1 - t)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, y, 3 + t * 9, 1.5 + t * 4, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHeart(ctx: Ctx, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.9);
  ctx.bezierCurveTo(x - size * 1.4, y, x - size * 0.7, y - size * 1.1, x, y - size * 0.35);
  ctx.bezierCurveTo(x + size * 0.7, y - size * 1.1, x + size * 1.4, y, x, y + size * 0.9);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x - size * 0.45, y - size * 0.35, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

/** Desenha um efeito passageiro; `t` em segundos desde que começou (some aos 2 s). */
export function drawFx(ctx: Ctx, e: Fx, t: number) {
  const cx = e.x * TILE + TILE / 2;
  const cy = e.y * TILE + TILE / 2;
  ctx.save();
  if (e.kind === 'fish') {
    // Pula num arco por 1,2 s, volta a mergulhar e as ondinhas somem até os 2 s.
    const JUMP = 1.2;
    const SPAN = 30;
    const HEIGHT = 24;
    const dir = e.variant % 2 ? -1 : 1;
    ripple(ctx, cx, cy + 4, t / 0.6);
    if (t < JUMP) {
      const k = t / JUMP;
      const x = cx + dir * (k - 0.5) * SPAN;
      const y = cy + 4 - Math.sin(Math.PI * k) * HEIGHT;
      // inclina seguindo a trajetória (sobe de nariz para cima, desce de nariz para baixo)
      const slope = -Math.cos(Math.PI * k) * HEIGHT * Math.PI;
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      ctx.rotate(Math.max(-0.9, Math.min(0.9, Math.atan2(slope, SPAN))));
      drawFish(ctx, e.variant, e.color);
    } else {
      ripple(ctx, cx + dir * (SPAN / 2), cy + 4, (t - JUMP) / 0.8);
      const a = Math.max(0, 1 - (t - JUMP) / 0.8);
      ctx.fillStyle = `rgba(220,240,255,${a})`;
      for (let i = 0; i < 4; i++) {
        const ang = Math.PI * (1.1 + i * 0.27);
        const r = 4 + (t - JUMP) * 14;
        ctx.beginPath();
        ctx.arc(cx + dir * (SPAN / 2) + Math.cos(ang) * r, cy + 2 + Math.sin(ang) * r * 0.8, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Coração sobe do pet e some.
    const k = t / 2;
    const pop = t < 0.2 ? 0.6 + (t / 0.2) * 0.6 : 1.2 - Math.min(0.2, (t - 0.2) * 0.5);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.5) * 2);
    drawHeart(ctx, cx + Math.sin(t * 5) * 2, e.y * TILE - 2 - k * 22, 5 * pop, e.color);
  }
  ctx.restore();
}
