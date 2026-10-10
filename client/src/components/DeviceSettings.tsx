import { Mic, Speaker, Video } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { canSelectOutput, type LocalMedia } from '../rtc/media';

function label(d: MediaDeviceInfo, i: number, fallback: string) {
  return d.label || `${fallback} ${i + 1}`;
}

/** Barra que acompanha o volume do microfone, para o usuário testar o dispositivo escolhido. */
function MicLevel({ track }: { track: MediaStreamTrack | null }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!track || !bar) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      bar.style.width = `${Math.min(100, (peak / 128) * 160)}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
      bar.style.width = '0%';
    };
  }, [track]);

  return (
    <div className="mic-level" title="Nível do microfone">
      <div ref={barRef} />
    </div>
  );
}

export function DeviceSettings({ media }: { media: LocalMedia }) {
  useSyncExternalStore(media.subscribe, media.getVersion);
  const { devices } = media;
  const micTrack = media.audioOn ? media.track('audio') : null;

  return (
    <div className="device-settings">
      <label>
        <span>
          <Mic size={14} /> Microfone
        </span>
        <select
          value={media.activeDevice('audio') ?? ''}
          onChange={e => media.setAudioDevice(e.target.value)}
          disabled={!devices.audio.length}
        >
          {!devices.audio.length && <option value="">Nenhum microfone encontrado</option>}
          {devices.audio.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {label(d, i, 'Microfone')}
            </option>
          ))}
        </select>
        <MicLevel track={micTrack} />
      </label>

      <label>
        <span>
          <Video size={14} /> Câmera
        </span>
        <select
          value={media.activeDevice('video') ?? ''}
          onChange={e => media.setVideoDevice(e.target.value)}
          disabled={!devices.video.length}
        >
          {!devices.video.length && <option value="">Nenhuma câmera encontrada</option>}
          {devices.video.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {label(d, i, 'Câmera')}
            </option>
          ))}
        </select>
      </label>

      {canSelectOutput && devices.output.length > 0 && (
        <label>
          <span>
            <Speaker size={14} /> Alto-falante
          </span>
          <select value={media.selected.output ?? 'default'} onChange={e => media.setOutputDevice(e.target.value)}>
            {devices.output.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {label(d, i, 'Alto-falante')}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
