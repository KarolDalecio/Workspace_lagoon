import {
  BoxSelect,
  Eraser,
  Hand,
  Home,
  ImageUp,
  Menu,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Stamp,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATALOG } from '../../../shared/catalog';
import {
  FLAG_EFFECTS,
  FLOORS,
  areaNames,
  isAllowed,
  createRoom,
  footprint,
  objectAt,
  parseKey,
  tileKey,
  ROOM_TEMPLATES,
  type EffectKind,
  type Floor,
  type FlagEffect,
  type Interaction,
  type AreaMeta,
  type MapEdit,
  type PlacedObject,
  type PortalTarget,
  type Rect,
  type Room,
  type RoomTemplate,
} from '../../../shared/map';
import type { Engine, MapmakerView, PointerInfo } from '../game/engine';
import { drawFloor } from '../game/mapRenderer';
import type { Point } from '../game/path';
import type { World } from '../world';
import { ObjectIcon, ObjectPicker, rotateStamp, type StampItem } from './ObjectPicker';

type Mode = 'objects' | 'effects' | 'floor';
type Tool = 'select' | 'stamp' | 'erase' | 'hand' | 'box';

const FLOOR_NAMES: Record<Floor, string> = {
  grass: 'Grama',
  wood: 'Madeira',
  darkwood: 'Madeira escura',
  carpet: 'Carpete azul',
  carpet2: 'Carpete vinho',
  tile: 'Piso frio',
  hex: 'Piso hexagonal',
  path: 'Caminho',
  sand: 'Areia',
  water: 'Água',
  rug: 'Tapete',
  darkrug: 'Tapete escuro',
  moss: 'Sebe / grama escura',
  stone: 'Pedra',
  dark: 'Escuro',
};

const EFFECTS: { id: EffectKind; name: string; description: string; color: string; icon: string }[] = [
  { id: 'impassable', name: 'Bloqueio', description: 'Ninguém consegue passar por estes tiles.', color: '#e53935', icon: '✕' },
  { id: 'spawn', name: 'Entrada', description: 'Onde as pessoas aparecem ao entrar na sala.', color: '#4cd964', icon: '⌖' },
  { id: 'portal', name: 'Portal', description: 'Teletransporta para outra sala (ou outro ponto da mesma).', color: '#6e50ff', icon: '↪' },
  { id: 'private', name: 'Área privada', description: 'Só quem está em tiles com o mesmo nome se vê e se ouve.', color: '#ec48c8', icon: '🔒' },
  { id: 'spotlight', name: 'Holofote', description: 'Quem fica aqui é ouvido e visto por todos na sala.', color: '#ffaa28', icon: '📢' },
];

const RECENT_KEY = 'praca:recent-objects';

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function excalidrawRoom() {
  const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const hex = [...bytes(10)].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = btoa(String.fromCharCode(...bytes(16))).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 22);
  return `https://excalidraw.com/#room=${hex},${key}`;
}

function rectFrom(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

function inRect(r: Rect, x: number, y: number) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function brushRect(p: Point, size: number): Rect {
  const off = Math.floor((size - 1) / 2);
  return { x: p.x - off, y: p.y - off, w: size, h: size };
}

function rectTiles(r: Rect, room: Room) {
  const out: Point[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < room.width && y < room.height) out.push({ x, y });
  return out;
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').filter((t: string) => CATALOG[t]);
  } catch {
    return [];
  }
}

export async function uploadImage(file: File): Promise<string> {
  if (file.size > 3 * 1024 * 1024) throw new Error('A imagem passa de 3 MB.');
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error ?? 'Não foi possível enviar a imagem.');
  return data.url;
}

/** Tiles de bloqueio que um conjunto de objetos deixaria de precisar (sem outro objeto bloqueante por cima). */
function freedBlocks(room: Room, removing: Set<string>, tiles: Point[]) {
  return tiles.filter(t => {
    if (!room.impassable[tileKey(t.x, t.y)]) return false;
    return !room.objects.some(o => {
      if (removing.has(o.id) || !CATALOG[o.type]?.blocks) return false;
      return inRect(footprint(o), t.x, t.y);
    });
  });
}

function footprintTiles(o: Pick<PlacedObject, 'type' | 'x' | 'y'>) {
  const f = footprint(o);
  const out: Point[] = [];
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) out.push({ x, y });
  return out;
}

/** Efeitos dentro de um retângulo, com coordenadas relativas ao canto. */
interface EffectsSnapshot {
  flags: Record<FlagEffect, Point[]>;
  private: (Point & { name: string })[];
  portals: (Point & { target: PortalTarget })[];
  meta: Record<string, AreaMeta>;
}

function effectsIn(room: Room, r: Rect): EffectsSnapshot {
  const snap: EffectsSnapshot = { flags: { impassable: [], spawn: [], spotlight: [] }, private: [], portals: [], meta: {} };
  for (const t of rectTiles(r, room)) {
    const k = tileKey(t.x, t.y);
    const rel = { x: t.x - r.x, y: t.y - r.y };
    for (const f of FLAG_EFFECTS) if (room[f][k]) snap.flags[f].push(rel);
    if (room.privateAreas[k]) {
      snap.private.push({ ...rel, name: room.privateAreas[k] });
      snap.meta[room.privateAreas[k]] = room.areaMeta[room.privateAreas[k]] ?? { desk: false };
    }
    if (room.portals[k]) snap.portals.push({ ...rel, target: room.portals[k] });
  }
  return snap;
}

/** Nome livre para uma área copiada: "Lounge" → "Lounge 2", "Lounge 3"… */
function uniqueAreaName(room: Room, name: string, taken: Set<string>) {
  const base = name.replace(/ \d+$/, '');
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`.slice(0, 40);
    if (!room.areaMeta[candidate] && !taken.has(candidate)) return candidate;
  }
}

/**
 * Coloca efeitos copiados. Ao colar (rename = true), áreas privadas ganham nomes novos —
 * senão a cópia viraria a mesma área que a original (mesmo nome = mesma conversa).
 */
function placeEffectsOps(room: Room, snap: EffectsSnapshot, at: Point, rename = false): MapEdit[] {
  const roomId = room.id;
  const names: Record<string, string> = {};
  const taken = new Set<string>();
  for (const n of Object.keys(snap.meta)) {
    names[n] = rename && room.areaMeta[n] ? uniqueAreaName(room, n, taken) : n;
    taken.add(names[n]);
  }
  const ops: MapEdit[] = [];
  for (const f of FLAG_EFFECTS)
    if (snap.flags[f].length) ops.push({ kind: 'flag', room: roomId, effect: f, tiles: snap.flags[f].map(t => ({ x: at.x + t.x, y: at.y + t.y, value: true })) });
  if (snap.private.length) {
    ops.push({ kind: 'private', room: roomId, tiles: snap.private.map(t => ({ x: at.x + t.x, y: at.y + t.y, value: names[t.name] ?? t.name })) });
    for (const [n, meta] of Object.entries(snap.meta)) if (meta.desk) ops.push({ kind: 'area-meta', room: roomId, name: names[n], meta });
  }
  if (snap.portals.length) ops.push({ kind: 'portal', room: roomId, tiles: snap.portals.map(t => ({ x: at.x + t.x, y: at.y + t.y, value: t.target })) });
  return ops;
}

function clearEffectsOps(room: Room, r: Rect): MapEdit[] {
  const tiles = rectTiles(r, room);
  const ops: MapEdit[] = [];
  for (const f of FLAG_EFFECTS) {
    const on = tiles.filter(t => room[f][tileKey(t.x, t.y)]);
    if (on.length) ops.push({ kind: 'flag', room: room.id, effect: f, tiles: on.map(t => ({ ...t, value: false })) });
  }
  const priv = tiles.filter(t => room.privateAreas[tileKey(t.x, t.y)]);
  if (priv.length) ops.push({ kind: 'private', room: room.id, tiles: priv.map(t => ({ ...t, value: null })) });
  const portals = tiles.filter(t => room.portals[tileKey(t.x, t.y)]);
  if (portals.length) ops.push({ kind: 'portal', room: room.id, tiles: portals.map(t => ({ ...t, value: null })) });
  return ops;
}

function FloorIcon({ floor, size = 30 }: { floor: Floor; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform((size / 32) * dpr, 0, 0, (size / 32) * dpr, 0, 0);
    drawFloor(ctx, floor, 0, 0);
  }, [floor, size]);
  return <canvas ref={ref} style={{ width: size, height: size, borderRadius: 6 }} />;
}

function ToolButton({ active, title, onClick, disabled, children }: { active?: boolean; title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button className={`mm-tool ${active ? 'active' : ''}`} title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

const INTERACTION_LABELS: Record<Interaction['kind'], string> = {
  embed: 'Site embutido',
  video: 'Vídeo embutido (YouTube, Vimeo, Twitch)',
  image: 'Imagem',
  link: 'Link externo / chamada (abre em nova aba)',
  note: 'Nota de texto',
};

function InteractionForm({ obj, onSave }: { obj: PlacedObject; onSave: (value: Interaction | null) => void }) {
  const [form, setForm] = useState<Interaction>(obj.interaction ?? { kind: 'embed', title: CATALOG[obj.type]?.name ?? '', url: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(obj.interaction ?? { kind: 'embed', title: CATALOG[obj.type]?.name ?? '', url: '' }), [obj.id, obj.interaction]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setForm({ ...form, url: await uploadImage(file) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor-box">
      <label>
        Interação (tecla X)
        <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as Interaction['kind'] })}>
          {Object.entries(INTERACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Título
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} maxLength={60} />
      </label>
      {form.kind === 'note' && (
        <label>
          Texto
          <textarea rows={5} value={form.text ?? ''} onChange={e => setForm({ ...form, text: e.target.value })} maxLength={3000} />
        </label>
      )}
      {form.kind === 'image' && (
        <label>
          Imagem (PNG, JPG, GIF · até 3 MB)
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e => onFile(e.target.files?.[0])} disabled={busy} />
          {form.url && <img src={form.url} alt="" className="thumb" />}
        </label>
      )}
      {form.kind !== 'note' && form.kind !== 'image' && (
        <label>
          Endereço (URL)
          <input value={form.url ?? ''} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://" />
        </label>
      )}
      {obj.type === 'whiteboard' && (
        <button className="chip" onClick={() => setForm({ ...form, kind: 'embed', url: excalidrawRoom() })}>
          Gerar novo quadro do Excalidraw
        </button>
      )}
      {error && <p className="hint warn">{error}</p>}
      <div className="tool-row">
        <button className="primary small" disabled={busy} onClick={() => onSave(form)}>
          Salvar interação
        </button>
        {obj.interaction && (
          <button className="chip" onClick={() => onSave(null)}>
            Remover
          </button>
        )}
      </div>
    </div>
  );
}

function NewRoomDialog({ world, onCreate, onClose }: { world: World; onCreate: (room: Room) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<RoomTemplate | 'copy'>('blank');
  const [copyOf, setCopyOf] = useState(world.map.order[0]);

  function create() {
    const n = name.trim();
    if (!n) return;
    const slug = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    const id = `${slug || 'sala'}-${Math.random().toString(36).slice(2, 6)}`;
    let room: Room;
    if (template === 'copy') {
      room = JSON.parse(JSON.stringify(world.map.rooms[copyOf]));
      room.id = id;
      room.name = n;
      room.objects = room.objects.map(o => ({ ...o, id: newId() }));
    } else room = createRoom(template, id, n);
    // Quadros brancos da sala nova ganham salas próprias do Excalidraw.
    for (const o of room.objects)
      if (o.type === 'whiteboard' && o.interaction?.kind === 'embed' && (!o.interaction.url || template === 'copy')) o.interaction.url = excalidrawRoom();
    // Portais que apontavam para salas de outro espaço/modelo não fazem sentido aqui.
    room.portals = Object.fromEntries(Object.entries(room.portals).filter(([, t]) => world.map.rooms[t.room]));
    onCreate(room);
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header>
          <h2>Criar nova sala</h2>
          <button className="icon" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <label className="field">
          Nome da sala
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Ex.: Terraço" autoFocus />
        </label>
        <div className="template-list">
          {ROOM_TEMPLATES.map(t => (
            <button key={t.id} className={`template ${template === t.id ? 'active' : ''}`} onClick={() => setTemplate(t.id)}>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          ))}
          <button className={`template ${template === 'copy' ? 'active' : ''}`} onClick={() => setTemplate('copy')}>
            <strong>Copiar sala existente</strong>
            <span>
              <select value={copyOf} onChange={e => setCopyOf(e.target.value)} onClick={e => e.stopPropagation()}>
                {world.map.order.map(id => (
                  <option key={id} value={id}>
                    {world.map.rooms[id].name}
                  </option>
                ))}
              </select>
            </span>
          </button>
        </div>
        <p className="hint">Depois de criar, ligue as salas com o efeito Portal.</p>
        <button className="primary" disabled={!name.trim()} onClick={create}>
          Criar sala
        </button>
      </div>
    </div>
  );
}

export function Mapmaker({ world, engine, onClose, onToast }: { world: World; engine: Engine | null; onClose: () => void; onToast: (t: string) => void }) {
  const map = world.map;
  const [mode, setMode] = useState<Mode>('objects');
  const [tool, setTool] = useState<Tool>('stamp');
  const [roomId, setRoomId] = useState(world.self.room);
  const [stamp, setStamp] = useState<StampItem | null>({ type: 'plant', color: 0, rot: 0 });
  const [autoBlock, setAutoBlock] = useState(true);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [box, setBox] = useState<Rect | null>(null);
  const [boxFilter, setBoxFilter] = useState({ objects: true, effects: true });
  const [clipboard, setClipboard] = useState<{ rect: Rect; objects: PlacedObject[]; effects: EffectsSnapshot | null } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [drag, setDrag] = useState<{ from: Point; to: Point; kind: 'move-obj' | 'move-group' | 'box' } | null>(null);
  const [effect, setEffect] = useState<EffectKind>('impassable');
  const [privateName, setPrivateName] = useState('');
  const [privateDesk, setPrivateDesk] = useState(false);
  const [portalTarget, setPortalTarget] = useState(map.order.find(id => id !== world.self.room) ?? map.order[0]);
  const [twoWay, setTwoWay] = useState(true);
  const [pendingPortal, setPendingPortal] = useState<{ room: string; tiles: Point[]; marking: boolean } | null>(null);
  const [inspect, setInspect] = useState<Point | null>(null);
  const [floor, setFloor] = useState<Floor>('wood');
  const [brush, setBrush] = useState(1);
  const [hover, setHover] = useState<Point | null>(null);
  const [bottomTab, setBottomTab] = useState<'rooms' | 'objects'>('rooms');
  const [menuOpen, setMenuOpen] = useState(false);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [listFilter, setListFilter] = useState('');
  const painted = useRef(new Set<string>());

  const room = map.rooms[roomId] ?? map.rooms[map.entry];
  const selectedObjs = selected.map(id => room.objects.find(o => o.id === id)).filter((o): o is PlacedObject => !!o);

  // Se a sala sendo editada for apagada (por alguém), volta para a entrada.
  useEffect(() => {
    if (!map.rooms[roomId]) setRoomId(map.entry);
  }, [map, roomId]);

  function edit(op: MapEdit) {
    return world.editMap(op);
  }

  function pushRecent(type: string) {
    const next = [type, ...recent.filter(t => t !== type)].slice(0, 9);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignora
    }
  }

  function switchRoom(id: string) {
    setRoomId(id);
    setSelected([]);
    setBox(null);
    setInspect(null);
    const r = map.rooms[id];
    if (r) engine?.centerOn(Math.floor(r.width / 2), Math.floor(r.height / 2));
  }

  // ------------------------------------------------------------ ações de objetos

  function placeObject(at: Point) {
    if (!stamp) return;
    const def = CATALOG[stamp.type];
    if (!def) return;
    const key = `${stamp.type}@${at.x},${at.y}`;
    if (painted.current.has(key)) return;
    painted.current.add(key);
    if (room.objects.some(o => o.type === stamp.type && o.x === at.x && o.y === at.y)) return;
    const obj: PlacedObject = { id: newId(), type: stamp.type, x: at.x, y: at.y, color: stamp.color, rot: stamp.rot };
    if (def.label !== undefined) obj.label = def.label;
    if (def.defaultInteraction === 'whiteboard') obj.interaction = { kind: 'embed', title: 'Quadro branco', url: excalidrawRoom() };
    const ops: MapEdit[] = [{ kind: 'obj-add', room: room.id, obj }];
    if (def.blocks && autoBlock) ops.push({ kind: 'flag', room: room.id, effect: 'impassable', tiles: footprintTiles(obj).map(t => ({ ...t, value: true })) });
    edit({ kind: 'batch', ops });
  }

  function removeObjects(ids: string[]) {
    const removing = new Set(ids);
    const objs = room.objects.filter(o => removing.has(o.id));
    if (!objs.length) return;
    const ops: MapEdit[] = objs.map(o => ({ kind: 'obj-remove', room: room.id, id: o.id }));
    const freed = freedBlocks(room, removing, objs.filter(o => CATALOG[o.type]?.blocks).flatMap(footprintTiles));
    if (freed.length) ops.push({ kind: 'flag', room: room.id, effect: 'impassable', tiles: freed.map(t => ({ ...t, value: false })) });
    edit({ kind: 'batch', ops });
    setSelected(s => s.filter(id => !removing.has(id)));
  }

  /** Move objetos (e o bloqueio embaixo deles) por um deslocamento. */
  function moveObjectsOps(objs: PlacedObject[], dx: number, dy: number): MapEdit[] {
    const ops: MapEdit[] = [];
    const ids = new Set(objs.map(o => o.id));
    const blockers = objs.filter(o => CATALOG[o.type]?.blocks);
    const freed = freedBlocks(room, ids, blockers.flatMap(footprintTiles));
    if (freed.length) ops.push({ kind: 'flag', room: room.id, effect: 'impassable', tiles: freed.map(t => ({ ...t, value: false })) });
    for (const o of objs) ops.push({ kind: 'obj-update', room: room.id, id: o.id, patch: { x: o.x + dx, y: o.y + dy } });
    const newBlocks = blockers.flatMap(o => footprintTiles({ ...o, x: o.x + dx, y: o.y + dy }));
    if (newBlocks.length) ops.push({ kind: 'flag', room: room.id, effect: 'impassable', tiles: newBlocks.map(t => ({ ...t, value: true })) });
    return ops;
  }

  function rotateSelected(dir: 1 | -1) {
    if (selectedObjs.length === 1) {
      const o = selectedObjs[0];
      const next = rotateStamp({ type: o.type, color: o.color, rot: o.rot }, dir);
      if (next.rot !== o.rot) edit({ kind: 'obj-update', room: room.id, id: o.id, patch: { rot: next.rot } });
    } else if (stamp) setStamp(rotateStamp(stamp, dir));
  }

  // ------------------------------------------------------------ seleção retangular

  function boxObjects(r: Rect) {
    return boxFilter.objects
      ? room.objects.filter(o => {
          const f = footprint(o);
          return f.x >= r.x && f.y >= r.y && f.x + f.w <= r.x + r.w && f.y + f.h <= r.y + r.h;
        })
      : [];
  }

  function copySelection() {
    if (!box) return;
    const objects = boxObjects(box).map(o => ({ ...o, x: o.x - box.x, y: o.y - box.y }));
    setClipboard({ rect: box, objects, effects: boxFilter.effects ? effectsIn(room, box) : null });
    setPasting(true);
    onToast('Seleção copiada — clique no mapa para colar');
  }

  function paste(at: Point) {
    if (!clipboard) return;
    const ops: MapEdit[] = clipboard.objects.map(o => ({
      kind: 'obj-add',
      room: room.id,
      obj: {
        ...o,
        id: newId(),
        x: at.x + o.x,
        y: at.y + o.y,
        // Quadro copiado vira um quadro novo, não o mesmo desenho.
        interaction: o.type === 'whiteboard' && o.interaction?.kind === 'embed' ? { ...o.interaction, url: excalidrawRoom() } : o.interaction,
      },
    }));
    if (clipboard.effects) ops.push(...placeEffectsOps(room, clipboard.effects, at, true));
    edit({ kind: 'batch', ops });
  }

  function eraseSelection() {
    if (!box) return;
    const ops: MapEdit[] = [];
    const objs = boxObjects(box);
    for (const o of objs) ops.push({ kind: 'obj-remove', room: room.id, id: o.id });
    if (boxFilter.effects) ops.push(...clearEffectsOps(room, box));
    else {
      const freed = freedBlocks(room, new Set(objs.map(o => o.id)), objs.filter(o => CATALOG[o.type]?.blocks).flatMap(footprintTiles));
      if (freed.length) ops.push({ kind: 'flag', room: room.id, effect: 'impassable', tiles: freed.map(t => ({ ...t, value: false })) });
    }
    if (ops.length) edit({ kind: 'batch', ops });
    setBox(null);
    setSelected([]);
  }

  function moveSelection(dx: number, dy: number) {
    if (!box || (!dx && !dy)) return;
    const objs = boxObjects(box);
    const ops = moveObjectsOps(objs, dx, dy);
    if (boxFilter.effects) {
      const snap = effectsIn(room, box);
      ops.unshift(...clearEffectsOps(room, box));
      ops.push(...placeEffectsOps(room, snap, { x: box.x + dx, y: box.y + dy }));
    }
    edit({ kind: 'batch', ops });
    setBox({ ...box, x: box.x + dx, y: box.y + dy });
  }

  // ------------------------------------------------------------ efeitos e piso

  function paintEffect(p: Point, on: boolean) {
    const all = rectTiles(brushRect(p, brush), room);
    // Só os tiles que realmente mudam (evita entradas vazias no desfazer).
    const tiles = all.filter(t => {
      const k = tileKey(t.x, t.y);
      if (effect === 'private') return on ? room.privateAreas[k] !== privateName.trim() : !!room.privateAreas[k];
      if (effect === 'portal') return !on && !!room.portals[k];
      return !!room[effect][k] !== on;
    });
    if (!tiles.length) return;
    if (effect === 'private') {
      const name = privateName.trim();
      if (on && !name) {
        onToast('Dê um nome à área privada antes de pintar');
        return;
      }
      const isNew = on && !room.areaMeta[name];
      edit({
        kind: 'batch',
        ops: [
          { kind: 'private', room: room.id, tiles: tiles.map(t => ({ ...t, value: on ? name : null })) },
          ...(isNew && privateDesk ? [{ kind: 'area-meta', room: room.id, name, meta: { desk: true } } as MapEdit] : []),
        ],
      });
    } else if (effect === 'portal') {
      if (!on) edit({ kind: 'portal', room: room.id, tiles: tiles.map(t => ({ ...t, value: null })) });
    } else edit({ kind: 'flag', room: room.id, effect, tiles: tiles.map(t => ({ ...t, value: on })) });
  }

  function paintFloor(p: Point) {
    const tiles = rectTiles(brushRect(p, brush), room).filter(t => room.floor[t.y][t.x] !== floor);
    if (tiles.length) edit({ kind: 'floor', room: room.id, tiles: tiles.map(t => ({ ...t, value: floor })) });
  }

  /** Portal: clique (ou arraste) marca a entrada; ao soltar, abre a sala de destino para clicar na saída. */
  function portalClick(p: Point, phase: PointerInfo['phase']) {
    if (pendingPortal && !pendingPortal.marking) {
      if (phase === 'down') finishPortal(p);
      return;
    }
    if (phase === 'down') setPendingPortal({ room: room.id, tiles: [p], marking: true });
    else if (pendingPortal?.marking && phase === 'move') {
      if (!pendingPortal.tiles.some(t => t.x === p.x && t.y === p.y)) setPendingPortal({ ...pendingPortal, tiles: [...pendingPortal.tiles, p] });
    } else if (pendingPortal?.marking && phase === 'up') {
      setPendingPortal({ ...pendingPortal, marking: false });
      if (portalTarget !== room.id) switchRoom(portalTarget);
      onToast(`Agora clique em "${map.rooms[portalTarget]?.name}" onde a pessoa vai aparecer`);
    }
  }

  function finishPortal(exit: Point) {
    if (!pendingPortal) return;
    const { room: fromRoom, tiles } = pendingPortal;
    // Portas duplas: cada tile da entrada leva a um tile ao lado do outro na saída.
    const horizontal = tiles.every(t => t.y === tiles[0].y);
    const sorted = [...tiles].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    const exits = sorted.map((_, i) => (horizontal ? { x: exit.x + i, y: exit.y } : { x: exit.x, y: exit.y + i }));
    const ops: MapEdit[] = [{ kind: 'portal', room: fromRoom, tiles: sorted.map((t, i) => ({ ...t, value: { room: room.id, ...exits[i] } })) }];
    if (twoWay) {
      // Volta: um tile à frente da porta de saída leva de volta para a frente da entrada.
      ops.push({ kind: 'portal', room: room.id, tiles: exits.map((t, i) => ({ ...t, value: { room: fromRoom, ...sorted[i] } })) });
    }
    edit({ kind: 'batch', ops });
    setPendingPortal(null);
    onToast(twoWay ? 'Portal de mão dupla criado' : 'Portal criado');
    if (fromRoom !== room.id) switchRoom(fromRoom);
  }

  // ------------------------------------------------------------ ponteiro

  function onPointer(info: PointerInfo) {
    const { tile: p, phase } = info;
    if (phase === 'down') {
      painted.current.clear();
      world.beginGroup();
    }
    if (phase === 'up') queueMicrotask(() => world.endGroup());

    if (pasting && clipboard) {
      if (phase === 'down') paste(p);
      return;
    }

    if (mode === 'floor') {
      if (tool === 'stamp') paintFloor(p);
      else if (tool === 'box') {
        if (phase === 'down') setDrag({ from: p, to: p, kind: 'box' });
        else if (drag) {
          setDrag({ ...drag, to: p });
          if (phase === 'up') {
            const r = rectFrom(drag.from, p);
            edit({ kind: 'floor', room: room.id, tiles: rectTiles(r, room).map(t => ({ ...t, value: floor })) });
            setDrag(null);
          }
        }
      }
      return;
    }

    if (mode === 'effects') {
      if (tool === 'select') {
        if (phase === 'down') setInspect(p);
      } else if (tool === 'stamp') {
        if (effect === 'portal') portalClick(p, phase);
        else paintEffect(p, true);
      } else if (tool === 'erase') paintEffect(p, false);
      else if (tool === 'box') boxPointer(p, phase);
      return;
    }

    // Objetos
    if (tool === 'stamp') placeObject(p);
    else if (tool === 'erase') {
      const o = objectAt(room, p.x, p.y);
      if (o) removeObjects([o.id]);
    } else if (tool === 'select') {
      if (phase === 'down') {
        const o = objectAt(room, p.x, p.y);
        setSelected(o ? [o.id] : []);
        if (o) setDrag({ from: p, to: p, kind: 'move-obj' });
      } else if (drag?.kind === 'move-obj') {
        setDrag({ ...drag, to: p });
        if (phase === 'up') {
          const dx = p.x - drag.from.x;
          const dy = p.y - drag.from.y;
          if ((dx || dy) && selectedObjs.length) edit({ kind: 'batch', ops: moveObjectsOps(selectedObjs, dx, dy) });
          setDrag(null);
        }
      }
    } else if (tool === 'box') boxPointer(p, phase);
  }

  function boxPointer(p: Point, phase: PointerInfo['phase']) {
    if (phase === 'down') {
      if (box && inRect(box, p.x, p.y)) setDrag({ from: p, to: p, kind: 'move-group' });
      else {
        setBox(null);
        setSelected([]);
        setDrag({ from: p, to: p, kind: 'box' });
      }
      return;
    }
    if (!drag) return;
    setDrag({ ...drag, to: p });
    if (phase !== 'up') return;
    if (drag.kind === 'box') {
      const r = rectFrom(drag.from, p);
      setBox(r);
      setSelected(boxObjects(r).map(o => o.id));
    } else moveSelection(p.x - drag.from.x, p.y - drag.from.y);
    setDrag(null);
  }

  // ------------------------------------------------------------ teclado

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (pickerOpen || newRoomOpen || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) world.redo();
        else world.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        world.redo();
      } else if (mod && e.key.toLowerCase() === 'c' && box) {
        e.preventDefault();
        copySelection();
      } else if (mod && e.key.toLowerCase() === 'v' && clipboard) {
        e.preventDefault();
        setPasting(true);
      } else if (!mod && (e.key === 'r' || e.key === 'R')) rotateSelected(e.shiftKey ? -1 : 1);
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (box) eraseSelection();
        else if (selected.length) removeObjects(selected);
      } else if (e.key === 'Escape') {
        setPasting(false);
        setPendingPortal(null);
        setSelected([]);
        setBox(null);
        setDrag(null);
      } else if (!mod) {
        const shortcuts: Record<string, Tool> = { v: 'select', b: 'stamp', e: 'erase', h: 'hand', m: 'box' };
        const tl = shortcuts[e.key.toLowerCase()];
        if (tl) setTool(tl);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------ espelha o estado no motor

  useEffect(() => {
    if (!engine) return;
    engine.onEditPointer = onPointer;
    engine.onHoverTile = setHover;
  });

  useEffect(() => {
    if (!engine) return;
    const h = hover && hover.x >= 0 && hover.y >= 0 && hover.x < room.width && hover.y < room.height ? hover : null;
    let ghost: MapmakerView['ghost'] = null;
    let ghostGroup: MapmakerView['ghostGroup'] = null;
    let rect: Rect | null = box;
    let hoverObject: MapmakerView['hoverObject'] = null;
    let brushR: Rect | null = null;

    if (pasting && clipboard && h) ghostGroup = { at: h, rect: clipboard.rect, objects: clipboard.objects };
    else if (mode === 'objects' && tool === 'stamp' && stamp && h) ghost = { ...stamp, ...h };
    if (h && mode === 'objects' && (tool === 'select' || tool === 'erase') && !drag) {
      const o = objectAt(room, h.x, h.y);
      if (o) hoverObject = { id: o.id, tone: tool === 'erase' ? 'erase' : 'select' };
    }
    if (h && (mode === 'effects' || mode === 'floor') && (tool === 'stamp' || tool === 'erase')) brushR = brushRect(h, effect === 'portal' && mode === 'effects' ? 1 : brush);
    if (drag?.kind === 'box') rect = rectFrom(drag.from, drag.to);
    if (drag?.kind === 'move-group' && box) {
      const dx = drag.to.x - drag.from.x;
      const dy = drag.to.y - drag.from.y;
      rect = { ...box, x: box.x + dx, y: box.y + dy };
      ghostGroup = { at: { x: rect.x, y: rect.y }, rect: box, objects: boxObjects(box).map(o => ({ ...o, x: o.x - box.x, y: o.y - box.y })) };
    }
    if (drag?.kind === 'move-obj' && selectedObjs[0]) {
      const o = selectedObjs[0];
      const f = footprint(o);
      ghostGroup = { at: { x: o.x + drag.to.x - drag.from.x, y: o.y + drag.to.y - drag.from.y }, rect: { x: 0, y: 0, w: f.w, h: f.h }, objects: [{ ...o, x: 0, y: 0 }] };
    }

    engine.setMapmaker({
      room: room.id,
      effects: mode === 'effects' ? EFFECTS.map(e => e.id) : [],
      activeEffect: mode === 'effects' ? effect : null,
      ghost,
      ghostGroup,
      rect,
      selected,
      hoverObject,
      brush: brushR,
      pan: tool === 'hand',
    });
  });

  // Desliga o Mapmaker no motor ao fechar.
  useEffect(() => () => engine?.setMapmaker(null), [engine]);

  const objectList = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    return room.objects.filter(o => !q || CATALOG[o.type]?.name.toLowerCase().includes(q)).slice(-400).reverse();
  }, [room, listFilter, world.mapVersion]);

  const inspectInfo = inspect && room ? {
    flags: FLAG_EFFECTS.filter(f => room[f][tileKey(inspect.x, inspect.y)]),
    area: room.privateAreas[tileKey(inspect.x, inspect.y)] ?? null,
    portal: room.portals[tileKey(inspect.x, inspect.y)] ?? null,
  } : null;

  async function uploadLayer(layer: 'background' | 'foreground', file: File | undefined) {
    if (!file) return;
    try {
      const url = await uploadImage(file);
      edit({ kind: 'room-update', room: room.id, patch: { [layer]: url } });
      onToast(layer === 'background' ? 'Fundo atualizado' : 'Primeiro plano atualizado');
    } catch (err) {
      onToast((err as Error).message);
    }
  }

  const toolHint: Record<Mode, Partial<Record<Tool, string>>> = {
    objects: {
      select: 'Clique num objeto para ver detalhes; arraste para mover.',
      stamp: 'Clique para colocar o objeto. R gira.',
      erase: 'Clique num objeto para apagar (fica vermelho ao passar o mouse).',
      box: 'Arraste para selecionar um grupo; arraste a seleção para mover.',
      hand: 'Arraste para mover a vista.',
    },
    effects: {
      select: 'Clique num tile para ver os efeitos dele.',
      stamp: effect === 'portal' ? 'Clique (ou arraste) na entrada do portal; depois clique onde a pessoa aparece.' : 'Clique ou arraste para pintar o efeito.',
      erase: 'Apaga só o efeito selecionado no painel.',
      box: 'Arraste para selecionar; copie, mova ou apague efeitos em grupo.',
      hand: 'Arraste para mover a vista.',
    },
    floor: { stamp: 'Clique ou arraste para pintar o piso.', box: 'Arraste um retângulo para preencher com o piso.', hand: 'Arraste para mover a vista.' },
  };

  return (
    <>
      <div className="mm-top">
        <div className="mm-menu-wrap">
          <button className="icon" onClick={() => setMenuOpen(o => !o)} title="Menu">
            <Menu size={18} />
          </button>
          {menuOpen && (
            <div className="mm-menu" onMouseLeave={() => setMenuOpen(false)}>
              <span className="mm-menu-title">Fundo e primeiro plano · {room.name}</span>
              <label className="mm-menu-item">
                <ImageUp size={14} /> Enviar fundo
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => uploadLayer('background', e.target.files?.[0])} />
              </label>
              <label className="mm-menu-item">
                <ImageUp size={14} /> Enviar primeiro plano
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={e => uploadLayer('foreground', e.target.files?.[0])} />
              </label>
              {room.background && (
                <>
                  <a className="mm-menu-item" href={room.background} target="_blank" rel="noreferrer">
                    Baixar fundo
                  </a>
                  <button className="mm-menu-item" onClick={() => edit({ kind: 'room-update', room: room.id, patch: { background: null } })}>
                    Remover fundo
                  </button>
                </>
              )}
              {room.foreground && (
                <>
                  <a className="mm-menu-item" href={room.foreground} target="_blank" rel="noreferrer">
                    Baixar primeiro plano
                  </a>
                  <button className="mm-menu-item" onClick={() => edit({ kind: 'room-update', room: room.id, patch: { foreground: null } })}>
                    Remover primeiro plano
                  </button>
                </>
              )}
              <hr />
              <button
                className="mm-menu-item danger"
                onClick={() => {
                  if (confirm('Restaurar o mapa padrão? Todas as salas, edições e mesas ocupadas deste espaço serão perdidas.')) world.resetMap();
                }}
              >
                <RotateCcw size={14} /> Restaurar mapa padrão
              </button>
              <button className="mm-menu-item" onClick={onClose}>
                <Home size={14} /> Voltar ao espaço
              </button>
            </div>
          )}
        </div>
        <div className="mm-modes">
          {(
            [
              ['objects', 'Objetos'],
              ['effects', 'Efeitos de tile'],
              ['floor', 'Piso'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              className={mode === m ? 'active' : ''}
              onClick={() => {
                setMode(m);
                setSelected([]);
                setBox(null);
                setPasting(false);
                setPendingPortal(null);
                if (m === 'floor' && (tool === 'select' || tool === 'erase')) setTool('stamp');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="mm-saved">✓ Salvo automaticamente</span>
        <span className="mm-room-name">{room.name}</span>
        <button className="leave" onClick={onClose}>
          Voltar ao espaço
        </button>
      </div>

      <div className="mm-left">
        <ToolButton active={tool === 'select'} title="Selecionar (V)" onClick={() => setTool('select')} disabled={mode === 'floor'}>
          <MousePointer2 size={18} />
        </ToolButton>
        <ToolButton active={tool === 'stamp'} title="Carimbo (B)" onClick={() => setTool('stamp')}>
          <Stamp size={18} />
        </ToolButton>
        <ToolButton active={tool === 'erase'} title="Borracha (E)" onClick={() => setTool('erase')} disabled={mode === 'floor'}>
          <Eraser size={18} />
        </ToolButton>
        <ToolButton active={tool === 'hand'} title="Mão — mover a vista (H, ou espaço + arrastar)" onClick={() => setTool('hand')}>
          <Hand size={18} />
        </ToolButton>
        <ToolButton active={tool === 'box'} title="Seleção retangular (M)" onClick={() => setTool('box')}>
          <BoxSelect size={18} />
        </ToolButton>
        <hr />
        <ToolButton title="Aproximar" onClick={() => engine?.setZoom(engine.zoom * 1.2)}>
          <ZoomIn size={18} />
        </ToolButton>
        <ToolButton title="Afastar" onClick={() => engine?.setZoom(engine.zoom / 1.2)}>
          <ZoomOut size={18} />
        </ToolButton>
        <ToolButton title="Desfazer (Ctrl+Z)" onClick={() => world.undo()} disabled={!world.canUndo}>
          <Undo2 size={18} />
        </ToolButton>
        <ToolButton title="Refazer (Ctrl+Shift+Z)" onClick={() => world.redo()} disabled={!world.canRedo}>
          <Redo2 size={18} />
        </ToolButton>
      </div>

      <div className="mm-coords">
        {hover ? `X:${hover.x} Y:${hover.y}` : `${room.width}×${room.height}`}
        <span>{toolHint[mode][tool] ?? ''}</span>
      </div>
      {pasting && (
        <div className="mm-banner">
          Clique para colar a seleção · <button onClick={() => setPasting(false)}>parar (Esc)</button>
        </div>
      )}
      {pendingPortal && (
        <div className="mm-banner">
          {pendingPortal.marking ? 'Marcando a entrada do portal…' : `Clique onde a pessoa vai aparecer em "${room.name}"`}{' '}
          · <button onClick={() => setPendingPortal(null)}>cancelar (Esc)</button>
        </div>
      )}

      <aside className="mm-right">
        <div className="mm-panel">
          {mode === 'objects' && (
            <>
              <button className="primary" onClick={() => setPickerOpen(true)}>
                Mais objetos
              </button>
              {recent.length > 0 && (
                <>
                  <h3>Recentes</h3>
                  <div className="mm-recent">
                    {recent.map(t => (
                      <button
                        key={t}
                        className={stamp?.type === t ? 'active' : ''}
                        title={CATALOG[t].name}
                        onClick={() => {
                          setStamp({ type: t, color: 0, rot: CATALOG[t].rotations?.[0] ?? 0 });
                          setTool('stamp');
                        }}
                      >
                        <ObjectIcon type={t} size={40} />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {tool === 'stamp' && stamp && (
                <>
                  <h3>Carimbo</h3>
                  <div className="mm-stamp">
                    <ObjectIcon type={stamp.type} color={stamp.color} rot={stamp.rot} size={64} />
                    <div>
                      <strong>{CATALOG[stamp.type]?.name}</strong>
                      <div className="swatches">
                        {CATALOG[stamp.type]?.colors.map((c, i) => (
                          <button key={c} className={`swatch ${stamp.color === i ? 'selected' : ''}`} style={{ background: c }} onClick={() => setStamp({ ...stamp, color: i })} />
                        ))}
                      </div>
                      {(CATALOG[stamp.type]?.rotations?.length ?? 0) > 1 && (
                        <div className="tool-row">
                          <button className="chip" onClick={() => setStamp(rotateStamp(stamp, -1))} title="Shift+R">
                            <RotateCcw size={14} />
                          </button>
                          <button className="chip" onClick={() => setStamp(rotateStamp(stamp, 1))} title="R">
                            <RotateCw size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {CATALOG[stamp.type]?.blocks && (
                    <label className="check">
                      <input type="checkbox" checked={autoBlock} onChange={e => setAutoBlock(e.target.checked)} /> Pintar Bloqueio embaixo
                    </label>
                  )}
                </>
              )}

              {tool === 'select' && selectedObjs.length === 1 && (
                <ObjectDetails
                  obj={selectedObjs[0]}
                  onUpdate={patch => edit({ kind: 'obj-update', room: room.id, id: selectedObjs[0].id, patch })}
                  onRemove={() => removeObjects([selectedObjs[0].id])}
                />
              )}
              {tool === 'select' && !selectedObjs.length && <p className="hint">Clique num objeto do mapa para editar cor, rotação e interação.</p>}
            </>
          )}

          {mode === 'effects' && (
            <>
              <div className="mm-effects">
                {EFFECTS.map(e => (
                  <button
                    key={e.id}
                    className={effect === e.id ? 'active' : ''}
                    onClick={() => {
                      setEffect(e.id);
                      setPendingPortal(null);
                      if (tool === 'hand' || tool === 'box') setTool('stamp');
                    }}
                  >
                    <i style={{ background: e.color }}>{e.icon}</i>
                    <span>
                      <strong>{e.name}</strong>
                      <small>{e.description}</small>
                    </span>
                  </button>
                ))}
              </div>
              {effect === 'private' && (
                <div className="editor-box">
                  <label>
                    Nome da área
                    <input list="area-names" value={privateName} onChange={e => setPrivateName(e.target.value)} maxLength={40} placeholder="Selecione ou digite um nome novo" />
                    <datalist id="area-names">
                      {areaNames(room).map(n => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </label>
                  {room.areaMeta[privateName.trim()] ? (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={room.areaMeta[privateName.trim()].desk}
                        onChange={e => edit({ kind: 'area-meta', room: room.id, name: privateName.trim(), meta: { ...room.areaMeta[privateName.trim()], desk: e.target.checked } })}
                      />{' '}
                      Área de mesa (pode ser ocupada)
                    </label>
                  ) : (
                    <label className="check">
                      <input type="checkbox" checked={privateDesk} onChange={e => setPrivateDesk(e.target.checked)} /> Área de mesa (pode ser ocupada)
                    </label>
                  )}
                  <p className="hint">Tiles com o mesmo nome formam uma só área, mesmo separados. Mesas de 1×2 a 3×3 funcionam bem.</p>
                </div>
              )}
              {effect === 'portal' && (
                <div className="editor-box">
                  <label>
                    Leva para a sala
                    <select value={portalTarget} onChange={e => setPortalTarget(e.target.value)}>
                      {map.order.map(id => (
                        <option key={id} value={id}>
                          {map.rooms[id].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={twoWay} onChange={e => setTwoWay(e.target.checked)} /> Mão dupla (cria a volta no destino)
                  </label>
                </div>
              )}
              {(effect === 'impassable' || effect === 'spawn' || effect === 'private' || effect === 'spotlight') && (
                <BrushPicker value={brush} onChange={setBrush} />
              )}
              {tool === 'select' && inspectInfo && inspect && (
                <div className="editor-box">
                  <strong>
                    Tile {inspect.x},{inspect.y}
                  </strong>
                  {!inspectInfo.flags.length && !inspectInfo.area && !inspectInfo.portal && <p className="hint">Sem efeitos.</p>}
                  {inspectInfo.flags.map(f => (
                    <span key={f}>• {EFFECTS.find(e => e.id === f)?.name}</span>
                  ))}
                  {inspectInfo.area && (
                    <>
                      <span>• Área privada: {inspectInfo.area}</span>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!!room.areaMeta[inspectInfo.area]?.desk}
                          onChange={e =>
                            edit({ kind: 'area-meta', room: room.id, name: inspectInfo.area!, meta: { ...room.areaMeta[inspectInfo.area!], desk: e.target.checked } })
                          }
                        />{' '}
                        Área de mesa
                      </label>
                      <AreaAccess world={world} room={room} name={inspectInfo.area} />
                      <button
                        className="chip"
                        onClick={() =>
                          edit({
                            kind: 'private',
                            room: room.id,
                            tiles: Object.entries(room.privateAreas)
                              .filter(([, n]) => n === inspectInfo.area)
                              .map(([k]) => ({ ...parseKey(k), value: null })),
                          })
                        }
                      >
                        <Trash2 size={13} /> Apagar área inteira
                      </button>
                    </>
                  )}
                  {inspectInfo.portal && (
                    <span>
                      • Portal → {map.rooms[inspectInfo.portal.room]?.name} ({inspectInfo.portal.x},{inspectInfo.portal.y})
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'floor' && (
            <>
              <h3>Piso</h3>
              <div className="mm-floors">
                {FLOORS.map(f => (
                  <button key={f} className={floor === f ? 'active' : ''} title={FLOOR_NAMES[f]} onClick={() => setFloor(f)}>
                    <FloorIcon floor={f} />
                    <span>{FLOOR_NAMES[f]}</span>
                  </button>
                ))}
              </div>
              <BrushPicker value={brush} onChange={setBrush} />
              <p className="hint">Água não bloqueia sozinha — pinte Bloqueio por cima (como no Gather).</p>
            </>
          )}

          {tool === 'box' && mode !== 'floor' && (
            <div className="editor-box">
              <span>Selecionar:</span>
              <div className="tool-row">
                <label className="check">
                  <input type="checkbox" checked={boxFilter.objects} onChange={e => setBoxFilter({ ...boxFilter, objects: e.target.checked })} /> Objetos
                </label>
                <label className="check">
                  <input type="checkbox" checked={boxFilter.effects} onChange={e => setBoxFilter({ ...boxFilter, effects: e.target.checked })} /> Efeitos
                </label>
              </div>
              {box ? (
                <div className="tool-row">
                  <button className="chip" onClick={copySelection}>
                    Copiar seleção
                  </button>
                  <button className="chip" onClick={eraseSelection}>
                    <Trash2 size={13} /> Apagar seleção
                  </button>
                </div>
              ) : (
                <p className="hint">Arraste no mapa para selecionar.</p>
              )}
            </div>
          )}
        </div>

        <div className="mm-bottom">
          <div className="tabs">
            <button className={bottomTab === 'rooms' ? 'active' : ''} onClick={() => setBottomTab('rooms')}>
              Salas
            </button>
            <button className={bottomTab === 'objects' ? 'active' : ''} onClick={() => setBottomTab('objects')}>
              Lista de objetos
            </button>
          </div>
          {bottomTab === 'rooms' ? (
            <>
              <ul className="mm-rooms">
                {map.order.map(id => (
                  <li key={id} className={id === room.id ? 'active' : ''}>
                    {renaming?.id === id ? (
                      <input
                        value={renaming.name}
                        autoFocus
                        onChange={e => setRenaming({ id, name: e.target.value })}
                        onBlur={() => {
                          if (renaming.name.trim()) edit({ kind: 'room-update', room: id, patch: { name: renaming.name } });
                          setRenaming(null);
                        }}
                        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    ) : (
                      <button className="mm-room" onClick={() => switchRoom(id)}>
                        {id === map.entry && <Home size={13} />} {map.rooms[id].name}
                      </button>
                    )}
                    <button className="icon" title="Renomear" onClick={() => setRenaming({ id, name: map.rooms[id].name })}>
                      <Pencil size={13} />
                    </button>
                    {id !== map.entry && (
                      <button
                        className="icon"
                        title="Apagar sala"
                        onClick={() => {
                          if (confirm(`Apagar a sala "${map.rooms[id].name}"? Quem estiver nela volta para a entrada.`)) {
                            edit({ kind: 'room-remove', id });
                            if (id === room.id) switchRoom(map.entry);
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <button className="chip mm-new-room" onClick={() => setNewRoomOpen(true)}>
                <Plus size={14} /> Criar sala
              </button>
            </>
          ) : (
            <>
              <input className="mm-filter" value={listFilter} onChange={e => setListFilter(e.target.value)} placeholder="Filtrar objetos" />
              <ul className="mm-objects">
                {objectList.map(o => (
                  <li key={o.id}>
                    <button
                      className={selected.includes(o.id) ? 'active' : ''}
                      onClick={() => {
                        setMode('objects');
                        setTool('select');
                        setSelected([o.id]);
                        engine?.centerOn(o.x, o.y);
                      }}
                    >
                      {o.interaction ? '✦ ' : ''}
                      {CATALOG[o.type]?.name ?? o.type} <small>{o.x},{o.y}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>

      {pickerOpen && (
        <ObjectPicker
          recent={recent}
          initial={stamp}
          onClose={() => setPickerOpen(false)}
          onPick={item => {
            setStamp(item);
            pushRecent(item.type);
            setMode('objects');
            setTool('stamp');
            setPickerOpen(false);
          }}
        />
      )}
      {newRoomOpen && (
        <NewRoomDialog
          world={world}
          onClose={() => setNewRoomOpen(false)}
          onCreate={r => {
            if (edit({ kind: 'room-add', room: r })) {
              setNewRoomOpen(false);
              switchRoom(r.id);
              onToast(`Sala "${r.name}" criada — use um Portal para ligá-la`);
            } else onToast('Não foi possível criar a sala (limite de salas?)');
          }}
        />
      )}
    </>
  );
}

/** Trancar uma área privada e escolher quem pode entrar (e editar o que tem dentro). */
function AreaAccess({ world, room, name }: { world: World; room: Room; name: string }) {
  const meta = room.areaMeta[name] ?? { desk: false };
  const canEdit = isAllowed(meta, world.who);
  const [addName, setAddName] = useState('');
  const allowed = meta.locked ? meta.allowed ?? [] : [];
  const online = [...world.players.values()].filter(p => !allowed.some(a => a.tag === p.tag));

  function save(next: typeof meta) {
    world.editMap({ kind: 'area-meta', room: room.id, name, meta: next });
  }

  return (
    <div className="access">
      <label className="check">
        <input
          type="checkbox"
          checked={!!meta.locked}
          disabled={!canEdit}
          onChange={e =>
            save(e.target.checked ? { ...meta, locked: true, allowed: [{ name: world.self.name, tag: world.ownerTag }] } : { desk: meta.desk })
          }
        />{' '}
        Trancar área (só a lista entra)
      </label>
      {meta.locked && (
        <>
          <ul>
            {allowed.map((a, i) => (
              <li key={`${a.name}-${i}`}>
                <span>
                  {a.name}
                  {a.tag === world.ownerTag && <em> (você)</em>}
                  <small>{a.tag ? 'vinculado ao navegador' : 'reservado pelo nome — vincula na 1ª entrada'}</small>
                </span>
                {canEdit && (
                  <button className="icon" title="Tirar o acesso" onClick={() => save({ ...meta, allowed: allowed.filter((_, j) => j !== i) })}>
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <>
              {online.length > 0 && (
                <select
                  value=""
                  onChange={e => {
                    const p = world.players.get(e.target.value);
                    if (p) save({ ...meta, allowed: [...allowed, { name: p.name, tag: p.tag }] });
                  }}
                >
                  <option value="">+ Dar acesso a quem está online…</option>
                  {online.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="tool-row">
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Reservar por nome" maxLength={24} />
                <button
                  className="chip"
                  disabled={!addName.trim()}
                  onClick={() => {
                    save({ ...meta, allowed: [...allowed, { name: addName.trim(), tag: null }] });
                    setAddName('');
                  }}
                >
                  Adicionar
                </button>
              </div>
            </>
          ) : (
            <p className="hint">Só quem está na lista pode mudar o acesso.</p>
          )}
        </>
      )}
    </div>
  );
}

function BrushPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="tool-row">
      <span className="hint">Pincel:</span>
      {[1, 2, 3, 5].map(n => (
        <button key={n} className={`chip ${value === n ? 'selected' : ''}`} onClick={() => onChange(n)}>
          {n}×{n}
        </button>
      ))}
    </div>
  );
}

function ObjectDetails({
  obj,
  onUpdate,
  onRemove,
}: {
  obj: PlacedObject;
  onUpdate: (patch: Extract<MapEdit, { kind: 'obj-update' }>['patch']) => void;
  onRemove: () => void;
}) {
  const def = CATALOG[obj.type];
  if (!def) return null;
  return (
    <>
      <h3>Detalhes do objeto</h3>
      <div className="mm-stamp">
        <ObjectIcon type={obj.type} color={obj.color} rot={obj.rot} size={64} />
        <div>
          <strong>{def.name}</strong>
          <span className="hint">
            {' '}
            X:{obj.x} Y:{obj.y}
          </span>
          <div className="swatches">
            {def.colors.map((c, i) => (
              <button key={c} className={`swatch ${obj.color === i ? 'selected' : ''}`} style={{ background: c }} onClick={() => onUpdate({ color: i })} />
            ))}
          </div>
          {(def.rotations?.length ?? 0) > 1 && (
            <div className="tool-row">
              <button className="chip" onClick={() => onUpdate({ rot: rotateStamp(obj, -1).rot })} title="Shift+R">
                <RotateCcw size={14} />
              </button>
              <button className="chip" onClick={() => onUpdate({ rot: rotateStamp(obj, 1).rot })} title="R">
                <RotateCw size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      {def.label !== undefined && (
        <label className="field">
          Texto da placa
          <input
            key={obj.id}
            defaultValue={obj.label ?? ''}
            maxLength={24}
            onBlur={e => e.target.value !== obj.label && onUpdate({ label: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
      )}
      <InteractionForm obj={obj} onSave={value => onUpdate({ interaction: value })} />
      <button className="reset" onClick={onRemove}>
        <Trash2 size={14} /> Apagar objeto (Delete)
      </button>
    </>
  );
}
