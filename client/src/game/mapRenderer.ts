import { TILE, type Floor, type GameMap, type Obj } from '../../../shared/map';

const T = TILE;

function hash(x: number, y: number) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
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

export function drawFloor(ctx: CanvasRenderingContext2D, f: Floor, x: number, y: number) {
  const px = x * T;
  const py = y * T;
  const h = hash(x, y);
  switch (f) {
    case 'grass':
      ctx.fillStyle = (x + y) % 2 ? '#6aa84f' : '#66a34b';
      ctx.fillRect(px, py, T, T);
      if (h % 4 === 0) {
        ctx.fillStyle = '#7cbf5e';
        const gx = px + (h % 24) + 4;
        const gy = py + ((h >> 5) % 22) + 6;
        ctx.fillRect(gx, gy, 1, 3);
        ctx.fillRect(gx + 2, gy - 1, 1, 4);
        ctx.fillRect(gx + 4, gy, 1, 3);
      }
      if (h % 23 === 0) circle(ctx, px + 8 + (h % 16), py + 8 + ((h >> 4) % 16), 1.6, h % 2 ? '#f4d35e' : '#f28fb1');
      break;
    case 'wood':
      ctx.fillStyle = '#c99a66';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#b98955';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px, py + i * 8 + 7, T, 1);
        ctx.fillRect(px + ((h >> (i * 3)) % T), py + i * 8, 1, 7);
      }
      break;
    case 'carpet':
    case 'carpet2':
      ctx.fillStyle = f === 'carpet' ? '#46578f' : '#7a4a6e';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = f === 'carpet' ? '#4f61a0' : '#875479';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) ctx.fillRect(px + i * 8 + 3, py + j * 8 + 3, 2, 2);
      break;
    case 'tile':
      ctx.fillStyle = '#e7eaf0';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#cfd4de';
      ctx.fillRect(px, py, T, 1);
      ctx.fillRect(px, py, 1, T);
      ctx.fillRect(px + 16, py, 1, T);
      ctx.fillRect(px, py + 16, T, 1);
      break;
    case 'path':
      ctx.fillStyle = '#cdb98f';
      ctx.fillRect(px, py, T, T);
      for (let i = 0; i < 3; i++) {
        const v = hash(x * 3 + i, y * 7 - i);
        circle(ctx, px + 5 + (v % 22), py + 5 + ((v >> 6) % 22), 2 + (v % 3), '#bda97e');
      }
      break;
    case 'water':
      ctx.fillStyle = '#3c8dd4';
      ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = '#6db0ea';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const wx = px + 4 + ((h >> (i * 4)) % 18);
        const wy = py + 8 + i * 12;
        ctx.beginPath();
        ctx.arc(wx, wy, 4, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      break;
    case 'rug':
      ctx.fillStyle = '#b5553d';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#cf6f52';
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 6);
      ctx.lineTo(px + 26, py + 16);
      ctx.lineTo(px + 16, py + 26);
      ctx.lineTo(px + 6, py + 16);
      ctx.closePath();
      ctx.fill();
      circle(ctx, px + 16, py + 16, 2.5, '#e9a77f');
      break;
  }
}

/** `map` é usado para olhar os vizinhos (ex.: monitor na mesa); null para desenhar ícones. */
export function drawObject(ctx: CanvasRenderingContext2D, map: GameMap | null, o: Obj, x: number, y: number) {
  const px = x * T;
  const py = y * T;
  const h = hash(x, y);
  switch (o) {
    case 'wall':
      ctx.fillStyle = '#3a3f5c';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#525878';
      ctx.fillRect(px, py, T, 7);
      ctx.fillStyle = '#33374f';
      ctx.fillRect(px, py + 18, T, 1);
      ctx.fillRect(px + (y % 2 ? 8 : 24), py + 7, 1, 11);
      ctx.fillRect(px + (y % 2 ? 24 : 8), py + 19, 1, 13);
      break;
    case 'desk':
      rrect(ctx, px, py + 2, T, T - 3, 2, '#9b6a3c');
      ctx.fillStyle = '#7d5330';
      ctx.fillRect(px, py + T - 5, T, 4);
      if (!map || map.objects[y - 1]?.[x] === 'chair' || map.objects[y + 1]?.[x] === 'chair') {
        rrect(ctx, px + 7, py + 6, 18, 12, 2, '#23262f');
        ctx.fillStyle = h % 3 ? '#5fb3f5' : '#7ad19a';
        ctx.fillRect(px + 9, py + 8, 14, 8);
        ctx.fillStyle = '#23262f';
        ctx.fillRect(px + 14, py + 18, 4, 4);
      }
      break;
    case 'chair':
      rrect(ctx, px + 8, py + 8, 16, 16, 4, '#3d4466');
      rrect(ctx, px + 8, py + 6, 16, 5, 2, '#2f3552');
      break;
    case 'plant':
      rrect(ctx, px + 10, py + 19, 12, 10, 2, '#a0522d');
      circle(ctx, px + 11, py + 15, 6, '#3f9a4a');
      circle(ctx, px + 21, py + 15, 6, '#3f9a4a');
      circle(ctx, px + 16, py + 11, 8, '#57b85f');
      break;
    case 'tree':
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(px + 16, py + 29, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(px + 13, py + 16, 6, 13);
      circle(ctx, px + 16, py + 8, 15, '#2f7d3a');
      circle(ctx, px + 11, py + 4, 9, '#3f9a4a');
      circle(ctx, px + 21, py + 9, 7, '#3a8f44');
      break;
    case 'sofa':
      rrect(ctx, px + 1, py + 5, T - 2, 24, 6, '#6c4fa3');
      rrect(ctx, px + 1, py + 3, T - 2, 9, 4, '#5a418a');
      break;
    case 'table':
      ctx.fillStyle = '#a8743f';
      ctx.fillRect(px, py + 1, T, T - 2);
      ctx.fillStyle = '#8a5d30';
      ctx.fillRect(px, py + T - 4, T, 3);
      if (h % 3 === 0) circle(ctx, px + 10 + (h % 12), py + 12, 3.5, '#f2f2f2');
      break;
    case 'counter':
      ctx.fillStyle = '#bfc4cf';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#f3f4f7';
      ctx.fillRect(px, py + 4, T, 16);
      if (h % 4 === 0) rrect(ctx, px + 7, py + 7, 18, 10, 3, '#9aa3b5');
      else if (h % 4 === 1) circle(ctx, px + 16, py + 12, 4, '#e15b64');
      break;
    case 'whiteboard':
      ctx.fillStyle = '#8a8fa3';
      ctx.fillRect(px, py + 3, T, 22);
      ctx.fillStyle = '#fbfbfd';
      ctx.fillRect(px + 1, py + 5, T - 2, 18);
      ctx.strokeStyle = h % 2 ? '#e15b64' : '#5b6ee1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + 5, py + 12);
      ctx.lineTo(px + 12, py + 9);
      ctx.lineTo(px + 18, py + 15);
      ctx.lineTo(px + 27, py + 10);
      ctx.stroke();
      break;
    case 'tv':
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(px + 13, py + 22, 6, 6);
      rrect(ctx, px, py + 2, T, 21, 2, '#15171f');
      ctx.fillStyle = (x + y) % 2 ? '#3b6fd6' : '#4f86e8';
      ctx.fillRect(px + 2, py + 4, T - 4, 17);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(px + 2, py + 4, T - 4, 5);
      break;
    case 'board': {
      ctx.fillStyle = '#7a5532';
      ctx.fillRect(px, py + 2, T, 24);
      ctx.fillStyle = '#c99a62';
      ctx.fillRect(px + 2, py + 4, T - 4, 20);
      const notes = ['#fff59d', '#ffccbc', '#c5e1a5', '#b3e5fc'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = notes[(h >> i) % notes.length];
        ctx.fillRect(px + 4 + i * 9, py + 6 + ((h >> (i + 3)) % 8), 7, 7);
        circle(ctx, px + 7.5 + i * 9, py + 7 + ((h >> (i + 3)) % 8), 1, '#e15b64');
      }
      break;
    }
    case 'bookshelf': {
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(px, py, T, T);
      const colors = ['#e15b64', '#5b6ee1', '#2fb380', '#f0a73a', '#8c5bd6', '#f2f2f2'];
      for (let row = 0; row < 2; row++) {
        let bx = px + 2;
        let i = 0;
        while (bx < px + T - 4) {
          const bw = 3 + ((h >> (i + row * 5)) % 3);
          ctx.fillStyle = colors[(h >> (i * 2 + row)) % colors.length];
          ctx.fillRect(bx, py + 3 + row * 15, bw, 11);
          bx += bw + 1;
          i++;
        }
      }
      break;
    }
  }
}

/** Desenha o mapa estático em um canvas fora da tela (refeito só quando o mapa muda). */
export function renderStaticMap(map: GameMap, scale = 2, canvas = document.createElement('canvas')) {
  canvas.width = map.width * T * scale;
  canvas.height = map.height * T * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) drawFloor(ctx, map.floor[y][x], x, y);
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const o = map.objects[y][x];
      if (o) drawObject(ctx, map, o, x, y);
    }
  return canvas;
}
