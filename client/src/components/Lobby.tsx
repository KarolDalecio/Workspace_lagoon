import { ArrowLeft, Mic, MicOff, Pencil, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { Avatar } from '../../../shared/types';
import { setAutoJoinSpace } from '../api';
import { accessToken, type AuthUser } from '../auth';
import { LocalMedia } from '../rtc/media';
import { UnauthorizedError, joinSpace, type World } from '../world';
import { AvatarEditor } from './AvatarEditor';
import { AvatarPreview } from './AvatarPreview';
import { DeviceSettings } from './DeviceSettings';

const NAME_KEY = 'praca:name';

export interface SpaceTarget {
  id: string;
  name?: string;
  /** Código de convite (quando veio de um link ou foi digitado). */
  code?: string;
}

/** Entra no espaço e marca para entrar direto da próxima vez (até clicar em "Sair"). */
export async function enterSpace(target: SpaceTarget, name: string, avatar: Avatar, media: LocalMedia) {
  const world = await joinSpace(
    { space: target.id, code: target.code, name, avatar, audio: media.audioOn, video: media.videoOn },
    await accessToken(),
  );
  setAutoJoinSpace(world.space);
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('space', world.space);
  history.replaceState(null, '', url);
  return world;
}

/** Tela de pré-entrada: câmera, microfone, dispositivos e avatar antes de entrar no espaço. */
export function Lobby({
  target,
  user,
  avatar,
  onAvatarChange,
  onBack,
  onJoined,
  onUnauthorized,
}: {
  target: SpaceTarget;
  /** Conta logada (null quando o login está desligado, em desenvolvimento). */
  user: AuthUser | null;
  avatar: Avatar;
  onAvatarChange: (avatar: Avatar) => void;
  onBack: () => void;
  onJoined: (world: World, media: LocalMedia) => void;
  onUnauthorized: (message: string) => void;
}) {
  const [media] = useState(() => new LocalMedia());
  useSyncExternalStore(media.subscribe, media.getVersion);
  const [name, setName] = useState(() => user?.person ?? localStorage.getItem(NAME_KEY) ?? '');
  const [editing, setEditing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const joined = useRef(false);

  useEffect(() => {
    void media.init();
    // Se a pessoa voltar sem entrar, desliga câmera e microfone.
    return () => {
      if (!joined.current) media.stop();
    };
  }, [media]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = media.stream;
  }, [media.stream]);

  async function join(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setJoining(true);
    setError(null);
    try {
      localStorage.setItem(NAME_KEY, trimmed);
    } catch {
      // ignora
    }
    try {
      const world = await enterSpace(target, trimmed, avatar, media);
      joined.current = true;
      onJoined(world, media);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized(err.message);
        return;
      }
      setError((err as Error).message);
      setJoining(false);
    }
  }

  return (
    <div className="lobby">
      <form className="lobby-card" onSubmit={join}>
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft size={16} /> Meus espaços
        </button>
        <div className="brand">
          <span className="brand-dot" /> {target.name ?? target.id}
        </div>
        <p className="lobby-sub">Confira câmera e microfone antes de entrar.</p>

        <div className="lobby-grid">
          <div className="lobby-media">
            <div className="preview">
              <video ref={videoRef} autoPlay muted playsInline className={media.videoOn ? '' : 'hidden'} />
              {!media.videoOn && (
                <div className="preview-avatar">
                  <AvatarPreview avatar={avatar} size={120} />
                </div>
              )}
            </div>
            <div className="preview-controls">
              <button
                type="button"
                className={`round ${media.audioOn ? '' : 'off'}`}
                onClick={() => media.setAudio(!media.audioOn)}
                title={media.audioOn ? 'Desligar microfone' : 'Ligar microfone'}
              >
                {media.audioOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              <button
                type="button"
                className={`round ${media.videoOn ? '' : 'off'}`}
                onClick={() => media.setVideo(!media.videoOn)}
                title={media.videoOn ? 'Desligar câmera' : 'Ligar câmera'}
              >
                {media.videoOn ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
            </div>
            {media.error && <p className="hint warn">{media.error}</p>}
            <DeviceSettings media={media} />
          </div>

          <div className="lobby-form">
            {user ? (
              <div className="account">
                <span>
                  Entrando como <strong>{user.person}</strong>
                  <small>{user.email}</small>
                </span>
              </div>
            ) : (
              <label>
                Seu nome
                <input value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Como te chamam?" autoFocus />
              </label>
            )}

            <div className="customizer">
              <AvatarPreview avatar={avatar} size={84} />
              <div>
                <strong>Seu avatar</strong>
                <p className="hint">Cabelo, roupas, chapéu, óculos e mais.</p>
                <button type="button" className="chip" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Editar avatar
                </button>
              </div>
            </div>

            <button className="primary" disabled={!name.trim() || joining}>
              {joining ? 'Entrando…' : 'Entrar no espaço'}
            </button>
            {error && <p className="hint warn">{error}</p>}
          </div>
        </div>
      </form>
      {editing && (
        <AvatarEditor
          name={user?.person ?? name}
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
