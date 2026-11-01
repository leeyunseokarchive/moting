import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSession } from "../src/client/api";
import { InterviewEngine, type EngineView } from "../src/client/interview/engine";

function engine() {
  const views: EngineView[] = [];
  const session = {
    id: "s1",
    plan: [],
    profile: {
      durationMin: 20,
      maxAnswerSec: 90,
      silenceToleranceSec: 5,
      interviewers: [{ id: "iv1", name: "면접관", voice: "Charon", pressure: 3, isLead: true }],
    },
  } as unknown as PublicSession;
  const deps = {
    session,
    mic: { now: () => 0, levels: [], setMuted() {}, startRecording() {}, close() {} },
    stt: { start: async () => {}, stop() {} },
    voice: { speak: async () => true, stop() {}, preload: async () => {}, close() {} },
    avatars: null,
    face: null,
    onView: (v: EngineView) => views.push(v),
    onFinished() {},
  } as unknown as ConstructorParameters<typeof InterviewEngine>[0];
  const e = new InterviewEngine(deps);
  (e as unknown as { view: EngineView }).view.phase = "listening";
  return { e, ended: () => views.some((v) => v.phase === "thinking") };
}

const segment = { text: "답변입니다", start: 0, end: 1, words: [] };

describe("답변 종료 대기", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("speech_final 뒤에 온 UtteranceEnd와 빈 결과가 마감을 뒤로 밀지 않는다", async () => {
    const { e, ended } = engine();
    e.onInterim("답변입니다");
    await vi.advanceTimersByTimeAsync(1500);
    e.onFinal(segment);
    e.onUtteranceEnd(); // speech_final (마지막 단어 후 1.5초)
    await vi.advanceTimersByTimeAsync(1000);
    e.onUtteranceEnd(); // UtteranceEnd (2.5초)
    await vi.advanceTimersByTimeAsync(1000);
    e.onUtteranceEnd(); // 침묵 중 빈 is_final (3.5초)
    await vi.advanceTimersByTimeAsync(1199);
    expect(ended()).toBe(false);
    await vi.advanceTimersByTimeAsync(1); // 4.7초
    expect(ended()).toBe(true);
    e.dispose();
  });

  it("자막은 새 질문의 소리가 날 때까지 이전 질문과 답변을 유지한다", async () => {
    const views: EngineView[] = [];
    let release = () => {};
    const e = new InterviewEngine({
      session: { id: "s1", plan: [], profile: { durationMin: 20, maxAnswerSec: 90, silenceToleranceSec: 5, interviewers: [{ id: "iv1", name: "면접관", voice: "Charon", pressure: 3, isLead: true }] } },
      mic: { now: () => 0, levels: [], setMuted() {}, startRecording() {}, close() {} },
      stt: { start: async () => {}, stop() {} },
      voice: {
        speak: (o: { onStart?: () => void }) =>
          new Promise<boolean>((resolve) => {
            release = () => {
              o.onStart?.();
              resolve(true);
            };
          }),
        stop() {},
        preload: async () => {},
        close() {},
      },
      avatars: null,
      face: null,
      onView: (v: EngineView) => views.push(v),
      onFinished() {},
    } as unknown as ConstructorParameters<typeof InterviewEngine>[0]);
    (e as unknown as { view: EngineView }).view.phase = "listening";
    e.onFinal(segment);
    expect(views.at(-1)?.answer).toBe("답변입니다");

    const say = (e as unknown as { say: (a: unknown, phase: string) => Promise<void> }).say.bind(e);
    const done = say({ speakerId: "iv1", say: "다음 질문", kind: "question", planId: null, waitMotion: "still", backchannel: false, end: false }, "next");
    await vi.advanceTimersByTimeAsync(0);
    expect(views.at(-1)).toMatchObject({ phase: "speaking", lastQuestion: "", answer: "답변입니다" });
    release();
    await done;
    expect(views.at(-1)).toMatchObject({ lastQuestion: "다음 질문", answer: "" });
    e.dispose();
  });

  it("면접관 발화가 끝나면 다음 차례 면접관의 아바타를 연결해 둔다", async () => {
    const retain = vi.fn(async () => {});
    const session = {
      id: "s1",
      plan: [],
      profile: {
        durationMin: 20,
        maxAnswerSec: 90,
        silenceToleranceSec: 5,
        interviewers: [
          { id: "iv1", name: "주", voice: "Charon", pressure: 3, isLead: true },
          { id: "iv2", name: "부", voice: "Kore", pressure: 3, isLead: false },
        ],
      },
    };
    const e = new InterviewEngine({
      session,
      mic: { now: () => 0, levels: [], setMuted() {}, startRecording() {}, close() {} },
      stt: { start: async () => {}, stop() {} },
      voice: { speak: async () => true, stop() {}, preload: async () => {}, close() {} },
      avatars: { retain, ensure: async () => true, closeAll: async () => {} },
      face: null,
      onView() {},
      onFinished() {},
    } as unknown as ConstructorParameters<typeof InterviewEngine>[0]);
    const say = (e as unknown as { say: (a: unknown, phase: string) => Promise<void> }).say.bind(e);
    await say({ speakerId: "iv1", say: "질문", kind: "question", planId: null, waitMotion: "nod", backchannel: false, end: false }, "next");
    expect((retain.mock.calls.at(-1) as unknown as [string[]])[0][0]).toBe("iv2");
    e.dispose();
  });
});
