import { nextSpeaker } from "../interviewers";
import { DirectorActionSchema, type DirectorAction, type EnvironmentProfile, type QuestionPlanItem, type TranscriptEntry } from "../types";

export type TurnPhase = "opening" | "next" | "timeout" | "closing" | "farewell";

export type TurnRequest = {
  phase: TurnPhase;
  elapsedSec: number;
  /** 직전 답변이 너무 짧았거나 길었는지 등 클라이언트 관찰값 */
  lastAnswerSec?: number;
};

export function leadOf(profile: EnvironmentProfile) {
  return profile.interviewers.find((i) => i.isLead) ?? profile.interviewers[0];
}

/** 이미 물어본 질문 계획 id */
export function usedPlanIds(transcript: TranscriptEntry[]): Set<string> {
  return new Set(transcript.filter((t) => t.planId).map((t) => t.planId as string));
}

/** 직전 계획 질문 이후 이어진 꼬리질문 수 */
export function followupsSinceLastQuestion(transcript: TranscriptEntry[]): number {
  let n = 0;
  for (let i = transcript.length - 1; i >= 0; i--) {
    const t = transcript[i];
    if (t.kind === "followup" || t.kind === "interrupt") n++;
    if (t.kind === "question") break;
  }
  return n;
}

const isClosing = (p: QuestionPlanItem) =>
  /마지막으로.*(?:말씀|질문|하고\s*싶은)|궁금한\s*점/.test(p.question) || /마지막\s*할\s*말/.test(p.intent);

/** 다음 계획 질문. 차례인 면접관의 질문을 고르고, 남은 게 없으면 다른 질문을 넘겨받는다. 마무리 질문은 맨 끝에 둔다. */
export function nextPlanned(
  profile: EnvironmentProfile,
  plan: QuestionPlanItem[],
  transcript: TranscriptEntry[],
): QuestionPlanItem | undefined {
  const used = usedPlanIds(transcript);
  const remaining = plan.filter((p) => !used.has(p.id));
  const body = remaining.filter((p) => !isClosing(p));
  if (body.length === 0) return remaining[0];
  const speaker = nextSpeaker(profile.interviewers, transcript).id;
  return body.find((p) => p.interviewerId === speaker) ?? { ...body[0], interviewerId: speaker };
}

/** LLM 응답을 안전하게 보정한다 */
export function normalizeAction(
  raw: unknown,
  profile: EnvironmentProfile,
  plan: QuestionPlanItem[],
  transcript: TranscriptEntry[],
): DirectorAction {
  const parsed = DirectorActionSchema.safeParse(raw);
  const lead = leadOf(profile);
  const base: DirectorAction = parsed.success
    ? parsed.data
    : { speakerId: lead.id, say: "", kind: "question", planId: null, waitMotion: "nod", backchannel: true, end: false };

  const ids = new Set(profile.interviewers.map((i) => i.id));
  if (!ids.has(base.speakerId)) base.speakerId = lead.id;

  const used = usedPlanIds(transcript);
  const next = nextPlanned(profile, plan, transcript);
  if (base.planId && (!plan.some((p) => p.id === base.planId) || used.has(base.planId))) base.planId = null;
  base.say = base.say
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
  if (transcript.length === 0 && !base.planId && plan[0] && /자기소개|본인\s*소개|1분\s*소개/.test(plan[0].question)) {
    base.planId = plan[0].id;
  }
  if (base.planId) {
    const item = plan.find((p) => p.id === base.planId);
    if (item) {
      base.speakerId = base.planId === next?.id ? next.interviewerId : item.interviewerId;
      if (!base.say) {
        base.say = item.question;
      } else if (!/[?？]|(?:까요|나요|습니까|주세요|부탁드립니다|할까요|신가요|어떨까요|무엇인가요)[.?？!]?\s*$/.test(base.say)) {
        base.say = `${base.say} ${item.question}`;
      }
      if (isClosing(item)) base.kind = "closing";
    }
  }
  if (base.kind === "followup" || (base.kind === "question" && !base.planId)) {
    base.speakerId = nextSpeaker(profile.interviewers, transcript).id;
  }
  if (!base.say) {
    if (next) {
      base.say = next.question;
      base.planId = next.id;
      base.speakerId = next.interviewerId;
      base.kind = "question";
    } else {
      base.say = "마지막으로 하고 싶은 말씀이 있으시면 해 주세요.";
      base.kind = "closing";
    }
  }
  return base;
}

export function directorSystem(profile: EnvironmentProfile): string {
  const panel = profile.interviewers
    .map(
      (i) =>
        `- ${i.id}: ${i.name} (${i.role}${i.isLead ? ", 주 질문자" : ""}) · 관심: ${i.focus.join(", ")} · 스타일: ${i.style} · 압박 ${i.pressure}/5`,
    )
    .join("\n");
  return `너는 실제 한국 기업 면접장을 재현하는 면접 진행자다. 면접관들의 다음 발화를 하나 정한다.
회사: ${profile.company} / 직무: ${profile.job} / 단계: ${profile.stage}
형식: ${profile.format} · 분위기: ${profile.atmosphere}
전체 압박 강도: ${profile.pressure}/5 · 끊기 빈도: ${profile.interruptRate} · 꼬리질문 최대 깊이: ${profile.followupDepth}
자주 파고드는 포인트: ${profile.frequentProbes.join(" / ") || "없음"}
회사 평가 포인트: ${profile.evaluationPoints.join(" / ") || "없음"}
면접관:
${panel}

규칙:
- say는 면접관이 실제로 소리 내어 말할 문장만 쓴다(존댓말, 1~2문장, 60자 안팎). 지문·괄호·이름표 금지.
- 답변이 모호하거나 수치·근거가 없으면 꼬리질문(kind=followup, planId=null). 앞 질문을 한 면접관이 아니어도 된다. "이번 발화자"가 자기 관심 분야에서 이어 묻는다.
- 꼬리질문이 최대 깊이에 이르렀거나 답변이 충분하면 "다음 계획 질문"으로 넘어간다(kind=question, planId=그 id). 질문 문장은 자연스럽게 다듬어도 된다.
- speakerId는 "이번 발화자"로 쓴다. 면접관이 바뀔 때는 앞 답변을 짧게 받아서 넘기는 말투도 좋다.
- 자소서 내용과 답변이 다르면 짚는다.
- 꼬리질문은 회사 평가 포인트를 판단할 근거가 부족한 부분을 확인한다.
- waitMotion: 답변을 들은 직후 면접관의 동작(nod 끄덕임, flipPages 서류 넘기기, takeNotes 메모, glance 옆 면접관과 눈맞춤, still 무반응). 압박이 클수록 still·takeNotes.
- backchannel: "네." 같은 짧은 맞장구를 먼저 할지. 압박 4 이상이면 대체로 false.
- 응답은 JSON 하나.`;
}

export function directorUserPrompt(
  req: TurnRequest,
  profile: EnvironmentProfile,
  plan: QuestionPlanItem[],
  transcript: TranscriptEntry[],
  coverLetterClaims: string[],
): string {
  const next = nextPlanned(profile, plan, transcript);
  const speaker = nextSpeaker(profile.interviewers, transcript);
  const recent = transcript.slice(-10).map((t) => {
    const who = t.speaker === "candidate" ? "지원자" : profile.interviewers.find((i) => i.id === t.speaker)?.name ?? t.speaker;
    return `${who}: ${t.text}`;
  });
  const left = Math.max(0, profile.durationMin * 60 - req.elapsedSec);
  const phaseGuide: Record<TurnPhase, string> = {
    opening: `지금은 면접 시작이다. 주 질문자가 ${profile.greetingStyle || "짧게 인사"} 후 1분 자기소개를 요청한다. kind=question, planId=null.`,
    next: `지원자의 직전 답변부터 판단한다. 수치·근거·본인 역할이 빠져 있고 꼬리질문이 ${profile.followupDepth}회 미만이면 계획 질문으로 넘어가지 말고 그 답변을 짚는 꼬리질문을 한다(kind=followup, planId=null). 답변이 충분하거나 꼬리질문을 다 썼을 때만 다음 계획 질문으로 넘어간다.`,
    timeout: `지원자의 답변이 ${req.lastAnswerSec ?? profile.maxAnswerSec}초를 넘어 길어지고 있다. 질문한 면접관이 정중하지만 단호하게 말을 끊고 핵심만 짧게 다시 묻는다. kind=interrupt.`,
    closing: "면접 시간이 거의 끝났다. 주 질문자가 마지막으로 하고 싶은 말을 묻는다. kind=closing, planId=null.",
    farewell: "지원자의 마지막 말을 들었다. 주 질문자가 짧게 감사 인사와 함께 면접 종료를 알린다(\"수고하셨습니다\" 포함). kind=closing, end=true, backchannel=false.",
  };
  return [
    `## 단계\n${phaseGuide[req.phase]}`,
    `## 남은 시간: 약 ${Math.round(left / 60)}분 · 직전 계획 질문 이후 꼬리질문 ${followupsSinceLastQuestion(transcript)}회`,
    req.phase === "next" ? `## 이번 발화자\n- ${speaker.id}: ${speaker.name} (${speaker.role}) · 관심: ${speaker.focus.join(", ")}` : "",
    `## 다음 계획 질문\n${next ? `- ${next.id} (${next.interviewerId}, ${next.source}): ${next.question}` : "- 없음"}`,
    coverLetterClaims.length ? `## 자소서 주장\n${coverLetterClaims.map((c) => `- ${c}`).join("\n")}` : "",
    `## 최근 대화\n${recent.join("\n") || "(아직 없음)"}`,
    `JSON 형식: {"speakerId": "이번 발화자 id", "say": "...", "kind": "question|followup|interrupt|closing|reaction", "planId": "q_... 또는 null", "waitMotion": "nod|flipPages|takeNotes|glance|still", "backchannel": true, "end": false}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** 키가 없을 때 쓰는 규칙 기반 진행자 */
export function fallbackAction(
  req: TurnRequest,
  profile: EnvironmentProfile,
  plan: QuestionPlanItem[],
  transcript: TranscriptEntry[],
): DirectorAction {
  const lead = leadOf(profile);
  const strict = profile.pressure >= 4;
  const motion = strict ? "takeNotes" : "nod";
  if (req.phase === "opening") {
    const intro = plan[0] && /자기소개|본인\s*소개|1분\s*소개/.test(plan[0].question) ? plan[0] : null;
    return {
      speakerId: lead.id,
      say: intro ? `반갑습니다. 긴장 푸시고요, ${intro.question}` : "반갑습니다. 긴장 푸시고요, 먼저 1분 정도 간단하게 자기소개 부탁드립니다.",
      kind: "question",
      planId: intro?.id ?? null,
      waitMotion: "still",
      backchannel: false,
      end: false,
    };
  }
  if (req.phase === "timeout") {
    const last = [...transcript].reverse().find((t) => t.speaker !== "candidate");
    return { speakerId: last?.speaker ?? lead.id, say: "잠시만요. 시간 관계상 핵심만 한 문장으로 다시 말씀해 주시겠어요?", kind: "interrupt", planId: null, waitMotion: "still", backchannel: false, end: false };
  }
  if (req.phase === "closing")
    return { speakerId: lead.id, say: "네, 시간이 거의 다 됐네요. 마지막으로 하고 싶은 말씀이 있으시면 해 주세요.", kind: "closing", planId: null, waitMotion: "flipPages", backchannel: true, end: false };
  if (req.phase === "farewell")
    return { speakerId: lead.id, say: "네, 오늘 면접은 여기까지입니다. 수고하셨습니다.", kind: "closing", planId: null, waitMotion: "nod", backchannel: false, end: true };

  const lastAnswer = [...transcript].reverse().find((t) => t.speaker === "candidate");
  const depth = followupsSinceLastQuestion(transcript);
  const vague = lastAnswer && (lastAnswer.text.length < 60 || !/\d/.test(lastAnswer.text));
  if (vague && depth < profile.followupDepth && lastAnswer && !/자기소개/.test(transcript.at(-2)?.text ?? "")) {
    const probes = ["방금 말씀하신 부분을 조금 더 구체적으로 설명해 주시겠어요?", "그 결과를 어떤 수치나 근거로 확인하셨나요?", "그때 본인이 직접 한 일은 정확히 무엇이었나요?"];
    return { speakerId: nextSpeaker(profile.interviewers, transcript).id, say: probes[depth % probes.length], kind: "followup", planId: null, waitMotion: motion, backchannel: !strict, end: false };
  }
  const next = nextPlanned(profile, plan, transcript);
  if (!next)
    return { speakerId: lead.id, say: "네, 마지막으로 하고 싶은 말씀이 있으시면 해 주세요.", kind: "closing", planId: null, waitMotion: "flipPages", backchannel: true, end: false };
  return { speakerId: next.interviewerId, say: next.question, kind: "question", planId: next.id, waitMotion: depth > 0 ? "flipPages" : motion, backchannel: !strict, end: false };
}
