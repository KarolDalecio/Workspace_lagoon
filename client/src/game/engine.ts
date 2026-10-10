import { MAP, TILE, areaAt, isWalkable, type Area } from '../../../shared/map';
import { PROX_RADIUS, canHear, volumeFor } from '../../../shared/proximity';
import { EMOTES, type Dir } from '../../../shared/types';
import type { PeerManager } from '../rtc/peers';
import type { World } from '../world';
import { drawAvatar, drawEmote, drawNameTag, drawSmoke, smokeClock } from './avatar';
import { renderStaticMap } from './mapRenderer';
import { findPath, type Point } from './path';

const STEP_MS = 140;
const SYNC_MS = 200;
const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};
const DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Loop do jogo: entrada, movimento, câmera, renderização e proximidade. */
export class Engine {
  zoom = 1.6;
  onAreaChange?: (a: Area | null) => void;

  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private held: Dir[] = [];
  private path: Point[] = [];
  private target: Point | null = null;
  private lastStep = 0;
  private lastFrame = 0;
  private syncTimer = 0;
  private cam = { x: 0, y: 0 };
  private areaId: string | null | undefined = undefined;
  private staticMap = renderStaticMap(2);

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private peers: PeerManager,
    private mediaEls: Map<string, HTMLMediaElement>,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.raf = requestAnimationFrame(this.frame);
    // Fora do rAF: abas em segundo plano pausam o rAF, mas a conversa precisa continuar.
    this.syncTimer = window.setInterval(() => {
      if (this.world.players.has(this.world.selfId)) this.syncProximity();
    }, SYNC_MS);
  }

  stop() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
    cancelAnimationFrame(this.raf);
    clearInterval(this.syncTimer);
  }

  setZoom(z: number) {
    this.zoom = clamp(z, 0.8, 3);
  }

  goTo(x: number, y: number, adjacent = false) {
    const me = this.world.self;
    this.path = findPath(me.x, me.y, x, y, adjacent);
    this.target = this.path.at(-1) ?? null;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // Alt+F: acende/apaga o cigarro. preventDefault evita o menu do navegador.
    if (e.altKey && e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (!e.repeat) this.world.toggleAction('smoke');
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEY_DIR[e.key];
    if (dir) {
      e.preventDefault();
      if (!this.held.includes(dir)) this.held.push(dir);
      this.path = [];
      this.target = null;
      return;
    }
    const n = Number(e.key);
    if (!e.repeat && n >= 1 && n <= EMOTES.length) this.world.sendEmote(EMOTES[n - 1]);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const dir = KEY_DIR[e.key];
    if (dir) this.held = this.held.filter(d => d !== dir);
  };

  private onBlur = () => {
    this.held = [];
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left) / this.zoom + this.cam.x;
    const wy = (e.clientY - rect.top) / this.zoom + this.cam.y;
    this.goTo(Math.floor(wx / TILE), Math.floor(wy / TILE));
  };

  private onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  };

  private frame = (now: number) => {
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 100) : 16;
    this.lastFrame = now;
    if (this.world.players.has(this.world.selfId)) {
      this.step(now);
      this.animate(dt);
      this.render(now);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(now: number) {
    if (now - this.lastStep < STEP_MS) return;
    const me = this.world.self;
    let dir = this.held.at(-1);
    let next: Point;
    if (dir) {
      const [dx, dy] = DELTA[dir];
      next = { x: me.x + dx, y: me.y + dy };
    } else if (this.path.length) {
      next = this.path[0];
      const dx = next.x - me.x;
      const dy = next.y - me.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) {
        this.path = [];
        this.target = null;
        return;
      }
      dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    } else return;

    this.lastStep = now;
    const prevDir = me.dir;
    let moved = false;
    if (isWalkable(next.x, next.y)) {
      me.x = next.x;
      me.y = next.y;
      moved = true;
      if (!this.held.length) this.path.shift();
    } else this.path = [];
    if (!this.path.length) this.target = null;
    me.dir = dir;
    if (moved || dir !== prevDir) this.world.socket.emit('move', { x: me.x, y: me.y, dir });
  }

  private animate(dt: number) {
    for (const p of this.world.players.values()) {
      const dx = p.x - p.rx;
      const dy = p.y - p.ry;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        p.rx = p.x;
        p.ry = p.y;
        continue;
      }
      const speed = (dt / STEP_MS) * (p.id === this.world.selfId ? 1 : 1.2);
      if (dist <= speed) {
        p.rx = p.x;
        p.ry = p.y;
      } else {
        p.rx += (dx / dist) * speed;
        p.ry += (dy / dist) * speed;
      }
      p.walk += dt;
    }
  }

  private syncProximity() {
    const me = this.world.self;
    const desired = new Set<string>();
    for (const p of this.world.players.values()) {
      if (p.id === me.id) continue;
      const radius = this.peers.has(p.id) ? PROX_RADIUS + 1 : PROX_RADIUS;
      if (canHear(me, p, radius)) desired.add(p.id);
    }
    this.peers.sync(desired);

    for (const [id, el] of this.mediaEls) {
      const p = this.world.players.get(id);
      if (p) el.volume = volumeFor(me, p);
    }

    const area = areaAt(me.x, me.y);
    if ((area?.id ?? null) !== this.areaId) {
      this.areaId = area?.id ?? null;
      this.onAreaChange?.(area);
    }
  }

  private render(now: number) {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b1e2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const z = this.zoom;
    const s = dpr * z;
    const viewW = w / z;
    const viewH = h / z;
    const mapW = MAP.width * TILE;
    const mapH = MAP.height * TILE;
    const me = this.world.self;
    const cx = me.rx * TILE + TILE / 2;
    const cy = me.ry * TILE + TILE / 2;
    const camX = mapW <= viewW ? (mapW - viewW) / 2 : clamp(cx - viewW / 2, 0, mapW - viewW);
    const camY = mapH <= viewH ? (mapH - viewH) / 2 : clamp(cy - viewH / 2, 0, mapH - viewH);
    const ox = Math.round(-camX * s);
    const oy = Math.round(-camY * s);
    this.cam.x = -ox / s;
    this.cam.y = -oy / s;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.staticMap, 0, 0, mapW, mapH);

    const area = this.areaId ? MAP.areas.find(a => a.id === this.areaId) : null;
    if (area) {
      ctx.save();
      ctx.strokeStyle = 'rgba(130,210,255,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(area.x * TILE + 1, area.y * TILE + 1, area.w * TILE - 2, area.h * TILE - 2);
      ctx.restore();
    }

    if (this.target) {
      const pulse = 4 + Math.sin(now / 150) * 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(this.target.x * TILE + 16, this.target.y * TILE + 26, pulse + 4, pulse / 2 + 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const players = [...this.world.players.values()].sort((a, b) => a.ry - b.ry);
    for (const p of players) {
      const px = p.rx * TILE;
      const py = p.ry * TILE;
      if (this.peers.has(p.id)) {
        ctx.strokeStyle = 'rgba(90,220,150,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 29, 12, 4.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const moving = Math.abs(p.x - p.rx) + Math.abs(p.y - p.ry) > 0.01;
      drawAvatar(ctx, px, py, p.avatar, p.dir, p.walk / STEP_MS, moving, p.action === 'smoke' ? smokeClock(now, p.id) : undefined);
    }
    for (const p of players) if (p.action === 'smoke') drawSmoke(ctx, p.rx * TILE, p.ry * TILE, p.dir, smokeClock(now, p.id));
    for (const p of players) drawNameTag(ctx, p.rx * TILE + 16, p.ry * TILE + 31, p.name, p.id === me.id, p.audio);
    for (const [id, e] of this.world.emotes) {
      const p = this.world.players.get(id);
      if (!p || e.until < now) {
        this.world.emotes.delete(id);
        continue;
      }
      drawEmote(ctx, p.rx * TILE + 16, p.ry * TILE, e.emoji, (e.until - now) / 3000);
    }
  }
}
