"use client";

import type { WordTiming } from "@/lib/types";
import type { MicCapture } from "../audio/mic";
import type { Stt, SttHandlers } from "./index";

type DgWord = { word: string; punctuated_word?: string; start: number; end: number };
type DgMessage =
  | {
      type: "Results";
      is_final: boolean;
      speech_final: boolean;
      start: number;
      duration: number;
      channel: { alternatives: { transcript: string; words: DgWord[] }[] };
    }
  | { type: "SpeechStarted"; timestamp: number }
  | { type: "UtteranceEnd"; last_word_end: number }
  | { type: "Metadata" }
  | { type: "Error"; description?: string };

/**
 * Deepgram Nova-3 실시간 STT. 마이크 PCM(linear16)을 그대로 보낸다.
 * Deepgram 시각(스트림 시작 기준)을 녹음 기준 시각으로 바꿔 돌려준다.
 */
export class DeepgramStt implements Stt {
  readonly kind = "deepgram" as const;
  private ws: WebSocket | null = null;
  private off: (() => void) | null = null;
  private offset = 0; // 녹음 기준 시각 = Deepgram 시각 + offset
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private retries = 0;

  constructor(
    private token: string,
    private mic: MicCapture,
    private h: SttHandlers,
  ) {}

  async start(): Promise<void> {
    this.closed = false;
    await this.connect();
  }

  private connect(): Promise<void> {
    const params = new URLSearchParams({
      model: "nova-3",
      language: "ko",
      encoding: "linear16",
      sample_rate: String(this.mic.sampleRate),
      channels: "1",
      interim_results: "true",
      smart_format: "true",
      punctuate: "true",
      vad_events: "true",
      utterance_end_ms: "2500",
      endpointing: "1500",
    });
    return new Promise((resolve) => {
      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["bearer", this.token]);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.retries = 0;
        this.offset = this.mic.now();
        this.off = this.mic.onFrame((f) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(f.pcm.buffer.slice(f.pcm.byteOffset, f.pcm.byteOffset + f.pcm.byteLength));
        });
        this.keepAlive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
        }, 5000);
        resolve();
      };
      ws.onmessage = (e) => this.handle(JSON.parse(String(e.data)) as DgMessage);
      ws.onerror = () => {
        if (!opened) resolve();
      };
      ws.onclose = () => {
        this.cleanup();
        if (!opened) this.h.onError?.("음성 인식 서버에 연결하지 못했습니다.");
        if (!this.closed && this.retries < 3) {
          this.retries++;
          setTimeout(() => {
            if (!this.closed) this.connect();
          }, 500 * this.retries);
        }
      };
    });
  }

  private handle(msg: DgMessage) {
    if (msg.type === "SpeechStarted") this.h.onSpeechStart?.();
    else if (msg.type === "UtteranceEnd") this.h.onUtteranceEnd?.();
    else if (msg.type === "Error") this.h.onError?.(msg.description ?? "음성 인식 오류");
    else if (msg.type === "Results") {
      const alt = msg.channel.alternatives[0];
      const text = alt?.transcript?.trim() ?? "";
      if (!text) {
        if (msg.speech_final || msg.is_final) this.h.onUtteranceEnd?.();
        return;
      }
      if (!msg.is_final) {
        this.h.onInterim?.(text);
        return;
      }
      const words: WordTiming[] = (alt.words ?? []).map((w) => ({
        word: w.punctuated_word ?? w.word,
        start: w.start + this.offset,
        end: w.end + this.offset,
      }));
      this.h.onFinal?.({
        text,
        words,
        start: (words[0]?.start ?? msg.start + this.offset),
        end: (words.at(-1)?.end ?? msg.start + msg.duration + this.offset),
      });
      if (msg.speech_final) this.h.onUtteranceEnd?.();
    }
  }

  private cleanup() {
    this.off?.();
    this.off = null;
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  stop() {
    this.closed = true;
    this.cleanup();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
      this.ws.close();
    }
    this.ws = null;
  }
}
