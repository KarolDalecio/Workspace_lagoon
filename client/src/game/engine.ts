import {
  TILE,
  areaAt,
  deskTileFor,
  interactionNear,
  isDesk,
  isWalkable,
  parseKey,
  tileKey,
  type Area,
  type DeskClaim,
  type Interaction,
  type Rect,
} from '../../../shared/map';
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

/** O que está ao alcance do jogador para a tecla X. */
export type Focus =
  | { type: 'interaction'; key: string; value: Interaction }
  | { type: 'desk'; key: string; claim: DeskClaim | null };

export type EditPhase = 'down' | 'move' | 'up';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function sameFocus(a: Focus | null, b: Focus | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Loop do jogo: entrada, movimento, câmera, renderização, proximidade e edição. */
export class Engine {
  zoom = 1.6;
  onAreaChange?: (a: Area | null) => void;
  onFocusChange?: (f: Focus | null) => void;
  onInteract?: (f: Focus) => void;

  /** Modo de edição: cliques pintam o mapa em vez de andar. */
  editMode = false;
  onEditPointer?: (tile: Point, phase: EditPhase) => void;
  /** Retângulo sendo arrastado e tile selecionado no editor. */
  editOverlay: { rect: Rect | null; selected: Point | null } = { rect: null, selected: null };

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
  private focus: Focus | null = null;
  private hover: Point | null = null;
  private dragging = false;
  private staticMap: HTMLCanvasElement;
  private staticVersion: number;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private peers: PeerManager,
    private mediaEls: Map<string, HTMLMediaElement>,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.staticMap = renderStaticMap(world.map);
    this.staticVersion = world.mapVersion;
  }

  start() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
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
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    cancelAnimationFrame(this.raf);
    clearInterval(this.syncTimer);
  }

  setZoom(z: number) {
    this.zoom = clamp(z, 0.6, 3);
  }

  goTo(x: number, y: number, adjacent = false) {
    const me = this.world.self;
    this.path = findPath(this.world.map, me.x, me.y, x, y, adjacent);
    this.target = this.path.at(-1) ?? null;
  }

  private tileAt(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left) / this.zoom + this.cam.x;
    const wy = (e.clientY - rect.top) / this.zoom + this.cam.y;
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
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
    if ((e.key === 'x' || e.key === 'X') && !e.repeat && !this.editMode) {
      if (this.focus) this.onInteract?.(this.focus);
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
    const tile = this.tileAt(e);
    if (this.editMode) {
      e.preventDefault();
      this.dragging = true;
      this.onEditPointer?.(tile, 'down');
      return;
    }
    this.goTo(tile.x, tile.y);
  };

  private onMouseMove = (e: MouseEvent) => {
    const tile = this.tileAt(e);
    const changed = !this.hover || this.hover.x !== tile.x || this.hover.y !== tile.y;
    this.hover = tile;
    if (this.dragging && changed) this.onEditPointer?.(tile, 'move');
  };

  private onMouseUp = (e: MouseEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.onEditPointer?.(this.tileAt(e), 'up');
  };

  private onMouseLeave = () => {
    this.hover = null;
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
      this.updateFocus();
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
    if (isWalkable(this.world.map, next.x, next.y)) {
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

  /** Sentado numa cadeira de mesa → mesa; senão, objeto interativo ao lado. */
  private updateFocus() {
    const me = this.world.self;
    const map = this.world.map;
    let focus: Focus | null = null;
    if (!this.editMode) {
      if (isDesk(map, me.x, me.y)) {
        const key = tileKey(me.x, me.y);
        focus = { type: 'desk', key, claim: map.claims[key] ?? null };
      } else {
        const near = interactionNear(map, me.x, me.y);
        if (near) focus = { type: 'interaction', ...near };
      }
    }
    if (!sameFocus(focus, this.focus)) {
      this.focus = focus;
      this.onFocusChange?.(focus);
    }
  }

  private syncProximity() {
    const me = this.world.self;
    const map = this.world.map;
    const desired = new Set<string>();
    for (const p of this.world.players.values()) {
      if (p.id === me.id) continue;
      const radius = this.peers.has(p.id) ? PROX_RADIUS + 1 : PROX_RADIUS;
      if (canHear(map, me, p, radius)) desired.add(p.id);
    }
    this.peers.sync(desired);

    for (const [id, el] of this.mediaEls) {
      const p = this.world.players.get(id);
      if (p) el.volume = volumeFor(map, me, p);
    }

    const area = areaAt(map, me.x, me.y);
    if ((area?.id ?? null) !== this.areaId) {
      this.areaId = area?.id ?? null;
      this.onAreaChange?.(area);
    }
  }

  private label(text: string, cx: number, y: number, bg: string, size = 6) {
    const { ctx } = this;
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y, w, size + 3, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, y + (size + 3) / 2 + 0.5);
  }

  private outline(x: number, y: number, w: number, h: number, color: string, dash: number[] = []) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.strokeRect(x * TILE + 1, y * TILE + 1, w * TILE - 2, h * TILE - 2);
    ctx.restore();
  }

  private render(now: number) {
    const { canvas, ctx } = this;
    const map = this.world.map;
    if (this.staticVersion !== this.world.mapVersion) {
      renderStaticMap(map, 2, this.staticMap);
      this.staticVersion = this.world.mapVersion;
    }

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
    const mapW = map.width * TILE;
    const mapH = map.height * TILE;
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

    // Plaquinhas das mesas ocupadas, no lado da mesa oposto à cadeira (para não ficar sob o nome de quem senta)
    for (const [key, claim] of Object.entries(map.claims)) {
      const chair = parseKey(key);
      const desk = deskTileFor(map, chair.x, chair.y);
      if (!desk) continue;
      const mine = claim.owner === this.world.ownerTag;
      this.label(claim.name, desk.x * TILE + 16, desk.y * TILE + (desk.y < chair.y ? 1 : 22), mine ? 'rgba(38,150,102,0.95)' : 'rgba(22,24,38,0.85)', 5.5);
    }

    const area = this.areaId ? map.areas.find(a => a.id === this.areaId) : null;
    if (area && !this.editMode) this.outline(area.x, area.y, area.w, area.h, 'rgba(130,210,255,0.85)', [6, 4]);

    if (this.focus) {
      const pulse = 0.55 + Math.sin(now / 250) * 0.3;
      const color = `rgba(255,214,90,${pulse})`;
      const { x, y } = parseKey(this.focus.key);
      if (this.focus.type === 'desk') {
        this.outline(x, y, 1, 1, color);
        const desk = deskTileFor(map, x, y);
        if (desk) this.outline(desk.x, desk.y, 1, 1, color);
      } else {
        // Destaca todos os tiles do mesmo objeto com a mesma interação (ex.: quadro de 2 tiles).
        const json = JSON.stringify(this.focus.value);
        const obj = map.objects[y][x];
        let x0 = x;
        let x1 = x;
        while (map.objects[y][x0 - 1] === obj && JSON.stringify(map.interactions[tileKey(x0 - 1, y)]) === json) x0--;
        while (map.objects[y][x1 + 1] === obj && JSON.stringify(map.interactions[tileKey(x1 + 1, y)]) === json) x1++;
        this.outline(x0, y, x1 - x0 + 1, 1, color);
      }
    }

    if (this.target && !this.editMode) {
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

    if (this.editMode) this.renderEditOverlay(viewW, viewH);
  }

  private renderEditOverlay(viewW: number, viewH: number) {
    const { ctx } = this;
    const map = this.world.map;
    const x0 = Math.max(0, Math.floor(this.cam.x / TILE));
    const y0 = Math.max(0, Math.floor(this.cam.y / TILE));
    const x1 = Math.min(map.width, Math.ceil((this.cam.x + viewW) / TILE));
    const y1 = Math.min(map.height, Math.ceil((this.cam.y + viewH) / TILE));

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      ctx.moveTo(x * TILE, y0 * TILE);
      ctx.lineTo(x * TILE, y1 * TILE);
    }
    for (let y = y0; y <= y1; y++) {
      ctx.moveTo(x0 * TILE, y * TILE);
      ctx.lineTo(x1 * TILE, y * TILE);
    }
    ctx.stroke();

    for (const a of map.areas) {
      ctx.fillStyle = 'rgba(130,210,255,0.12)';
      ctx.fillRect(a.x * TILE, a.y * TILE, a.w * TILE, a.h * TILE);
      this.outline(a.x, a.y, a.w, a.h, 'rgba(130,210,255,0.9)', [6, 4]);
      this.label(`🔒 ${a.name}`, (a.x + a.w / 2) * TILE, a.y * TILE + 3, 'rgba(40,90,140,0.9)', 7);
    }

    const sp = map.spawn;
    ctx.fillStyle = 'rgba(90,220,150,0.15)';
    ctx.fillRect(sp.x * TILE, sp.y * TILE, sp.w * TILE, sp.h * TILE);
    this.outline(sp.x, sp.y, sp.w, sp.h, 'rgba(90,220,150,0.9)', [4, 3]);
    this.label('Entrada', (sp.x + sp.w / 2) * TILE, sp.y * TILE + 3, 'rgba(30,120,80,0.95)', 7);

    for (const key of Object.keys(map.interactions)) {
      const { x, y } = parseKey(key);
      ctx.fillStyle = '#ffd65a';
      ctx.beginPath();
      ctx.arc(x * TILE + 27, y * TILE + 5, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (isDesk(map, x, y) && !map.claims[tileKey(x, y)]) {
          ctx.fillStyle = 'rgba(90,220,150,0.9)';
          ctx.beginPath();
          ctx.arc(x * TILE + 16, y * TILE + 16, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

    const { rect, selected } = this.editOverlay;
    if (rect) {
      ctx.fillStyle = 'rgba(255,214,90,0.18)';
      ctx.fillRect(rect.x * TILE, rect.y * TILE, rect.w * TILE, rect.h * TILE);
      this.outline(rect.x, rect.y, rect.w, rect.h, '#ffd65a');
    }
    if (selected) this.outline(selected.x, selected.y, 1, 1, '#ff8a5b');
    if (this.hover) this.outline(this.hover.x, this.hover.y, 1, 1, 'rgba(255,255,255,0.9)');
  }
}
