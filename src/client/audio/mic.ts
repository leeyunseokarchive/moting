"use client";

import { float32ToInt16, rmsDb } from "./pcm";

export type MicFrame = { pcm: Int16Array; db: number; t: number };

/**
 * 마이크 캡처: PCM 프레임(STT용), 음량(dB), 녹음(MediaRecorder)을 한 번에 다룬다.
 * 시간 t는 녹음 시작 기준 초.
 */
export class MicCapture {
  stream: MediaStream | null = null;
  ctx: AudioContext | null = null;
  sampleRate = 48000;
  private node: AudioWorkletNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private listeners = new Set<(f: MicFrame) => void>();
  private muted = false;
  levels: [number, number][] = [];

  static async devices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] }> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: all.filter((d) => d.kind === "audioinput"),
      outputs: all.filter((d) => d.kind === "audiooutput"),
      cameras: all.filter((d) => d.kind === "videoinput"),
    };
  }

  async open(deviceId?: string): Promise<void> {
    this.close();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.ctx = new AudioContext();
    this.sampleRate = this.ctx.sampleRate;
    await this.ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const db = rmsDb(e.data);
      const t = this.now();
      if (this.recorder) this.levels.push([t, db]);
      if (this.muted) return;
      const frame = { pcm: float32ToInt16(e.data), db, t };
      this.listeners.forEach((l) => l(frame));
    };
    src.connect(this.node);
    // 워클릿이 돌도록 무음 출력에 연결
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
  }

  onFrame(fn: (f: MicFrame) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  get isMuted() {
    return this.muted;
  }

  startRecording() {
    if (!this.stream || this.recorder) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    this.chunks = [];
    this.levels = [];
    this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    this.recorder.start(1000);
    this.startedAt = performance.now();
  }

  /** 녹음 시작 기준 현재 시각(초) */
  now(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  get recordingStartedAt() {
    return this.startedAt;
  }

  async stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec) return null;
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || "audio/webm" }));
      if (rec.state !== "inactive") rec.stop();
      else resolve(new Blob(this.chunks, { type: rec.mimeType || "audio/webm" }));
      this.recorder = null;
    });
  }

  close() {
    this.node?.disconnect();
    this.node = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
