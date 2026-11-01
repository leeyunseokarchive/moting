"use client";

import type { AvatarManager } from "../avatar/simli";
import { int16ToBytes, int16ToFloat32, Pcm16Accumulator, resampleInt16 } from "./pcm";

const TTS_RATE = 24000;
const SIMLI_RATE = 16000;

type SpeakOptions = {
  speakerId: string;
  voice: string;
  text: string;
  /** 첫 소리가 나기 직전 */
  onStart?: () => void;
};

/**
 * 면접관 음성 출력.
 * - 서버 TTS(PCM 24kHz 스트림)를 받아 아바타가 연결돼 있으면 16kHz로 바꿔 Simli로 보내고(입 모양 동기화),
 *   아니면 Web Audio로 직접 재생한다.
 * - TTS를 쓸 수 없으면 브라우저 speechSynthesis로 대체한다.
 * - 녹음 타임라인에 면접관 발화 구간을 남기기 위해 실제 재생 시간을 돌려준다.
 */
export class InterviewerVoice {
  private ctx: AudioContext | null = null;
  private abort: AbortController | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private cancelled = false;
  private cache = new Map<string, Int16Array>();
  sinkId: string | null = null;

  constructor(private avatars: AvatarManager | null) {}

  private audio(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: TTS_RATE });
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async setSink(deviceId: string | null) {
    this.sinkId = deviceId;
    const ctx = this.audio() as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (deviceId && ctx.setSinkId) await ctx.setSinkId(deviceId).catch(() => {});
  }

  /** 맞장구처럼 자주 쓰는 짧은 말을 미리 받아 둔다 */
  async preload(voice: string, text: string): Promise<void> {
    const key = `${voice}|${text}`;
    if (this.cache.has(key)) return;
    const pcm = await this.fetchAll(voice, text).catch(() => null);
    if (pcm) this.cache.set(key, pcm);
  }

  private async fetchAll(voice: string, text: string): Promise<Int16Array | null> {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (res.status !== 200) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return new Pcm16Accumulator().push(buf);
  }

  /** 말하기. 끝까지 재생되면 true, 중간에 멈추면 false */
  async speak(o: SpeakOptions): Promise<boolean> {
    this.stop();
    this.cancelled = false;
    const cached = this.cache.get(`${o.voice}|${o.text}`);
    if (cached) return this.playPcm(o, [cached]);

    const abort = new AbortController();
    this.abort = abort;
    let res: Response;
    try {
      res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: o.text, voice: o.voice }),
        signal: abort.signal,
      });
    } catch {
      if (this.cancelled) return false;
      return this.speakBrowser(o);
    }
    if (res.status !== 200 || !res.body) return this.speakBrowser(o);
    return this.playStream(o, res.body);
  }

  private async playStream(o: SpeakOptions, body: ReadableStream<Uint8Array>): Promise<boolean> {
    const reader = body.getReader();
    const acc = new Pcm16Accumulator();
    const useAvatar = this.avatars?.isLive(o.speakerId) ?? false;
    let started = false;
    let streamStartAt = 0;
    let sentSec = 0;
    let playhead = 0;
    const ctx = useAvatar ? null : this.audio();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || this.cancelled) break;
        const pcm = acc.push(value);
        if (pcm.length === 0) continue;
        if (!started) {
          started = true;
          streamStartAt = performance.now();
          o.onStart?.();
        }
        if (useAvatar) {
          const down = resampleInt16(pcm, TTS_RATE, SIMLI_RATE);
          if (!this.avatars!.send(o.speakerId, int16ToBytes(down))) {
            // 도중에 끊기면 로컬 재생으로 넘어간다
            return this.playPcm({ ...o, onStart: undefined }, [pcm]);
          }
          sentSec += down.length / SIMLI_RATE;
        } else if (ctx) {
          playhead = this.schedule(ctx, pcm, playhead);
        }
      }
    } catch {
      return false;
    }
    if (this.cancelled) return false;
    if (useAvatar) {
      // Simli는 받은 오디오를 순서대로 재생한다. 이미 흐른 시간을 빼고 남은 재생 시간만큼만 기다린다.
      const elapsedMs = streamStartAt ? performance.now() - streamStartAt : 0;
      const remainingMs = Math.max(0, sentSec * 1000 - elapsedMs);
      await this.avatars!.waitSilent(o.speakerId, remainingMs + 600);
      return !this.cancelled;
    }
    if (ctx) await this.waitUntil(ctx, playhead);
    return !this.cancelled;
  }

  private async playPcm(o: SpeakOptions, chunks: Int16Array[]): Promise<boolean> {
    const useAvatar = this.avatars?.isLive(o.speakerId) ?? false;
    o.onStart?.();
    if (useAvatar) {
      let sec = 0;
      for (const c of chunks) {
        const down = resampleInt16(c, TTS_RATE, SIMLI_RATE);
        this.avatars!.send(o.speakerId, int16ToBytes(down));
        sec += down.length / SIMLI_RATE;
      }
      await this.avatars!.waitSilent(o.speakerId, sec * 1000 + 2000);
      return !this.cancelled;
    }
    const ctx = this.audio();
    let playhead = 0;
    for (const c of chunks) playhead = this.schedule(ctx, c, playhead);
    await this.waitUntil(ctx, playhead);
    return !this.cancelled;
  }

  private schedule(ctx: AudioContext, pcm: Int16Array, playhead: number): number {
    const buf = ctx.createBuffer(1, pcm.length, TTS_RATE);
    buf.copyToChannel(int16ToFloat32(pcm) as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.03, playhead);
    src.start(at);
    this.sources.push(src);
    src.onended = () => (this.sources = this.sources.filter((s) => s !== src));
    return at + buf.duration;
  }

  private waitUntil(ctx: AudioContext, playhead: number): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => {
        if (this.cancelled || ctx.currentTime >= playhead) resolve();
        else setTimeout(tick, 60);
      };
      tick();
    });
  }

  private speakBrowser(o: SpeakOptions): Promise<boolean> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(o.text);
      u.lang = "ko-KR";
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("ko"));
      if (voices.length) u.voice = voices[Math.abs(hash(o.voice)) % voices.length];
      u.rate = 1.02;
      u.onstart = () => o.onStart?.();
      u.onend = () => resolve(!this.cancelled);
      u.onerror = () => resolve(!this.cancelled);
      window.speechSynthesis.speak(u);
    });
  }

  /** 즉시 멈춤(지원자가 말을 끊었을 때) */
  stop(speakerId?: string) {
    this.cancelled = true;
    this.abort?.abort();
    this.abort = null;
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* noop */
      }
    });
    this.sources = [];
    if (speakerId) this.avatars?.clear(speakerId);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  close() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
