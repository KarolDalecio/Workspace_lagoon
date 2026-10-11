import { useEffect, useState } from 'react';
import { currentUser, loadAuthConfig, signOut, type AuthUser } from './auth';
import { Lobby } from './components/Lobby';
import { ClosedScreen, Login } from './components/Login';
import { Space } from './components/Space';
import type { LocalMedia } from './rtc/media';
import type { World } from './world';

type Gate =
  | { state: 'loading' }
  | { state: 'closed'; message: string }
  | { state: 'login'; error?: string | null }
  /** user = null quando o login está desligado (só em desenvolvimento). */
  | { state: 'ready'; user: AuthUser | null };

export default function App() {
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  const [session, setSession] = useState<{ world: World; media: LocalMedia } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await loadAuthConfig();
        if (cfg.auth === 'misconfigured') {
          setGate({ state: 'closed', message: 'O acesso está fechado: o login ainda não foi configurado no servidor.' });
          return;
        }
        if (cfg.auth === 'disabled') {
          setGate({ state: 'ready', user: null });
          return;
        }
        const user = await currentUser();
        setGate(user ? { state: 'ready', user } : { state: 'login' });
      } catch (err) {
        setGate({ state: 'login', error: (err as Error).message });
      }
    })();
  }, []);

  async function logout() {
    session?.world.leave();
    session?.media.stop();
    setSession(null);
    await signOut();
    setGate({ state: 'login' });
  }

  if (gate.state === 'loading') return <div className="lobby" />;
  if (gate.state === 'closed') return <ClosedScreen message={gate.message} />;
  if (gate.state === 'login') return <Login initialError={gate.error} onLogin={user => setGate({ state: 'ready', user })} />;

  if (!session)
    return (
      <Lobby
        user={gate.user}
        onLogout={gate.user ? logout : undefined}
        onUnauthorized={message => {
          void signOut();
          setGate({ state: 'login', error: message });
        }}
        onJoined={(world, media) => setSession({ world, media })}
      />
    );

  return (
    <Space
      key={session.world.selfId}
      world={session.world}
      media={session.media}
      onLeave={() => {
        session.world.leave();
        session.media.stop();
        setSession(null);
      }}
    />
  );
}
