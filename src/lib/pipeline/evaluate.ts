import "server-only";
import { env, providers } from "../env";
import { generateJSON } from "../gemini";
import { glossary } from "../glossary";
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
- 답변은 음성 인식으로 받아쓴 글이다. 전문용어가 소리가 비슷한 엉뚱한 글자나 숫자로 적혀 있을 수 있다(예: "구조" → "9조"). 서류의 전문용어와 문맥에 비추어 지원자가 실제로 말했을 가장 그럴듯한 용어로 읽고, 받아쓰기 오류는 지적하거나 감점하지 않는다.
- marks.quote는 반드시 답변 원문에 그대로 있는 4~25자 구절이어야 한다. good=잘한 부분, bad=문제 있는 부분, question=근거가 필요한 부분. 2~4개. 받아쓰기 오류로 보이는 구절은 고르지 않는다.
- note는 펜으로 적는 짧은 메모(15자 이내, 반말 메모체 가능: "수치 근거?", "결론 먼저").
- strengths·weaknesses는 항목마다 이 답변에서 지원자가 실제로 한 말을 짚는다(무엇을 말했고 무엇이 빠졌는지). 어느 답변에나 붙일 수 있는 일반론("구체적으로 말하기", "결론부터 말하기")만 적지 않는다.
- betterAnswer는 같은 내용을 더 잘 말한 예시(3~4문장, 지원자 1인칭). 지원자가 말한 사실만으로 만든다. 지원자가 말하지 않은 수치·도구·성과를 지어내지 않고, 수치가 있어야 할 자리에 수치가 없었다면 "(구체적 수치)"처럼 빈칸으로 남겨 무엇을 채워야 하는지 보이게 한다.
- consistencyIssue: 자소서 주장과 다르면 한 문장, 아니면 빈 문자열.
- 답하기 전이나 답하는 도중에 잠시 생각하느라 멈추는 것은 자연스러운 일이며 감점 요인이 아니다.
- 말하기 습관(속도, 습관어)도 참고하되, 내용 평가가 중심이다.`;

export function evalUserPrompt(answer: AnswerRecord, profile: EnvironmentProfile, parsed: ParsedInput): string {
  const terms = glossary(parsed);
  return [
    `회사/직무: ${profile.company} / ${profile.job} (${profile.stage})`,
    `평가 포인트: ${profile.evaluationPoints.join(", ")}`,
    `자소서 주장: ${parsed.coverLetterClaims.map((c) => c.claim).join(" / ") || "없음"}`,
    terms.length ? `지원자 서류의 전문용어: ${terms.join(", ")}` : "",
    `질문: ${answer.question}`,
    `답변(음성 인식): ${answer.answer}`,
    answer.voice
      ? `말하기: ${Math.round(answer.voice.durationSec)}초, 분당 ${Math.round(answer.voice.syllablesPerMin)}음절, 습관어 ${answer.voice.fillerCount}회`
      : "",
    answer.interrupted ? "답변이 길어 면접관이 중간에 끊었다." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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
      parts: [{ text: evalUserPrompt(answer, profile, parsed) }],
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
- overallScore 1~100. verdict는 "실전 준비도 높음", "실전 준비도 보통", "보완 후 재도전" 중 하나를 그대로 쓰고 그 뒤에 짧은 이유를 붙인다(예: "실전 준비도 보통 · 경험은 구체적이나 수치 근거가 부족"). 합격·불합격을 단정하는 말은 쓰지 않는다.
- headline: 한 문장 총평.
- companyFit: 환경 프로필의 평가 포인트별 1~5점과 한 줄 코멘트.
- interviewerNotes: 각 면접관 시점의 한두 문장 메모.
- nextSteps: 다음 연습에서 할 일 3개(구체적 행동).
- improvements, nextSteps: 항목마다 어느 답변에서 나온 것인지 번호와 주제를 먼저 밝히고 그 답변에 맞는 구체적 행동을 적는다(예: "3번 답변(배포 장애 대응): 롤백을 결정한 기준을 첫 문장에 말하기"). 어느 면접에나 통하는 조언("결론부터 말하기", "수치 붙이기")만 적지 않는다.
- 답변은 음성 인식으로 받아쓴 글이다. 받아쓰기 오류로 보이는 표현과, 답하기 전이나 도중에 생각하느라 멈춘 것은 문제 삼지 않는다.
- 말투는 지원자를 돕는 코치의 말투다. 부족한 점은 솔직하게 짚되 몰아세우지 않는다.
- 한국어, 담백하게.`;

const VERDICTS = ["실전 준비도 높음", "실전 준비도 보통", "보완 후 재도전"] as const;
const verdictOf = (overall: number) => VERDICTS[overall >= 75 ? 0 : overall >= 55 ? 1 : 2];

/** 보고서에서 답변을 가리키는 말: "3번 답변(질문 앞부분)" */
const answerRef = (a: AnswerRecord, i: number) => `${i + 1}번 답변(${a.question.length > 30 ? `${a.question.slice(0, 30)}…` : a.question})`;

export async function buildReport(
  answers: AnswerRecord[],
  profile: EnvironmentProfile,
  parsed: ParsedInput,
): Promise<Report> {
  if (!providers().llm || answers.length === 0) return fallbackReport(answers, profile);
  try {
    const report = await generateJSON(ReportSchema, {
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
                `${i + 1}. [${a.interviewerId}] Q: ${a.question}\nA: ${a.answer.slice(0, 900)}\n평가: ${a.eval ? `${a.eval.score}/5 ${a.eval.summary}${a.eval.weaknesses.length ? ` · 부족한 점: ${a.eval.weaknesses.join(" / ")}` : ""}` : "없음"}${
                  a.voice ? ` · ${Math.round(a.voice.syllablesPerMin)}음절/분, 습관어 ${a.voice.fillerCount}` : ""
                }${a.face ? ` · 시선 이탈 ${Math.round(a.face.gazeAwayRatio * 100)}%` : ""}`,
            ),
          ].join("\n"),
        },
      ],
    });
    // 화면과 문서가 세 가지 표현에 기대므로, 모델이 다른 말을 쓰면 점수로 정한 표현으로 바꾼다
    if (!VERDICTS.some((v) => report.verdict.startsWith(v))) report.verdict = verdictOf(report.overallScore);
    return report;
  } catch (e) {
    console.error("[report] 실패, 규칙 기반 보고서 사용", e);
    return fallbackReport(answers, profile);
  }
}

export function fallbackReport(answers: AnswerRecord[], profile: EnvironmentProfile): Report {
  const scores = answers.map((a) => a.eval?.score ?? 3);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
  const overall = clamp(Math.round(avg * 20), 1, 100);
  // 점수가 낮은 답변부터(같으면 먼저 나온 답변부터)
  const weakest = answers.map((a, i) => ({ a, i })).sort((x, y) => scores[x.i] - scores[y.i] || x.i - y.i);
  return {
    overallScore: overall,
    verdict: verdictOf(overall),
    headline: weakest.length ? `${answerRef(weakest[0].a, weakest[0].i)}부터 다시 연습해 보면 좋겠습니다.` : "답변이 기록되지 않았습니다.",
    strengths: answers.flatMap((a) => a.eval?.strengths ?? []).slice(0, 3),
    improvements: answers.flatMap((a, i) => (a.eval?.weaknesses ?? []).map((w) => `${i + 1}번 답변: ${w}`)).slice(0, 3),
    companyFit: profile.evaluationPoints.slice(0, 4).map((p) => ({ point: p, rating: clamp(Math.round(avg), 1, 5), comment: "" })),
    interviewerNotes: profile.interviewers.map((i) => ({ interviewerId: i.id, note: "" })),
    nextSteps: weakest.slice(0, 3).map(({ a, i }) => `${answerRef(a, i)}: 같은 질문에 다시 답해 보기`),
  };
}
