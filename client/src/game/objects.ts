import { CATALOG } from '../../../shared/catalog';
import type { PlacedObject } from '../../../shared/map';
import { drawArt } from './art';

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

type Draw = (ctx: Ctx, px: number, py: number, color: string, rot: number, o: Pick<PlacedObject, 'x' | 'y' | 'label' | 'art'>) => void;

function text(ctx: Ctx, label: string, cx: number, cy: number, maxW: number, color: string, size = 9) {
  ctx.save();
  ctx.font = `800 ${size}px "Press Start 2P", Inter, system-ui, sans-serif`;
  let s = size;
  while (ctx.measureText(label).width > maxW && s > 4) {
    s -= 0.5;
    ctx.font = `800 ${s}px Inter, system-ui, sans-serif`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

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
  desklong(ctx, px, py, c) {
    shadow(ctx, px + 48, py + 30, 46, 3);
    rrect(ctx, px + 1, py + 2, 94, 26, 3, c);
    ctx.fillStyle = shade(c, -0.22);
    ctx.fillRect(px + 1, py + 24, 94, 4);
    ctx.fillRect(px + 47, py + 2, 1.5, 22);
    rrect(ctx, px + 38, py + 5, 20, 12, 2, '#23262f');
    ctx.fillStyle = '#5fb3f5';
    ctx.fillRect(px + 40, py + 7, 16, 8);
    rrect(ctx, px + 40, py + 19, 16, 4, 1, '#3a3f4f');
  },
  workstation3(ctx, px, py, c) {
    shadow(ctx, px + 48, py + 30, 46, 3);
    rrect(ctx, px + 1, py + 8, 94, 21, 3, c);
    ctx.fillStyle = shade(c, -0.25);
    ctx.fillRect(px + 1, py + 25, 94, 4);
    // dois monitores deitados + um em pé (vertical)
    for (const mx of [14, 50]) {
      rrect(ctx, px + mx, py + 1, 26, 15, 2, '#15171f');
      ctx.fillStyle = mx === 14 ? '#5fb3f5' : '#8c5bd6';
      ctx.fillRect(px + mx + 2, py + 3, 22, 11);
    }
    rrect(ctx, px + 78, py - 6, 12, 22, 2, '#15171f');
    ctx.fillStyle = '#7ad19a';
    ctx.fillRect(px + 80, py - 4, 8, 18);
    rrect(ctx, px + 4, py + 4, 8, 20, 2, '#23262f');
    circle(ctx, px + 8, py + 9, 1.4, '#4fc3ff');
    rrect(ctx, px + 30, py + 19, 28, 5, 1, '#3a3f4f');
    rrect(ctx, px + 62, py + 19, 6, 6, 3, '#3a3f4f');
  },
  workstation5xl(ctx, px, py, c) {
    shadow(ctx, px + 96, py + 30, 94, 3);
    rrect(ctx, px + 1, py + 10, 190, 19, 3, c);
    ctx.fillStyle = shade(c, -0.25);
    ctx.fillRect(px + 1, py + 25, 190, 4);
    const screens = ['#5fb3f5', '#7ad19a', '#f0a73a', '#e15b64', '#8c5bd6'];
    // 5 monitores centralizados na mesa (3 embaixo, 2 em cima); a ponta esquerda fica livre para a cafeteira
    [56, 84, 112].forEach((mx, i) => {
      rrect(ctx, px + mx, py + 5, 26, 13, 2, '#15171f');
      ctx.fillStyle = screens[i];
      ctx.fillRect(px + mx + 2, py + 7, 22, 9);
    });
    [70, 98].forEach((mx, i) => {
      rrect(ctx, px + mx, py - 8, 26, 13, 2, '#15171f');
      ctx.fillStyle = screens[i + 3];
      ctx.fillRect(px + mx + 2, py - 6, 22, 9);
    });
    rrect(ctx, px + 80, py + 20, 34, 5, 1, '#3a3f4f');
    rrect(ctx, px + 118, py + 20, 6, 6, 3, '#3a3f4f');
    // caixas de som e torre do PC na ponta direita
    rrect(ctx, px + 146, py + 6, 8, 12, 2, '#23262f');
    circle(ctx, px + 150, py + 13, 2, '#5a5f73');
    rrect(ctx, px + 164, py - 2, 18, 24, 3, '#23262f');
    ctx.fillStyle = '#8c5bd6';
    ctx.fillRect(px + 167, py + 2, 2, 16);
    circle(ctx, px + 176, py + 4, 1.5, '#4fc3ff');
  },
  /** Cafeteira de cápsula preta com decalque de droide-bola (laranja e branco) e xícara. */
  coffeemaker(ctx, px, py, c) {
    // base e bandeja
    rrect(ctx, px + 4, py + 22, 24, 5, 2, shade(c, 0.25));
    // corpo
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 23);
    ctx.lineTo(px + 6, py - 2);
    ctx.quadraticCurveTo(px + 7, py - 8, px + 14, py - 8);
    ctx.lineTo(px + 24, py - 6);
    ctx.lineTo(px + 24, py + 8);
    ctx.lineTo(px + 17, py + 8);
    ctx.lineTo(px + 17, py + 23);
    ctx.closePath();
    ctx.fill();
    // tampa prateada
    ctx.fillStyle = '#c9ced8';
    ctx.beginPath();
    ctx.ellipse(px + 17, py - 7, 9, 3, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#23262f';
    ctx.beginPath();
    ctx.ellipse(px + 17, py - 7.4, 6.5, 1.8, -0.08, 0, Math.PI * 2);
    ctx.fill();
    // decalque do droide-bola
    circle(ctx, px + 11, py + 13, 5, '#f4f1ea');
    ctx.strokeStyle = '#e8742a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(px + 11, py + 13, 3, 0, Math.PI * 2);
    ctx.stroke();
    circle(ctx, px + 11, py + 6.2, 2.6, '#f4f1ea');
    ctx.fillStyle = '#e8742a';
    ctx.fillRect(px + 8.6, py + 6.4, 4.8, 0.9);
    circle(ctx, px + 11.4, py + 5.6, 0.7, '#1d1d28');
    // xícara de vidro com café
    rrect(ctx, px + 18, py + 13, 9, 9, 2, 'rgba(230,240,250,0.55)');
    rrect(ctx, px + 19, py + 15, 7, 6, 1.5, '#7a4a2a');
    ctx.fillStyle = '#c8955c';
    ctx.fillRect(px + 19, py + 15, 7, 1.4);
    ctx.strokeStyle = 'rgba(230,240,250,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px + 28, py + 17.5, 2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  },
  workstation5(ctx, px, py, c) {
    shadow(ctx, px + 48, py + 30, 46, 3);
    rrect(ctx, px + 1, py + 10, 94, 19, 3, c);
    ctx.fillStyle = shade(c, -0.25);
    ctx.fillRect(px + 1, py + 25, 94, 4);
    const screens = ['#5fb3f5', '#7ad19a', '#f0a73a', '#e15b64', '#8c5bd6'];
    // três embaixo, dois em cima
    [6, 34, 62].forEach((mx, i) => {
      rrect(ctx, px + mx, py + 5, 26, 13, 2, '#15171f');
      ctx.fillStyle = screens[i];
      ctx.fillRect(px + mx + 2, py + 7, 22, 9);
    });
    [20, 48].forEach((mx, i) => {
      rrect(ctx, px + mx, py - 8, 26, 13, 2, '#15171f');
      ctx.fillStyle = screens[i + 3];
      ctx.fillRect(px + mx + 2, py - 6, 22, 9);
    });
    rrect(ctx, px + 32, py + 20, 30, 5, 1, '#3a3f4f');
  },
  doorsign(ctx, px, py, c, _rot, o) {
    ctx.fillStyle = '#d4dae4';
    ctx.fillRect(px, py, 32, 32);
    ctx.fillStyle = shade('#d4dae4', 0.22);
    ctx.fillRect(px, py, 32, 7);
    rrect(ctx, px + 2, py + 9, 28, 14, 2, c);
    rrect(ctx, px + 3, py + 10, 26, 12, 2, shade(c, 0.15));
    text(ctx, (o.label ?? '').toUpperCase(), px + 16, py + 16.5, 24, '#ffffff', 8);
  },
  smalldesk(ctx, px, py, c) {
    rrect(ctx, px + 1, py + 3, 30, 25, 3, c);
    rrect(ctx, px + 8, py + 6, 16, 12, 2, '#15171f');
    ctx.fillStyle = '#e8eaf0';
    ctx.fillRect(px + 10, py + 8, 12, 8);
    ctx.fillStyle = '#5b6ee1';
    ctx.fillRect(px + 12, py + 10, 5, 4);
  },
  conftable(ctx, px, py, c) {
    shadow(ctx, px + 80, py + 126, 76, 4);
    rrect(ctx, px + 2, py + 4, 156, 120, 8, shade(c, -0.25));
    rrect(ctx, px + 4, py + 4, 152, 116, 8, c);
    rrect(ctx, px + 36, py + 26, 88, 72, 4, '#15171f');
    ctx.fillStyle = '#2d6fc4';
    ctx.fillRect(px + 40, py + 30, 80, 64);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 52, py + 42, 56, 40);
    circle(ctx, px + 80, py + 62, 8, 'rgba(244,211,94,0.8)');
  },
  locker(ctx, px, py, c) {
    rrect(ctx, px + 2, py, 28, 30, 1, c);
    ctx.fillStyle = shade(c, -0.25);
    ctx.fillRect(px + 15.5, py, 1, 30);
    for (const x of [4, 18]) for (const y of [4, 8]) ctx.fillRect(px + x, py + y, 10, 1);
    ctx.fillStyle = '#f4d35e';
    ctx.fillRect(px + 12, py + 15, 2, 4);
    ctx.fillRect(px + 18, py + 15, 2, 4);
  },
  console(ctx, px, py, c) {
    rrect(ctx, px + 2, py + 2, 28, 27, 3, c);
    ctx.fillStyle = '#15171f';
    ctx.fillRect(px + 5, py + 5, 22, 10);
    ctx.fillStyle = '#4fc3ff';
    ctx.fillRect(px + 7, py + 7, 8, 2);
    ctx.fillStyle = '#7ad19a';
    ctx.fillRect(px + 7, py + 11, 14, 2);
    for (let i = 0; i < 4; i++) circle(ctx, px + 8 + i * 5, py + 22, 1.6, ['#e15b64', '#f4d35e', '#2fb380', '#5b6ee1'][i]);
  },
  diningtable(ctx, px, py, c) {
    shadow(ctx, px + 48, py + 62, 44, 3);
    rrect(ctx, px + 3, py + 3, 90, 58, 4, shade(c, -0.25));
    rrect(ctx, px + 3, py + 1, 90, 56, 4, c);
    circle(ctx, px + 28, py + 22, 7, '#f2f2f2');
    circle(ctx, px + 28, py + 22, 4, '#c2551f');
    circle(ctx, px + 66, py + 36, 6, '#f2f2f2');
    circle(ctx, px + 66, py + 36, 3, '#e15b64');
  },
  stool(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 24, 7, 2);
    circle(ctx, px + 16, py + 17, 7, shade(c, -0.2));
    circle(ctx, px + 16, py + 16, 6, c);
  },
  coffeecart(ctx, px, py, c) {
    shadow(ctx, px + 32, py + 62, 30, 3);
    rrect(ctx, px + 2, py + 14, 60, 46, 4, c);
    rrect(ctx, px + 2, py + 6, 60, 12, 3, shade(c, 0.25));
    ctx.fillStyle = '#e15b64';
    for (let i = 0; i < 6; i++) ctx.fillRect(px + 4 + i * 10, py + 6, 5, 4);
    rrect(ctx, px + 8, py + 22, 14, 18, 2, '#3a3f4f');
    rrect(ctx, px + 26, py + 24, 30, 10, 2, '#f2f2f2');
    for (let i = 0; i < 4; i++) circle(ctx, px + 31 + i * 7, py + 29, 2.2, ['#5b6ee1', '#2fb380', '#f0a73a', '#e15b64'][i]);
    ctx.fillStyle = shade(c, -0.3);
    ctx.fillRect(px + 6, py + 46, 52, 2);
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
  videogame(ctx, px, py, c) {
    rrect(ctx, px + 9, py + 8, 14, 9, 2, c);
    ctx.fillStyle = '#4fc3ff';
    ctx.fillRect(px + 11, py + 11, 3, 1.5);
    for (const [cx, cy] of [[9, 23], [23, 23]]) {
      rrect(ctx, px + cx - 6, py + cy - 3, 12, 7, 3, '#3a3f4f');
      circle(ctx, px + cx - 3, py + cy, 1, '#f2f2f2');
      circle(ctx, px + cx + 3, py + cy, 1, '#e15b64');
    }
  },
  turntable(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 29, 13, 2);
    rrect(ctx, px + 2, py + 12, 28, 17, 2, shade(c, -0.15));
    rrect(ctx, px + 2, py + 4, 28, 12, 2, c);
    circle(ctx, px + 13, py + 10, 7, '#15171f');
    ctx.strokeStyle = '#3a3f4f';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(px + 13, py + 10, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    circle(ctx, px + 13, py + 10, 1.8, '#e15b64');
    ctx.strokeStyle = '#d4dae4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 26, py + 5);
    ctx.lineTo(px + 24, py + 12);
    ctx.lineTo(px + 18, py + 13);
    ctx.stroke();
    // discos encostados
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ['#e15b64', '#5b6ee1', '#f4d35e'][i];
      ctx.fillRect(px + 6 + i * 7, py + 18, 5, 9);
    }
  },
  /** Cachorro deitado de lado. Na cor quase preta, ganha as marcações de tricolor (pastor-australiano). */
  dog(ctx, px, py, c, _rot, o) {
    const tricolor = c === '#1c1c22';
    const white = '#f4f1ea';
    const tan = '#b8743a';
    const legs = tricolor ? tan : shade(c, -0.1);
    shadow(ctx, px + 16, py + 28, 12, 3);
    // patas esticadas para a frente e para trás
    rrect(ctx, px + 2, py + 23, 10, 3.5, 1.5, legs);
    rrect(ctx, px + 4, py + 26, 9, 3, 1.5, legs);
    rrect(ctx, px + 22, py + 24, 8, 3.5, 1.5, legs);
    for (const [x, y] of [[2, 24.8], [4, 27.5], [28.5, 25.8]]) circle(ctx, px + x, py + y, 1.7, white);
    // corpo e rabo
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(px + 18, py + 21, 11, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, px + 29, py + 18, 3.2, c);
    if (tricolor) {
      // leve mescla acinzentada no lombo, como na foto
      ctx.fillStyle = 'rgba(160,160,170,0.18)';
      ctx.beginPath();
      ctx.ellipse(px + 20, py + 18, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // peito branco
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.ellipse(px + 10, py + 21.5, 4, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // cabeça e orelhas meio caídas
    circle(ctx, px + 9, py + 13, 6.5, c);
    ctx.fillStyle = shade(c, tricolor ? 0.25 : -0.25);
    ctx.beginPath();
    ctx.ellipse(px + 3.8, py + 9, 2.4, 3.6, -0.5, 0, Math.PI * 2);
    ctx.ellipse(px + 14.2, py + 9, 2.4, 3.6, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // faixa branca na testa e focinho
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 7);
    ctx.lineTo(px + 10, py + 7);
    ctx.lineTo(px + 11, py + 15);
    ctx.lineTo(px + 7, py + 15);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px + 9, py + 17, 4.2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (tricolor) {
      circle(ctx, px + 4.6, py + 15.5, 1.7, tan);
      circle(ctx, px + 13.4, py + 15.5, 1.7, tan);
      circle(ctx, px + 6.6, py + 10.6, 1, tan);
      circle(ctx, px + 11.4, py + 10.6, 1, tan);
    }
    circle(ctx, px + 6.6, py + 12.6, 1.1, '#1d1d28');
    circle(ctx, px + 11.4, py + 12.6, 1.1, '#1d1d28');
    circle(ctx, px + 9, py + 16.2, 1.3, '#1d1d28');
    if (o.label) drawDogLabel(ctx, o.label, px, py);
  },
  dogbed(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 27, 15, 3);
    ctx.fillStyle = shade(c, -0.25);
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 20, 15.5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 19, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(c, 0.35);
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 20.5, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  /** Prancha em pé, encostada na parede (passa um pouco do tile para cima). */
  surfboard(ctx, px, py, c) {
    shadow(ctx, px + 17, py + 28, 7, 2.5);
    ctx.save();
    ctx.translate(px + 16, py + 12);
    ctx.rotate(0.12);
    // contorno + prancha (bico pontudo em cima, rabeta arredondada embaixo)
    const board = () => {
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.bezierCurveTo(7.5, -12, 7.5, 8, 5, 15);
      ctx.quadraticCurveTo(0, 18.5, -5, 15);
      ctx.bezierCurveTo(-7.5, 8, -7.5, -12, 0, -22);
      ctx.closePath();
    };
    board();
    ctx.fillStyle = shade(c, -0.3);
    ctx.fill();
    ctx.scale(0.86, 0.94);
    board();
    ctx.fillStyle = c;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(px + 16, py + 12);
    ctx.rotate(0.12);
    // longarina e faixas
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(0, 15);
    ctx.stroke();
    const stripe = c === '#f4f1ea' ? '#3fb6d6' : '#f4f1ea';
    rrect(ctx, -5.6, -3, 11.2, 2.2, 1, stripe);
    rrect(ctx, -5.4, 0.4, 10.8, 1.1, 0.5, shade(c, -0.25));
    // quilha
    ctx.fillStyle = '#2a2d3f';
    ctx.beginPath();
    ctx.moveTo(-1, 10);
    ctx.lineTo(1.5, 10);
    ctx.lineTo(0.8, 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  fishingrod(ctx, px, py, c) {
    rrect(ctx, px + 4, py + 18, 10, 10, 2, '#5b6ee1');
    circle(ctx, px + 9, py + 20, 2, '#3fb6d6');
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 26);
    ctx.lineTo(px + 34, py + 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(px + 34, py + 4);
    ctx.lineTo(px + 40, py + 20);
    ctx.stroke();
    circle(ctx, px + 40, py + 21, 1.8, '#e15b64');
  },
  frame(ctx, px, py, c, _rot, o) {
    rrect(ctx, px + 3, py + 3, 26, 21, 2, c);
    ctx.fillStyle = shade(c, -0.3);
    ctx.fillRect(px + 5, py + 5, 22, 17);
    if (drawArt(ctx, o.art, px + 6, py + 6, 20, 15)) return;
    ctx.fillStyle = '#8fc6e8';
    ctx.fillRect(px + 6, py + 7, 20, 14);
    ctx.fillStyle = '#4f8f3c';
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 21);
    ctx.lineTo(px + 14, py + 12);
    ctx.lineTo(px + 20, py + 17);
    ctx.lineTo(px + 26, py + 13);
    ctx.lineTo(px + 26, py + 21);
    ctx.fill();
  },
  barrel(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 28, 11, 3);
    circle(ctx, px + 16, py + 16, 12, shade(c, -0.2));
    circle(ctx, px + 16, py + 15, 11, c);
    ctx.strokeStyle = shade(c, -0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px + 16, py + 15, 7, 0, Math.PI * 2);
    ctx.stroke();
  },
  arcade(ctx, px, py, c) {
    rrect(ctx, px + 4, py, 24, 30, 3, c);
    rrect(ctx, px + 7, py + 3, 18, 12, 2, '#15171f');
    ctx.fillStyle = '#7ad19a';
    ctx.fillRect(px + 9, py + 5, 14, 8);
    ctx.fillStyle = shade(c, -0.3);
    ctx.fillRect(px + 6, py + 17, 20, 6);
    circle(ctx, px + 11, py + 20, 1.8, '#f4d35e');
    circle(ctx, px + 18, py + 20, 1.6, '#e15b64');
    circle(ctx, px + 22, py + 20, 1.6, '#4fc3ff');
  },
  scooter(ctx, px, py, c) {
    shadow(ctx, px + 16, py + 26, 12, 2);
    circle(ctx, px + 7, py + 22, 4, '#23262f');
    circle(ctx, px + 25, py + 22, 4, '#23262f');
    ctx.fillStyle = c;
    ctx.fillRect(px + 7, py + 18, 18, 3);
    ctx.fillRect(px + 22, py + 6, 3, 14);
    ctx.fillRect(px + 18, py + 6, 10, 2);
  },
  arrowsign(ctx, px, py, c, rot, o) {
    const left = rot === 1;
    ctx.fillStyle = '#5a5f73';
    ctx.fillRect(px + 30, py + 22, 3, 8);
    ctx.fillRect(px + 95, py + 22, 3, 8);
    ctx.fillStyle = c;
    ctx.beginPath();
    if (left) {
      ctx.moveTo(px + 2, py + 13);
      ctx.lineTo(px + 14, py + 3);
      ctx.lineTo(px + 126, py + 3);
      ctx.lineTo(px + 126, py + 23);
      ctx.lineTo(px + 14, py + 23);
    } else {
      ctx.moveTo(px + 126, py + 13);
      ctx.lineTo(px + 114, py + 3);
      ctx.lineTo(px + 2, py + 3);
      ctx.lineTo(px + 2, py + 23);
      ctx.lineTo(px + 114, py + 23);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a8fa3';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, (o.label ?? '').toUpperCase(), px + 64 + (left ? 6 : -6), py + 13.5, 100, '#2b3a8f', 10);
  },
  plaque(ctx, px, py, c, _rot, o) {
    const dark = parseInt(c.slice(1), 16) < 0x808080;
    text(ctx, (o.label ?? '').toUpperCase(), px + 32, py + 16, 60, dark ? 'rgba(235,238,248,0.85)' : '#2a2e45', 10);
  },
  standsign(ctx, px, py, c, _rot, o) {
    shadow(ctx, px + 16, py + 29, 9, 2);
    ctx.fillStyle = '#8a8fa3';
    ctx.fillRect(px + 15, py + 20, 2, 9);
    rrect(ctx, px + 5, py + 1, 22, 22, 3, c);
    rrect(ctx, px + 8, py + 4, 16, 16, 2, 'rgba(255,255,255,0.85)');
    text(ctx, o.label ?? '', px + 16, py + 12.5, 14, shade(c, -0.35), 11);
  },
  window(ctx, px, py, c) {
    ctx.fillStyle = '#d4dae4';
    ctx.fillRect(px, py, 32, 32);
    rrect(ctx, px + 4, py + 6, 24, 20, 1, '#8a93a6');
    ctx.fillStyle = c;
    ctx.fillRect(px + 6, py + 8, 20, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 20);
    ctx.lineTo(px + 18, py + 8);
    ctx.lineTo(px + 22, py + 8);
    ctx.lineTo(px + 10, py + 24);
    ctx.lineTo(px + 6, py + 24);
    ctx.fill();
  },
  railing(ctx, px, py, c, rot) {
    ctx.fillStyle = c;
    if (rot === 1) {
      ctx.fillRect(px + 14, py, 4, 32);
      ctx.fillStyle = shade(c, -0.25);
      ctx.fillRect(px + 13, py + 2, 6, 4);
    } else {
      ctx.fillRect(px, py + 22, 32, 4);
      ctx.fillStyle = shade(c, -0.25);
      ctx.fillRect(px + 2, py + 20, 4, 10);
      ctx.fillRect(px + 18, py + 20, 4, 10);
    }
  },
  stairs(ctx, px, py, c) {
    ctx.fillStyle = shade(c, -0.35);
    ctx.fillRect(px, py, 64, 32);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = shade(c, 0.15 - i * 0.08);
      ctx.fillRect(px + 2, py + 2 + i * 6, 60, 5);
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
/**
 * Cachorro em pé, de perfil, olhando para a direita (`facing` = -1 espelha).
 * `phase` (radianos) anima as patas e o rabo; `walking` = false deixa as patas paradas.
 */
export function drawDogStanding(
  ctx: Ctx,
  o: Pick<PlacedObject, 'type' | 'color' | 'label'>,
  px: number,
  py: number,
  facing: 1 | -1,
  phase: number,
  walking: boolean,
) {
  const def = CATALOG[o.type];
  const c = def?.colors[o.color] ?? '#d9a066';
  const tricolor = c === '#1c1c22';
  const white = '#f4f1ea';
  const tan = '#b8743a';
  const legs = tricolor ? tan : shade(c, -0.1);
  const swing = walking ? Math.sin(phase) * 2.6 : 0;
  const bob = walking ? Math.abs(Math.sin(phase)) * 0.9 : 0;
  const wag = Math.sin(phase * (walking ? 2 : 1.4)) * 2.2;

  shadow(ctx, px + 16, py + 28, 11, 3);
  ctx.save();
  ctx.translate(px + 16, py);
  ctx.scale(facing, 1);
  ctx.translate(-16, -bob);

  const leg = (hx: number, foot: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, 19);
    ctx.lineTo(hx + foot, 26.5 + bob);
    ctx.stroke();
    circle(ctx, hx + foot, 26.8 + bob, 1.6, tricolor ? white : shade(c, 0.15));
  };
  // patas do lado de lá (mais escuras) primeiro; pares diagonais andam juntos
  const far = tricolor ? shade(tan, -0.25) : shade(c, -0.35);
  leg(10.5, -swing, far);
  leg(21.5, swing, far);
  // rabo abanando
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8, 16);
  ctx.quadraticCurveTo(4, 13, 3.5, 9 + wag);
  ctx.stroke();
  // corpo
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(16, 17.5, 9.5, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (tricolor) {
    ctx.fillStyle = 'rgba(160,160,170,0.18)';
    ctx.beginPath();
    ctx.ellipse(15, 14.8, 6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  leg(8.5, swing, legs);
  leg(23.5, -swing, legs);
  // peito branco
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.ellipse(23, 19, 3, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // cabeça de perfil
  circle(ctx, 25, 11, 5.2, c);
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.ellipse(28.8, 13, 3.2, 2.3, 0, 0, Math.PI * 2);
  ctx.fill();
  if (tricolor) {
    circle(ctx, 27.3, 11.4, 1.4, tan);
    ctx.fillStyle = white;
    ctx.fillRect(25.6, 6.2, 1.4, 5);
  }
  circle(ctx, 31, 12.4, 1.2, '#1d1d28');
  circle(ctx, 26.6, 9.7, 1, '#1d1d28');
  // orelha caída
  ctx.fillStyle = shade(c, tricolor ? 0.25 : -0.25);
  ctx.beginPath();
  ctx.ellipse(22.6, 9.5, 2.2, 3.6, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (o.label) drawDogLabel(ctx, o.label, px, py);
}

export function drawDogLabel(ctx: Ctx, label: string, px: number, py: number) {
  ctx.save();
  ctx.font = '600 6px Inter, system-ui, sans-serif';
  const w = ctx.measureText(label).width + 6;
  ctx.fillStyle = 'rgba(22,24,38,0.75)';
  ctx.beginPath();
  ctx.roundRect(px + 16 - w / 2, py - 6, w, 9, 4.5);
  ctx.fill();
  ctx.fillStyle = '#ffe08a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, px + 16, py - 1.3);
  ctx.restore();
}

export function drawObject(ctx: Ctx, o: Pick<PlacedObject, 'type' | 'x' | 'y' | 'color' | 'rot' | 'label' | 'art'>, px = o.x * T, py = o.y * T) {
  const def = CATALOG[o.type];
  const draw = DRAW[o.type];
  if (!def || !draw) return;
  draw(ctx, px, py, def.colors[o.color] ?? def.colors[0], o.rot, o);
}
