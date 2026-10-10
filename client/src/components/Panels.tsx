import { MapPin, MicOff, Send, VideoOff, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatScope } from '../../../shared/types';
import type { PeerManager } from '../rtc/peers';
import type { World } from '../world';
import { AvatarPreview } from './AvatarPreview';

function time(ts: number) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ChatPanel({ world, onClose }: { world: World; onClose: () => void }) {
  const [scope, setScope] = useState<ChatScope>('everyone');
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [world.chat.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    world.sendChat(t, scope);
    setText('');
  }

  return (
    <aside className="panel">
      <header>
        <h2>Chat</h2>
        <button className="icon" onClick={onClose} title="Fechar">
          <X size={18} />
        </button>
      </header>
      <div className="tabs">
        <button className={scope === 'everyone' ? 'active' : ''} onClick={() => setScope('everyone')}>
          Todos
        </button>
        <button className={scope === 'nearby' ? 'active' : ''} onClick={() => setScope('nearby')}>
          Por perto
        </button>
      </div>
      <div className="messages" ref={listRef}>
        {world.chat.length === 0 && <p className="empty">Nenhuma mensagem ainda. Diga oi! 👋</p>}
        {world.chat.map(m => (
          <div key={m.id} className={`msg ${m.from === world.selfId ? 'mine' : ''}`}>
            <div className="msg-head">
              <strong>{m.name}</strong>
              {m.scope === 'nearby' && <span className="badge">por perto</span>}
              <time>{time(m.ts)}</time>
            </div>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && (e.target as HTMLInputElement).blur()}
          placeholder={scope === 'everyone' ? 'Mensagem para todos' : 'Mensagem para quem está por perto'}
          maxLength={500}
        />
        <button className="icon" disabled={!text.trim()} title="Enviar">
          <Send size={18} />
        </button>
      </form>
    </aside>
  );
}

export function PeoplePanel({
  world,
  peers,
  onGoTo,
  onClose,
}: {
  world: World;
  peers: PeerManager;
  onGoTo: (x: number, y: number) => void;
  onClose: () => void;
}) {
  const list = [...world.players.values()].sort((a, b) =>
    a.id === world.selfId ? -1 : b.id === world.selfId ? 1 : a.name.localeCompare(b.name),
  );

  return (
    <aside className="panel">
      <header>
        <h2>Pessoas · {list.length}</h2>
        <button className="icon" onClick={onClose} title="Fechar">
          <X size={18} />
        </button>
      </header>
      <ul className="people">
        {list.map(p => (
          <li key={p.id}>
            <AvatarPreview avatar={p.avatar} size={32} />
            <div className="person">
              <span>
                {p.name}
                {p.id === world.selfId && <em> (você)</em>}
              </span>
              {peers.has(p.id) && <small className="talking">na sua conversa</small>}
            </div>
            {!p.audio && <MicOff size={14} className="dim" />}
            {!p.video && <VideoOff size={14} className="dim" />}
            {p.id !== world.selfId && (
              <button className="icon" title={`Ir até ${p.name}`} onClick={() => onGoTo(p.x, p.y)}>
                <MapPin size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
