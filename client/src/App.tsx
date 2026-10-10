import { useState } from 'react';
import { Lobby } from './components/Lobby';
import { Space } from './components/Space';
import type { LocalMedia } from './rtc/media';
import type { World } from './world';

export default function App() {
  const [session, setSession] = useState<{ world: World; media: LocalMedia } | null>(null);

  if (!session) return <Lobby onJoined={(world, media) => setSession({ world, media })} />;

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
