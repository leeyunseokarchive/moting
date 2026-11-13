import { describe, expect, it } from "vitest";
import { evalUserPrompt, fallbackReport } from "../src/lib/pipeline/evaluate";
import { EnvironmentProfileSchema, ParsedInputSchema, type AnswerRecord } from "../src/lib/types";

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
  evaluationPoints: ["문제 해결"],
  interviewers: [{ id: "iv1", name: "박도현 팀장", role: "실무 리드", faceId: "f1", portrait: "", voice: "Charon", gender: "male", isLead: true }],
  confidence: 0.5,
});

const answer = (question: string, score: number, weaknesses: string[] = []): AnswerRecord => ({
  id: question,
  questionEntryIndex: 0,
  interviewerId: "iv1",
  question,
  answer: "백엔드 9조를 맡았습니다.",
  startSec: 0,
  endSec: 10,
  words: [],
  interrupted: false,
  voice: { durationSec: 10, avgDb: -30, dbStdev: 3, syllablesPerMin: 300, fillerCount: 2, fillers: ["음"], latencySec: 2.4, longPauses: 1 },
  eval: { score, summary: "", strengths: [], weaknesses, marks: [], betterAnswer: "", consistencyIssue: "" },
});

describe("evalUserPrompt", () => {
  it("전문용어가 있을 때만 한 줄로 넣는다", () => {
    const a = answer("역할은?", 3);
    expect(evalUserPrompt(a, profile, ParsedInputSchema.parse({ terms: ["구조", "Redis"] }))).toContain("지원자 서류의 전문용어: 구조, Redis");
    expect(evalUserPrompt(a, profile, ParsedInputSchema.parse({}))).not.toContain("전문용어");
  });

  it("답하기 전 생각한 시간은 평가자에게 알리지 않는다", () => {
    const p = evalUserPrompt(answer("역할은?", 3), profile, ParsedInputSchema.parse({}));
    expect(p).not.toContain("첫마디");
    expect(p).not.toContain("2.4");
    expect(p).toContain("습관어 2회");
  });
});

describe("fallbackReport", () => {
  const labels = ["실전 준비도 높음", "실전 준비도 보통", "보완 후 재도전"];

  it("합격 여부 대신 준비도 세 단계로 말한다", () => {
    expect(fallbackReport([answer("a", 4)], profile).verdict).toBe(labels[0]);
    expect(fallbackReport([answer("a", 3)], profile).verdict).toBe(labels[1]);
    expect(fallbackReport([answer("a", 2)], profile).verdict).toBe(labels[2]);
    expect(labels).toContain(fallbackReport([], profile).verdict);
    for (const s of [1, 2, 3, 4, 5]) expect(fallbackReport([answer("a", s)], profile).verdict).not.toContain("합격");
  });

  it("총평과 다음 할 일은 점수가 가장 낮은 답변을 짚는다", () => {
    const r = fallbackReport(
      [answer("지원 동기는?", 4), answer("배포 장애에 어떻게 대응했나요?", 2, ["롤백 기준을 말하지 않았습니다."]), answer("협업 경험은?", 3)],
      profile,
    );
    expect(r.headline).toContain("2번 답변(배포 장애에 어떻게 대응했나요?)");
    expect(r.nextSteps).toHaveLength(3);
    expect(r.nextSteps[0]).toContain("2번 답변(배포 장애에 어떻게 대응했나요?)");
    expect(r.nextSteps[1]).toContain("3번 답변");
    expect(r.improvements).toEqual(["2번 답변: 롤백 기준을 말하지 않았습니다."]);
  });

  it("답변이 없으면 할 일을 지어내지 않는다", () => {
    const r = fallbackReport([], profile);
    expect(r.headline).toBe("답변이 기록되지 않았습니다.");
    expect(r.nextSteps).toEqual([]);
  });
});
