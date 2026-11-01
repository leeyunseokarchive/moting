"use client";

import type { MicCapture } from "../audio/mic";
import type { Stt, SttHandlers } from "./index";

type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onspeechstart: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function ctor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * 데모용 대체 STT(브라우저 내장). 단어 타이밍이 없어 발화 시간을 균등 분배해 추정한다.
 */
export class WebSpeechStt implements Stt {
  readonly kind = "webspeech" as const;
  private rec: SR | null = null;
  private stopped = false;
  private segStart = 0;

  static supported() {
    return ctor() !== null;
  }

  constructor(
    private mic: MicCapture,
    private h: SttHandlers,
  ) {}

  async start() {
    const C = ctor();
    if (!C) return;
    this.stopped = false;
    const rec = new C();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onspeechstart = () => {
      this.segStart = this.mic.now();
      this.h.onSpeechStart?.();
    };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (!r.isFinal) {
          if (!this.segStart) this.segStart = this.mic.now();
          this.h.onInterim?.(text);
          continue;
        }
        const end = this.mic.now();
        const start = this.segStart || Math.max(0, end - text.length * 0.18);
        const tokens = text.split(/\s+/);
        const step = (end - start) / Math.max(1, tokens.length);
        this.h.onFinal?.({
          text,
          start,
          end,
          words: tokens.map((w, k) => ({ word: w, start: start + k * step, end: start + (k + 1) * step })),
        });
        this.segStart = 0;
        this.h.onUtteranceEnd?.();
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") this.h.onError?.("마이크 권한이 필요합니다.");
    };
    rec.onend = () => {
      if (!this.stopped) {
        try {
          rec.start();
        } catch {
          /* 이미 시작됨 */
        }
      }
    };
    this.rec = rec;
    rec.start();
  }

  stop() {
    this.stopped = true;
    try {
      this.rec?.stop();
    } catch {
      /* noop */
    }
    this.rec = null;
  }
}
