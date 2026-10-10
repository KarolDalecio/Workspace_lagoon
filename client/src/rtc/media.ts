export type Kind = 'audio' | 'video';

const VIDEO: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } };
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const DEVICES_KEY = 'praca:devices';

export interface DeviceLists {
  audio: MediaDeviceInfo[];
  video: MediaDeviceInfo[];
  output: MediaDeviceInfo[];
}

interface DevicePrefs {
  audio: string | null;
  video: string | null;
  output: string | null;
}

function loadPrefs(): DevicePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(DEVICES_KEY) ?? 'null');
    if (p) return { audio: p.audio ?? null, video: p.video ?? null, output: p.output ?? null };
  } catch {
    // sem armazenamento disponível
  }
  return { audio: null, video: null, output: null };
}

/** Escolher a saída de áudio só é possível em navegadores com setSinkId (Chrome/Edge). */
export const canSelectOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Microfone, câmera e compartilhamento de tela do usuário local. */
export class LocalMedia {
  stream = new MediaStream();
  audioOn = false;
  videoOn = false;
  screenOn = false;
  /** O compartilhamento de tela também está enviando o som da tela/aba. */
  screenAudioOn = false;
  error: string | null = null;
  devices: DeviceLists = { audio: [], video: [], output: [] };
  /** Dispositivos escolhidos pelo usuário (null = padrão do sistema). */
  selected: DevicePrefs = loadPrefs();
  /** Chamado quando a trilha de um tipo muda, para substituir nos peers. */
  onTrack?: (kind: Kind, track: MediaStreamTrack | null) => void;

  private listeners = new Set<() => void>();
  private version = 0;
  private screenAudio: MediaStreamTrack | null = null;
  private mixer: { ctx: AudioContext; track: MediaStreamTrack } | null = null;

  constructor() {
    navigator.mediaDevices?.addEventListener('devicechange', this.refreshDevices);
  }

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

  /** Trilha que vai para os outros: no áudio, é o microfone mixado com o som da tela quando houver. */
  sendTrack(kind: Kind): MediaStreamTrack | null {
    if (kind === 'audio' && this.mixer) return this.mixer.track;
    return this.track(kind);
  }

  private setTrack(kind: Kind, track: MediaStreamTrack | null) {
    const old = this.track(kind);
    if (old && old !== track) old.stop();
    const others = this.stream.getTracks().filter(t => t.kind !== kind);
    this.stream = new MediaStream(track ? [...others, track] : others);
    if (kind === 'audio') this.rebuildMix();
    this.onTrack?.(kind, this.sendTrack(kind));
  }

  /**
   * Cada conversa tem um único canal de áudio, então o som da tela é mixado
   * com o microfone. Microfone mudo (track.enabled = false) vira silêncio no mix.
   */
  private rebuildMix() {
    if (this.mixer) {
      this.mixer.track.stop();
      void this.mixer.ctx.close();
      this.mixer = null;
    }
    if (!this.screenAudio) return;
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(new MediaStream([this.screenAudio])).connect(dest);
    const mic = this.track('audio');
    if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest);
    void ctx.resume();
    this.mixer = { ctx, track: dest.stream.getAudioTracks()[0] };
  }

  private constraints(kind: Kind): MediaTrackConstraints {
    const id = this.selected[kind];
    return { ...(kind === 'audio' ? AUDIO : VIDEO), ...(id ? { deviceId: { ideal: id } } : {}) };
  }

  private savePrefs() {
    try {
      localStorage.setItem(DEVICES_KEY, JSON.stringify(this.selected));
    } catch {
      // ignora
    }
  }

  /** Lista os dispositivos. Os nomes só aparecem depois que o usuário dá permissão. */
  refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.deviceId);
    this.devices = {
      audio: list.filter(d => d.kind === 'audioinput'),
      video: list.filter(d => d.kind === 'videoinput'),
      output: list.filter(d => d.kind === 'audiooutput'),
    };
    this.notify();
  };

  /** Id do dispositivo realmente em uso (pode diferir do escolhido se ele sumiu). */
  activeDevice(kind: Kind): string | null {
    if (kind === 'video' && this.screenOn) return this.selected.video;
    return this.track(kind)?.getSettings().deviceId ?? this.selected[kind];
  }

  /** Pede câmera e microfone juntos (um único prompt), com fallback individual. */
  async init() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: this.constraints('audio'), video: this.constraints('video') });
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
    await this.refreshDevices();
  }

  async setAudio(on: boolean) {
    let t = this.track('audio');
    if (on && !t) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: this.constraints('audio') });
        t = s.getAudioTracks()[0];
        this.setTrack('audio', t);
        void this.refreshDevices();
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
        const s = await navigator.mediaDevices.getUserMedia({ video: this.constraints('video') });
        this.setTrack('video', s.getVideoTracks()[0]);
        this.videoOn = true;
        this.error = null;
        void this.refreshDevices();
      } catch {
        this.error = 'Não foi possível acessar a câmera.';
      }
    } else {
      if (!this.screenOn) this.setTrack('video', null);
      this.videoOn = false;
    }
    this.notify();
  }

  /** Troca o microfone mantendo o estado de mudo; as conversas recebem a nova trilha. */
  async setAudioDevice(deviceId: string) {
    this.selected.audio = deviceId;
    this.savePrefs();
    if (this.track('audio')) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO, deviceId: { exact: deviceId } } });
        const t = s.getAudioTracks()[0];
        t.enabled = this.audioOn;
        this.setTrack('audio', t);
        this.error = null;
      } catch {
        this.error = 'Não foi possível usar esse microfone.';
      }
    }
    this.notify();
  }

  /** Troca a câmera; se ela estiver desligada (ou compartilhando tela), vale na próxima vez que ligar. */
  async setVideoDevice(deviceId: string) {
    this.selected.video = deviceId;
    this.savePrefs();
    if (this.videoOn && !this.screenOn) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO, deviceId: { exact: deviceId } } });
        this.setTrack('video', s.getVideoTracks()[0]);
        this.error = null;
      } catch {
        this.error = 'Não foi possível usar essa câmera.';
      }
    }
    this.notify();
  }

  setOutputDevice(deviceId: string) {
    this.selected.output = deviceId;
    this.savePrefs();
    this.notify();
  }

  /** Compartilhar tela substitui a trilha de vídeo da câmera enquanto durar. */
  async toggleScreen() {
    if (this.screenOn) {
      this.screenOn = false;
      this.setScreenAudio(null);
      this.setTrack('video', null);
      if (this.videoOn) await this.setVideo(true);
      else this.notify();
      return;
    }
    try {
      // systemAudio: no Windows/ChromeOS o Chrome permite compartilhar o som do sistema inteiro.
      const options = { video: true, audio: true, systemAudio: 'include' } as DisplayMediaStreamOptions;
      const s = await navigator.mediaDevices.getDisplayMedia(options);
      const t = s.getVideoTracks()[0];
      t.onended = () => {
        if (this.screenOn && this.track('video') === t) void this.toggleScreen();
      };
      this.screenOn = true;
      this.setScreenAudio(s.getAudioTracks()[0] ?? null);
      this.setTrack('video', t);
      this.notify();
    } catch {
      // usuário cancelou o seletor
    }
  }

  private setScreenAudio(track: MediaStreamTrack | null) {
    this.screenAudio?.stop();
    this.screenAudio = track;
    this.screenAudioOn = !!track;
    this.rebuildMix();
    this.onTrack?.('audio', this.sendTrack('audio'));
  }

  stop() {
    navigator.mediaDevices?.removeEventListener('devicechange', this.refreshDevices);
    this.stream.getTracks().forEach(t => t.stop());
    this.stream = new MediaStream();
    this.screenAudio?.stop();
    this.screenAudio = null;
    this.screenAudioOn = false;
    this.rebuildMix();
    this.audioOn = this.videoOn = this.screenOn = false;
    this.onTrack = undefined;
    this.notify();
  }
}
