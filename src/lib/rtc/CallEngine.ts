import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { iceServers } from "@/lib/config";

/**
 * Full-mesh WebRTC call engine.
 *
 * Every participant opens one RTCPeerConnection to every other participant.
 * Signalling rides a Supabase Realtime channel (`call:<callId>`):
 *   - `presence` tracks who is in the room (and their mic/cam flags)
 *   - `broadcast` "signal" events carry SDP + ICE, addressed peer-to-peer
 *
 * Renegotiation (camera on/off, screen share) uses the "perfect negotiation"
 * pattern so simultaneous offers never deadlock.
 *
 * Mesh scales to a handful of people; beyond ~6 an SFU should replace this.
 * The public surface (join / leave / toggles / subscribe) would stay the same.
 */

export type CallStatus = "idle" | "connecting" | "connected" | "ended";

export interface PeerView {
  id: string;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
}

export interface CallEngineState {
  status: CallStatus;
  localStream: MediaStream | null;
  peers: PeerView[];
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  error: string | null;
}

type SignalMessage =
  | { kind: "description"; from: string; to: string; description: RTCSessionDescriptionInit }
  | { kind: "candidate"; from: string; to: string; candidate: RTCIceCandidateInit | null }
  | { kind: "media-state"; from: string; to: null; micOn: boolean; camOn: boolean };

type Subscriber = (state: CallEngineState) => void;

interface Options {
  supabase: SupabaseClient;
  callId: string;
  selfId: string;
  /** Start with the camera track live. */
  withVideo: boolean;
}

class PeerConn {
  pc: RTCPeerConnection;
  stream: MediaStream | null = null;
  makingOffer = false;
  ignoreOffer = false;
  polite: boolean;
  micOn = true;
  camOn = false;
  connectionState: RTCPeerConnectionState = "new";

  constructor(polite: boolean) {
    this.polite = polite;
    this.pc = new RTCPeerConnection({ iceServers: iceServers() });
  }
}

export class CallEngine {
  private opts: Options;
  private channel: RealtimeChannel | null = null;
  private peers = new Map<string, PeerConn>();
  private subscribers = new Set<Subscriber>();

  private localStream: MediaStream | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private screenStream: MediaStream | null = null;

  private state: CallEngineState = {
    status: "idle",
    localStream: null,
    peers: [],
    micOn: true,
    camOn: false,
    screenSharing: false,
    error: null,
  };

  constructor(opts: Options) {
    this.opts = opts;
    this.state.camOn = opts.withVideo;
  }

  // ── public API ───────────────────────────────────────────────────────────

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    fn(this.snapshot());
    return () => this.subscribers.delete(fn);
  }

  getState(): CallEngineState {
    return this.snapshot();
  }

  async join(): Promise<void> {
    if (this.state.status !== "idle") return;
    this.patch({ status: "connecting" });

    await this.acquireLocalMedia();

    const { supabase, callId, selfId } = this.opts;
    const channel = supabase.channel(`call:${callId}`, {
      config: { broadcast: { ack: false }, presence: { key: selfId } },
    });
    this.channel = channel;

    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      void this.onSignal(payload as SignalMessage);
    });

    channel.on("presence", { event: "sync" }, () => this.syncPresence());
    channel.on("presence", { event: "join" }, () => this.syncPresence());
    channel.on("presence", { event: "leave" }, () => this.syncPresence());

    await new Promise<void>((resolve) => {
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: selfId,
            micOn: this.state.micOn,
            camOn: this.state.camOn,
            at: Date.now(),
          });
          resolve();
        }
      });
    });
  }

  async leave(): Promise<void> {
    if (this.state.status === "ended") return;
    for (const [, peer] of this.peers) peer.pc.close();
    this.peers.clear();

    if (this.channel) {
      try {
        await this.channel.untrack();
      } catch {
        /* ignore */
      }
      await this.opts.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.cameraTrack?.stop();
    this.localStream = null;
    this.screenStream = null;
    this.cameraTrack = null;

    this.patch({ status: "ended", localStream: null, peers: [], screenSharing: false });
    this.subscribers.clear();
  }

  toggleMic(): void {
    const on = !this.state.micOn;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.patch({ micOn: on });
    void this.broadcastMediaState();
    void this.updatePresence();
  }

  async toggleCamera(): Promise<void> {
    if (this.state.screenSharing) return;
    if (this.state.camOn) {
      this.setVideoTrack(null);
      this.patch({ camOn: false });
    } else {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: true });
        this.setVideoTrack(media.getVideoTracks()[0]);
        this.patch({ camOn: true });
      } catch (err) {
        this.patch({ error: describeMediaError(err) });
        return;
      }
    }
    void this.broadcastMediaState();
    void this.updatePresence();
  }

  async toggleScreenShare(): Promise<void> {
    if (this.state.screenSharing) {
      this.screenStream?.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
      // Restore camera if it was on before, else drop video.
      this.setVideoTrack(this.state.camOn ? await this.reacquireCamera() : null);
      this.patch({ screenSharing: false });
    } else {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        this.screenStream = display;
        const track = display.getVideoTracks()[0];
        track.addEventListener("ended", () => void this.toggleScreenShare());
        this.setVideoTrack(track, { fromScreen: true });
        this.patch({ screenSharing: true });
      } catch (err) {
        this.patch({ error: describeMediaError(err) });
      }
    }
  }

  // ── media ────────────────────────────────────────────────────────────────

  private async acquireLocalMedia(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.opts.withVideo,
      });
      this.localStream = stream;
      this.cameraTrack = stream.getVideoTracks()[0] ?? null;
      this.patch({
        localStream: stream,
        micOn: true,
        camOn: this.opts.withVideo && !!this.cameraTrack,
      });
    } catch (err) {
      // Join anyway as a view-only participant.
      this.localStream = new MediaStream();
      this.patch({
        localStream: this.localStream,
        micOn: false,
        camOn: false,
        error: describeMediaError(err),
      });
    }
  }

  private async reacquireCamera(): Promise<MediaStreamTrack | null> {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true });
      return media.getVideoTracks()[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Replace the outgoing video track on every peer (and the local preview). */
  private setVideoTrack(track: MediaStreamTrack | null, opts?: { fromScreen?: boolean }): void {
    if (!this.localStream) return;

    for (const existing of this.localStream.getVideoTracks()) {
      this.localStream.removeTrack(existing);
      if (existing !== this.cameraTrack || track === null) existing.stop();
    }
    if (track) this.localStream.addTrack(track);
    if (!opts?.fromScreen) this.cameraTrack = track;

    for (const [, peer] of this.peers) {
      const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video");
      if (track && sender) {
        void sender.replaceTrack(track);
      } else if (track && !sender) {
        peer.pc.addTrack(track, this.localStream);
      } else if (!track && sender) {
        peer.pc.removeTrack(sender);
      }
    }
    this.patch({ localStream: this.localStream });
  }

  // ── presence / peers ─────────────────────────────────────────────────────

  private syncPresence(): void {
    if (!this.channel) return;
    const raw = this.channel.presenceState() as Record<
      string,
      { userId: string; micOn: boolean; camOn: boolean }[]
    >;

    const present = new Map<string, { micOn: boolean; camOn: boolean }>();
    for (const entries of Object.values(raw)) {
      const e = entries[0];
      if (e && e.userId !== this.opts.selfId) {
        present.set(e.userId, { micOn: e.micOn, camOn: e.camOn });
      }
    }

    // Remove peers that left.
    for (const id of [...this.peers.keys()]) {
      if (!present.has(id)) {
        this.peers.get(id)?.pc.close();
        this.peers.delete(id);
      }
    }

    // Add peers that joined.
    for (const [id, flags] of present) {
      let peer = this.peers.get(id);
      if (!peer) {
        peer = this.createPeer(id);
        peer.micOn = flags.micOn;
        peer.camOn = flags.camOn;
      } else {
        peer.micOn = flags.micOn;
        peer.camOn = flags.camOn;
      }
    }

    if (this.peers.size > 0 && this.state.status === "connecting") {
      this.patch({ status: "connected" });
    }
    this.emit();
  }

  private createPeer(peerId: string): PeerConn {
    // Deterministic, symmetric roles: the higher id is the "polite" peer.
    const peer = new PeerConn(this.opts.selfId > peerId);
    this.peers.set(peerId, peer);
    const { pc } = peer;

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.sendSignal({
          kind: "description",
          from: this.opts.selfId,
          to: peerId,
          description: pc.localDescription!.toJSON(),
        });
      } catch (err) {
        console.error("negotiationneeded", err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      this.sendSignal({
        kind: "candidate",
        from: this.opts.selfId,
        to: peerId,
        candidate: candidate ? candidate.toJSON() : null,
      });
    };

    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] ?? peer.stream ?? new MediaStream();
      if (!streams[0]) stream.addTrack(track);
      peer.stream = stream;
      track.addEventListener("ended", () => this.emit());
      this.emit();
    };

    pc.onconnectionstatechange = () => {
      peer.connectionState = pc.connectionState;
      if (pc.connectionState === "failed") {
        try {
          pc.restartIce();
        } catch {
          /* ignore */
        }
      }
      if (pc.connectionState === "connected" && this.state.status !== "connected") {
        this.patch({ status: "connected" });
      }
      this.emit();
    };

    return peer;
  }

  // ── signalling ───────────────────────────────────────────────────────────

  private sendSignal(msg: SignalMessage): void {
    void this.channel?.send({ type: "broadcast", event: "signal", payload: msg });
  }

  private async broadcastMediaState(): Promise<void> {
    this.sendSignal({
      kind: "media-state",
      from: this.opts.selfId,
      to: null,
      micOn: this.state.micOn,
      camOn: this.state.camOn,
    });
  }

  private async updatePresence(): Promise<void> {
    await this.channel?.track({
      userId: this.opts.selfId,
      micOn: this.state.micOn,
      camOn: this.state.camOn,
      at: Date.now(),
    });
  }

  private async onSignal(msg: SignalMessage): Promise<void> {
    if (msg.kind === "media-state") {
      const peer = this.peers.get(msg.from);
      if (peer) {
        peer.micOn = msg.micOn;
        peer.camOn = msg.camOn;
        this.emit();
      }
      return;
    }

    if (msg.to !== this.opts.selfId) return;
    let peer = this.peers.get(msg.from);
    if (!peer) peer = this.createPeer(msg.from);
    const { pc } = peer;

    try {
      if (msg.kind === "description") {
        const description = msg.description;
        const offerCollision =
          description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === "offer") {
          await pc.setLocalDescription();
          this.sendSignal({
            kind: "description",
            from: this.opts.selfId,
            to: msg.from,
            description: pc.localDescription!.toJSON(),
          });
        }
      } else if (msg.kind === "candidate") {
        try {
          if (msg.candidate) await pc.addIceCandidate(msg.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) console.error("addIceCandidate", err);
        }
      }
    } catch (err) {
      console.error("onSignal", err);
    }
  }

  // ── state plumbing ───────────────────────────────────────────────────────

  private snapshot(): CallEngineState {
    const peers: PeerView[] = [...this.peers.entries()].map(([id, p]) => ({
      id,
      stream: p.stream,
      connectionState: p.connectionState,
      micOn: p.micOn,
      camOn: p.camOn,
      speaking: false,
    }));
    return { ...this.state, peers };
  }

  private patch(part: Partial<CallEngineState>): void {
    this.state = { ...this.state, ...part };
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.subscribers) fn(snap);
  }
}

function describeMediaError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  switch (e?.name) {
    case "NotAllowedError":
      return "Camera / microphone permission was denied.";
    case "NotFoundError":
      return "No camera or microphone found.";
    case "NotReadableError":
      return "Your camera or microphone is already in use by another app.";
    default:
      return e?.message || "Could not access media devices.";
  }
}
