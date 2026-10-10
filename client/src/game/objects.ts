import { CATALOG } from '../../../shared/catalog';
import type { PlacedObject } from '../../../shared/map';

const T = 32;
type Ctx = CanvasRenderingContext2D;

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function circle(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function shadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Assento visto de cima: `rot` aponta para onde a pessoa sentada olha (encosto do lado oposto). */
function seat(ctx: Ctx, px: number, py: number, color: string, rot: number, size: number, back: number) {
  const pad = (T - size) / 2;
  shadow(ctx, px + 16, py + 27, size / 2, 3);
  rrect(ctx, px + pad, py + pad, size, size, 5, color);
  const dark = shade(color, -0.25);
  if (rot === 0) rrect(ctx, px + pad, py + pad - 2, size, back, 4, dark);
  if (rot === 2) rrect(ctx, px + pad, py + pad + size - back + 2, size, back, 4, dark);
  if (rot === 1) rrect(ctx, px + pad + size - back + 2, py + pad, back, size, 4, dark);
  if (rot === 3) rrect(ctx, px + pad - 2, py + pad, back, size, 4, dark);
}

type Draw = (ctx: Ctx, px: number, py: number, color: string, rot: number, o: Pick<PlacedObject, 'x' | 'y'>) => void;

const DRAW: Record<string, Draw> = {
  desk(ctx, px, py, c) {
    shadow(ctx, px + 32, py + 30, 30, 3);
    rrect(ctx, px + 1, py + 3, 62, 25, 3, c);
    ctx.fillStyle = shade(c, -0.22);
    ctx.fillRect(px + 1, py + 24, 62, 4);
    for (const dx of [10, 38]) {
      rrect(ctx, px + dx, py + 5, 16, 11, 2, '#23262f');
      ctx.fillStyle = dx === 10 ? '#5fb3f5' : '#7ad19a';
      ctx.fillRect(px + dx + 2, py + 7, 12, 7);
    }
    rrect(ctx, px + 12, py + 18, 12, 4, 1, '#3a3f4f');
  },
  chair(ctx, px, py, c, rot) {
    seat(ctx, px, py, c, rot, 15, 5);
  },
  armchair(ctx, px, py, c, rot) {
    seat(ctx, px, py, c, rot, 24, 8);
  },
  table(ctx, px, py, c) {
    shadow(ctx, px + 32, py + 30, 30, 3);
    ctx.fillStyle = c;
    ctx.fillRect(px, py + 2, 64, 26);
    ctx.fillStyle = shade(c, -0.2);
    ctx.fillRect(px, py + 25, 64, 3);
  },
  roundtable(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 28, 11, 3);
    circle(ctx, px + 16, py + 15, 12, shade(c, -0.18));
    circle(ctx, px + 16, py + 14, 11, c);
  },
  coffeetable(ctx, px, py, c) {
    shadow(ctx, px + 32, py + 26, 26, 4);
    ctx.fillStyle = shade(c, -0.15);
    ctx.beginPath();
    ctx.ellipse(px + 32, py + 17, 27, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(px + 32, py + 15, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  cabinet(ctx, px, py, c) {
    rrect(ctx, px + 5, py + 2, 22, 27, 2, c);
    ctx.fillStyle = shade(c, -0.25);
    for (const y of [8, 17]) ctx.fillRect(px + 7, py + y, 18, 1.5);
    for (const y of [5, 12, 21]) ctx.fillRect(px + 13, py + y, 6, 2);
  },
  printer(ctx, px, py, c) {
    rrect(ctx, px + 3, py + 8, 26, 19, 3, c);
    rrect(ctx, px + 6, py + 4, 20, 7, 2, '#f7f7f7');
    ctx.fillStyle = '#3a3f4f';
    ctx.fillRect(px + 6, py + 16, 20, 3);
    circle(ctx, px + 24, py + 12, 1.6, '#2fb380');
  },
  watercooler(ctx, px, py, c) {
    rrect(ctx, px + 9, py + 13, 14, 16, 2, '#e8eaf0');
    rrect(ctx, px + 10, py + 1, 12, 13, 5, c);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(px + 12, py + 3, 3, 9);
    ctx.fillStyle = '#5a5f73';
    ctx.fillRect(px + 14, py + 18, 4, 3);
  },
  podium(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 29, 11, 3);
    rrect(ctx, px + 6, py + 6, 20, 22, 2, c);
    rrect(ctx, px + 4, py + 3, 24, 6, 2, shade(c, 0.2));
    circle(ctx, px + 16, py + 3, 2, '#23262f');
  },
  sofa(ctx, px, py, c, rot) {
    shadow(ctx, px + 32, py + 29, 30, 3);
    rrect(ctx, px + 1, py + 5, 62, 23, 6, c);
    const dark = shade(c, -0.22);
    rrect(ctx, px + 1, rot === 2 ? py + 21 : py + 3, 62, 8, 4, dark);
    rrect(ctx, px + 1, py + 5, 7, 23, 4, dark);
    rrect(ctx, px + 56, py + 5, 7, 23, 4, dark);
    ctx.fillStyle = shade(c, 0.12);
    ctx.fillRect(px + 31, py + (rot === 2 ? 8 : 13), 1.5, 10);
  },
  sofaside(ctx, px, py, c, rot) {
    shadow(ctx, px + 16, py + 61, 13, 3);
    rrect(ctx, px + 4, py + 1, 24, 62, 6, c);
    const dark = shade(c, -0.22);
    rrect(ctx, rot === 1 ? px + 21 : px + 3, py + 1, 8, 62, 4, dark);
    rrect(ctx, px + 4, py + 1, 24, 7, 4, dark);
    rrect(ctx, px + 4, py + 56, 24, 7, 4, dark);
  },
  bookshelf(ctx, px, py, c, _rot, o) {
    ctx.fillStyle = c;
    ctx.fillRect(px, py, 64, 30);
    ctx.fillStyle = shade(c, -0.3);
    ctx.fillRect(px, py + 14, 64, 2);
    const colors = ['#e15b64', '#5b6ee1', '#2fb380', '#f0a73a', '#8c5bd6', '#f2f2f2'];
    let seed = o.x * 7 + o.y * 13;
    for (const row of [2, 17]) {
      let bx = px + 3;
      while (bx < px + 60) {
        seed = (seed * 9301 + 49297) % 233280;
        const bw = 3 + (seed % 3);
        ctx.fillStyle = colors[seed % colors.length];
        ctx.fillRect(bx, py + row + (seed % 2), bw, 11 - (seed % 2));
        bx += bw + 1;
      }
    }
  },
  counter(ctx, px, py, c, _rot, o) {
    ctx.fillStyle = shade(c, -0.18);
    ctx.fillRect(px, py, 32, 32);
    ctx.fillStyle = shade(c, 0.12);
    ctx.fillRect(px, py + 3, 32, 18);
    if ((o.x + o.y) % 3 === 0) rrect(ctx, px + 7, py + 6, 18, 12, 3, '#9aa3b5');
    else if ((o.x + o.y) % 3 === 1) {
      circle(ctx, px + 11, py + 12, 4, '#3a3f4f');
      circle(ctx, px + 22, py + 12, 4, '#3a3f4f');
    }
  },
  fridge(ctx, px, py, c) {
    rrect(ctx, px + 4, py, 24, 30, 3, c);
    ctx.fillStyle = shade(c, -0.25);
    ctx.fillRect(px + 4, py + 11, 24, 1.5);
    ctx.fillRect(px + 23, py + 4, 2, 5);
    ctx.fillRect(px + 23, py + 15, 2, 8);
  },
  whiteboard(ctx, px, py) {
    ctx.fillStyle = '#8a8fa3';
    ctx.fillRect(px, py + 3, 64, 22);
    ctx.fillStyle = '#fbfbfd';
    ctx.fillRect(px + 2, py + 5, 60, 18);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e15b64';
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 16);
    ctx.lineTo(px + 16, py + 10);
    ctx.lineTo(px + 26, py + 18);
    ctx.stroke();
    ctx.strokeStyle = '#5b6ee1';
    ctx.strokeRect(px + 36, py + 9, 18, 9);
    ctx.fillStyle = '#5a5f73';
    ctx.fillRect(px + 8, py + 25, 48, 2);
  },
  tv(ctx, px, py, c) {
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(px + 28, py + 23, 8, 6);
    rrect(ctx, px + 1, py + 2, 62, 22, 2, c);
    ctx.fillStyle = '#3b6fd6';
    ctx.fillRect(px + 3, py + 4, 58, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(px + 3, py + 4, 58, 6);
  },
  board(ctx, px, py, c, _rot, o) {
    ctx.fillStyle = shade(c, -0.35);
    ctx.fillRect(px, py + 2, 64, 24);
    ctx.fillStyle = c;
    ctx.fillRect(px + 2, py + 4, 60, 20);
    const notes = ['#fff59d', '#ffccbc', '#c5e1a5', '#b3e5fc'];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = notes[(i + o.x) % notes.length];
      ctx.fillRect(px + 5 + i * 11, py + 7 + ((i * 5 + o.y) % 8), 8, 8);
      circle(ctx, px + 9 + i * 11, py + 8 + ((i * 5 + o.y) % 8), 1, '#e15b64');
    }
  },
  document(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 28, 11, 3);
    circle(ctx, px + 16, py + 17, 11, '#a8743f');
    ctx.fillStyle = shade(c, 0.1);
    ctx.fillRect(px + 7, py + 10, 3, 14);
    ctx.save();
    ctx.translate(px + 17, py + 15);
    ctx.rotate(-0.15);
    rrect(ctx, -7, -8, 14, 17, 1, '#fdfdfd');
    ctx.fillStyle = '#9aa3b5';
    for (let i = 0; i < 4; i++) ctx.fillRect(-5, -5 + i * 4, 10, 1);
    ctx.restore();
  },
  plant(ctx, px, py, c) {
    rrect(ctx, px + 10, py + 19, 12, 10, 2, '#a0522d');
    circle(ctx, px + 11, py + 15, 6, shade(c, -0.15));
    circle(ctx, px + 21, py + 15, 6, shade(c, -0.15));
    circle(ctx, px + 16, py + 11, 8, c);
  },
  tallplant(ctx, px, py, c) {
    rrect(ctx, px + 10, py + 21, 12, 9, 2, '#e8eaf0');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 6, 7, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(c, 0.25);
    ctx.beginPath();
    ctx.ellipse(px + 14, py + 2, 3, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  tree(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 29, 12, 4);
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(px + 13, py + 16, 6, 13);
    circle(ctx, px + 16, py + 8, 15, shade(c, -0.1));
    circle(ctx, px + 11, py + 4, 9, shade(c, 0.15));
    circle(ctx, px + 21, py + 9, 7, c);
  },
  bush(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 27, 13, 3);
    circle(ctx, px + 10, py + 18, 8, shade(c, -0.12));
    circle(ctx, px + 22, py + 18, 8, shade(c, -0.12));
    circle(ctx, px + 16, py + 13, 9, c);
  },
  flowers(ctx, px, py, c) {
    ctx.fillStyle = '#3f9a4a';
    for (const [x, y] of [[8, 18], [16, 12], [24, 20], [12, 25], [22, 9]]) {
      ctx.fillRect(px + x, py + y, 1.5, 6);
      circle(ctx, px + x + 0.7, py + y, 3, c);
      circle(ctx, px + x + 0.7, py + y, 1.2, '#fff6c2');
    }
  },
  rock(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 26, 12, 3);
    ctx.fillStyle = shade(c, -0.15);
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 19, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(px + 14, py + 17, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  lamp(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 29, 7, 2);
    ctx.fillStyle = '#5a5f73';
    ctx.fillRect(px + 15, py + 12, 2, 16);
    ctx.fillStyle = 'rgba(255,230,140,0.25)';
    circle(ctx, px + 16, py + 9, 13, 'rgba(255,230,140,0.25)');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(px + 9, py + 13);
    ctx.lineTo(px + 23, py + 13);
    ctx.lineTo(px + 19, py + 3);
    ctx.lineTo(px + 13, py + 3);
    ctx.closePath();
    ctx.fill();
  },
  fishbowl(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 28, 12, 3);
    circle(ctx, px + 16, py + 20, 12, '#f2f2f2');
    circle(ctx, px + 16, py + 13, 9, shade(c, 0.3));
    circle(ctx, px + 16, py + 15, 7, c);
    circle(ctx, px + 15, py + 15, 2.5, '#f0a73a');
  },
  cat(ctx, px, py, c) {
    circle(ctx, px + 16, py + 20, 11, '#c2551f');
    circle(ctx, px + 16, py + 19, 9, '#e8955a');
    circle(ctx, px + 16, py + 18, 7, c);
    circle(ctx, px + 16, py + 11, 5.5, c);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(px + 11, py + 9);
    ctx.lineTo(px + 12, py + 3);
    ctx.lineTo(px + 15, py + 7);
    ctx.moveTo(px + 21, py + 9);
    ctx.lineTo(px + 20, py + 3);
    ctx.lineTo(px + 17, py + 7);
    ctx.fill();
    circle(ctx, px + 14, py + 11, 1, '#ffe08a');
    circle(ctx, px + 18, py + 11, 1, '#ffe08a');
  },
  screen(ctx, px, py, c) {
    for (let i = 0; i < 3; i++) {
      const x = px + 2 + i * 20;
      rrect(ctx, x, py + 2 + (i % 2) * 2, 19, 25, 2, shade(c, -0.3));
      ctx.fillStyle = c;
      ctx.fillRect(x + 2, py + 4 + (i % 2) * 2, 15, 21);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 5, py + 8 + (i % 2) * 2, 9, 2);
    }
  },
  wall(ctx, px, py, c, _rot, o) {
    ctx.fillStyle = c;
    ctx.fillRect(px, py, 32, 32);
    ctx.fillStyle = shade(c, 0.22);
    ctx.fillRect(px, py, 32, 7);
    ctx.fillStyle = shade(c, -0.12);
    ctx.fillRect(px, py + 18, 32, 1);
    ctx.fillRect(px + (o.y % 2 ? 8 : 24), py + 7, 1, 11);
    ctx.fillRect(px + (o.y % 2 ? 24 : 8), py + 19, 1, 13);
  },
  door(ctx, px, py, c) {
    ctx.fillStyle = shade(c, -0.3);
    ctx.fillRect(px + 1, py, 30, 32);
    ctx.fillStyle = c;
    ctx.fillRect(px + 3, py + 2, 12, 30);
    ctx.fillRect(px + 17, py + 2, 12, 30);
    circle(ctx, px + 13, py + 18, 1.3, '#f4d35e');
    circle(ctx, px + 19, py + 18, 1.3, '#f4d35e');
  },
  portalpad(ctx, px, py, c) {
    const g = ctx.createRadialGradient(px + 16, py + 18, 2, px + 16, py + 18, 14);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 18, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  },
};

/** Desenha um objeto do catálogo com o canto superior esquerdo em (px, py). */
export function drawObject(ctx: Ctx, o: Pick<PlacedObject, 'type' | 'x' | 'y' | 'color' | 'rot'>, px = o.x * T, py = o.y * T) {
  const def = CATALOG[o.type];
  const draw = DRAW[o.type];
  if (!def || !draw) return;
  draw(ctx, px, py, def.colors[o.color] ?? def.colors[0], o.rot, o);
}
