import "server-only";
import { env, providers } from "../env";
import { generateJSON } from "../gemini";
import {
  AnswerEvalSchema,
  ReportSchema,
  type AnswerEval,
  type AnswerRecord,
  type EnvironmentProfile,
  type ParsedInput,
  type Report,
} from "../types";
import { clamp } from "../util";

const EVAL_SYSTEM = `너는 한국 기업 면접관이다. 지원자의 답변 하나를 평가하고, 평가지에 빨간 펜으로 표시할 구절을 고른다.
- score 1~5 (3이 보통).
- marks.quote는 반드시 답변 원문에 그대로 있는 4~25자 구절이어야 한다. good=잘한 부분, bad=문제 있는 부분, question=근거가 필요한 부분. 2~4개.
- note는 펜으로 적는 짧은 메모(15자 이내, 반말 메모체 가능: "수치 근거?", "결론 먼저").
- betterAnswer는 같은 내용을 더 잘 말한 예시(3~4문장, 지원자 1인칭).
- consistencyIssue: 자소서 주장과 다르면 한 문장, 아니면 빈 문자열.
- 말하기 습관(속도, 습관어)도 참고하되, 내용 평가가 중심이다.`;

export async function evaluateAnswer(
  answer: AnswerRecord,
  profile: EnvironmentProfile,
  parsed: ParsedInput,
): Promise<AnswerEval> {
  if (!providers().llm || answer.answer.trim().length < 2) return fallbackEval(answer);
  try {
    const ev = await generateJSON(AnswerEvalSchema, {
      model: env.models.smart,
      system: EVAL_SYSTEM,
      thinking: "low",
      timeoutMs: 40000,
      parts: [
        {
          text: [
            `회사/직무: ${profile.company} / ${profile.job} (${profile.stage})`,
            `평가 포인트: ${profile.evaluationPoints.join(", ")}`,
            `자소서 주장: ${parsed.coverLetterClaims.map((c) => c.claim).join(" / ") || "없음"}`,
            `질문: ${answer.question}`,
            `답변(음성 인식): ${answer.answer}`,
            answer.voice
              ? `말하기: ${Math.round(answer.voice.durationSec)}초, 분당 ${Math.round(answer.voice.syllablesPerMin)}음절, 습관어 ${answer.voice.fillerCount}회, 첫마디까지 ${answer.voice.latencySec.toFixed(1)}초`
              : "",
            answer.interrupted ? "답변이 길어 면접관이 중간에 끊었다." : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
    ev.marks = ev.marks.filter((m) => answer.answer.includes(m.quote));
    return ev;
  } catch (e) {
    console.error("[evaluate] 실패, 규칙 기반 평가 사용", e);
    return fallbackEval(answer);
  }
}

export function fallbackEval(answer: AnswerRecord): AnswerEval {
  const text = answer.answer.trim();
  const hasNumber = /\d/.test(text);
  const long = text.length > 350;
  const short = text.length < 60;
  let score = 3;
  if (hasNumber) score++;
  if (short) score--;
  if (long || answer.interrupted) score--;
  const sentences = text.split(/(?<=[.?!다요])\s+/).filter((s) => s.length > 6);
  const marks: AnswerEval["marks"] = [];
  const numSentence = sentences.find((s) => /\d/.test(s));
  if (numSentence) marks.push({ quote: numSentence.slice(0, 20), type: "good", note: "수치 근거 좋음" });
  const vague = sentences.find((s) => /열심히|최선|노력|많이/.test(s));
  if (vague) marks.push({ quote: vague.slice(0, 20), type: "question", note: "구체적으로?" });
  return {
    score: clamp(score, 1, 5),
    summary: short ? "답변이 짧아 판단 근거가 부족합니다." : long ? "핵심이 늦게 나와 길게 느껴집니다." : "질문 의도에 맞게 답했습니다.",
    strengths: hasNumber ? ["수치로 성과를 설명했습니다."] : [],
    weaknesses: [!hasNumber ? "성과를 뒷받침할 수치나 근거가 없습니다." : "", long ? "결론을 먼저 말하면 더 명확합니다." : ""].filter(Boolean),
    marks,
    betterAnswer: "",
    consistencyIssue: "",
  };
}

const REPORT_SYSTEM = `너는 면접 결과를 정리하는 면접위원장이다. 답변별 평가와 말하기 지표를 종합해 최종 평가지를 쓴다.
- overallScore 1~100. verdict는 "합격 가능성 높음/보통/낮음" 중 하나에 짧은 이유.
- headline: 한 문장 총평.
- companyFit: 환경 프로필의 평가 포인트별 1~5점과 한 줄 코멘트.
- interviewerNotes: 각 면접관 시점의 한두 문장 메모.
- nextSteps: 다음 연습에서 할 일 3개(구체적 행동).
- 한국어, 담백하게.`;

export async function buildReport(
  answers: AnswerRecord[],
  profile: EnvironmentProfile,
  parsed: ParsedInput,
): Promise<Report> {
  if (!providers().llm || answers.length === 0) return fallbackReport(answers, profile);
  try {
    return await generateJSON(ReportSchema, {
      model: env.models.smart,
      system: REPORT_SYSTEM,
      thinking: "low",
      timeoutMs: 60000,
      parts: [
        {
          text: [
            `회사/직무: ${profile.company} / ${profile.job}`,
            `평가 포인트: ${profile.evaluationPoints.join(", ")}`,
            `면접관: ${profile.interviewers.map((i) => `${i.id}=${i.name}(${i.role})`).join(", ")}`,
            `지원자 핵심 경험: ${parsed.candidateHighlights.join(" / ")}`,
            "## 답변별",
            ...answers.map(
              (a, i) =>
                `${i + 1}. [${a.interviewerId}] Q: ${a.question}\nA: ${a.answer.slice(0, 900)}\n평가: ${a.eval ? `${a.eval.score}/5 ${a.eval.summary}` : "없음"}${
                  a.voice ? ` · ${Math.round(a.voice.syllablesPerMin)}음절/분, 습관어 ${a.voice.fillerCount}` : ""
                }${a.face ? ` · 시선 이탈 ${Math.round(a.face.gazeAwayRatio * 100)}%` : ""}`,
            ),
          ].join("\n"),
        },
      ],
    });
  } catch (e) {
    console.error("[report] 실패, 규칙 기반 보고서 사용", e);
    return fallbackReport(answers, profile);
  }
}

export function fallbackReport(answers: AnswerRecord[], profile: EnvironmentProfile): Report {
  const scores = answers.map((a) => a.eval?.score ?? 3);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
  const overall = clamp(Math.round(avg * 20), 1, 100);
  return {
    overallScore: overall,
    verdict: overall >= 75 ? "합격 가능성 높음" : overall >= 55 ? "합격 가능성 보통" : "합격 가능성 낮음",
    headline: answers.length ? "답변의 근거를 조금 더 구체적으로 보여주면 좋아집니다." : "답변이 기록되지 않았습니다.",
    strengths: answers.flatMap((a) => a.eval?.strengths ?? []).slice(0, 3),
    improvements: answers.flatMap((a) => a.eval?.weaknesses ?? []).slice(0, 3),
    companyFit: profile.evaluationPoints.slice(0, 4).map((p) => ({ point: p, rating: clamp(Math.round(avg), 1, 5), comment: "" })),
    interviewerNotes: profile.interviewers.map((i) => ({ interviewerId: i.id, note: "" })),
    nextSteps: ["답변마다 결론을 첫 문장에 말하기", "성과에 수치·근거 붙이기", "자소서 주장별 예상 꼬리질문 준비하기"],
  };
}
