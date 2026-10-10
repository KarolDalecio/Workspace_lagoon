import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { AVATAR_OPTIONS, type Avatar } from '../../../shared/types';
import { LocalMedia } from '../rtc/media';
import { joinSpace, type World } from '../world';
import { AvatarPreview } from './AvatarPreview';

const STORAGE_KEY = 'praca:profile';

function randomOf<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

function loadProfile(): { name: string; avatar: Avatar } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.avatar) return saved;
  } catch {
    // sem armazenamento disponível
  }
  return {
    name: '',
    avatar: {
      skin: randomOf(AVATAR_OPTIONS.skin),
      hair: randomOf(AVATAR_OPTIONS.hair),
      shirt: randomOf(AVATAR_OPTIONS.shirt),
      hairStyle: Math.floor(Math.random() * AVATAR_OPTIONS.hairStyles),
    },
  };
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map(c => (
        <button
          key={c}
          type="button"
          className={`swatch ${c === value ? 'selected' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}

export function Lobby({ onJoined }: { onJoined: (world: World, media: LocalMedia) => void }) {
  const [media] = useState(() => new LocalMedia());
  useSyncExternalStore(media.subscribe, media.getVersion);
  const [profile] = useState(loadProfile);
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState<Avatar>(profile.avatar);
  const [space, setSpace] = useState(() => new URLSearchParams(location.search).get('space') ?? 'principal');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    void media.init();
  }, [media]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = media.stream;
  }, [media.stream]);

  const patch = (p: Partial<Avatar>) => setAvatar(a => ({ ...a, ...p }));

  async function join(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setJoining(true);
    setError(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: trimmed, avatar }));
    } catch {
      // ignora
    }
    try {
      const world = await joinSpace({ space, name: trimmed, avatar, audio: media.audioOn, video: media.videoOn });
      const url = new URL(location.href);
      url.searchParams.set('space', world.space);
      history.replaceState(null, '', url);
      onJoined(world, media);
    } catch (err) {
      setError((err as Error).message);
      setJoining(false);
    }
  }

  return (
    <div className="lobby">
      <form className="lobby-card" onSubmit={join}>
        <div className="brand">
          <span className="brand-dot" /> Praça
        </div>
        <p className="lobby-sub">Seu escritório virtual. Ande até alguém para conversar.</p>

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
          </div>

          <div className="lobby-form">
            <label>
              Seu nome
              <input value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Como te chamam?" autoFocus />
            </label>
            <label>
              Espaço
              <input value={space} onChange={e => setSpace(e.target.value)} maxLength={40} placeholder="principal" />
            </label>

            <div className="customizer">
              <AvatarPreview avatar={avatar} size={72} />
              <div className="customizer-options">
                <span>Pele</span>
                <Swatches colors={AVATAR_OPTIONS.skin} value={avatar.skin} onChange={skin => patch({ skin })} />
                <span>Cabelo</span>
                <Swatches colors={AVATAR_OPTIONS.hair} value={avatar.hair} onChange={hair => patch({ hair })} />
                <span>Roupa</span>
                <Swatches colors={AVATAR_OPTIONS.shirt} value={avatar.shirt} onChange={shirt => patch({ shirt })} />
                <span>Estilo</span>
                <div className="styles">
                  {['Curto', 'Longo', 'Coque', 'Raspado'].map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      className={`chip ${avatar.hairStyle === i ? 'selected' : ''}`}
                      onClick={() => patch({ hairStyle: i })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className="primary" disabled={!name.trim() || joining}>
              {joining ? 'Entrando…' : 'Entrar no espaço'}
            </button>
            {error && <p className="hint warn">{error}</p>}
          </div>
        </div>
      </form>
    </div>
  );
}
