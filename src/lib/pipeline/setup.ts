import "server-only";
import { z } from "zod";
import { env, providers } from "../env";
import { generateJSON } from "../gemini";
import { DEFAULT_PANEL, persona, PERSONAS } from "../interviewers";
import { bankCandidates, companyProfile, type BankQuestion, type CompanyProfile } from "../seed/dataset";
import {
  EnvironmentProfileSchema,
  type EnvironmentProfile,
  type Interviewer,
  type MatchResult,
  type ParsedInput,
  type QuestionPlanItem,
  type Review,
} from "../types";
import { clamp, uid } from "../util";

const DraftInterviewer = z.object({
  role: z.string(),
  focus: z.array(z.string()).default([]),
  style: z.string().default(""),
  pressure: z.number().int().min(1).max(5).default(3),
  gender: z.enum(["male", "female"]).default("male"),
  isLead: z.boolean().default(false),
});

const SetupDraftSchema = z.object({
  format: z.string(),
  durationMin: z.number().int().min(10).max(60),
  atmosphere: z.string(),
  pressure: z.number().int().min(1).max(5),
  interruptRate: z.enum(["low", "mid", "high"]),
  silenceToleranceSec: z.number().min(2).max(15),
  followupDepth: z.number().int().min(0).max(4),
  maxAnswerSec: z.number().int().min(30).max(240),
  frequentProbes: z.array(z.string()).max(6),
  evaluationPoints: z.array(z.string()).max(6),
  greetingStyle: z.string(),
  interviewers: z.array(DraftInterviewer).min(1).max(3),
  evidence: z.array(z.object({ reviewId: z.string(), note: z.string() })).max(8),
  confidence: z.number().min(0).max(1),
  plan: z
    .array(
      z.object({
        interviewerIndex: z.number().int().min(0).max(2),
        question: z.string(),
        intent: z.string(),
        source: z.enum(["review", "posting", "coverLetter", "resume", "general", "bank"]),
        bankId: z.string().optional(),
      }),
    )
    .min(4)
    .max(14),
});
type SetupDraft = z.infer<typeof SetupDraftSchema>;

const SYSTEM = `너는 한국 기업의 면접 환경을 재현하는 설계자다.
지원자의 서류와 실제 면접 후기를 바탕으로, 그 회사 면접장의 형식·분위기·면접관 역할·압박 강도와 질문 계획을 만든다.
규칙:
- 후기에 근거가 있는 내용은 evidence에 reviewId와 근거를 남긴다. 근거가 약하면 confidence를 낮춘다.
- 면접 안내 이메일의 사실(면접관 수, 시간, 형식)이 있으면 후기보다 우선한다.
- 면접관은 1~3명. 첫 번째가 주 질문자(isLead=true, 보통 실무 리드). 인사 담당, 임원 등 역할을 나눈다.
- 압박 강도 1(편안)~5(강한 압박). interruptRate: 답변 중 끊는 빈도.
- maxAnswerSec: 이 시간을 넘기면 면접관이 끊는다(압박이 클수록 짧게, 60~150초).
- plan: 자기소개를 제외한 본 질문 6~10개. 참고 후기에 질문이 있으면 반드시 최소 2개 이상은 후기 기출 질문(source="review")으로 포함하고, 공고 요구사항(posting), 자소서 주장 검증(coverLetter), 이력서 경험(resume)을 섞는다.
  각 질문은 면접관이 실제로 말하는 한 문장(존댓말)으로 쓴다. 질문 앞에 번호나 따옴표를 붙이지 않는다.
  interviewerIndex는 역할에 맞게 나누되 주 질문자 4 : 다른 면접관 각 3 비율로 맞춘다.
- 회사 공식 정보가 있으면 지원 단계에 맞는 전형으로 면접장을 구성한다. format과 면접관 역할·focus를 그 전형에 맞추고, evaluationPoints에 공식 평가 포인트와 인재상·중시 가치를 먼저 넣는다(항목 이름만, 접두어 없이).
  plan에는 평가 포인트와 인재상마다 그것을 검증하는 질문을 넣고 intent를 "평가 포인트: ○○" 형식으로 쓴다.
  면접관 style과 greetingStyle, atmosphere에도 회사가 중시하는 가치가 드러나게 한다(예: 실행 속도를 중시하면 짧고 직접적으로 묻는다).
- 분위기·압박·끊기 빈도·꼬리질문 깊이는 공식 정보에 없으므로 참고 후기의 분위기·압박에서 판단한다. 공식 정보에 없는 인재상이나 평가 기준을 지어내지 않는다.
- 질문 은행은 실제 출제 질문이 아니다. 지원 직무의 기초 역량을 확인할 때 1~3개만 골라 말투만 다듬어 쓰고 source="bank", bankId=그 id로 표시한다. 후기 기출 질문을 대신하지 않는다.
- greetingStyle: 그 회사 면접장의 첫 인사 분위기를 한 문장으로.
- 모든 문장은 한국어.`;

export async function buildSetup(
  parsed: ParsedInput,
  match: MatchResult,
  reviews: Review[],
  userReviewText: string,
): Promise<{ profile: EnvironmentProfile; plan: QuestionPlanItem[] }> {
  const used = reviews.filter((r) => match.reviewIds.includes(r.id));
  const company = companyProfile(parsed.company);
  const bank = bankCandidates(
    parsed.job,
    [...parsed.requirements, ...parsed.candidateHighlights, ...parsed.coverLetterClaims.map((c) => c.claim)].join(" "),
  );
  let draft: SetupDraft;
  if (providers().llm) {
    try {
      draft = await generateJSON(SetupDraftSchema, {
        model: env.models.smart,
        system: SYSTEM,
        thinking: "low",
        timeoutMs: 70000,
        parts: [
          {
            text: [
              `## 지원 정보\n${JSON.stringify(parsed, null, 1)}`,
              company ? `## 회사 공식 정보(공식 채용 안내 기준)\n${companyBrief(company)}` : "",
              `## 매칭 단계: ${match.summary}`,
              `## 참고 후기\n${used
                .map(
                  (r) =>
                    `- [${r.id}] ${r.company}/${r.job}/${r.stage} · 형식: ${r.format} · 면접관 ${r.interviewerCount}명 · 압박 ${r.pressure}\n  분위기: ${r.atmosphere}\n  질문: ${r.questions.join(" / ")}\n  팁: ${r.tips}`,
                )
                .join("\n")}`,
              userReviewText ? `## 사용자가 붙여넣은 후기(가장 우선)\n${userReviewText.slice(0, 6000)}` : "",
              bank.length ? `## 질문 은행(회사 무관 일반 기술 질문)\n${bank.map((q) => `- [${q.id}] ${q.question}`).join("\n")}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      });
    } catch (e) {
      console.error("[setup] Gemini 실패, 규칙 기반 설정 사용", e);
      draft = fallbackDraft(parsed, used, company, bank);
    }
  } else {
    draft = fallbackDraft(parsed, used, company, bank);
  }
  return assemble(parsed, draft, used, company, bank);
}

function companyBrief(c: CompanyProfile): string {
  return [
    `회사: ${c.company} (${c.companyType}, ${c.industry})`,
    c.evaluation_points.length ? `평가 포인트: ${c.evaluation_points.join(", ")}` : "",
    c.talent ? `인재상·중시 가치: ${c.talent.talent.join(", ")}${c.talent.notes ? ` (${c.talent.notes})` : ""}` : "",
    c.stages.length
      ? `전형:\n${c.stages.map((s) => `- ${s.name}${s.format ? ` (${s.format})` : ""}${s.notes ? `: ${s.notes}` : ""}`).join("\n")}`
      : "",
    c.facts.length ? `확인된 사실:\n${c.facts.map((f) => `- ${f.text}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function assemble(parsed: ParsedInput, d: SetupDraft, used: Review[], company: CompanyProfile | null, bank: BankQuestion[]): { profile: EnvironmentProfile; plan: QuestionPlanItem[] } {
  // 이메일에 면접관 수가 있으면 그 수를 따른다
  const wanted = parsed.emailFacts.interviewers > 0 ? clamp(parsed.emailFacts.interviewers, 1, 3) : d.interviewers.length;
  const draftPanel = [...d.interviewers];
  while (draftPanel.length < wanted)
    draftPanel.push({ role: "인사 담당", focus: ["조직 적합성"], style: "온화함", pressure: 2, gender: "female", isLead: false });
  const panel = draftPanel.slice(0, wanted);
  if (!panel.some((p) => p.isLead)) panel[0].isLead = true;

  const usedKeys = new Set<string>();
  const interviewers: Interviewer[] = panel.map((p, i) => {
    const preferred = DEFAULT_PANEL[i] ?? "hank";
    let key: string = preferred;
    if (persona(preferred).gender !== p.gender) {
      const alt = PERSONAS.find((x) => x.gender === p.gender && !usedKeys.has(x.key));
      if (alt) key = alt.key;
    }
    if (usedKeys.has(key)) key = PERSONAS.find((x) => !usedKeys.has(x.key))?.key ?? key;
    usedKeys.add(key);
    const per = persona(key);
    return {
      id: `iv${i + 1}`,
      name: per.defaultName,
      role: p.role,
      focus: p.focus.slice(0, 4),
      style: p.style,
      pressure: p.pressure,
      faceId: per.faceId,
      portrait: per.portrait,
      voice: per.voice,
      gender: per.gender,
      isLead: p.isLead,
    };
  });

  const profile = EnvironmentProfileSchema.parse({
    company: parsed.company || "지원 회사",
    job: parsed.job || "지원 직무",
    stage: parsed.stage || "1차 면접",
    format: parsed.emailFacts.format || d.format,
    durationMin: parsed.emailFacts.durationMin > 0 ? clamp(parsed.emailFacts.durationMin, 5, 60) : d.durationMin,
    atmosphere: d.atmosphere,
    pressure: d.pressure,
    interruptRate: d.interruptRate,
    silenceToleranceSec: d.silenceToleranceSec,
    followupDepth: d.followupDepth,
    maxAnswerSec: d.maxAnswerSec,
    frequentProbes: d.frequentProbes,
    evaluationPoints: d.evaluationPoints.map((p) => p.replace(/^평가\s*포인트\s*:\s*/, "")),
    greetingStyle: d.greetingStyle,
    interviewers,
    evidence: d.evidence,
    confidence: d.confidence,
  });

  if (company?.talent) {
    const { talent, source } = company.talent;
    profile.evidence.push({ reviewId: "company_talent", note: `${profile.company} 인재상·중시 가치: ${talent.join(", ")} (출처: ${source})` });
  }

  const lead = interviewers.find((i) => i.isLead) ?? interviewers[0];
  const rawPlan: QuestionPlanItem[] = d.plan.map((q) => {
    const banked = bank.find((b) => b.id === q.bankId);
    return {
      id: uid("q"),
      interviewerId: interviewers[Math.min(q.interviewerIndex, interviewers.length - 1)].id,
      question: q.question.trim(),
      intent: q.intent,
      source: banked ? "bank" : q.source === "bank" ? "general" : q.source,
      credit: banked && { url: banked.source_url, license: banked.license },
    };
  });

  const reviewCount = rawPlan.filter((q) => q.source === "review").length;
  if (reviewCount < 2 && used.length > 0) {
    const existingQs = new Set(rawPlan.map((q) => q.question));
    const reviewCandidates = Array.from(new Set(used.flatMap((r) => r.questions))).filter(
      (q) => !/자기소개|마지막으로/.test(q) && !existingQs.has(q.trim()),
    );
    const needed = Math.min(2 - reviewCount, reviewCandidates.length);
    for (let i = 0; i < needed; i++) {
      rawPlan.splice(i, 0, {
        id: uid("q"),
        interviewerId: interviewers[i % interviewers.length].id,
        question: reviewCandidates[i].trim(),
        intent: "면접 후기 실제 기출 질문",
        source: "review",
      });
    }
  }

  const hasIntro = rawPlan.some((q) => /자기소개|본인\s*소개|1분\s*소개/.test(q.question) || /자기소개/.test(q.intent));
  const hasClosing = rawPlan.some(
    (q) => /마지막으로.*(?:말씀|질문|하고\s*싶은)|궁금한\s*점/.test(q.question) || /마지막\s*할\s*말|역질문|마무리/.test(q.intent),
  );

  const plan: QuestionPlanItem[] = [
    ...(hasIntro
      ? []
      : [
          {
            id: uid("q"),
            interviewerId: lead.id,
            question: "먼저 1분 정도로 간단하게 본인 자기소개 부탁드립니다.",
            intent: "1분 자기소개 · 지원 직무 핵심 강점 요약",
            source: "general" as const,
          },
        ]),
    ...rawPlan,
    ...(hasClosing
      ? []
      : [
          {
            id: uid("q"),
            interviewerId: lead.id,
            question: "면접이 거의 마무리되었습니다. 마지막으로 꼭 하고 싶은 말씀이나 궁금한 점이 있다면 편하게 말씀해 주세요.",
            intent: "마지막 할 말 · 입사 의지 및 역질문",
            source: "general" as const,
          },
        ]),
  ];
  return { profile, plan };
}

/** 키가 없을 때 후기에서 직접 만드는 설정 */
export function fallbackDraft(parsed: ParsedInput, used: Review[], company: CompanyProfile | null, bank: BankQuestion[]): SetupDraft {
  const avgPressure = used.length
    ? Math.round(used.reduce((s, r) => s + r.pressure, 0) / used.length)
    : 3;
  const count = clamp(
    used.length ? Math.round(used.reduce((s, r) => s + r.interviewerCount, 0) / used.length) : 2,
    1,
    3,
  );
  const reviewQs = Array.from(new Set(used.flatMap((r) => r.questions))).filter((q) => !/자기소개/.test(q));
  const plan: SetupDraft["plan"] = [];
  reviewQs.slice(0, 4).forEach((q, i) => plan.push({ interviewerIndex: i % count, question: q, intent: "후기 기출", source: "review" }));
  parsed.coverLetterClaims.slice(0, 2).forEach((c) =>
    plan.push({
      interviewerIndex: 0,
      question: `자기소개서에 "${c.claim.slice(0, 40)}"라고 쓰셨는데, 구체적으로 어떻게 하셨는지 설명해 주시겠어요?`,
      intent: "자소서 주장 검증",
      source: "coverLetter",
    }),
  );
  parsed.candidateHighlights.slice(0, 1).forEach((h) =>
    plan.push({ interviewerIndex: 0, question: `이력서의 "${h.slice(0, 40)}" 경험에서 가장 어려웠던 점은 무엇이었나요?`, intent: "이력 검증", source: "resume" }),
  );
  const officialPoints = [...(company?.evaluation_points ?? []), ...(company?.talent?.talent ?? [])].map((p) =>
    p.replace(/\(.*\)|:.*/, "").trim(),
  );
  officialPoints.slice(0, 3).forEach((p, i) =>
    plan.push({
      interviewerIndex: i % count,
      question: `${p} 측면에서 본인을 가장 잘 보여 주는 경험을 말씀해 주세요.`,
      intent: `평가 포인트: ${p}`,
      source: "general",
    }),
  );
  bank.slice(0, 2).forEach((q) =>
    plan.push({ interviewerIndex: 0, question: q.question, intent: "직무 기초 확인", source: "bank", bankId: q.id }),
  );
  const generic = [
    { q: `${parsed.company || "저희 회사"}에 지원하신 이유를 말씀해 주세요.`, s: "general" as const, i: Math.min(1, count - 1) },
    { q: "팀에서 의견이 충돌했을 때 어떻게 해결하셨나요?", s: "general" as const, i: Math.min(1, count - 1) },
    { q: "입사 후 3년 안에 이루고 싶은 목표는 무엇인가요?", s: "general" as const, i: count - 1 },
  ];
  for (const g of generic) if (plan.length < 8) plan.push({ interviewerIndex: g.i, question: g.q, intent: "기본 역량", source: g.s });

  const roles: SetupDraft["interviewers"] = [
    { role: "실무 리드", focus: ["직무 역량", "프로젝트 디테일"], style: "핵심을 파고드는 질문", pressure: clamp(avgPressure + 1, 1, 5), gender: "male", isLead: true },
    { role: "인사 담당", focus: ["지원 동기", "협업"], style: "부드럽게 분위기를 풀어줌", pressure: clamp(avgPressure - 1, 1, 5), gender: "female", isLead: false },
    { role: "임원", focus: ["가치관", "장기 목표"], style: "말수가 적고 무표정", pressure: avgPressure, gender: "female", isLead: false },
  ];
  return {
    format: used[0]?.format || `다대일 ${count}:1, 약 25분`,
    durationMin: 25,
    atmosphere: used[0]?.atmosphere || "차분하지만 답변의 근거를 확인하는 분위기",
    pressure: avgPressure,
    interruptRate: avgPressure >= 4 ? "high" : avgPressure >= 3 ? "mid" : "low",
    silenceToleranceSec: avgPressure >= 4 ? 4 : 6,
    followupDepth: avgPressure >= 4 ? 3 : 2,
    maxAnswerSec: avgPressure >= 4 ? 80 : 120,
    frequentProbes: used.map((r) => r.tips).filter(Boolean).slice(0, 3),
    evaluationPoints: [...new Set([...officialPoints, "직무 이해도", "근거 있는 답변", "협업 태도", "회사 이해도"])].slice(0, 6),
    greetingStyle: "정중하지만 짧은 인사 후 바로 자기소개를 요청",
    interviewers: roles.slice(0, count),
    evidence: used.slice(0, 4).map((r) => ({ reviewId: r.id, note: r.atmosphere.slice(0, 60) })),
    confidence: used.length >= 2 ? 0.6 : 0.35,
    plan: plan.length >= 4 ? plan : [...plan, ...generic.map((g) => ({ interviewerIndex: g.i, question: g.q, intent: "기본 역량", source: g.s }))].slice(0, 6),
  };
}
