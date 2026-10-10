import { Eraser, MapPinned, MousePointerClick, RotateCcw, SquareDashed, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FLOORS,
  OBJECTS,
  tileKey,
  type Floor,
  type Interaction,
  type Obj,
  type Rect,
} from '../../../shared/map';
import type { EditPhase, Engine } from '../game/engine';
import { drawFloor, drawObject } from '../game/mapRenderer';
import type { Point } from '../game/path';
import type { World } from '../world';

type Tool =
  | { kind: 'floor'; value: Floor }
  | { kind: 'object'; value: Obj }
  | { kind: 'erase' }
  | { kind: 'area' }
  | { kind: 'spawn' }
  | { kind: 'interact' };

const FLOOR_NAMES: Record<Floor, string> = {
  grass: 'Grama',
  wood: 'Madeira',
  carpet: 'Carpete azul',
  carpet2: 'Carpete vinho',
  tile: 'Piso frio',
  path: 'Caminho',
  water: 'Água',
  rug: 'Tapete',
};

const OBJECT_NAMES: Record<Obj, string> = {
  wall: 'Parede',
  desk: 'Mesa de trabalho',
  chair: 'Cadeira',
  plant: 'Planta',
  tree: 'Árvore',
  sofa: 'Sofá',
  table: 'Mesa',
  counter: 'Balcão',
  whiteboard: 'Quadro branco',
  bookshelf: 'Estante',
  tv: 'TV',
  board: 'Mural',
};

function rectFrom(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

function excalidrawRoom() {
  const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const hex = [...bytes(10)].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = btoa(String.fromCharCode(...bytes(16))).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 22);
  return `https://excalidraw.com/#room=${hex},${key}`;
}

function TileIcon({ floor, object }: { floor: Floor; object?: Obj }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 30 * dpr;
    c.height = 30 * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform((30 / 32) * dpr, 0, 0, (30 / 32) * dpr, 0, 0);
    drawFloor(ctx, floor, 0, 0);
    if (object) drawObject(ctx, null, object, 0, 0);
  }, [floor, object]);
  return <canvas ref={ref} style={{ width: 30, height: 30, borderRadius: 6 }} />;
}

function ToolButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`tool ${active ? 'active' : ''}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function MapEditor({ world, engine, onClose }: { world: World; engine: Engine | null; onClose: () => void }) {
  const map = world.map;
  const [tool, setTool] = useState<Tool>({ kind: 'floor', value: 'wood' });
  const [pendingArea, setPendingArea] = useState<Rect | null>(null);
  const [areaName, setAreaName] = useState('');
  const [selected, setSelected] = useState<Point | null>(null);
  const [form, setForm] = useState<Interaction>({ kind: 'embed', title: '', url: '' });
  const dragStart = useRef<Point | null>(null);
  const lastPaint = useRef<Point | null>(null);

  const isTool = (t: Tool) => JSON.stringify(t) === JSON.stringify(tool);

  // Liga o modo de edição no motor e limpa ao sair.
  useEffect(() => {
    if (!engine) return;
    engine.editMode = true;
    return () => {
      engine.editMode = false;
      engine.onEditPointer = undefined;
      engine.editOverlay = { rect: null, selected: null };
    };
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    engine.editOverlay = { rect: pendingArea, selected };
  }, [engine, pendingArea, selected]);

  // Tiles contíguos do mesmo objeto na linha (ex.: quadro de 2 tiles) recebem a mesma interação.
  function objectTiles(p: Point) {
    const obj = map.objects[p.y]?.[p.x];
    let x0 = p.x;
    let x1 = p.x;
    while (map.objects[p.y][x0 - 1] === obj) x0--;
    while (map.objects[p.y][x1 + 1] === obj) x1++;
    return Array.from({ length: x1 - x0 + 1 }, (_, i) => tileKey(x0 + i, p.y));
  }

  function paint(p: Point) {
    if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) return;
    if (tool.kind === 'floor') {
      if (map.floor[p.y][p.x] !== tool.value) world.editMap({ kind: 'tiles', tiles: [{ ...p, floor: tool.value }] });
    } else if (tool.kind === 'object') {
      if (map.objects[p.y][p.x] !== tool.value) world.editMap({ kind: 'tiles', tiles: [{ ...p, object: tool.value }] });
    } else if (tool.kind === 'erase') {
      if (map.objects[p.y][p.x]) world.editMap({ kind: 'tiles', tiles: [{ ...p, object: null }] });
    }
  }

  function onPointer(p: Point, phase: EditPhase) {
    if (tool.kind === 'floor' || tool.kind === 'object' || tool.kind === 'erase') {
      // Preenche a linha entre o último ponto e o atual, para o arraste rápido não deixar buracos.
      const from = phase === 'move' && lastPaint.current ? lastPaint.current : p;
      const steps = Math.max(Math.abs(p.x - from.x), Math.abs(p.y - from.y));
      for (let i = 1; i <= steps; i++)
        paint({ x: Math.round(from.x + ((p.x - from.x) * i) / steps), y: Math.round(from.y + ((p.y - from.y) * i) / steps) });
      if (!steps) paint(p);
      lastPaint.current = phase === 'up' ? null : p;
    } else if (tool.kind === 'area' || tool.kind === 'spawn') {
      if (phase === 'down') dragStart.current = p;
      if (!dragStart.current) return;
      const rect = rectFrom(dragStart.current, p);
      setPendingArea(rect);
      if (phase === 'up') {
        dragStart.current = null;
        if (tool.kind === 'spawn') {
          world.editMap({ kind: 'spawn', rect });
          setPendingArea(null);
        }
      }
    } else if (tool.kind === 'interact' && phase === 'down') {
      if (!map.objects[p.y]?.[p.x]) {
        setSelected(null);
        return;
      }
      setSelected(p);
      const existing = map.interactions[tileKey(p.x, p.y)];
      setForm(existing ?? { kind: 'embed', title: OBJECT_NAMES[map.objects[p.y][p.x]!], url: '' });
    }
  }

  // O motor chama sempre a versão mais recente do handler (com o tool atual).
  useEffect(() => {
    if (engine) engine.onEditPointer = onPointer;
  });

  function choose(t: Tool) {
    setTool(t);
    setPendingArea(null);
    setSelected(null);
    dragStart.current = null;
  }

  function saveArea() {
    if (!pendingArea || !areaName.trim()) return;
    world.editMap({ kind: 'area-add', area: { id: `area-${Date.now().toString(36)}`, name: areaName.trim(), ...pendingArea } });
    setPendingArea(null);
    setAreaName('');
  }

  function saveInteraction(value: Interaction | null) {
    if (!selected) return;
    for (const key of objectTiles(selected)) world.editMap({ kind: 'interaction', key, value });
    if (!value) setSelected(null);
  }

  const selectedObj = selected ? map.objects[selected.y]?.[selected.x] : null;

  return (
    <aside className="panel editor">
      <header>
        <h2>Editar mapa</h2>
        <button className="icon" onClick={onClose} title="Sair da edição">
          <X size={18} />
        </button>
      </header>

      <div className="editor-body">
        <p className="hint">Clique e arraste no mapa para pintar. Você continua andando com o teclado.</p>

        <h3>Piso</h3>
        <div className="tools">
          {FLOORS.map(f => (
            <ToolButton key={f} title={FLOOR_NAMES[f]} active={isTool({ kind: 'floor', value: f })} onClick={() => choose({ kind: 'floor', value: f })}>
              <TileIcon floor={f} />
            </ToolButton>
          ))}
        </div>

        <h3>Objetos</h3>
        <div className="tools">
          {OBJECTS.map(o => (
            <ToolButton key={o} title={OBJECT_NAMES[o]} active={isTool({ kind: 'object', value: o })} onClick={() => choose({ kind: 'object', value: o })}>
              <TileIcon floor="wood" object={o} />
            </ToolButton>
          ))}
          <ToolButton title="Borracha (remove objetos)" active={isTool({ kind: 'erase' })} onClick={() => choose({ kind: 'erase' })}>
            <Eraser size={18} />
          </ToolButton>
        </div>
        <p className="hint">Dica: uma cadeira encostada numa mesa de trabalho vira uma mesa que pode ser ocupada.</p>

        <h3>Ferramentas</h3>
        <div className="tool-row">
          <button className={`chip ${tool.kind === 'area' ? 'selected' : ''}`} onClick={() => choose({ kind: 'area' })}>
            <SquareDashed size={14} /> Área privada
          </button>
          <button className={`chip ${tool.kind === 'spawn' ? 'selected' : ''}`} onClick={() => choose({ kind: 'spawn' })}>
            <MapPinned size={14} /> Entrada
          </button>
          <button className={`chip ${tool.kind === 'interact' ? 'selected' : ''}`} onClick={() => choose({ kind: 'interact' })}>
            <MousePointerClick size={14} /> Interação
          </button>
        </div>

        {tool.kind === 'area' && (
          <div className="editor-box">
            {pendingArea ? (
              <>
                <label>
                  Nome da área ({pendingArea.w}×{pendingArea.h})
                  <input value={areaName} onChange={e => setAreaName(e.target.value)} maxLength={40} placeholder="Ex.: Sala do time" autoFocus />
                </label>
                <div className="tool-row">
                  <button className="primary small" disabled={!areaName.trim()} onClick={saveArea}>
                    Criar área
                  </button>
                  <button className="chip" onClick={() => setPendingArea(null)}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <p className="hint">Arraste no mapa para desenhar a área. Quem está dentro só conversa entre si.</p>
            )}
            <ul className="area-list">
              {map.areas.map(a => (
                <li key={a.id}>
                  <span>🔒 {a.name}</span>
                  <button className="icon" title="Remover área" onClick={() => world.editMap({ kind: 'area-remove', id: a.id })}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tool.kind === 'spawn' && (
          <div className="editor-box">
            <p className="hint">Arraste no mapa para definir onde as pessoas aparecem ao entrar.</p>
          </div>
        )}

        {tool.kind === 'interact' && (
          <div className="editor-box">
            {!selected || !selectedObj ? (
              <p className="hint">Clique num objeto do mapa (TV, quadro, mural…) para configurar o que acontece ao apertar X perto dele.</p>
            ) : (
              <>
                <p className="hint">
                  Objeto: <strong>{OBJECT_NAMES[selectedObj]}</strong>
                </p>
                <label>
                  Tipo
                  <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as Interaction['kind'] })}>
                    <option value="embed">Site ou vídeo embutido</option>
                    <option value="note">Nota de texto</option>
                    <option value="link">Link externo</option>
                  </select>
                </label>
                <label>
                  Título
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} maxLength={60} />
                </label>
                {form.kind === 'note' ? (
                  <label>
                    Texto
                    <textarea rows={5} value={form.text ?? ''} onChange={e => setForm({ ...form, text: e.target.value })} maxLength={2000} />
                  </label>
                ) : (
                  <label>
                    Endereço (URL)
                    <input value={form.url ?? ''} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://" />
                  </label>
                )}
                {selectedObj === 'whiteboard' && form.kind !== 'note' && (
                  <button className="chip" onClick={() => setForm({ ...form, kind: 'embed', url: excalidrawRoom() })}>
                    Gerar novo quadro do Excalidraw
                  </button>
                )}
                <div className="tool-row">
                  <button className="primary small" onClick={() => saveInteraction(form)}>
                    Salvar
                  </button>
                  {map.interactions[tileKey(selected.x, selected.y)] && (
                    <button className="chip" onClick={() => saveInteraction(null)}>
                      Remover interação
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <button
          className="reset"
          onClick={() => {
            if (confirm('Restaurar o mapa padrão? Todas as edições e mesas ocupadas deste espaço serão perdidas.')) world.resetMap();
          }}
        >
          <RotateCcw size={14} /> Restaurar mapa padrão
        </button>
      </div>
    </aside>
  );
}
