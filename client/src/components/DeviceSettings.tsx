import { Check, Mic, Speaker, Video } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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

type SinkAudio = HTMLAudioElement & { setSinkId(id: string): Promise<void> };

/**
 * Menu da setinha ao lado do microfone/câmera: lista os dispositivos para trocar
 * e testa o escolhido (nível + gravação de 3 s no microfone, prévia na câmera).
 */
export function DeviceMenu({ media, kind, onClose }: { media: LocalMedia; kind: 'audio' | 'video'; onClose: () => void }) {
  useSyncExternalStore(media.subscribe, media.getVersion);
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [test, setTest] = useState<MediaStream | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [recording, setRecording] = useState<'idle' | 'rec' | 'play'>('idle');
  const active = media.activeDevice(kind);
  const list = kind === 'audio' ? media.devices.audio : media.devices.video;

  // Fecha ao clicar fora (a própria setinha cuida de abrir/fechar) ou com Esc.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current && !ref.current.contains(t) && !t.closest?.('.chevron')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  // Fluxo próprio de teste do dispositivo escolhido (funciona mesmo com o mic/câmera desligado na chamada).
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const device = active ? { deviceId: { exact: active } } : {};
    const constraints: MediaStreamConstraints =
      kind === 'audio' ? { audio: { echoCancellation: true, noiseSuppression: true, ...device } } : { video: { width: { ideal: 320 }, ...device } };
    navigator.mediaDevices
      ?.getUserMedia(constraints)
      .then(s => {
        if (cancelled) return s.getTracks().forEach(t => t.stop());
        stream = s;
        setTest(s);
        setTestError(null);
        void media.refreshDevices();
      })
      .catch(() => !cancelled && setTestError(kind === 'audio' ? 'Sem acesso ao microfone.' : 'Sem acesso à câmera.'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
      setTest(null);
    };
  }, [kind, active, media]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = test;
  }, [test]);

  /** Grava 3 segundos e toca de volta na saída escolhida. */
  function recordTest() {
    if (!test || recording !== 'idle' || typeof MediaRecorder === 'undefined') return;
    const rec = new MediaRecorder(test);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
      const audio = new Audio(url) as SinkAudio;
      if (media.selected.output && canSelectOutput) void audio.setSinkId(media.selected.output).catch(() => {});
      setRecording('play');
      audio.onended = audio.onerror = () => {
        URL.revokeObjectURL(url);
        setRecording('idle');
      };
      audio.play().catch(() => setRecording('idle'));
    };
    rec.start();
    setRecording('rec');
    setTimeout(() => rec.state !== 'inactive' && rec.stop(), 3000);
  }

  const choose = (id: string) => void (kind === 'audio' ? media.setAudioDevice(id) : media.setVideoDevice(id));
  const output = media.selected.output ?? 'default';

  return (
    <div className="device-menu" ref={ref}>
      <div className="dm-title">
        {kind === 'audio' ? <Mic size={14} /> : <Video size={14} />} {kind === 'audio' ? 'Microfone' : 'Câmera'}
      </div>
      {list.length === 0 && <div className="dm-empty">{kind === 'audio' ? 'Nenhum microfone encontrado' : 'Nenhuma câmera encontrada'}</div>}
      {list.map((d, i) => (
        <button key={d.deviceId} className={`dm-item ${d.deviceId === active ? 'on' : ''}`} onClick={() => choose(d.deviceId)}>
          <span className="dm-check">{d.deviceId === active && <Check size={14} />}</span>
          {label(d, i, kind === 'audio' ? 'Microfone' : 'Câmera')}
        </button>
      ))}

      <div className="dm-test">
        {testError && <div className="dm-empty">{testError}</div>}
        {kind === 'audio' && !testError && (
          <>
            <span>Fale algo para testar:</span>
            <MicLevel track={test?.getAudioTracks()[0] ?? null} />
            <button className="dm-rec" onClick={recordTest} disabled={!test || recording !== 'idle'}>
              {recording === 'rec' ? '⏺ Gravando 3 s…' : recording === 'play' ? '▶ Tocando a gravação…' : '🎙️ Gravar 3 s e ouvir'}
            </button>
          </>
        )}
        {kind === 'video' && !testError && <video ref={videoRef} className="dm-preview mirror" autoPlay playsInline muted />}
      </div>

      {kind === 'audio' && canSelectOutput && media.devices.output.length > 0 && (
        <>
          <div className="dm-title">
            <Speaker size={14} /> Alto-falante
          </div>
          {media.devices.output.map((d, i) => (
            <button key={d.deviceId} className={`dm-item ${output === d.deviceId ? 'on' : ''}`} onClick={() => media.setOutputDevice(d.deviceId)}>
              <span className="dm-check">{output === d.deviceId && <Check size={14} />}</span>
              {label(d, i, 'Alto-falante')}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
