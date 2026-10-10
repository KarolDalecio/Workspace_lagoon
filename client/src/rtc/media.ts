export type Kind = 'audio' | 'video';

const VIDEO: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } };
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** Microfone, câmera e compartilhamento de tela do usuário local. */
export class LocalMedia {
  stream = new MediaStream();
  audioOn = false;
  videoOn = false;
  screenOn = false;
  error: string | null = null;
  /** Chamado quando a trilha de um tipo muda, para substituir nos peers. */
  onTrack?: (kind: Kind, track: MediaStreamTrack | null) => void;

  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = () => this.version;

  private notify() {
    this.version++;
    this.listeners.forEach(fn => fn());
  }

  track(kind: Kind): MediaStreamTrack | null {
    return (kind === 'audio' ? this.stream.getAudioTracks() : this.stream.getVideoTracks())[0] ?? null;
  }

  private setTrack(kind: Kind, track: MediaStreamTrack | null) {
    const old = this.track(kind);
    if (old && old !== track) old.stop();
    const others = this.stream.getTracks().filter(t => t.kind !== kind);
    this.stream = new MediaStream(track ? [...others, track] : others);
    this.onTrack?.(kind, track);
  }

  /** Pede câmera e microfone juntos (um único prompt), com fallback individual. */
  async init() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: VIDEO });
      this.setTrack('audio', s.getAudioTracks()[0] ?? null);
      this.setTrack('video', s.getVideoTracks()[0] ?? null);
      this.audioOn = !!this.track('audio');
      this.videoOn = !!this.track('video');
      this.error = null;
      this.notify();
    } catch {
      await this.setAudio(true);
      await this.setVideo(true);
    }
  }

  async setAudio(on: boolean) {
    let t = this.track('audio');
    if (on && !t) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
        t = s.getAudioTracks()[0];
        this.setTrack('audio', t);
      } catch {
        this.error = 'Não foi possível acessar o microfone.';
        this.notify();
        return;
      }
    }
    if (t) t.enabled = on;
    this.audioOn = on && !!t;
    this.error = null;
    this.notify();
  }

  async setVideo(on: boolean) {
    if (on) {
      if (this.screenOn) this.screenOn = false;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
        this.setTrack('video', s.getVideoTracks()[0]);
        this.videoOn = true;
        this.error = null;
      } catch {
        this.error = 'Não foi possível acessar a câmera.';
      }
    } else {
      if (!this.screenOn) this.setTrack('video', null);
      this.videoOn = false;
    }
    this.notify();
  }

  /** Compartilhar tela substitui a trilha de vídeo da câmera enquanto durar. */
  async toggleScreen() {
    if (this.screenOn) {
      this.screenOn = false;
      this.setTrack('video', null);
      if (this.videoOn) await this.setVideo(true);
      else this.notify();
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const t = s.getVideoTracks()[0];
      t.onended = () => {
        if (this.screenOn && this.track('video') === t) void this.toggleScreen();
      };
      this.screenOn = true;
      this.setTrack('video', t);
      this.notify();
    } catch {
      // usuário cancelou o seletor
    }
  }

  stop() {
    this.stream.getTracks().forEach(t => t.stop());
    this.stream = new MediaStream();
    this.audioOn = this.videoOn = this.screenOn = false;
    this.onTrack = undefined;
    this.notify();
  }
}
