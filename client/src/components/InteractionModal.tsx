import { ExternalLink, X } from 'lucide-react';
import { useEffect } from 'react';
import type { Interaction } from '../../../shared/map';

/** Links de vídeo do YouTube só funcionam em iframe no formato /embed/. */
function toEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtube.com') && u.pathname === '/watch' && u.searchParams.get('v'))
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`;
    if (u.hostname.endsWith('vimeo.com') && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`;
    if (u.hostname.endsWith('twitch.tv') && u.pathname.length > 1)
      return `https://player.twitch.tv/?channel=${u.pathname.slice(1)}&parent=${location.hostname}`;
  } catch {
    // mantém como veio
  }
  return url;
}

export function InteractionModal({ interaction, onClose }: { interaction: Interaction; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { kind, title, url, text } = interaction;

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${kind === 'embed' || kind === 'video' || kind === 'image' ? 'wide' : ''}`}>
        <header>
          <h2>{title}</h2>
          <div className="tool-row">
            {url && (
              <a className="icon" href={url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba">
                <ExternalLink size={18} />
              </a>
            )}
            <button className="icon" onClick={onClose} title="Fechar (Esc)">
              <X size={18} />
            </button>
          </div>
        </header>
        {(kind === 'embed' || kind === 'video' || kind === 'image') && !url && <p className="hint">Este objeto ainda não tem endereço — configure no Mapmaker.</p>}
        {kind === 'image' && url && <img className="modal-image" src={url} alt={title} />}
        {(kind === 'embed' || kind === 'video') && url && (
          <>
            <iframe
              src={toEmbedUrl(url)}
              title={title}
              allow="autoplay; clipboard-read; clipboard-write; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <p className="hint">Não carregou? Alguns sites bloqueiam incorporação — use o botão de abrir em nova aba.</p>
          </>
        )}
        {kind === 'note' && <p className="note-text">{text}</p>}
        {kind === 'link' && url && (
          <div className="link-box">
            <p className="hint">{url}</p>
            <a className="primary" href={url} target="_blank" rel="noopener noreferrer">
              Abrir link
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
