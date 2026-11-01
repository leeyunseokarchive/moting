import { describe, expect, it } from "vitest";
import { fallbackAction, nextPlanned, normalizeAction } from "../src/lib/pipeline/director";
import { nextSpeaker } from "../src/lib/interviewers";
import { EnvironmentProfileSchema, type QuestionPlanItem, type TranscriptEntry } from "../src/lib/types";

const profile = EnvironmentProfileSchema.parse({
  company: "한빛전자",
  job: "소프트웨어 개발",
  stage: "1차 실무면접",
  format: "다대일 2:1",
  durationMin: 20,
  atmosphere: "차분",
  pressure: 3,
  interruptRate: "mid",
  silenceToleranceSec: 5,
  followupDepth: 2,
  maxAnswerSec: 90,
  interviewers: [
    { id: "iv1", name: "박도현 팀장", role: "실무 리드", faceId: "f1", portrait: "", voice: "Charon", gender: "male", isLead: true },
    { id: "iv2", name: "김서연 과장", role: "인사", faceId: "f2", portrait: "", voice: "Kore", gender: "female" },
  ],
  confidence: 0.5,
});
const plan: QuestionPlanItem[] = [
  { id: "q_a", interviewerId: "iv1", question: "프로젝트 역할을 설명해 주세요.", intent: "", source: "review" },
  { id: "q_b", interviewerId: "iv2", question: "지원 동기는?", intent: "", source: "general" },
];

describe("normalizeAction", () => {
  it("없는 면접관 id는 주 질문자로 바꾼다", () => {
    const a = normalizeAction({ speakerId: "ghost", say: "좋아요", kind: "followup" }, profile, plan, []);
    expect(a.speakerId).toBe("iv1");
  });

  it("빈 발화는 다음 계획 질문으로 채운다", () => {
    const a = normalizeAction({ speakerId: "iv1", say: "  ", kind: "question" }, profile, plan, []);
    expect(a.say).toBe("프로젝트 역할을 설명해 주세요.");
    expect(a.planId).toBe("q_a");
  });

  it("이미 쓴 planId는 지운다", () => {
    const t: TranscriptEntry[] = [{ speaker: "iv1", text: "x", at: 0, kind: "question", planId: "q_a" }];
    const a = normalizeAction({ speakerId: "iv1", say: "다시", kind: "question", planId: "q_a" }, profile, plan, t);
    expect(a.planId).toBeNull();
  });

  it("따옴표와 번호를 벗긴다", () => {
    const a = normalizeAction({ speakerId: "iv2", say: '"1. 지원 동기가 뭔가요?"', kind: "question" }, profile, plan, []);
    expect(a.say).toBe("지원 동기가 뭔가요?");
  });

  it("planId가 있는데 전환 멘트만 있고 질문이 빠진 경우 계획 질문을 이어 붙인다", () => {
    const a = normalizeAction(
      { speakerId: "iv1", say: "네, 자기소개 잘 들었습니다. 그럼 바로 첫 번째 기술적인 내용부터 확인해 보겠습니다.", kind: "question", planId: "q_a" },
      profile,
      plan,
      [],
    );
    expect(a.say).toContain("프로젝트 역할을 설명해 주세요.");
  });

  it("첫 질문이 자기소개면 opening에 planId를 연결하고 마지막 할 말은 closing으로 처리한다", () => {
    const bookendedPlan: QuestionPlanItem[] = [
      { id: "q_intro", interviewerId: "iv1", question: "1분 자기소개를 부탁드립니다.", intent: "", source: "general" },
      ...plan,
      { id: "q_outro", interviewerId: "iv2", question: "마지막으로 하고 싶은 말씀 있으신가요?", intent: "", source: "general" },
    ];
    const open = normalizeAction({ speakerId: "iv1", say: "반갑습니다. 1분 자기소개 부탁드립니다.", kind: "opening" }, profile, bookendedPlan, []);
    expect(open.planId).toBe("q_intro");

    const close = normalizeAction(
      { speakerId: "iv2", say: "마지막으로 하고 싶은 말씀 있으신가요?", kind: "question", planId: "q_outro" },
      profile,
      bookendedPlan,
      [],
    );
    expect(close.kind).toBe("closing");
  });

  it("계획 질문은 LLM이 고른 화자와 달라도 담당 면접관이 묻는다", () => {
    const a = normalizeAction({ speakerId: "iv1", say: "지원 동기를 말씀해 주시겠어요?", kind: "question", planId: "q_b" }, profile, plan, []);
    expect(a.speakerId).toBe("iv2");
  });
});

describe("발언 비율", () => {
  const trio = EnvironmentProfileSchema.parse({
    ...profile,
    interviewers: [...profile.interviewers, { id: "iv3", name: "이준호 상무", role: "임원", faceId: "f3", portrait: "", voice: "Orus", gender: "male" }],
  });
  const leadOnly: QuestionPlanItem[] = Array.from({ length: 12 }, (_, i) => ({
    id: `q_${i}`,
    interviewerId: "iv1",
    question: `질문 ${i}`,
    intent: "",
    source: "resume" as const,
  }));

  function run(p: typeof profile, answer: string, turns: number) {
    const t: TranscriptEntry[] = [];
    for (let i = 0; i < turns; i++) {
      const a = fallbackAction({ phase: i === 0 ? "opening" : "next", elapsedSec: i * 60 }, p, leadOnly, t);
      t.push({ speaker: a.speakerId, text: a.say, at: i, kind: a.kind, planId: a.planId ?? undefined });
      t.push({ speaker: "candidate", text: answer, at: i, kind: "answer" });
    }
    const counts = Object.fromEntries(p.interviewers.map((iv) => [iv.id, t.filter((x) => x.speaker === iv.id).length]));
    return { t, counts };
  }
  const concrete = "응답 시간을 1.2초에서 0.4초로 줄였고, 부하 테스트로 측정했습니다. 캐시 계층도 직접 설계해 적용했습니다. 결과는 대시보드로 확인했습니다.";

  it("질문이 주 질문자에게 몰려 있어도 2인은 4:3으로 말한다", () => {
    expect(run(profile, concrete, 14).counts).toEqual({ iv1: 8, iv2: 6 });
  });

  it("3인은 4:3:3으로 말한다", () => {
    expect(run(trio, concrete, 10).counts).toEqual({ iv1: 4, iv2: 3, iv3: 3 });
  });

  it("꼬리질문도 다른 면접관이 이어받는다", () => {
    const { t } = run(trio, "열심히 했습니다.", 7);
    const followups = t.filter((x) => x.kind === "followup").map((x) => x.speaker);
    expect(new Set(followups).size).toBeGreaterThan(1);
  });

  it("LLM이 고른 꼬리질문 화자보다 차례를 우선한다", () => {
    const t: TranscriptEntry[] = [{ speaker: "iv1", text: "역할은?", at: 0, kind: "question", planId: "q_a" }];
    expect(normalizeAction({ speakerId: "iv1", say: "수치로 설명해 주시겠어요?", kind: "followup" }, profile, plan, t).speakerId).toBe("iv2");
  });

  it("질문을 다 쓴 면접관의 차례면 남은 질문을 넘겨받는다", () => {
    const t: TranscriptEntry[] = [{ speaker: "iv1", text: "질문", at: 0, kind: "question", planId: "q_0" }];
    const next = nextPlanned(profile, leadOnly, t);
    expect(next?.interviewerId).toBe("iv2");
    expect(normalizeAction({ speakerId: "iv1", say: "다음 질문은 무엇인가요?", kind: "question", planId: next?.id }, profile, leadOnly, t).speakerId).toBe("iv2");
  });

  it("재촉 같은 짧은 반응은 발언 수에 넣지 않는다", () => {
    const t: TranscriptEntry[] = [
      { speaker: "iv1", text: "질문", at: 0, kind: "question" },
      { speaker: "iv2", text: "천천히 말씀하세요", at: 1, kind: "reaction" },
    ];
    expect(nextSpeaker(profile.interviewers, t).id).toBe("iv2");
  });
});

describe("nextPlanned", () => {
  const leadFirst: QuestionPlanItem[] = [
    { id: "q_1", interviewerId: "iv1", question: "역할은?", intent: "", source: "resume" },
    { id: "q_2", interviewerId: "iv1", question: "장애 경험은?", intent: "", source: "resume" },
    { id: "q_3", interviewerId: "iv2", question: "지원 동기는?", intent: "", source: "general" },
    { id: "q_end", interviewerId: "iv2", question: "마지막으로 하고 싶은 말씀 있으신가요?", intent: "", source: "general" },
  ];
  const opened: TranscriptEntry[] = [{ speaker: "iv1", text: "역할은?", at: 0, kind: "question", planId: "q_1" }];

  it("주 질문자 질문이 앞에 몰려 있어도 덜 말한 면접관을 먼저 고른다", () => {
    expect(nextPlanned(profile, leadFirst, opened)?.id).toBe("q_3");
  });

  it("마무리 질문은 다른 질문을 다 쓴 뒤에만 고른다", () => {
    const asked: TranscriptEntry[] = [...opened, { speaker: "iv2", text: "지원 동기는?", at: 1, kind: "question", planId: "q_3" }];
    expect(nextPlanned(profile, leadFirst, asked)?.id).toBe("q_2");
    expect(nextPlanned(profile, leadFirst, [...asked, { speaker: "iv1", text: "장애 경험은?", at: 2, kind: "question", planId: "q_2" }])?.id).toBe("q_end");
  });

  it("규칙 기반 진행도 같은 순서를 따른다", () => {
    const t: TranscriptEntry[] = [
      ...opened,
      { speaker: "candidate", text: "백엔드 API를 맡아 응답 시간을 1.2초에서 0.4초로 줄였고, 캐시 계층을 직접 설계했습니다. 측정은 부하 테스트로 했습니다.", at: 1, kind: "answer" },
    ];
    expect(fallbackAction({ phase: "next", elapsedSec: 60 }, profile, leadFirst, t).speakerId).toBe("iv2");
  });
});

describe("fallbackAction", () => {
  it("모호한 답변엔 꼬리질문, 구체적이면 다음 질문", () => {
    const base: TranscriptEntry[] = [
      { speaker: "iv1", text: "프로젝트 역할을 설명해 주세요.", at: 0, kind: "question", planId: "q_a" },
    ];
    const vague = fallbackAction({ phase: "next", elapsedSec: 60 }, profile, plan, [
      ...base,
      { speaker: "candidate", text: "열심히 했습니다.", at: 1, kind: "answer" },
    ]);
    expect(vague.kind).toBe("followup");
    const concrete = fallbackAction({ phase: "next", elapsedSec: 60 }, profile, plan, [
      ...base,
      { speaker: "candidate", text: "백엔드 API를 맡아 응답 시간을 1.2초에서 0.4초로 줄였고, 캐시 계층을 직접 설계했습니다. 측정은 부하 테스트로 했습니다.", at: 1, kind: "answer" },
    ]);
    expect(concrete.kind).toBe("question");
    expect(concrete.planId).toBe("q_b");
    expect(concrete.speakerId).toBe("iv2");
  });
});
