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
