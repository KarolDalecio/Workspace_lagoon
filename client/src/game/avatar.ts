import { cleanAvatar, type Avatar, type Dir } from '../../../shared/types';

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

const OUTLINE = '#1d1d28';

function strokeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function strokeRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

export interface AvatarExtras {
  /** Relógio da fumaça (Alt+F); undefined = sem cigarro. */
  smokeClock?: number;
  /** Cor do patinete em que está andando. */
  scooter?: string;
}

/** Patinete visto de cima/lado, sob os pés. `front` desenha só o guidão (vai na frente do corpo). */
function drawScooter(ctx: CanvasRenderingContext2D, cx: number, py: number, dir: Dir, color: string, part: 'base' | 'front') {
  const side = dir === 'left' || dir === 'right';
  const sign = dir === 'left' ? -1 : 1;
  if (part === 'base') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, py + 30, side ? 13 : 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (side) {
      circle(ctx, cx - 10, py + 28, 3, '#23262f');
      circle(ctx, cx + 10, py + 28, 3, '#23262f');
      rrect(ctx, cx - 11, py + 25, 22, 3, 1.5, color);
      ctx.fillStyle = color;
      ctx.fillRect(cx + 9 * sign - 1, py + 12, 2.5, 14);
      ctx.fillRect(cx + 9 * sign - 3, py + 11, 7, 2);
    } else {
      rrect(ctx, cx - 4, py + 21, 8, 9, 2, color);
      circle(ctx, cx, py + (dir === 'up' ? 21 : 30), 2.5, '#23262f');
    }
    return;
  }
  if (!side && dir === 'down') {
    // guidão na frente do corpo
    ctx.fillStyle = color;
    ctx.fillRect(cx - 1, py + 15, 2.5, 13);
    rrect(ctx, cx - 7, py + 14, 14, 2.5, 1, shade(color, -0.2));
    circle(ctx, cx, py + 30, 2.5, '#23262f');
  }
  if (dir === 'up') {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 1, py + 9, 2.5, 12);
    rrect(ctx, cx - 7, py + 8, 14, 2.5, 1, shade(color, -0.2));
  }
}

function drawHairBack(ctx: CanvasRenderingContext2D, cx: number, hy: number, av: Avatar, dir: Dir) {
  const c = av.hair;
  switch (av.hairStyle) {
    case 1: // longo
      strokeRect(ctx, cx - 9, hy - 5, 18, 16, 6, c);
      break;
    case 4: // black power
      strokeCircle(ctx, cx, hy - 2, 11.5, c);
      break;
    case 5: // cacheado
      for (const [dx, dy] of [[-8, 0], [8, 0], [-6, -6], [6, -6], [0, -8], [-8, 5], [8, 5]]) strokeCircle(ctx, cx + dx, hy + dy, 4, c);
      break;
    case 6: // rabo de cavalo
      if (dir === 'left') strokeRect(ctx, cx + 6, hy - 2, 5, 11, 2.5, c);
      else if (dir === 'right') strokeRect(ctx, cx - 11, hy - 2, 5, 11, 2.5, c);
      else if (dir === 'up') strokeRect(ctx, cx - 2.5, hy, 5, 12, 2.5, c);
      break;
    case 9: // tranças
      if (dir !== 'up') {
        strokeRect(ctx, cx - 10, hy - 1, 4, 13, 2, c);
        strokeRect(ctx, cx + 6, hy - 1, 4, 13, 2, c);
      }
      break;
  }
}

function drawHairFront(ctx: CanvasRenderingContext2D, cx: number, hy: number, av: Avatar, dir: Dir) {
  const c = av.hair;
  const style = av.hairStyle;
  if (style === 3) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, hy - 1, 8.3, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  if (dir === 'up') {
    // de costas: o cabelo cobre a cabeça
    if (style === 1 || style === 9) strokeRect(ctx, cx - 9, hy - 5, 18, 16, 6, c);
    else strokeCircle(ctx, cx, hy, 8.6, c);
    if (style === 2) strokeCircle(ctx, cx, hy - 9, 4, c);
    if (style === 5) for (const [dx, dy] of [[-5, -4], [5, -4], [0, 2]]) strokeCircle(ctx, cx + dx, hy + dy, 4, c);
    return;
  }
  ctx.fillStyle = c;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (style === 8) {
    // franja: cobre a testa até as sobrancelhas
    ctx.moveTo(cx - 8.8, hy + 1);
    ctx.arc(cx, hy - 1, 8.8, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineTo(cx + 8.8, hy + 1);
    ctx.lineTo(cx - 8.8, hy + 1);
  } else {
    ctx.arc(cx, hy - 1, 8.6, Math.PI, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (dir === 'left') strokeRect(ctx, cx + 2, hy - 3, 6.6, 7, 2, c);
  if (dir === 'right') strokeRect(ctx, cx - 8.6, hy - 3, 6.6, 7, 2, c);
  if (style === 2) strokeCircle(ctx, cx, hy - 9, 4, c);
  if (style === 7) {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(cx + i * 3.5 - 2.5, hy - 6);
      ctx.lineTo(cx + i * 3.5, hy - 13 + Math.abs(i));
      ctx.lineTo(cx + i * 3.5 + 2.5, hy - 6);
    }
    ctx.fill();
  }
}

function drawHat(ctx: CanvasRenderingContext2D, cx: number, hy: number, av: Avatar, dir: Dir) {
  const c = av.hatColor;
  const dark = shade(c, -0.25);
  switch (av.hat) {
    case 1: {
      // boné: copa + aba virada para onde olha
      ctx.fillStyle = c;
      ctx.strokeStyle = OUTLINE;
      ctx.beginPath();
      ctx.arc(cx, hy - 2, 9, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (dir === 'down') strokeRect(ctx, cx - 7, hy - 3, 14, 3, 1.5, dark);
      if (dir === 'left') strokeRect(ctx, cx - 13, hy - 4, 8, 3, 1.5, dark);
      if (dir === 'right') strokeRect(ctx, cx + 5, hy - 4, 8, 3, 1.5, dark);
      circle(ctx, cx, hy - 11, 1.3, dark);
      break;
    }
    case 2: // gorro
      ctx.fillStyle = c;
      ctx.strokeStyle = OUTLINE;
      ctx.beginPath();
      ctx.arc(cx, hy - 1, 9.2, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      strokeRect(ctx, cx - 9.5, hy - 3, 19, 3.5, 1.5, dark);
      strokeCircle(ctx, cx, hy - 11, 2.5, '#f2f2f2');
      break;
    case 3: // quepe
      strokeRect(ctx, cx - 10, hy - 11, 20, 8, 3, c);
      ctx.fillStyle = '#f4d35e';
      ctx.fillRect(cx - 9, hy - 5, 18, 1.5);
      if (dir === 'down') strokeRect(ctx, cx - 7, hy - 3.5, 14, 2.5, 1, '#1d1d28');
      circle(ctx, cx, hy - 8, 1.6, '#f4d35e');
      break;
    case 4: // chapéu de bruxo
      ctx.fillStyle = c;
      ctx.strokeStyle = OUTLINE;
      ctx.beginPath();
      ctx.moveTo(cx - 8, hy - 5);
      ctx.lineTo(cx + 3, hy - 22);
      ctx.lineTo(cx + 8, hy - 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      strokeRect(ctx, cx - 12, hy - 6, 24, 3, 1.5, dark);
      ctx.fillStyle = '#f4d35e';
      ctx.fillRect(cx - 5, hy - 9, 10, 1.5);
      break;
    case 5: // fone de ouvido
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, hy, 9.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      if (dir !== 'right') strokeRect(ctx, cx - 11, hy - 2, 4, 7, 2, dark);
      if (dir !== 'left') strokeRect(ctx, cx + 7, hy - 2, 4, 7, 2, dark);
      break;
  }
}

function drawFace(ctx: CanvasRenderingContext2D, cx: number, hy: number, av: Avatar, dir: Dir) {
  if (dir === 'up') return;
  const eyes = dir === 'down' ? [cx - 3, cx + 3] : dir === 'left' ? [cx - 4.5] : [cx + 4.5];
  for (const ex of eyes) {
    rrect(ctx, ex - 1.1, hy + 0.3, 2.2, 2.8, 1, '#1d1d28');
    circle(ctx, ex - 0.3, hy + 0.9, 0.5, '#ffffff');
  }
  // bochechas coradas, como nos bonecos do Gather
  ctx.fillStyle = 'rgba(232,96,110,0.45)';
  if (dir === 'down') {
    ctx.fillRect(cx - 6.5, hy + 3.5, 2.5, 1.5);
    ctx.fillRect(cx + 4, hy + 3.5, 2.5, 1.5);
  } else ctx.fillRect(dir === 'left' ? cx - 3.5 : cx + 1, hy + 3.5, 2.5, 1.5);

  const beard = shade(av.hair, -0.05);
  if (av.facialHair === 1) rrect(ctx, dir === 'down' ? cx - 3 : dir === 'left' ? cx - 6 : cx + 1, hy + 4.5, dir === 'down' ? 6 : 5, 1.6, 0.8, beard);
  if (av.facialHair === 2) {
    ctx.fillStyle = beard;
    ctx.beginPath();
    ctx.arc(cx + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0), hy + 2, 7.6, Math.PI * 0.1, Math.PI * 0.9);
    ctx.lineTo(cx - 5, hy + 4);
    ctx.fill();
  }
  if (av.facialHair === 3) rrect(ctx, (dir === 'down' ? cx : dir === 'left' ? cx - 3 : cx + 3) - 1.5, hy + 5.5, 3, 2.8, 1, beard);

  if (av.glasses) {
    const lens = av.glasses === 3 ? '#1d1d28' : 'rgba(200,230,255,0.35)';
    ctx.strokeStyle = '#1d1d28';
    ctx.lineWidth = 0.9;
    for (const ex of eyes) {
      ctx.fillStyle = lens;
      ctx.beginPath();
      if (av.glasses === 1) ctx.arc(ex, hy + 1.6, 2.3, 0, Math.PI * 2);
      else ctx.rect(ex - 2.4, hy - 0.4, 4.8, 3.6);
      ctx.fill();
      ctx.stroke();
    }
    if (dir === 'down') {
      ctx.beginPath();
      ctx.moveTo(cx - 0.8, hy + 1.4);
      ctx.lineTo(cx + 0.8, hy + 1.4);
      ctx.stroke();
    }
  }
}

function drawBody(ctx: CanvasRenderingContext2D, cx: number, py: number, by: number, av: Avatar, dir: Dir, swing: number, riding: boolean) {
  const leg = av.bottom === 1 ? av.skin : av.pants;
  // pernas (paradas em cima do patinete)
  const l = riding ? 0 : Math.max(0, swing);
  const r = riding ? 0 : Math.max(0, -swing);
  strokeRect(ctx, cx - 5, by + 8, 4, 6 - l, 1, leg);
  strokeRect(ctx, cx + 1, by + 8, 4, 6 - r, 1, leg);
  if (av.bottom === 1) {
    ctx.fillStyle = av.pants;
    ctx.fillRect(cx - 5.5, by + 8, 11, 3);
  }
  // sapatos
  rrect(ctx, cx - 5.5, by + 13 - l, 5, 2.4, 1, av.shoes);
  rrect(ctx, cx + 0.5, by + 13 - r, 5, 2.4, 1, av.shoes);

  const sleeveLong = av.top === 1 || av.top === 4 || av.top === 5;
  const sleeve = av.top === 5 ? shade(av.shirt, -0.15) : shade(av.shirt, -0.12);
  const armY = by + 1;
  for (const [ax, s] of [[cx - 9.5, l], [cx + 6.5, r]] as const) {
    strokeRect(ctx, ax, armY + s * 0.5, 3, 7, 1.5, sleeveLong ? sleeve : av.skin);
    if (!sleeveLong) rrect(ctx, ax, armY + s * 0.5, 3, 3, 1.2, sleeve);
  }

  if (av.top === 3) {
    // vestido: tronco + saia longa
    ctx.fillStyle = av.shirt;
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(cx - 6, by);
    ctx.lineTo(cx + 6, by);
    ctx.lineTo(cx + 9, by + 12);
    ctx.lineTo(cx - 9, by + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (av.bottom === 2) {
    ctx.fillStyle = av.pants;
    ctx.strokeStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(cx - 6, by + 7);
    ctx.lineTo(cx + 6, by + 7);
    ctx.lineTo(cx + 8, by + 12);
    ctx.lineTo(cx - 8, by + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  strokeRect(ctx, cx - 7, by, 14, 10, 4, av.top === 5 ? '#f2f2f2' : av.shirt);
  if (av.top === 2) {
    ctx.fillStyle = '#f2f2f2';
    for (const y of [2.5, 5.5, 8.5]) ctx.fillRect(cx - 6.5, by + y, 13, 1.4);
  }
  if (av.top === 1 && dir !== 'up') {
    // moletom: bolso e cordão
    rrect(ctx, cx - 4, by + 5, 8, 3.5, 1, shade(av.shirt, -0.18));
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(cx - 2, by + 1, 0.8, 3);
    ctx.fillRect(cx + 1.2, by + 1, 0.8, 3);
  }
  if (av.top === 1 && dir === 'up') rrect(ctx, cx - 5, by - 1, 10, 5, 2.5, shade(av.shirt, -0.18));
  if (av.top === 4 && dir !== 'up') {
    // terno: paletó, camisa branca e gravata
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.moveTo(cx - 3, by + 0.5);
    ctx.lineTo(cx + 3, by + 0.5);
    ctx.lineTo(cx, by + 6);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(cx - 0.8, by + 1.5, 1.6, 5);
  }
  if (av.top === 5 && dir !== 'up') {
    // jaqueta aberta sobre camiseta branca
    ctx.fillStyle = av.shirt;
    ctx.fillRect(cx - 6.5, by + 0.5, 4, 9);
    ctx.fillRect(cx + 2.5, by + 0.5, 4, 9);
  }
}

/** Desenha o avatar ocupando o tile cujo canto superior esquerdo é (px, py). */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  avatar: Avatar,
  dir: Dir,
  phase: number,
  moving: boolean,
  extras: AvatarExtras = {},
) {
  const av = cleanAvatar(avatar);
  const cx = px + 16;
  const riding = !!extras.scooter;
  const wave = Math.sin(phase * Math.PI);
  const bob = moving && !riding ? Math.abs(wave) * 1.5 : 0;
  const swing = moving && !riding ? wave * 2 : 0;
  const lift = riding ? 3 : 0;
  const by = py + 14 - bob - lift;

  if (riding) drawScooter(ctx, cx, py, dir, extras.scooter!, 'base');
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, py + 29, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (riding && dir === 'up') drawScooter(ctx, cx, py, dir, extras.scooter!, 'front');

  const hy = py + 9 - bob - lift;
  if (dir !== 'up') drawHairBack(ctx, cx, hy, av, dir);
  drawBody(ctx, cx, py, by, av, dir, swing, riding);
  strokeCircle(ctx, cx, hy, 8, av.skin);
  drawHairFront(ctx, cx, hy, av, dir);
  drawFace(ctx, cx, hy, av, dir);
  drawHat(ctx, cx, hy, av, dir);
  if (dir === 'up') drawHairBack(ctx, cx, hy, av, dir);

  if (riding && dir === 'down') drawScooter(ctx, cx, py, dir, extras.scooter!, 'front');
  if (extras.smokeClock !== undefined) drawCigarette(ctx, cx, hy, dir, extras.smokeClock);
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
