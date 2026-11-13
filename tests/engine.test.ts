import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSession } from "../src/client/api";
import { InterviewEngine, looksUnfinished, type EngineView } from "../src/client/interview/engine";

function engine(over: Record<string, unknown> = {}, maxAnswerSec = 90) {
  const views: EngineView[] = [];
  const session = {
    id: "s1",
    plan: [],
    profile: {
      durationMin: 20,
      maxAnswerSec,
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
    ...over,
  } as unknown as ConstructorParameters<typeof InterviewEngine>[0];
  const e = new InterviewEngine(deps);
  (e as unknown as { view: EngineView }).view.phase = "listening";
  return { e, views, ended: () => views.some((v) => v.phase === "thinking") };
}

/** 면접관이 mic 시각 10초에 말하기 시작한 상태. finish()를 부르면 발화가 끝난다 */
async function speaking() {
  const clock = { sec: 10 };
  const stop = vi.fn();
  let finish = () => {};
  const ctx = engine({
    mic: { now: () => clock.sec, levels: [], setMuted() {}, startRecording() {}, close() {} },
    voice: {
      speak: (o: { onStart?: () => void }) =>
        new Promise<boolean>((resolve) => {
          o.onStart?.();
          finish = () => resolve(true);
        }),
      stop,
      preload: async () => {},
      close() {},
    },
  });
  const say = (ctx.e as unknown as { say: (a: unknown, phase: string) => Promise<void> }).say.bind(ctx.e);
  const done = say({ speakerId: "iv1", say: "다음 질문", kind: "question", planId: null, waitMotion: "still", backchannel: false, end: false }, "next");
  await vi.advanceTimersByTimeAsync(1000); // 조기 답변 판정(800ms)을 넘긴다
  clock.sec = 11;
  return { ...ctx, stop, clock, finish: () => (finish(), done) };
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

  it("면접관 음성이 나기 전에 한 말이 늦게 도착해도 말을 끊거나 답변으로 받지 않는다", async () => {
    const { e, views, stop } = await speaking();
    e.onInterim("이전 답변의 꼬리", 9.2);
    e.onFinal({ text: "이전 답변의 꼬리", start: 9.2, end: 10.3, words: [] }); // 허용 오차(0.5초) 안에서 끝난 말
    expect(stop).not.toHaveBeenCalled();
    expect(views.at(-1)).toMatchObject({ phase: "speaking", answer: "", interim: "" });
    e.dispose();
  });

  it("질문 도중에 실제로 시작한 답변은 면접관을 멈추고 받아 적는다", async () => {
    const { e, views, stop } = await speaking();
    e.onInterim("네 저는", 10.8);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(views.at(-1)).toMatchObject({ phase: "listening", interim: "네 저는" });
    e.onFinal({ text: "네 저는 그렇게 생각합니다", start: 10.8, end: 12, words: [] });
    expect(views.at(-1)?.answer).toBe("네 저는 그렇게 생각합니다");
    e.dispose();
  });

  it("시각이 없는 중간 결과(WebSpeech)는 예전처럼 조기 답변으로 본다", async () => {
    const { e, views, stop } = await speaking();
    e.onInterim("네");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(views.at(-1)?.phase).toBe("listening");
    e.dispose();
  });

  it("듣는 중에 도착한 이전 발화의 확정 결과는 답변에 붙이지 않는다", async () => {
    const { e, views, finish, clock } = await speaking();
    clock.sec = 14;
    await finish();
    expect(views.at(-1)?.phase).toBe("listening");
    e.onFinal({ text: "이전 답변의 꼬리", start: 8, end: 9.6, words: [] });
    expect(views.at(-1)).toMatchObject({ answer: "", answering: false, endAt: null });
    e.onFinal({ text: "새 답변입니다", start: 14.5, end: 15.5, words: [] });
    expect(views.at(-1)?.answer).toBe("새 답변입니다");
    e.dispose();
  });

  it("문장이 끝나지 않은 채 멈추면 한 번만 더 기다린다", async () => {
    const { e, views, ended } = engine();
    e.onFinal({ ...segment, text: "프로젝트를 진행했는데." });
    // 처음부터 연장분까지 더한 실제 마감 시각을 알리고, 연장이 시작돼도 그 시각이 바뀌지 않는다
    const announced = performance.now() + 3800 + 2800;
    expect(views.at(-1)?.endAt).toBe(announced);
    await vi.advanceTimersByTimeAsync(3800);
    expect(ended()).toBe(false);
    expect(views.at(-1)?.endAt).toBe(announced);
    await vi.advanceTimersByTimeAsync(2799);
    expect(ended()).toBe(false);
    await vi.advanceTimersByTimeAsync(1); // 여전히 미완성이어도 두 번은 미루지 않는다
    expect(ended()).toBe(true);
    e.dispose();
  });

  it("미룬 뒤 다시 말하면 다음 침묵에서 또 한 번 미룰 수 있다", async () => {
    const { e, ended } = engine();
    e.onFinal({ ...segment, text: "프로젝트를 진행했는데" });
    await vi.advanceTimersByTimeAsync(3800 + 1000);
    e.onFinal({ ...segment, text: "그래서" });
    await vi.advanceTimersByTimeAsync(3800 + 2799);
    expect(ended()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ended()).toBe(true);
    e.dispose();
  });

  it("답변 마침 버튼과 최대 답변 시간은 미완성 문장이어도 미뤄지지 않는다", async () => {
    const a = engine();
    a.e.onFinal({ ...segment, text: "제가 맡은 역할은" });
    a.e.finishAnswer();
    expect(a.ended()).toBe(true);
    a.e.dispose();

    const b = engine({}, 3);
    b.e.onFinal({ ...segment, text: "제가 맡은 역할은" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(b.ended()).toBe(true);
    b.e.dispose();
  });

  it("endAt은 마감 타이머의 예정 시각을 따르고, 타이머가 없으면 null이다", async () => {
    const { e, views } = engine();
    const t0 = performance.now();
    e.onInterim("답변");
    expect(views.at(-1)?.endAt).toBe(t0 + 5000);
    await vi.advanceTimersByTimeAsync(500);
    e.onFinal(segment);
    expect(views.at(-1)?.endAt).toBe(t0 + 500 + 3800);
    await vi.advanceTimersByTimeAsync(400);
    e.onUtteranceEnd(); // 마감을 당긴다
    expect(views.at(-1)?.endAt).toBe(t0 + 900 + 3200);
    e.pause();
    expect(views.at(-1)).toMatchObject({ phase: "paused", endAt: null });
    e.resume();
    e.onFinal(segment);
    expect(views.at(-1)?.endAt).toBe(performance.now() + 3800);
    await vi.advanceTimersByTimeAsync(3800);
    expect(views.at(-1)).toMatchObject({ phase: "thinking", endAt: null });
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

describe("looksUnfinished", () => {
  it.each([
    "프로젝트를 진행했는데.",
    "성능을 개선하고",
    "데이터를 수집해서,",
    "일정이 밀렸지만",
    "문제가 생기면",
    "그 이유는",
    "서버 구조를",
    "배포했습니다. 그리고",
    "그렇게 한 이유는 음...",
    "그 일정 때문에",
  ])("끝나지 않은 말: %s", (text) => expect(looksUnfinished(text)).toBe(true));

  it.each(["프로젝트를 진행했습니다.", "그렇게 생각해요", "맞죠?", "네", "잘 모르겠습니다", "이상입니다.", ""])(
    "끝난 말: %s",
    (text) => expect(looksUnfinished(text)).toBe(false),
  );
});
