import type { FaceMetrics, VoiceMetrics, WordTiming } from "@/lib/types";

/** 한국어 습관어(단독 어절일 때만 센다) */
export const FILLER_WORDS = ["음", "어", "으음", "어어", "그", "저", "뭐", "약간", "이제", "그러니까", "막", "아"];

const HANGUL = /[가-힣]/g;

function clean(word: string): string {
  return word.replace(/[.,!?…~"'“”‘’()]/g, "").trim();
}

export function countFillers(words: WordTiming[]): { count: number; list: string[] } {
  const list: string[] = [];
  for (const w of words) {
    const c = clean(w.word);
    if (FILLER_WORDS.includes(c)) list.push(c);
  }
  return { count: list.length, list };
}

/** 전사 단어를 답변 글자 위치에 맞춘다. 본문에서 못 찾은 단어는 건너뛴다 */
export function locateWords(text: string, words: WordTiming[]): { from: number; to: number; start: number }[] {
  let cursor = 0;
  return words.flatMap((w) => {
    const from = text.indexOf(w.word, cursor);
    if (from < 0) return [];
    cursor = from + w.word.length;
    return [{ from, to: cursor, start: w.start }];
  });
}

/**
 * 답변 하나의 말하기 지표.
 * @param words 녹음 기준 초 단위 단어 타이밍
 * @param levels 답변 구간의 [시각(초), dBFS] 샘플(말하는 구간만 평균)
 * @param questionEndSec 질문이 끝난 시각(녹음 기준)
 */
export function voiceMetrics(
  words: WordTiming[],
  levels: [number, number][],
  questionEndSec: number,
): VoiceMetrics {
  if (words.length === 0) {
    return { durationSec: 0, avgDb: -100, dbStdev: 0, syllablesPerMin: 0, fillerCount: 0, fillers: [], latencySec: 0, longPauses: 0 };
  }
  const start = words[0].start;
  const end = words[words.length - 1].end;
  const durationSec = Math.max(0.1, end - start);
  const syllables = words.reduce((n, w) => n + (clean(w.word).match(HANGUL)?.length ?? Math.ceil(clean(w.word).length / 2)), 0);

  let longPauses = 0;
  let pausedSec = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= 2) longPauses++;
    if (gap > 0.3) pausedSec += gap;
  }
  const speakingMin = Math.max(0.05, (durationSec - pausedSec) / 60);

  const voiced = levels.filter(([t, db]) => t >= start && t <= end && db > -55).map(([, db]) => db);
  const avgDb = voiced.length ? voiced.reduce((a, b) => a + b, 0) / voiced.length : -100;
  const dbStdev = voiced.length
    ? Math.sqrt(voiced.reduce((s, db) => s + (db - avgDb) ** 2, 0) / voiced.length)
    : 0;
  const { count, list } = countFillers(words);

  return {
    durationSec,
    avgDb,
    dbStdev,
    syllablesPerMin: syllables / speakingMin,
    fillerCount: count,
    fillers: list,
    latencySec: Math.max(0, start - questionEndSec),
    longPauses,
  };
}

/** 말하기 속도 해석(한국어 기준 분당 음절) */
export function paceLabel(spm: number): "느림" | "적당" | "빠름" {
  if (spm < 230) return "느림";
  if (spm > 380) return "빠름";
  return "적당";
}

/** 목소리 크기 해석(dBFS, 마이크 자동 게인 고려한 대략값) */
export function loudnessLabel(db: number): "작음" | "적당" | "큼" {
  if (db < -38) return "작음";
  if (db > -16) return "큼";
  return "적당";
}

export type FaceSample = { t: number; away: boolean; nose: [number, number]; smile: number; blink: number };

export function faceMetrics(samples: FaceSample[], fromSec: number, toSec: number): FaceMetrics | undefined {
  const s = samples.filter((x) => x.t >= fromSec && x.t <= toSec);
  if (s.length < 3) return undefined;
  let move = 0;
  for (let i = 1; i < s.length; i++) {
    move += Math.hypot(s[i].nose[0] - s[i - 1].nose[0], s[i].nose[1] - s[i - 1].nose[1]);
  }
  let blinks = 0;
  for (let i = 1; i < s.length; i++) if (s[i].blink > 0.55 && s[i - 1].blink <= 0.55) blinks++;
  const minutes = Math.max(1 / 60, (toSec - fromSec) / 60);
  return {
    samples: s.length,
    gazeAwayRatio: s.filter((x) => x.away).length / s.length,
    headMovement: move / s.length,
    smileRatio: s.filter((x) => x.smile > 0.45).length / s.length,
    blinkPerMin: blinks / minutes,
  };
}
