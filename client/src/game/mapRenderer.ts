import { TILE, footprint, type Floor, type Room } from '../../../shared/map';
import { drawObject } from './objects';

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
    case 'darkwood':
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#7a4d32';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px, py + i * 8 + 7, T, 1);
        ctx.fillRect(px + ((h >> (i * 3)) % T), py + i * 8, 1, 7);
      }
      break;
    case 'sand':
      ctx.fillStyle = '#e9e6dc';
      ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = '#d4cfbf';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px, py + 6 + i * 10);
        ctx.quadraticCurveTo(px + 16, py + 2 + i * 10, px + 32, py + 6 + i * 10);
        ctx.stroke();
      }
      break;
    case 'hex': {
      ctx.fillStyle = '#c9ced8';
      ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = '#b3b9c6';
      ctx.lineWidth = 1;
      const hx = px + 16;
      const hy = py + 16;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        ctx.lineTo(hx + Math.cos(a) * 14, hy + Math.sin(a) * 14);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'moss':
      ctx.fillStyle = (x + y) % 2 ? '#4f8f3c' : '#4b8a39';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#5ea648';
      for (let i = 0; i < 4; i++) circle(ctx, px + 6 + ((h >> (i * 4)) % 20), py + 6 + ((h >> (i * 3 + 2)) % 20), 3, '#5ea648');
      break;
    case 'darkrug':
      ctx.fillStyle = '#4a3328';
      ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = '#6b4a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 3.5, py + 3.5, T - 7, T - 7);
      break;
    case 'stone':
      ctx.fillStyle = '#b9b4ab';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#a7a299';
      ctx.fillRect(px, py + (x % 2 ? 0 : 15), T, 1.5);
      ctx.fillRect(px + 15, py, 1.5, T);
      break;
    case 'dark':
      ctx.fillStyle = (x + y) % 2 ? '#2a2d3f' : '#2d3044';
      ctx.fillRect(px, py, T, T);
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

/** Imagens (fundo/primeiro plano) já carregadas, compartilhadas entre renderizações. */
const images = new Map<string, HTMLImageElement>();

/** Retorna a imagem se já carregou; senão começa a carregar e chama `onLoad` quando terminar. */
export function getImage(url: string, onLoad: () => void) {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.onload = onLoad;
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/**
 * Camada estática da sala (refeita só quando a sala muda): piso, imagem de fundo
 * e objetos, ordenados pela base para o que está mais abaixo ficar na frente.
 */
export function renderRoom(room: Room, scale: number, canvas: HTMLCanvasElement, onImage: () => void) {
  canvas.width = room.width * T * scale;
  canvas.height = room.height * T * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) drawFloor(ctx, room.floor[y][x], x, y);
  if (room.background) {
    const img = getImage(room.background, onImage);
    if (img) ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
  }
  const sorted = [...room.objects].sort((a, b) => footprint(a).y + footprint(a).h - (footprint(b).y + footprint(b).h));
  for (const o of sorted) drawObject(ctx, o);
  return canvas;
}
