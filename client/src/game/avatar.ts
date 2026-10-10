import type { Avatar, Dir } from '../../../shared/types';

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Desenha o avatar ocupando o tile cujo canto superior esquerdo é (px, py). */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  av: Avatar,
  dir: Dir,
  phase: number,
  moving: boolean,
  smokeClock?: number,
) {
  const cx = px + 16;
  const wave = Math.sin(phase * Math.PI);
  const bob = moving ? Math.abs(wave) * 1.5 : 0;
  const swing = moving ? wave * 2 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, py + 29, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2d3247';
  ctx.fillRect(cx - 5, py + 22, 4, 6 - Math.max(0, swing));
  ctx.fillRect(cx + 1, py + 22, 4, 6 - Math.max(0, -swing));

  const arm = shade(av.shirt, -0.2);
  rrect(ctx, cx - 9, py + 15 - bob + Math.max(0, swing) * 0.5, 3, 7, 1.5, arm);
  rrect(ctx, cx + 6, py + 15 - bob + Math.max(0, -swing) * 0.5, 3, 7, 1.5, arm);
  rrect(ctx, cx - 7, py + 14 - bob, 14, 10, 4, av.shirt);

  const hy = py + 9 - bob;
  const style = av.hairStyle;
  if (style === 1 && dir !== 'up') rrect(ctx, cx - 9, hy - 5, 18, 15, 6, av.hair);
  circle(ctx, cx, hy, 8, av.skin);

  if (style === 3) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = av.hair;
    ctx.beginPath();
    ctx.arc(cx, hy - 1, 8.4, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (dir === 'up') {
    if (style === 1) rrect(ctx, cx - 9, hy - 5, 18, 15, 6, av.hair);
    circle(ctx, cx, hy, 8.6, av.hair);
  } else {
    ctx.fillStyle = av.hair;
    ctx.beginPath();
    ctx.arc(cx, hy - 1, 8.6, Math.PI, 0);
    ctx.fill();
    if (dir === 'left') rrect(ctx, cx + 2, hy - 3, 6.6, 7, 2, av.hair);
    if (dir === 'right') rrect(ctx, cx - 8.6, hy - 3, 6.6, 7, 2, av.hair);
  }
  if (style === 2) circle(ctx, cx, hy - 9, 4, av.hair);

  const eye = '#1d1d28';
  if (dir === 'down') {
    circle(ctx, cx - 3, hy + 1.5, 1.3, eye);
    circle(ctx, cx + 3, hy + 1.5, 1.3, eye);
  } else if (dir === 'left') circle(ctx, cx - 4.5, hy + 1.5, 1.3, eye);
  else if (dir === 'right') circle(ctx, cx + 4.5, hy + 1.5, 1.3, eye);

  if (smokeClock !== undefined) drawCigarette(ctx, cx, hy, dir, smokeClock);
}

const SMOKE_CYCLE = 4000;
const INHALE_MS = 900;
const EXHALE_START = 1000;
const EXHALE_MS = 1600;

/** Relógio da fumaça defasado por jogador, para ninguém tragar em sincronia. */
export function smokeClock(now: number, id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return now + (h % SMOKE_CYCLE);
}

function cigaretteTip(cx: number, hy: number, dir: Dir) {
  const my = hy + 4.5;
  if (dir === 'left') return { x: cx - 11, y: my };
  if (dir === 'right') return { x: cx + 11, y: my };
  if (dir === 'up') return { x: cx + 6, y: hy + 1 };
  return { x: cx + 7.5, y: my + 0.5 };
}

function drawCigarette(ctx: CanvasRenderingContext2D, cx: number, hy: number, dir: Dir, clock: number) {
  if (dir === 'up') return; // de costas o cigarro fica escondido, só a fumaça aparece
  const tip = cigaretteTip(cx, hy, dir);
  const my = hy + 4.5;
  const from = dir === 'left' ? cx - 4 : dir === 'right' ? cx + 4 : cx + 1;
  const x0 = Math.min(from, tip.x);
  const x1 = Math.max(from, tip.x);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(x0, my - 0.8 + (dir === 'down' ? 0.5 : 0), x1 - x0, 1.6);
  ctx.fillStyle = '#d99a4e';
  ctx.fillRect(dir === 'left' ? x1 - 1.6 : x0, my - 0.8 + (dir === 'down' ? 0.5 : 0), 1.6, 1.6);

  const inhaling = clock % SMOKE_CYCLE < INHALE_MS;
  if (inhaling) {
    ctx.fillStyle = 'rgba(255,170,60,0.35)';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  circle(ctx, tip.x, tip.y, 1.1, inhaling ? '#ffd54a' : '#ff6a2b');
}

/** Fumaça saindo da ponta do cigarro e, depois de cada tragada, uma baforada pela boca. */
export function drawSmoke(ctx: CanvasRenderingContext2D, px: number, py: number, dir: Dir, clock: number) {
  const cx = px + 16;
  const hy = py + 9;
  const tip = cigaretteTip(cx, hy, dir);
  const drift = dir === 'left' ? -1 : 1;

  const LIFE = 2200;
  const WISPS = 5;
  for (let i = 0; i < WISPS; i++) {
    const t = ((clock + (i * LIFE) / WISPS) % LIFE) / LIFE;
    const alpha = 0.4 * (1 - t) * Math.min(1, t * 6);
    ctx.fillStyle = `rgba(225,225,235,${alpha})`;
    ctx.beginPath();
    ctx.arc(tip.x + Math.sin(t * 6 + i) * 2.5 * t + drift * t * 3, tip.y - 2 - t * 20, 1.2 + t * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const c = clock % SMOKE_CYCLE;
  if (c >= EXHALE_START && c < EXHALE_START + EXHALE_MS) {
    const t = (c - EXHALE_START) / EXHALE_MS;
    const mx = dir === 'left' ? cx - 4 : dir === 'right' ? cx + 4 : cx + 2;
    for (let k = 0; k < 3; k++) {
      const alpha = 0.5 * (1 - t) * (1 - k * 0.25);
      ctx.fillStyle = `rgba(235,235,242,${alpha})`;
      ctx.beginPath();
      ctx.arc(mx + drift * (3 + t * 10 + k * 2.5), hy + 4 - t * 8 - k * 2, 2 + t * 5 - k * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  name: string,
  isSelf: boolean,
  audio: boolean,
) {
  ctx.font = '600 7px Inter, system-ui, sans-serif';
  const textW = ctx.measureText(name).width;
  const w = textW + 10 + (audio ? 0 : 7);
  const x = cx - w / 2;
  rrect(ctx, x, y, w, 11, 5.5, isSelf ? 'rgba(38,150,102,0.92)' : 'rgba(22,24,38,0.8)');
  if (!audio) circle(ctx, x + 6.5, y + 5.5, 2.2, '#ef5350');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 5 + (audio ? 0 : 7), y + 6);
}

export function drawEmote(ctx: CanvasRenderingContext2D, cx: number, y: number, emoji: string, remaining: number) {
  const t = Math.max(0, Math.min(1, remaining));
  ctx.globalAlpha = Math.min(1, t * 5);
  const by = y - 10 - (1 - t) * 4;
  circle(ctx, cx, by, 9, '#ffffff');
  ctx.font = '11px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, cx, by + 0.5);
  ctx.globalAlpha = 1;
}
