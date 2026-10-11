import { CATALOG } from '../../../shared/catalog';
import {
  TILE,
  areaAt,
  areaBounds,
  areaNames,
  claimKey,
  deskAreaAt,
  footprint,
  interactionNear,
  fullAgainst,
  isWalkable,
  lockedAgainst,
  onSpotlight,
  parseKey,
  tileKey,
  type DeskClaim,
  type EffectKind,
  type PlacedObject,
  type Rect,
  type Room,
} from '../../../shared/map';
import { PROX_RADIUS, canHear, volumeFor } from '../../../shared/proximity';
import { EMOTES, type Dir } from '../../../shared/types';
import type { PeerManager } from '../rtc/peers';
import type { World } from '../world';
import { drawAvatar, drawEmote, drawNameTag, drawSmoke, smokeClock } from './avatar';
import { getImage, renderRoom } from './mapRenderer';
import { drawObject } from './objects';
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
  | { type: 'interaction'; obj: PlacedObject }
  | { type: 'desk'; room: string; area: string; claim: DeskClaim | null };

/** Onde a pessoa está: área privada e/ou holofote. */
export interface Place {
  area: string | null;
  spotlight: boolean;
}

export type EditPhase = 'down' | 'move' | 'up';

export interface PointerInfo {
  tile: Point;
  phase: EditPhase;
  ctrl: boolean;
  shift: boolean;
}

/** Estado visual do Mapmaker, controlado pelo React. */
export interface MapmakerView {
  room: string;
  /** Quais camadas de efeito mostrar sobrepostas. */
  effects: EffectKind[];
  /** Destaque forte de uma camada (a selecionada no painel de efeitos). */
  activeEffect: EffectKind | null;
  ghost: (Pick<PlacedObject, 'type' | 'color' | 'rot'> & Point) | null;
  /** Grupo sendo colado/movido: objetos relativos ao canto do retângulo. */
  ghostGroup: { at: Point; rect: Rect; objects: PlacedObject[] } | null;
  rect: Rect | null;
  selected: string[];
  hoverObject: { id: string; tone: 'select' | 'erase' } | null;
  brush: Rect | null;
  /** Mão: arrastar move a câmera. */
  pan: boolean;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Loop do jogo: entrada, movimento, câmera, renderização, proximidade e Mapmaker. */
export class Engine {
  zoom = 1.6;
  onPlaceChange?: (p: Place) => void;
  onFocusChange?: (f: Focus | null) => void;
  onInteract?: (f: Focus) => void;
  /** Tentou entrar numa área trancada. */
  onLocked?: (area: string) => void;

  /** Mapmaker ligado: câmera livre, cliques vão para o editor. */
  mm: MapmakerView | null = null;
  onEditPointer?: (p: PointerInfo) => void;
  onHoverTile?: (p: Point | null) => void;

  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private held: Dir[] = [];
  private path: Point[] = [];
  private target: Point | null = null;
  private lastStep = 0;
  private lastFrame = 0;
  private syncTimer = 0;
  private cam = { x: 0, y: 0 };
  /** Centro da câmera livre do Mapmaker, em pixels do mundo. */
  private freeCam = { x: 0, y: 0 };
  private place: Place = { area: null, spotlight: false };
  private placeKey = '';
  private focus: Focus | null = null;
  private focusKey = '';
  private hover: Point | null = null;
  private dragging = false;
  private panning: { x: number; y: number; cx: number; cy: number } | null = null;
  private spaceHeld = false;
  private staticMap = document.createElement('canvas');
  private staticKey = '';
  private imageVersion = 0;
  private lastLockedNotice = 0;

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
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onWindowMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
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
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    cancelAnimationFrame(this.raf);
    clearInterval(this.syncTimer);
  }

  setZoom(z: number) {
    this.zoom = clamp(z, 0.4, 3);
  }

  /** Liga/desliga o Mapmaker. Ao ligar, a câmera livre começa onde o avatar está. */
  setMapmaker(view: MapmakerView | null) {
    if (view && !this.mm) {
      const me = this.world.self;
      this.freeCam = { x: me.rx * TILE + TILE / 2, y: me.ry * TILE + TILE / 2 };
      this.held = [];
      this.path = [];
      this.target = null;
    }
    this.mm = view;
  }

  /** Centraliza a câmera livre num tile (lista de objetos, troca de sala). */
  centerOn(x: number, y: number) {
    this.freeCam = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
  }

  get room(): Room | undefined {
    return this.world.map.rooms[this.mm?.room ?? this.world.self.room];
  }

  goTo(x: number, y: number, adjacent = false) {
    const me = this.world.self;
    const room = this.world.map.rooms[me.room];
    if (!room) return;
    const who = this.world.who;
    const players = [...this.world.players.values()];
    const blocked = (tx: number, ty: number) => lockedAgainst(room, tx, ty, who) ?? fullAgainst(room, tx, ty, me.id, players);
    this.path = findPath(room, me.x, me.y, x, y, adjacent, (tx, ty) => !blocked(tx, ty));
    if (!this.path.length) {
      const name = blocked(x, y);
      if (name) this.notifyLocked(name);
    }
    this.target = this.path.at(-1) ?? null;
  }

  /** Anda até a própria mesa (se estiver nesta sala). Retorna false se a mesa é em outra sala. */
  walkToDesk() {
    const desk = this.world.myDesk;
    const me = this.world.self;
    if (!desk) return false;
    if (desk.room !== me.room) return false;
    const room = this.world.map.rooms[me.room];
    const tiles = Object.entries(room.privateAreas)
      .filter(([, n]) => n === desk.area)
      .map(([k]) => parseKey(k))
      .filter(t => isWalkable(room, t.x, t.y));
    if (!tiles.length) return true;
    tiles.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    this.goTo(tiles[0].x, tiles[0].y);
    return true;
  }

  private notifyLocked(area: string) {
    const now = performance.now();
    if (now - this.lastLockedNotice < 2000) return;
    this.lastLockedNotice = now;
    this.onLocked?.(area);
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
    if (this.mm) {
      if (e.code === 'Space') this.spaceHeld = true;
      // No Mapmaker as setas movem a câmera, não o avatar.
      const dir = e.key.startsWith('Arrow') ? KEY_DIR[e.key] : undefined;
      if (dir) {
        e.preventDefault();
        const [dx, dy] = DELTA[dir];
        this.freeCam.x += dx * TILE * 3;
        this.freeCam.y += dy * TILE * 3;
      }
      return;
    }
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
    if ((e.key === 'x' || e.key === 'X') && !e.repeat) {
      if (this.focus) this.onInteract?.(this.focus);
      return;
    }
    const n = Number(e.key);
    if (!e.repeat && n >= 1 && n <= EMOTES.length) this.world.sendEmote(EMOTES[n - 1]);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.spaceHeld = false;
    const dir = KEY_DIR[e.key];
    if (dir) this.held = this.held.filter(d => d !== dir);
  };

  private onBlur = () => {
    this.held = [];
    this.spaceHeld = false;
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.mm) e.preventDefault();
  };

  private onMouseDown = (e: MouseEvent) => {
    const tile = this.tileAt(e);
    if (this.mm) {
      e.preventDefault();
      // Mão, botão do meio ou espaço+arrastar movem a câmera.
      if (this.mm.pan || e.button === 1 || this.spaceHeld) {
        this.panning = { x: e.clientX, y: e.clientY, cx: this.freeCam.x, cy: this.freeCam.y };
        return;
      }
      if (e.button !== 0) return;
      this.dragging = true;
      this.onEditPointer?.({ tile, phase: 'down', ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
      return;
    }
    if (e.button === 0) this.goTo(tile.x, tile.y);
  };

  private onWindowMouseMove = (e: MouseEvent) => {
    if (!this.panning) return;
    this.freeCam.x = this.panning.cx - (e.clientX - this.panning.x) / this.zoom;
    this.freeCam.y = this.panning.cy - (e.clientY - this.panning.y) / this.zoom;
  };

  private onMouseMove = (e: MouseEvent) => {
    const tile = this.tileAt(e);
    const changed = !this.hover || this.hover.x !== tile.x || this.hover.y !== tile.y;
    this.hover = tile;
    if (!changed) return;
    this.onHoverTile?.(tile);
    if (this.dragging) this.onEditPointer?.({ tile, phase: 'move', ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  };

  private onMouseUp = (e: MouseEvent) => {
    if (this.panning) {
      this.panning = null;
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;
    this.onEditPointer?.({ tile: this.hover ?? this.tileAt(e), phase: 'up', ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  };

  private onMouseLeave = () => {
    this.hover = null;
    this.onHoverTile?.(null);
  };

  private onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !this.mm) return;
    e.preventDefault();
    this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  };

  private frame = (now: number) => {
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 100) : 16;
    this.lastFrame = now;
    if (this.world.players.has(this.world.selfId)) {
      if (!this.mm) this.step(now);
      this.animate(dt);
      this.updateFocus();
      this.render(now);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(now: number) {
    if (now - this.lastStep < STEP_MS) return;
    const me = this.world.self;
    const room = this.world.map.rooms[me.room];
    if (!room) return;
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
    const locked = lockedAgainst(room, next.x, next.y, this.world.who) ?? fullAgainst(room, next.x, next.y, me.id, this.world.players.values());
    if (locked) {
      // Porta trancada: vira para ela, mas não entra.
      this.path = [];
      this.notifyLocked(locked);
    } else if (isWalkable(room, next.x, next.y)) {
      me.x = next.x;
      me.y = next.y;
      moved = true;
      if (!this.held.length) this.path.shift();
      // Pisou num portal: o servidor muda a sala; para o caminho atual.
      if (room.portals[tileKey(me.x, me.y)]) this.path = [];
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

  /** Dentro de uma área de mesa → mesa; senão, objeto interativo ao lado. */
  private updateFocus() {
    const me = this.world.self;
    const room = this.world.map.rooms[me.room];
    let focus: Focus | null = null;
    if (!this.mm && room) {
      const desk = deskAreaAt(room, me.x, me.y);
      if (desk) focus = { type: 'desk', room: room.id, area: desk, claim: this.world.map.claims[claimKey(room.id, desk)] ?? null };
      else {
        const obj = interactionNear(room, me.x, me.y);
        if (obj) focus = { type: 'interaction', obj };
      }
    }
    const key = JSON.stringify(focus);
    if (key !== this.focusKey) {
      this.focusKey = key;
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

    const room = map.rooms[me.room];
    const place: Place = { area: room ? areaAt(room, me.x, me.y) : null, spotlight: room ? onSpotlight(room, me.x, me.y) : false };
    const key = JSON.stringify(place);
    if (key !== this.placeKey) {
      this.placeKey = key;
      this.place = place;
      this.onPlaceChange?.(place);
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

  private outline(r: Rect, color: string, dash: number[] = [], width = 2) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.strokeRect(r.x * TILE + 1, r.y * TILE + 1, r.w * TILE - 2, r.h * TILE - 2);
    ctx.restore();
  }

  private render(now: number) {
    const { canvas, ctx } = this;
    const map = this.world.map;
    const room = this.room;
    if (!room) return;
    const key = `${room.id}:${this.world.mapVersion}:${this.imageVersion}`;
    if (key !== this.staticKey) {
      renderRoom(room, 2, this.staticMap, () => this.imageVersion++);
      this.staticKey = key;
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
    const mapW = room.width * TILE;
    const mapH = room.height * TILE;
    const me = this.world.self;
    let camX: number;
    let camY: number;
    if (this.mm) {
      // Câmera livre: pode passar um pouco das bordas para editar os cantos com folga.
      this.freeCam.x = clamp(this.freeCam.x, -viewW / 4, mapW + viewW / 4);
      this.freeCam.y = clamp(this.freeCam.y, -viewH / 4, mapH + viewH / 4);
      camX = this.freeCam.x - viewW / 2;
      camY = this.freeCam.y - viewH / 2;
    } else {
      const cx = me.rx * TILE + TILE / 2;
      const cy = me.ry * TILE + TILE / 2;
      camX = mapW <= viewW ? (mapW - viewW) / 2 : clamp(cx - viewW / 2, 0, mapW - viewW);
      camY = mapH <= viewH ? (mapH - viewH) / 2 : clamp(cy - viewH / 2, 0, mapH - viewH);
    }
    const ox = Math.round(-camX * s);
    const oy = Math.round(-camY * s);
    this.cam.x = -ox / s;
    this.cam.y = -oy / s;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.staticMap, 0, 0, mapW, mapH);

    // Plaquinhas das mesas ocupadas: no topo da área de mesa
    for (const name of areaNames(room)) {
      const claim = map.claims[claimKey(room.id, name)];
      if (!claim) continue;
      const b = areaBounds(room, name);
      if (!b) continue;
      const mine = claim.owner === this.world.ownerTag;
      this.label(claim.name, (b.x + b.w / 2) * TILE, (b.y + b.h) * TILE - 10, mine ? 'rgba(38,150,102,0.95)' : 'rgba(22,24,38,0.85)', 5.5);
    }

    if (!this.mm) {
      for (const name of areaNames(room)) {
        const meta = room.areaMeta[name];
        if (!meta?.locked) continue;
        const b = areaBounds(room, name);
        if (b) this.label(`🔒 ${name}`, (b.x + b.w / 2) * TILE, b.y * TILE + 3, 'rgba(120,30,60,0.88)', 6);
      }
      if (this.place.area) {
        const b = areaBounds(room, this.place.area);
        if (b) {
          // Só os tiles da área (ela pode ter formato irregular)
          ctx.fillStyle = 'rgba(130,210,255,0.08)';
          for (const [k, n] of Object.entries(room.privateAreas))
            if (n === this.place.area) {
              const t = parseKey(k);
              ctx.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
            }
          this.outline(b, 'rgba(130,210,255,0.85)', [6, 4]);
        }
      }
      this.renderFocus(room, now);
      if (this.target) {
        const pulse = 4 + Math.sin(now / 150) * 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(this.target.x * TILE + 16, this.target.y * TILE + 26, pulse + 4, pulse / 2 + 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const players = [...this.world.players.values()].filter(p => p.room === room.id).sort((a, b) => a.ry - b.ry);
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

    // Primeiro plano fica acima dos avatares (ex.: copas de árvores, teto).
    if (room.foreground) {
      const img = getImage(room.foreground, () => this.imageVersion++);
      if (img) ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
    }

    for (const p of players) {
      const spot = onSpotlight(room, p.x, p.y);
      drawNameTag(ctx, p.rx * TILE + 16, p.ry * TILE + 31, (spot ? '📢 ' : '') + p.name, p.id === me.id, p.audio);
    }
    for (const [id, e] of this.world.emotes) {
      const p = this.world.players.get(id);
      if (!p || e.until < now) {
        this.world.emotes.delete(id);
        continue;
      }
      if (p.room === room.id) drawEmote(ctx, p.rx * TILE + 16, p.ry * TILE, e.emoji, (e.until - now) / 3000);
    }

    if (this.mm) this.renderMapmaker(room, viewW, viewH);
  }

  private renderFocus(room: Room, now: number) {
    if (!this.focus) return;
    const pulse = 0.55 + Math.sin(now / 250) * 0.3;
    const color = `rgba(255,214,90,${pulse})`;
    if (this.focus.type === 'desk') {
      const b = areaBounds(room, this.focus.area);
      if (b) this.outline(b, color);
    } else this.outline(footprint(this.focus.obj), color);
  }

  private renderMapmaker(room: Room, viewW: number, viewH: number) {
    const { ctx } = this;
    const mm = this.mm!;
    const x0 = Math.max(0, Math.floor(this.cam.x / TILE));
    const y0 = Math.max(0, Math.floor(this.cam.y / TILE));
    const x1 = Math.min(room.width, Math.ceil((this.cam.x + viewW) / TILE));
    const y1 = Math.min(room.height, Math.ceil((this.cam.y + viewH) / TILE));

    // Grade
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
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
    ctx.strokeStyle = 'rgba(255,214,90,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, room.width * TILE, room.height * TILE);

    // Camadas de efeito (cores no estilo do Gather)
    const alpha = (k: EffectKind) => (mm.activeEffect === k ? 0.5 : mm.activeEffect ? 0.18 : 0.32);
    const show = new Set(mm.effects);
    const fillTiles = (keys: string[], color: string) => {
      ctx.fillStyle = color;
      for (const k of keys) {
        const t = parseKey(k);
        if (t.x >= x0 && t.x < x1 && t.y >= y0 && t.y < y1) ctx.fillRect(t.x * TILE + 0.5, t.y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    };
    if (show.has('private')) {
      fillTiles(Object.keys(room.privateAreas), `rgba(236,72,200,${alpha('private')})`);
      for (const name of areaNames(room)) {
        const b = areaBounds(room, name);
        const meta = room.areaMeta[name];
        if (b) this.label(`${meta?.locked ? '🔐 ' : meta?.desk ? '🪑 ' : '🔒 '}${name}`, (b.x + b.w / 2) * TILE, b.y * TILE + 2, 'rgba(150,30,120,0.9)', 6);
      }
    }
    if (show.has('impassable')) fillTiles(Object.keys(room.impassable), `rgba(229,57,53,${alpha('impassable')})`);
    if (show.has('spawn')) fillTiles(Object.keys(room.spawn), `rgba(76,217,100,${alpha('spawn') + 0.15})`);
    if (show.has('spotlight')) {
      fillTiles(Object.keys(room.spotlight), `rgba(255,170,40,${alpha('spotlight') + 0.1})`);
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const k of Object.keys(room.spotlight)) {
        const t = parseKey(k);
        ctx.fillText('📢', t.x * TILE + 16, t.y * TILE + 16);
      }
    }
    if (show.has('portal')) {
      fillTiles(Object.keys(room.portals), `rgba(110,80,255,${alpha('portal') + 0.2})`);
      for (const [k, target] of Object.entries(room.portals)) {
        const t = parseKey(k);
        const dest = this.world.map.rooms[target.room];
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↪', t.x * TILE + 16, t.y * TILE + 14);
        if (dest) this.label(`${dest.name} (${target.x},${target.y})`, t.x * TILE + 16, t.y * TILE + 22, 'rgba(80,50,200,0.9)', 5);
      }
    }

    // Seleção e destaques
    for (const id of mm.selected) {
      const o = room.objects.find(ob => ob.id === id);
      if (o) this.outline(footprint(o), '#4fc3ff', [], 2);
    }
    if (mm.hoverObject) {
      const o = room.objects.find(ob => ob.id === mm.hoverObject!.id);
      if (o) {
        const f = footprint(o);
        if (mm.hoverObject.tone === 'erase') {
          ctx.fillStyle = 'rgba(229,57,53,0.35)';
          ctx.fillRect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
        }
        this.outline(f, mm.hoverObject.tone === 'erase' ? '#ff5252' : 'rgba(79,195,255,0.8)');
      }
    }
    if (mm.rect) {
      ctx.fillStyle = 'rgba(79,195,255,0.12)';
      ctx.fillRect(mm.rect.x * TILE, mm.rect.y * TILE, mm.rect.w * TILE, mm.rect.h * TILE);
      this.outline(mm.rect, '#4fc3ff', [5, 4]);
    }
    if (mm.ghostGroup) {
      const { at, rect, objects } = mm.ghostGroup;
      ctx.globalAlpha = 0.6;
      for (const o of objects) drawObject(ctx, o, (at.x + o.x) * TILE, (at.y + o.y) * TILE);
      ctx.globalAlpha = 1;
      this.outline({ x: at.x, y: at.y, w: rect.w, h: rect.h }, '#4fc3ff', [5, 4]);
    }
    if (mm.ghost) {
      const def = CATALOG[mm.ghost.type];
      ctx.globalAlpha = 0.65;
      drawObject(ctx, { ...mm.ghost }, mm.ghost.x * TILE, mm.ghost.y * TILE);
      ctx.globalAlpha = 1;
      this.outline({ x: mm.ghost.x, y: mm.ghost.y, w: def?.w ?? 1, h: def?.h ?? 1 }, 'rgba(255,255,255,0.8)', [3, 3]);
    } else if (mm.brush) this.outline(mm.brush, 'rgba(255,255,255,0.9)');
  }
}
