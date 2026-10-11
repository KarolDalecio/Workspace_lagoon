import { useEffect, useRef, useState } from 'react';
import type { Avatar } from '../../shared/types';
import { autoJoinSpace, localAvatar, saveAvatarRemote, saveLocalAvatar, setAutoJoinSpace } from './api';
import { currentUser, devAvatar, loadAuthConfig, signOut, type AuthUser } from './auth';
import { Home } from './components/Home';
import { Lobby, enterSpace, type SpaceTarget } from './components/Lobby';
import { ClosedScreen, Login } from './components/Login';
import { Space } from './components/Space';
import { LocalMedia } from './rtc/media';
import { UnauthorizedError, type World } from './world';

type Gate =
  | { state: 'loading' }
  | { state: 'closed'; message: string }
  | { state: 'login'; error?: string | null }
  /** user = null quando o login está desligado (só em desenvolvimento). */
  | { state: 'ready'; user: AuthUser | null };

type Screen =
  | { kind: 'home'; notice?: string | null }
  | { kind: 'lobby'; target: SpaceTarget }
  /** Entrando direto no último espaço (sem passar pela tela inicial). */
  | { kind: 'auto'; target: SpaceTarget };

/** Para onde ir depois do login: link de convite > último espaço > tela inicial. */
function firstScreen(): Screen {
  const params = new URLSearchParams(location.search);
  const space = params.get('space');
  const code = params.get('code') ?? undefined;
  if (space && code) return { kind: 'lobby', target: { id: space, code } };
  const auto = autoJoinSpace();
  if (auto) return { kind: 'auto', target: { id: auto } };
  if (space) return { kind: 'lobby', target: { id: space } };
  return { kind: 'home' };
}

export default function App() {
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  const [screen, setScreen] = useState<Screen>(firstScreen);
  const [avatar, setAvatar] = useState<Avatar>(localAvatar);
  const [session, setSession] = useState<{ world: World; media: LocalMedia } | null>(null);

  function ready(user: AuthUser | null, saved: Avatar | null | undefined) {
    if (saved) {
      setAvatar(saved);
      saveLocalAvatar(saved);
    }
    setGate({ state: 'ready', user });
  }

  useEffect(() => {
    (async () => {
      try {
        const cfg = await loadAuthConfig();
        if (cfg.auth === 'misconfigured') {
          setGate({ state: 'closed', message: 'O acesso está fechado: o login ainda não foi configurado no servidor.' });
          return;
        }
        if (cfg.auth === 'disabled') {
          ready(null, await devAvatar().catch(() => null));
          return;
        }
        const user = await currentUser();
        if (user) ready(user, user.avatar);
        else setGate({ state: 'login' });
      } catch (err) {
        setGate({ state: 'login', error: (err as Error).message });
      }
    })();
  }, []);

  function changeAvatar(a: Avatar) {
    setAvatar(a);
    saveLocalAvatar(a);
    void saveAvatarRemote(a).catch(() => {});
  }

  function backToLogin(message: string) {
    void signOut();
    setGate({ state: 'login', error: message });
  }

  async function logout() {
    session?.world.leave();
    session?.media.stop();
    setSession(null);
    setAutoJoinSpace(null);
    await signOut();
    setScreen({ kind: 'home' });
    setGate({ state: 'login' });
  }

  if (gate.state === 'loading') return <div className="lobby" />;
  if (gate.state === 'closed') return <ClosedScreen message={gate.message} />;
  if (gate.state === 'login')
    return (
      <Login
        initialError={gate.error}
        onLogin={user => {
          ready(user, user.avatar);
          setScreen(firstScreen());
        }}
      />
    );

  if (session)
    return (
      <Space
        key={session.world.selfId}
        world={session.world}
        media={session.media}
        onAvatarChange={a => {
          setAvatar(a);
          saveLocalAvatar(a);
        }}
        onLeave={() => {
          // "Sair" do espaço: deixa de entrar direto e mostra os espaços recentes.
          session.world.leave();
          session.media.stop();
          setSession(null);
          setAutoJoinSpace(null);
          history.replaceState(null, '', location.pathname);
          setScreen({ kind: 'home' });
        }}
      />
    );

  if (screen.kind === 'auto')
    return (
      <AutoJoin
        target={screen.target}
        user={gate.user}
        avatar={avatar}
        onJoined={(world, media) => setSession({ world, media })}
        onFail={message => {
          setAutoJoinSpace(null);
          setScreen({ kind: 'home', notice: message });
        }}
        onUnauthorized={backToLogin}
      />
    );

  if (screen.kind === 'lobby')
    return (
      <Lobby
        target={screen.target}
        user={gate.user}
        avatar={avatar}
        onAvatarChange={changeAvatar}
        onBack={() => {
          history.replaceState(null, '', location.pathname);
          setScreen({ kind: 'home' });
        }}
        onJoined={(world, media) => setSession({ world, media })}
        onUnauthorized={backToLogin}
      />
    );

  return (
    <Home
      user={gate.user}
      avatar={avatar}
      notice={screen.notice}
      onAvatarChange={changeAvatar}
      onOpen={target => setScreen({ kind: 'lobby', target })}
      onLogout={gate.user ? logout : undefined}
    />
  );
}

/** Entra direto no último espaço, com câmera e microfone como da última vez. */
function AutoJoin({
  target,
  user,
  avatar,
  onJoined,
  onFail,
  onUnauthorized,
}: {
  target: SpaceTarget;
  user: AuthUser | null;
  avatar: Avatar;
  onJoined: (world: World, media: LocalMedia) => void;
  onFail: (message: string) => void;
  onUnauthorized: (message: string) => void;
}) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const media = new LocalMedia();
    (async () => {
      await media.init();
      try {
        const name = user?.person ?? localStorage.getItem('praca:name') ?? 'Convidado';
        onJoined(await enterSpace(target, name, avatar, media), media);
      } catch (err) {
        media.stop();
        if (err instanceof UnauthorizedError) onUnauthorized(err.message);
        else onFail((err as Error).message);
      }
    })();
  });
  return (
    <div className="lobby">
      <div className="lobby-card login-card">
        <div className="brand">
          <span className="brand-dot" /> Praça
        </div>
        <p className="hint">Entrando em {target.name ?? target.id}…</p>
      </div>
    </div>
  );
}
