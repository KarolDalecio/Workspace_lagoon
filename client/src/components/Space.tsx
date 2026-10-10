import {
  Link2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Smile,
  Users,
  Video,
  VideoOff,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Area } from '../../../shared/map';
import { EMOTES } from '../../../shared/types';
import { Engine } from '../game/engine';
import type { LocalMedia } from '../rtc/media';
import { PeerManager } from '../rtc/peers';
import type { World } from '../world';
import { ChatPanel, PeoplePanel } from './Panels';
import { VideoStrip } from './VideoStrip';

export function Space({ world, media, onLeave }: { world: World; media: LocalMedia; onLeave: () => void }) {
  useSyncExternalStore(world.subscribe, world.getVersion);
  useSyncExternalStore(media.subscribe, media.getVersion);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [peers] = useState(() => new PeerManager(world.socket, world.selfId, media, world.notify));
  const [mediaEls] = useState(() => new Map<string, HTMLMediaElement>());
  const [area, setArea] = useState<Area | null>(null);
  const [panel, setPanel] = useState<'chat' | 'people' | null>(null);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [seenChat, setSeenChat] = useState(world.chat.length);
  const [toast, setToast] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => {
    media.onTrack = (kind, track) => peers.replaceTrack(kind, track);
    const engine = new Engine(canvasRef.current!, world, peers, mediaEls);
    engine.onAreaChange = setArea;
    engine.start();
    engineRef.current = engine;
    if (import.meta.env.DEV) Object.assign(window, { praca: { world, engine, peers } });
    const help = setTimeout(() => setShowHelp(false), 10000);
    return () => {
      clearTimeout(help);
      engine.stop();
      peers.dispose();
      media.onTrack = undefined;
    };
  }, [world, media, peers, mediaEls]);

  useEffect(() => {
    world.setMedia(media.audioOn, media.videoOn || media.screenOn);
  }, [world, media.audioOn, media.videoOn, media.screenOn]);

  useEffect(() => {
    if (panel === 'chat') setSeenChat(world.chat.length);
  }, [panel, world.chat.length]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const unread = panel === 'chat' ? 0 : world.chat.length - seenChat;
  const togglePanel = (p: 'chat' | 'people') => setPanel(cur => (cur === p ? null : p));

  async function copyInvite() {
    const url = `${location.origin}${location.pathname}?space=${encodeURIComponent(world.space)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Link de convite copiado');
    } catch {
      setToast(url);
    }
  }

  return (
    <div className="space">
      <div className="stage">
        <canvas ref={canvasRef} className="game" />
        <VideoStrip world={world} peers={peers} media={media} mediaEls={mediaEls} />

        {area && (
          <div className="area-banner">
            🔒 <strong>{area.name}</strong> — só quem está aqui dentro te ouve
          </div>
        )}
        {showHelp && (
          <div className="help" onClick={() => setShowHelp(false)}>
            Ande com <kbd>WASD</kbd>/<kbd>setas</kbd> ou clique no mapa · Chegue perto de alguém para conversar · <kbd>1</kbd>–
            <kbd>5</kbd> emotes
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
        {media.error && <div className="toast warn">{media.error}</div>}
        {world.disconnected && (
          <div className="overlay">
            <div>
              <h2>Conexão perdida</h2>
              <p>Não foi possível manter a conexão com o servidor.</p>
              <button className="primary" onClick={() => location.reload()}>
                Reconectar
              </button>
            </div>
          </div>
        )}
      </div>

      {panel === 'chat' && <ChatPanel world={world} onClose={() => setPanel(null)} />}
      {panel === 'people' && (
        <PeoplePanel
          world={world}
          peers={peers}
          onGoTo={(x, y) => engineRef.current?.goTo(x, y, true)}
          onClose={() => setPanel(null)}
        />
      )}

      <nav className="toolbar">
        <div className="tb-group">
          <span className="space-name" title="Espaço">
            {world.space}
          </span>
          <button className="icon" onClick={copyInvite} title="Copiar link de convite">
            <Link2 size={18} />
          </button>
        </div>

        <div className="tb-group">
          <button
            className={`round ${media.audioOn ? '' : 'off'}`}
            onClick={() => media.setAudio(!media.audioOn)}
            title={media.audioOn ? 'Desligar microfone' : 'Ligar microfone'}
          >
            {media.audioOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          <button
            className={`round ${media.videoOn ? '' : 'off'}`}
            onClick={() => media.setVideo(!media.videoOn)}
            title={media.videoOn ? 'Desligar câmera' : 'Ligar câmera'}
          >
            {media.videoOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>
          <button
            className={`round ${media.screenOn ? 'active' : ''}`}
            onClick={() => media.toggleScreen()}
            title={media.screenOn ? 'Parar compartilhamento' : 'Compartilhar tela'}
          >
            <MonitorUp size={18} />
          </button>
          <div className="emote-wrap">
            <button className="round" onClick={() => setEmoteOpen(o => !o)} title="Emotes">
              <Smile size={18} />
            </button>
            {emoteOpen && (
              <div className="emote-menu">
                {EMOTES.map((e, i) => (
                  <button
                    key={e}
                    onClick={() => {
                      world.sendEmote(e);
                      setEmoteOpen(false);
                    }}
                    title={`Tecla ${i + 1}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="tb-group">
          <button className="icon" onClick={() => engineRef.current?.setZoom(engineRef.current.zoom / 1.2)} title="Diminuir zoom">
            <ZoomOut size={18} />
          </button>
          <button className="icon" onClick={() => engineRef.current?.setZoom(engineRef.current.zoom * 1.2)} title="Aumentar zoom">
            <ZoomIn size={18} />
          </button>
          <button className={`icon ${panel === 'chat' ? 'active' : ''}`} onClick={() => togglePanel('chat')} title="Chat">
            <MessageSquare size={18} />
            {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button className={`icon ${panel === 'people' ? 'active' : ''}`} onClick={() => togglePanel('people')} title="Pessoas">
            <Users size={18} />
            <span className="count">{world.players.size}</span>
          </button>
          <button className="leave" onClick={onLeave} title="Sair">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </nav>
    </div>
  );
}
