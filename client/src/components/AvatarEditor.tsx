import { RotateCcw, RotateCw, Shuffle, X } from 'lucide-react';
import { useState } from 'react';
import { AVATAR_OPTIONS, AVATAR_STYLES, randomAvatar, type Avatar, type Dir } from '../../../shared/types';
import { AvatarPreview } from './AvatarPreview';

type StyleKey = keyof typeof AVATAR_STYLES;
type ColorKey = 'skin' | 'hair' | 'shirt' | 'pants' | 'shoes' | 'hatColor';

interface Section {
  label: string;
  style?: StyleKey;
  color?: ColorKey;
}

const TABS: { label: string; sections: Section[] }[] = [
  {
    label: 'Base',
    sections: [
      { label: 'Pele', color: 'skin' },
      { label: 'Cabelo', style: 'hairStyle', color: 'hair' },
      { label: 'Barba', style: 'facialHair', color: 'hair' },
    ],
  },
  {
    label: 'Roupas',
    sections: [
      { label: 'Parte de cima', style: 'top', color: 'shirt' },
      { label: 'Parte de baixo', style: 'bottom', color: 'pants' },
      { label: 'Sapatos', color: 'shoes' },
    ],
  },
  {
    label: 'Acessórios',
    sections: [
      { label: 'Chapéu', style: 'hat', color: 'hatColor' },
      { label: 'Óculos', style: 'glasses' },
    ],
  },
];

const DIRS: Dir[] = ['down', 'left', 'up', 'right'];

/** Editor de avatar no estilo do Gather: prévia, abas, cores e grade de estilos. */
export function AvatarEditor({
  name,
  initial,
  onSave,
  onClose,
}: {
  name: string;
  initial: Avatar;
  onSave: (avatar: Avatar) => void;
  onClose: () => void;
}) {
  const [avatar, setAvatar] = useState<Avatar>(initial);
  const [tab, setTab] = useState(0);
  const [section, setSection] = useState(0);
  const [dir, setDir] = useState(0);
  const current = TABS[tab].sections[section];
  const patch = (p: Partial<Avatar>) => setAvatar(a => ({ ...a, ...p }));

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="avatar-editor">
        <header>
          <span className="name-chip">{name || 'Você'}</span>
          <button className="icon" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="ae-preview">
          <button className="icon" onClick={() => setDir(d => (d + 3) % 4)} title="Girar">
            <RotateCcw size={16} />
          </button>
          <AvatarPreview avatar={avatar} size={150} dir={DIRS[dir]} />
          <button className="icon" onClick={() => setDir(d => (d + 1) % 4)} title="Girar">
            <RotateCw size={16} />
          </button>
        </div>

        <nav className="ae-tabs">
          {TABS.map((t, i) => (
            <button
              key={t.label}
              className={tab === i ? 'active' : ''}
              onClick={() => {
                setTab(i);
                setSection(0);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ae-chips">
          {TABS[tab].sections.map((s, i) => (
            <button key={s.label} className={`chip ${section === i ? 'selected' : ''}`} onClick={() => setSection(i)}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="ae-body">
          {current.color && (
            <div className="ae-colors">
              {AVATAR_OPTIONS[current.color].map(c => (
                <button
                  key={c}
                  className={`swatch ${avatar[current.color!] === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => patch({ [current.color!]: c } as Partial<Avatar>)}
                  aria-label={c}
                />
              ))}
            </div>
          )}
          {current.style && (
            <div className="ae-grid">
              {AVATAR_STYLES[current.style].map((label, i) => (
                <button
                  key={label}
                  className={avatar[current.style!] === i ? 'active' : ''}
                  onClick={() => patch({ [current.style!]: i } as Partial<Avatar>)}
                  title={label}
                >
                  <AvatarPreview avatar={{ ...avatar, [current.style!]: i }} size={62} />
                  <small>{label}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <footer>
          <button className="chip" onClick={() => setAvatar(randomAvatar())}>
            <Shuffle size={14} /> Aleatório
          </button>
          <span />
          <button className="chip" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" onClick={() => onSave(avatar)}>
            Concluir
          </button>
        </footer>
      </div>
    </div>
  );
}
