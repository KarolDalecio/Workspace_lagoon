import type { IceCandidate, SessionDescription, SignalData } from '../../../shared/types';
import type { AppSocket } from '../world';
import type { Kind, LocalMedia } from './media';

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

interface Peer {
  pc: RTCPeerConnection;
  stream: MediaStream;
  pending: IceCandidate[];
}

/**
 * Malha P2P de WebRTC. O motor do jogo chama sync() com quem deve estar
 * conectado; o lado com o menor id sempre inicia a oferta (evita colisão).
 */
export class PeerManager {
  private peers = new Map<string, Peer>();
  private cooldown = new Map<string, number>();

  constructor(
    private socket: AppSocket,
    private selfId: string,
    private media: LocalMedia,
    private onChange: () => void,
  ) {
    socket.on('rtc:signal', this.onSignal);
    socket.on('player:left', this.onLeft);
  }

  has(id: string) {
    return this.peers.has(id);
  }

  ids() {
    return [...this.peers.keys()];
  }

  stream(id: string) {
    return this.peers.get(id)?.stream ?? null;
  }

  sync(desired: Set<string>) {
    for (const id of [...this.peers.keys()]) if (!desired.has(id)) this.hangup(id);
    const now = Date.now();
    for (const id of desired)
      if (!this.peers.has(id) && this.selfId < id && (this.cooldown.get(id) ?? 0) < now) void this.call(id);
  }

  replaceTrack(kind: Kind, track: MediaStreamTrack | null) {
    for (const { pc } of this.peers.values())
      for (const tr of pc.getTransceivers())
        if (tr.receiver.track.kind === kind && tr.currentDirection !== 'stopped') void tr.sender.replaceTrack(track).catch(() => {});
  }

  dispose() {
    this.socket.off('rtc:signal', this.onSignal);
    this.socket.off('player:left', this.onLeft);
    for (const id of [...this.peers.keys()]) this.close(id);
  }

  private send(to: string, data: SignalData) {
    this.socket.emit('rtc:signal', { to, data });
  }

  private create(id: string): Peer {
    const pc = new RTCPeerConnection(ICE);
    const peer: Peer = { pc, stream: new MediaStream(), pending: [] };
    pc.onicecandidate = e => {
      if (e.candidate) this.send(id, { candidate: e.candidate.toJSON() as IceCandidate });
    };
    pc.ontrack = e => {
      const others = peer.stream.getTracks().filter(t => t.kind !== e.track.kind);
      peer.stream = new MediaStream([...others, e.track]);
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && this.peers.get(id)?.pc === pc) {
        this.close(id);
        this.cooldown.set(id, Date.now() + 3000);
      }
    };
    this.peers.set(id, peer);
    this.onChange();
    return peer;
  }

  private async call(id: string) {
    const { pc } = this.create(id);
    for (const kind of ['audio', 'video'] as const)
      pc.addTransceiver(this.media.track(kind) ?? kind, { direction: 'sendrecv' });
    try {
      await pc.setLocalDescription();
      this.send(id, { sdp: pc.localDescription!.toJSON() as SessionDescription });
    } catch (err) {
      console.warn('Falha ao criar oferta', err);
      this.close(id);
    }
  }

  private onSignal = async ({ from, data }: { from: string; data: SignalData }) => {
    try {
      if ('hangup' in data) {
        this.close(from);
        this.cooldown.set(from, Date.now() + 1500);
      } else if ('sdp' in data) {
        if (data.sdp.type === 'offer') await this.answer(from, data.sdp);
        else {
          const peer = this.peers.get(from);
          if (!peer) return;
          await peer.pc.setRemoteDescription(data.sdp);
          await this.flush(peer);
        }
      } else if ('candidate' in data) {
        const peer = this.peers.get(from);
        if (!peer) return;
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
        else peer.pending.push(data.candidate);
      }
    } catch (err) {
      console.warn('Erro de sinalização com', from, err);
      this.close(from);
    }
  };

  private async answer(from: string, sdp: SessionDescription) {
    if (this.peers.has(from)) this.close(from);
    const peer = this.create(from);
    const { pc } = peer;
    await pc.setRemoteDescription(sdp);
    for (const tr of pc.getTransceivers()) {
      await tr.sender.replaceTrack(this.media.track(tr.receiver.track.kind as Kind));
      tr.direction = 'sendrecv';
    }
    await pc.setLocalDescription();
    this.send(from, { sdp: pc.localDescription!.toJSON() as SessionDescription });
    await this.flush(peer);
  }

  private async flush(peer: Peer) {
    const list = peer.pending.splice(0);
    for (const c of list) await peer.pc.addIceCandidate(c).catch(() => {});
  }

  private hangup(id: string) {
    this.send(id, { hangup: true });
    this.close(id);
    this.cooldown.set(id, Date.now() + 1500);
  }

  close(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(id);
    this.onChange();
  }

  private onLeft = (id: string) => {
    this.close(id);
    this.cooldown.delete(id);
  };
}
