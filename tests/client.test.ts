import { describe, expect, it } from "vitest";
import { Pcm16Accumulator, resampleInt16 } from "../src/client/audio/pcm";
import { countFillers, faceMetrics, locateWords, paceLabel, voiceMetrics } from "../src/client/metrics";

describe("resampleInt16", () => {
  it("24k → 16k는 길이가 2/3이 되고 값이 보간된다", () => {
    const input = new Int16Array([0, 300, 600, 900, 1200, 1500]);
    const out = resampleInt16(input, 24000, 16000);
    expect(out.length).toBe(4);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(450);
  });
  it("같은 비율이면 복사본", () => {
    const input = new Int16Array([1, 2, 3]);
    const out = resampleInt16(input, 16000, 16000);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(out).not.toBe(input);
  });
});

describe("Pcm16Accumulator", () => {
  it("홀수 바이트 청크를 이어 붙인다", () => {
    const acc = new Pcm16Accumulator();
    const a = acc.push(new Uint8Array([1, 0, 2]));
    const b = acc.push(new Uint8Array([0, 3, 0]));
    expect(Array.from(a)).toEqual([1]);
    expect(Array.from(b)).toEqual([2, 3]);
  });
});

describe("voiceMetrics", () => {
  const words = [
    { word: "음", start: 2.0, end: 2.2 },
    { word: "저는", start: 2.4, end: 2.8 },
    { word: "백엔드를", start: 2.9, end: 3.5 },
    { word: "맡았습니다.", start: 3.6, end: 4.4 },
    { word: "어", start: 7.0, end: 7.2 },
    { word: "그래서", start: 7.3, end: 7.8 },
  ];
  it("지연, 습관어, 긴 침묵을 센다", () => {
    const m = voiceMetrics(words, [[3, -25], [4, -27], [7.5, -30]], 1.0);
    expect(m.latencySec).toBeCloseTo(1.0);
    expect(m.fillerCount).toBe(2);
    expect(m.longPauses).toBe(1);
    expect(m.avgDb).toBeLessThan(-24);
    expect(m.syllablesPerMin).toBeGreaterThan(100);
  });
  it("빈 답변은 0", () => {
    expect(voiceMetrics([], [], 0).durationSec).toBe(0);
  });
  it("습관어는 단독 어절만", () => {
    expect(countFillers([{ word: "음식을", start: 0, end: 1 }]).count).toBe(0);
  });
  it("속도 라벨", () => {
    expect(paceLabel(200)).toBe("느림");
    expect(paceLabel(300)).toBe("적당");
    expect(paceLabel(420)).toBe("빠름");
  });
});

describe("locateWords", () => {
  it("같은 단어가 반복돼도 순서대로 자기 위치를 찾고, 본문에 없는 단어는 건너뛴다", () => {
    const words = ["락을", "없음", "락을"].map((word, i) => ({ word, start: i, end: i + 1 }));
    expect(locateWords("락을 쓰고 락을 뺐다", words)).toEqual([
      { from: 0, to: 2, start: 0 },
      { from: 6, to: 8, start: 2 },
    ]);
  });
});

describe("faceMetrics", () => {
  it("구간 안 샘플로 시선 이탈 비율과 깜빡임을 센다", () => {
    const s = [0, 1, 2, 3].map((t) => ({ t, away: t === 2, nose: [0.5, 0.5] as [number, number], smile: 0, blink: t % 2 ? 0.8 : 0.1 }));
    const m = faceMetrics(s, 0, 3)!;
    expect(m.gazeAwayRatio).toBeCloseTo(0.25);
    expect(m.blinkPerMin).toBeCloseTo(40);
  });
});
