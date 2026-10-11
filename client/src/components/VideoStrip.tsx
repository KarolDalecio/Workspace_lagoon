import { MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  const audioRef = useRef<HTMLAudioElement>(null);

  // A voz vai num <audio> separado do vídeo. Com a câmera da outra pessoa desligada,
  // a trilha de vídeo nunca recebe quadros e o <video> fica parado esperando por eles,
  // segurando o som junto. O <video> fica sempre mudo e só mostra a imagem.
  const audioTrack = stream?.getAudioTracks()[0] ?? null;
  const videoTrack = stream?.getVideoTracks()[0] ?? null;

  useEffect(() => {
    const el = audioRef.current;
    if (el && sinkId && 'setSinkId' in el) void el.setSinkId(sinkId).catch(() => {});
  }, [sinkId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (self) {
      if (el.srcObject !== stream) el.srcObject = stream;
      return;
    }
    el.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
    if (videoTrack) el.play().catch(() => {});
  }, [stream, videoTrack, self]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || self) return;
    el.srcObject = audioTrack ? new MediaStream([audioTrack]) : null;
    // Sem interação prévia do usuário o navegador pode bloquear áudio com autoplay.
    if (audioTrack)
      el.play().catch((err: DOMException) => {
        if (err.name === 'NotAllowedError') onAutoplayBlocked?.();
      });
  }, [audioTrack, self, onAutoplayBlocked]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || self || !mediaEls) return;
    mediaEls.set(id, el);
    return () => {
      mediaEls.delete(id);
    };
  }, [id, self, mediaEls]);

  return (
    <div className="tile" onClick={videoOn ? onExpand : undefined}>
      <video ref={ref} autoPlay playsInline muted className={`${videoOn ? '' : 'hidden'} ${mirror ? 'mirror' : ''}`} />
      {!self && <audio ref={audioRef} autoPlay />}
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
  onAutoplayBlocked,
}: {
  world: World;
  peers: PeerManager;
  media: LocalMedia;
  mediaEls: Map<string, HTMLMediaElement>;
  /** O navegador bloqueou o som (falta um clique na página); o Space mostra o aviso. */
  onAutoplayBlocked: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
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
      {expanded && expandedStream && (
        <div className="spotlight" onClick={() => setExpanded(null)}>
          <video ref={expandedRef} autoPlay playsInline muted />
          <span>Clique para fechar</span>
        </div>
      )}
    </>
  );
}
