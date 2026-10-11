import { RotateCcw, RotateCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG, CATEGORIES, type Category } from '../../../shared/catalog';
import { drawFloor } from '../game/mapRenderer';
import { drawObject } from '../game/objects';

export interface StampItem {
  type: string;
  color: number;
  rot: number;
}

/** Miniatura de um objeto do catálogo (desenhado sobre piso de madeira). */
export function ObjectIcon({ type, color = 0, rot, art, size = 40 }: { type: string; color?: number; rot?: number; art?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = CATALOG[type];
  useEffect(() => {
    const c = ref.current;
    if (!c || !def) return;
    const dpr = window.devicePixelRatio || 1;
    const tiles = Math.max(def.w, def.h);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    const s = (size / (tiles * 32)) * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const ox = ((tiles - def.w) * 32) / 2;
    const oy = ((tiles - def.h) * 32) / 2;
    for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) drawFloor(ctx, 'wood', x, y);
    drawObject(ctx, { type, x: 0, y: 0, color, rot: rot ?? def.rotations?.[0] ?? 0, art }, ox, oy);
  }, [type, color, rot, art, size, def]);
  return <canvas ref={ref} style={{ width: size, height: size, borderRadius: 6, flex: 'none' }} />;
}

export function rotateStamp(item: StampItem, dir: 1 | -1): StampItem {
  const rots = CATALOG[item.type]?.rotations;
  if (!rots || rots.length < 2) return item;
  const i = rots.indexOf(item.rot);
  return { ...item, rot: rots[(i + dir + rots.length) % rots.length] };
}

export function ObjectPicker({
  recent,
  initial,
  onPick,
  onClose,
}: {
  recent: string[];
  initial: StampItem | null;
  onPick: (item: StampItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all' | 'recent'>('all');
  const [chosen, setChosen] = useState<StampItem | null>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      if ((e.key === 'r' || e.key === 'R') && chosen) setChosen(rotateStamp(chosen, e.shiftKey ? -1 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chosen, onClose]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = Object.entries(CATALOG);
    if (category === 'recent') list = recent.filter(t => CATALOG[t]).map(t => [t, CATALOG[t]] as const);
    else if (category !== 'all') list = list.filter(([, d]) => d.category === category);
    if (q) list = list.filter(([id, d]) => `${d.name} ${d.keywords ?? ''} ${id}`.toLowerCase().includes(q));
    return list.sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [query, category, recent]);

  const def = chosen ? CATALOG[chosen.type] : null;

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="picker">
        <nav className="picker-cats">
          <h2>Objetos</h2>
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
            Todos
          </button>
          <button className={category === 'recent' ? 'active' : ''} onClick={() => setCategory('recent')}>
            Usados recentemente
          </button>
          <hr />
          {CATEGORIES.map(c => (
            <button key={c.id} className={category === c.id ? 'active' : ''} onClick={() => setCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </nav>

        <section className="picker-main">
          <label className="picker-search">
            <Search size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar objetos" autoFocus />
          </label>
          <div className="picker-grid">
            {items.length === 0 && <p className="hint">Nenhum objeto encontrado.</p>}
            {items.map(([id, d]) => (
              <button
                key={id}
                className={`picker-card ${chosen?.type === id ? 'active' : ''}`}
                onClick={() => setChosen({ type: id, color: 0, rot: d.rotations?.[0] ?? 0 })}
                onDoubleClick={() => onPick({ type: id, color: 0, rot: d.rotations?.[0] ?? 0 })}
              >
                <ObjectIcon type={id} size={52} />
                <span>
                  <strong>{d.name}</strong>
                  {d.colors.length > 1 && (
                    <span className="dots">
                      {d.colors.map(c => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className="picker-details">
          <header>
            <h3>Detalhes do objeto</h3>
            <button className="icon" onClick={onClose} title="Fechar (Esc)">
              <X size={18} />
            </button>
          </header>
          {!chosen || !def ? (
            <p className="hint">Nenhum objeto selecionado.</p>
          ) : (
            <>
              <div className="picker-preview">
                <ObjectIcon type={chosen.type} color={chosen.color} rot={chosen.rot} size={120} />
              </div>
              <strong>{def.name}</strong>
              <span className="hint">
                {def.w}×{def.h} tiles{def.blocks ? ' · bloqueia passagem' : ''}
                {def.defaultInteraction ? ' · interativo' : ''}
              </span>
              {def.colors.length > 1 && (
                <div className="swatches">
                  {def.colors.map((c, i) => (
                    <button
                      key={c}
                      className={`swatch ${chosen.color === i ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setChosen({ ...chosen, color: i })}
                      aria-label={`Cor ${i + 1}`}
                    />
                  ))}
                </div>
              )}
              {def.rotations && def.rotations.length > 1 && (
                <div className="tool-row">
                  <button className="chip" onClick={() => setChosen(rotateStamp(chosen, -1))} title="Girar (Shift+R)">
                    <RotateCcw size={14} />
                  </button>
                  <button className="chip" onClick={() => setChosen(rotateStamp(chosen, 1))} title="Girar (R)">
                    <RotateCw size={14} />
                  </button>
                </div>
              )}
              <p className="hint">Interações (site, vídeo, imagem, link, nota) são configuradas depois de colocar, em Detalhes do objeto.</p>
              <button className="primary" onClick={() => onPick(chosen)}>
                Selecionar
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
