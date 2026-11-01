"use client";

import type { WordTiming } from "@/lib/types";
import type { MicCapture } from "../audio/mic";
import { DeepgramStt } from "./deepgram";
import { WebSpeechStt } from "./webspeech";

export type FinalSegment = { text: string; words: WordTiming[]; start: number; end: number };

export type SttHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (seg: FinalSegment) => void;
  onSpeechStart?: () => void;
  onUtteranceEnd?: () => void;
  onError?: (message: string) => void;
};

export interface Stt {
  readonly kind: "deepgram" | "webspeech" | "none";
  start(): Promise<void>;
  stop(): void;
}

/** Deepgram 임시 토큰을 받으면 Deepgram, 아니면 브라우저 음성 인식 */
export async function createStt(mic: MicCapture, handlers: SttHandlers): Promise<Stt> {
  try {
    const res = await fetch("/api/tokens/deepgram", { method: "POST" });
    if (res.status === 200) {
      const { token } = (await res.json()) as { token: string };
      return new DeepgramStt(token, mic, handlers);
    }
  } catch {
    /* 대체로 진행 */
  }
  if (WebSpeechStt.supported()) return new WebSpeechStt(mic, handlers);
  return { kind: "none", start: async () => handlers.onError?.("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해 주세요."), stop: () => {} };
}
