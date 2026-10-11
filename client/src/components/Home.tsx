import { KeyRound, LogOut, Plus, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { Avatar, SpaceSummary } from '../../../shared/types';
import { createSpace, joinByCode, listSpaces } from '../api';
import type { AuthUser } from '../auth';
import { AvatarEditor } from './AvatarEditor';
import { AvatarPreview } from './AvatarPreview';
import type { SpaceTarget } from './Lobby';

function when(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

/** Tela inicial: espaços visitados recentemente, entrar com código, criar espaço e perfil. */
export function Home({
  user,
  avatar,
  notice,
  onAvatarChange,
  onOpen,
  onLogout,
}: {
  user: AuthUser | null;
  avatar: Avatar;
  notice?: string | null;
  onAvatarChange: (avatar: Avatar) => void;
  onOpen: (target: SpaceTarget) => void;
  onLogout?: () => void;
}) {
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [code, setCode] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSpaces()
      .then(setSpaces)
      .catch(err => {
        setSpaces([]);
        setError((err as Error).message);
      });
  }, []);

  async function enterCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await joinByCode(code);
      onOpen({ id: s.id, name: s.name, code: s.code });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await createSpace(newName);
      onOpen({ id: s.id, name: s.name, code: s.code });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <header className="home-bar">
        <div className="brand">
          <span className="brand-dot" /> Praça
        </div>
        <button className="profile-btn" onClick={() => setEditing(true)} title="Editar avatar">
          <AvatarPreview avatar={avatar} size={34} />
          {user?.person ?? 'Perfil'}
        </button>
        <span className="spacer" />
        <form className="code-form" onSubmit={enterCode}>
          <KeyRound size={16} />
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Código do espaço" maxLength={12} />
          <button className="chip" disabled={!code.trim() || busy}>
            Entrar
          </button>
        </form>
        <button className="primary small" onClick={() => setCreating(c => !c)}>
          <Plus size={14} /> Criar espaço
        </button>
        {onLogout && (
          <button className="icon" onClick={onLogout} title="Sair da conta">
            <LogOut size={18} />
          </button>
        )}
      </header>

      {creating && (
        <form className="create-form" onSubmit={create}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do novo espaço" maxLength={40} autoFocus />
          <button className="primary small" disabled={!newName.trim() || busy}>
            Criar
          </button>
        </form>
      )}
      {error && <p className="hint warn home-error">{error}</p>}

      <h2 className="home-title">Visitados recentemente</h2>
      {spaces === null ? (
        <p className="hint">Carregando…</p>
      ) : spaces.length === 0 ? (
        <p className="hint">Nenhum espaço ainda. Entre com um código de convite ou crie o seu.</p>
      ) : (
        <div className="space-grid">
          {spaces.map(s => (
            <button key={s.id} className="space-card" onClick={() => onOpen({ id: s.id, name: s.name })}>
              <div className="space-thumb">
                <span>{s.name.slice(0, 1).toUpperCase()}</span>
                <i className={s.online ? 'on' : ''}>
                  <Users size={12} /> {s.online}
                </i>
              </div>
              <div className="space-info">
                <strong>{s.name}</strong>
                <small>
                  {when(s.lastVisited)} · código <code>{s.code}</code>
                </small>
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <AvatarEditor
          name={user?.person ?? 'Você'}
          initial={avatar}
          onClose={() => setEditing(false)}
          onSave={a => {
            onAvatarChange(a);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
