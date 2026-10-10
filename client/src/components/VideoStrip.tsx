import { MicOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Avatar } from '../../../shared/types';
import type { LocalMedia } from '../rtc/media';
import type { PeerManager } from '../rtc/peers';
import type { World } from '../world';
import { AvatarPreview } from './AvatarPreview';

interface TileProps {
  id: string;
  name: string;
  avatar: Avatar;
  stream: MediaStream | null;
  videoOn: boolean;
  audioOn: boolean;
  self?: boolean;
  mirror?: boolean;
  mediaEls?: Map<string, HTMLMediaElement>;
  sinkId?: string | null;
  onAutoplayBlocked?: () => void;
  onExpand?: () => void;
}

function VideoTile({
  id,
  name,
  avatar,
  stream,
  videoOn,
  audioOn,
  self,
  mirror,
  mediaEls,
  sinkId,
  onAutoplayBlocked,
  onExpand,
}: TileProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !self && sinkId && 'setSinkId' in el) void el.setSinkId(sinkId).catch(() => {});
  }, [sinkId, self]);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    // Sem interação prévia do usuário o navegador pode bloquear áudio com autoplay.
    if (stream && !self)
      el.play().catch((err: DOMException) => {
        if (err.name === 'NotAllowedError') onAutoplayBlocked?.();
      });
  }, [stream, self, onAutoplayBlocked]);

  useEffect(() => {
    const el = ref.current;
    if (!el || self || !mediaEls) return;
    mediaEls.set(id, el);
    return () => {
      mediaEls.delete(id);
    };
  }, [id, self, mediaEls]);

  return (
    <div className="tile" onClick={videoOn ? onExpand : undefined}>
      <video ref={ref} autoPlay playsInline muted={self} className={`${videoOn ? '' : 'hidden'} ${mirror ? 'mirror' : ''}`} />
      {!videoOn && (
        <div className="tile-avatar">
          <AvatarPreview avatar={avatar} size={56} />
        </div>
      )}
      <div className="tile-name">
        {!audioOn && <MicOff size={12} className="muted-icon" />}
        {self ? `${name} (você)` : name}
      </div>
    </div>
  );
}

export function VideoStrip({
  world,
  peers,
  media,
  mediaEls,
}: {
  world: World;
  peers: PeerManager;
  media: LocalMedia;
  mediaEls: Map<string, HTMLMediaElement>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const onAutoplayBlocked = useCallback(() => setAudioBlocked(true), []);

  function unlockAudio() {
    setAudioBlocked(false);
    for (const el of mediaEls.values())
      el.play().catch((err: DOMException) => {
        if (err.name === 'NotAllowedError') setAudioBlocked(true);
      });
  }
  const me = world.self;
  const others = peers.ids().map(id => world.players.get(id)).filter(p => !!p);
  const expandedStream = expanded === me.id ? media.stream : expanded ? peers.stream(expanded) : null;
  const expandedRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (expandedRef.current) expandedRef.current.srcObject = expandedStream;
  }, [expandedStream]);

  useEffect(() => {
    if (expanded && expanded !== me.id && !peers.has(expanded)) setExpanded(null);
  });

  return (
    <>
      <div className="video-strip">
        <VideoTile
          id={me.id}
          name={me.name}
          avatar={me.avatar}
          stream={media.stream}
          videoOn={media.videoOn || media.screenOn}
          audioOn={media.audioOn}
          mirror={!media.screenOn}
          self
          onExpand={() => setExpanded(me.id)}
        />
        {others.map(p => (
          <VideoTile
            key={p.id}
            id={p.id}
            name={p.name}
            avatar={p.avatar}
            stream={peers.stream(p.id)}
            videoOn={p.video}
            audioOn={p.audio}
            mediaEls={mediaEls}
            sinkId={media.selected.output}
            onAutoplayBlocked={onAutoplayBlocked}
            onExpand={() => setExpanded(p.id)}
          />
        ))}
      </div>
      {audioBlocked && (
        <button className="unlock-audio" onClick={unlockAudio}>
          🔇 Clique para ativar o áudio
        </button>
      )}
      {expanded && expandedStream && (
        <div className="spotlight" onClick={() => setExpanded(null)}>
          <video ref={expandedRef} autoPlay playsInline muted />
          <span>Clique para fechar</span>
        </div>
      )}
    </>
  );
}
