import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepgramStt, listenParams } from "../src/client/stt/deepgram";

describe("Deepgram 연결 쿼리", () => {
  it("smart_format 없이 punctuate만 켠다", () => {
    const p = listenParams(48000);
    expect(p.has("smart_format")).toBe(false);
    expect(p.get("punctuate")).toBe("true");
    expect(p.get("sample_rate")).toBe("48000");
    expect(p.has("keyterm")).toBe(false);
  });

  it("keyterm을 반복 파라미터로 붙이고 빈 값·중복은 뺀다", () => {
    const p = listenParams(48000, ["구조해석", " Kubernetes ", "", "구조해석"]);
    expect(p.getAll("keyterm")).toEqual(["구조해석", "Kubernetes"]);
    expect(p.toString()).toContain("keyterm=%EA%B5%AC%EC%A1%B0%ED%95%B4%EC%84%9D&keyterm=Kubernetes");
  });

  it("50개·300자를 넘기지 않는다", () => {
    expect(listenParams(48000, Array.from({ length: 80 }, (_, i) => `용어${i}`)).getAll("keyterm")).toHaveLength(50);
    const long = listenParams(48000, ["가".repeat(200), "나".repeat(200), "다".repeat(100), "라"]).getAll("keyterm");
    expect(long).toEqual(["가".repeat(200), "다".repeat(100)]);
  });
});

describe("DeepgramStt", () => {
  class FakeWs {
    static OPEN = 1;
    static made: FakeWs[] = [];
    readyState = 0;
    onopen = () => {};
    onclose = () => {};
    onerror = () => {};
    onmessage = (_e: { data: string }) => {};
    constructor(public url: string) {
      FakeWs.made.push(this);
    }
    send() {}
    close() {}
  }
  const mic = { sampleRate: 48000, now: () => 10, onFrame: () => () => {} } as unknown as ConstructorParameters<typeof DeepgramStt>[1];

  afterEach(() => {
    FakeWs.made = [];
    vi.unstubAllGlobals();
  });

  it("keyterm을 넣은 연결이 열리기 전에 닫히면 keyterm 없이 한 번 더 연결한다", async () => {
    vi.stubGlobal("WebSocket", FakeWs);
    const onError = vi.fn();
    const stt = new DeepgramStt("t", mic, { onError }, ["구조해석"]);
    let started = false;
    const start = stt.start().then(() => (started = true));
    expect(FakeWs.made[0].url).toContain("keyterm=");
    FakeWs.made[0].onerror();
    FakeWs.made[0].onclose();
    await Promise.resolve();
    expect(started).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(FakeWs.made).toHaveLength(2);
    expect(FakeWs.made[1].url).not.toContain("keyterm");
    FakeWs.made[1].readyState = 1;
    FakeWs.made[1].onopen();
    await start;
    stt.stop();
  });

  it("음소거로 프레임이 끊겨도 단어 시각이 녹음 기준과 어긋나지 않는다", async () => {
    vi.stubGlobal("WebSocket", FakeWs);
    let push = (_f: { pcm: Int16Array; db: number; t: number }) => {};
    const live = {
      sampleRate: 48000,
      now: () => 0,
      onFrame: (fn: typeof push) => ((push = fn), () => {}),
    } as unknown as ConstructorParameters<typeof DeepgramStt>[1];
    const onFinal = vi.fn();
    const stt = new DeepgramStt("t", live, { onFinal });
    const start = stt.start();
    FakeWs.made[0].readyState = 1;
    FakeWs.made[0].onopen();
    await start;
    const second = () => new Int16Array(48000);
    // 5초 보내고, 30초 음소거(프레임 없음) 뒤 다시 1초를 보낸다. Deepgram 시계는 6초, 녹음 시계는 36초다
    for (let t = 1; t <= 5; t++) push({ pcm: second(), db: -30, t });
    push({ pcm: second(), db: -30, t: 36 });
    FakeWs.made[0].onmessage({
      data: JSON.stringify({
        type: "Results",
        is_final: true,
        speech_final: false,
        start: 5,
        duration: 1,
        channel: { alternatives: [{ transcript: "네", words: [{ word: "네", start: 5.2, end: 5.6 }] }] },
      }),
    });
    expect(onFinal.mock.calls[0][0].start).toBeCloseTo(35.2);
    stt.stop();
  });

  it("중간 결과에 첫 단어 시각을 녹음 기준으로 실어 보낸다", async () => {
    vi.stubGlobal("WebSocket", FakeWs);
    const onInterim = vi.fn();
    const stt = new DeepgramStt("t", mic, { onInterim });
    const start = stt.start();
    FakeWs.made[0].readyState = 1;
    FakeWs.made[0].onopen();
    await start;
    FakeWs.made[0].onmessage({
      data: JSON.stringify({
        type: "Results",
        is_final: false,
        speech_final: false,
        start: 1,
        duration: 1,
        channel: { alternatives: [{ transcript: "구조", words: [{ word: "구조", start: 1.25, end: 1.5 }] }] },
      }),
    });
    expect(onInterim).toHaveBeenCalledWith("구조", 11.25);
    stt.stop();
  });
});
