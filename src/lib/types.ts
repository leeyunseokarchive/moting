import { z } from "zod";

/* ───────── 입력 ───────── */

export const InputDocSchema = z.object({
  kind: z.enum(["posting", "coverLetter", "resume", "guideEmail", "review"]),
  /** 사용자가 붙여넣은 텍스트 또는 PDF에서 추출한 텍스트 */
  text: z.string().default(""),
  /** PDF 원본(base64). 서버에서 Gemini에 직접 전달 */
  pdfBase64: z.string().optional(),
  fileName: z.string().optional(),
});
export type InputDoc = z.infer<typeof InputDocSchema>;

export const ParsedInputSchema = z.object({
  company: z.string().default(""),
  job: z.string().default(""),
  industry: z.string().default(""),
  companyType: z
    .enum(["대기업", "중견기업", "공기업", "스타트업", "외국계", "기타"])
    .default("기타"),
  stage: z.string().default("1차 면접"),
  postingSummary: z.string().default(""),
  requirements: z.array(z.string()).default([]),
  candidateName: z.string().default(""),
  candidateHighlights: z.array(z.string()).default([]),
  coverLetterClaims: z
    .array(z.object({ claim: z.string(), detail: z.string().default("") }))
    .default([]),
  emailFacts: z
    .object({
      format: z.string().default(""),
      interviewers: z.number().int().min(0).max(5).default(0),
      durationMin: z.number().int().min(0).max(120).default(0),
      notes: z.string().default(""),
    })
    .default({ format: "", interviewers: 0, durationMin: 0, notes: "" }),
});
export type ParsedInput = z.infer<typeof ParsedInputSchema>;

/* ───────── 후기 ───────── */

export const ReviewSchema = z.object({
  id: z.string(),
  company: z.string(),
  job: z.string(),
  industry: z.string().default(""),
  companyType: z.string().default("기타"),
  stage: z.string().default("1차 면접"),
  format: z.string().default(""),
  interviewerCount: z.number().int().min(1).max(5).default(2),
  questions: z.array(z.string()).default([]),
  atmosphere: z.string().default(""),
  pressure: z.number().int().min(1).max(5).default(3),
  tips: z.string().default(""),
  source: z.string().default("team"),
  collectedAt: z.string().default(""),
  status: z.enum(["approved", "pending", "rejected"]).default("approved"),
  isSample: z.boolean().default(false),
  embedding: z.array(z.number()).optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const MatchTier = z.enum(["exact", "company", "similar", "default"]);
export type MatchTier = z.infer<typeof MatchTier>;

export const MatchResultSchema = z.object({
  tier: MatchTier,
  reviewIds: z.array(z.string()),
  summary: z.string(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

/* ───────── 면접 환경 ───────── */

export const InterviewerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  focus: z.array(z.string()).default([]),
  style: z.string().default(""),
  pressure: z.number().int().min(1).max(5).default(3),
  faceId: z.string(),
  portrait: z.string(),
  voice: z.string(),
  gender: z.enum(["male", "female"]),
  isLead: z.boolean().default(false),
});
export type Interviewer = z.infer<typeof InterviewerSchema>;

export const EnvironmentProfileSchema = z.object({
  company: z.string(),
  job: z.string(),
  stage: z.string(),
  format: z.string(),
  durationMin: z.number().int().min(5).max(60),
  atmosphere: z.string(),
  pressure: z.number().int().min(1).max(5),
  interruptRate: z.enum(["low", "mid", "high"]),
  silenceToleranceSec: z.number().min(2).max(15),
  followupDepth: z.number().int().min(0).max(4),
  maxAnswerSec: z.number().int().min(30).max(240),
  frequentProbes: z.array(z.string()).default([]),
  evaluationPoints: z.array(z.string()).default([]),
  greetingStyle: z.string().default(""),
  interviewers: z.array(InterviewerSchema).min(1).max(3),
  evidence: z
    .array(z.object({ reviewId: z.string(), note: z.string() }))
    .default([]),
  confidence: z.number().min(0).max(1),
});
export type EnvironmentProfile = z.infer<typeof EnvironmentProfileSchema>;

export const QuestionPlanItemSchema = z.object({
  id: z.string(),
  interviewerId: z.string(),
  question: z.string(),
  intent: z.string().default(""),
  source: z.enum(["review", "posting", "coverLetter", "resume", "general", "bank"]),
  /** 질문 은행에서 온 질문의 출처 표기(라이선스 의무) */
  credit: z.object({ url: z.string().nullable(), license: z.string() }).optional(),
});
export type QuestionPlanItem = z.infer<typeof QuestionPlanItemSchema>;

/* ───────── 면접 진행 ───────── */

export const TranscriptEntrySchema = z.object({
  speaker: z.string(), // interviewer id 또는 "candidate"
  text: z.string(),
  at: z.number(), // 면접 시작 기준 ms
  endAt: z.number().optional(),
  kind: z
    .enum(["greeting", "question", "followup", "interrupt", "reaction", "closing", "answer"])
    .default("question"),
  planId: z.string().optional(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

export const WaitMotion = z.enum(["nod", "flipPages", "takeNotes", "glance", "still"]);
export type WaitMotion = z.infer<typeof WaitMotion>;

export const DirectorActionSchema = z.object({
  speakerId: z.string(),
  say: z.string(),
  kind: z.enum(["question", "followup", "interrupt", "closing", "reaction"]),
  planId: z.string().nullable().default(null),
  waitMotion: WaitMotion.default("nod"),
  backchannel: z.boolean().default(true),
  end: z.boolean().default(false),
});
export type DirectorAction = z.infer<typeof DirectorActionSchema>;

export const WordTimingSchema = z.object({
  word: z.string(),
  start: z.number(), // 녹음 기준 초
  end: z.number(),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const VoiceMetricsSchema = z.object({
  durationSec: z.number(),
  avgDb: z.number(),
  dbStdev: z.number(),
  syllablesPerMin: z.number(),
  fillerCount: z.number(),
  fillers: z.array(z.string()),
  latencySec: z.number(), // 질문 끝 → 답변 시작
  longPauses: z.number(), // 2초 이상 침묵
});
export type VoiceMetrics = z.infer<typeof VoiceMetricsSchema>;

export const FaceMetricsSchema = z.object({
  samples: z.number(),
  gazeAwayRatio: z.number(),
  headMovement: z.number(),
  smileRatio: z.number(),
  blinkPerMin: z.number(),
});
export type FaceMetrics = z.infer<typeof FaceMetricsSchema>;

export const AnswerEvalSchema = z.object({
  score: z.number().int().min(1).max(5),
  summary: z.string(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  /** 답변 안에서 펜으로 표시할 구절 */
  marks: z
    .array(
      z.object({
        quote: z.string(),
        type: z.enum(["good", "bad", "question"]),
        note: z.string(),
      }),
    )
    .default([]),
  betterAnswer: z.string().default(""),
  consistencyIssue: z.string().default(""),
});
export type AnswerEval = z.infer<typeof AnswerEvalSchema>;

export const AnswerRecordSchema = z.object({
  id: z.string(),
  questionEntryIndex: z.number(),
  interviewerId: z.string(),
  question: z.string(),
  answer: z.string(),
  startSec: z.number(), // 녹음 기준
  endSec: z.number(),
  words: z.array(WordTimingSchema).default([]),
  voice: VoiceMetricsSchema.optional(),
  face: FaceMetricsSchema.optional(),
  interrupted: z.boolean().default(false),
  eval: AnswerEvalSchema.optional(),
});
export type AnswerRecord = z.infer<typeof AnswerRecordSchema>;

export const ReportSchema = z.object({
  overallScore: z.number().int().min(1).max(100),
  verdict: z.string(),
  headline: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  companyFit: z.array(
    z.object({ point: z.string(), rating: z.number().int().min(1).max(5), comment: z.string() }),
  ),
  interviewerNotes: z.array(z.object({ interviewerId: z.string(), note: z.string() })),
  nextSteps: z.array(z.string()),
});
export type Report = z.infer<typeof ReportSchema>;

export const SessionStatus = z.enum(["setup", "interviewing", "finished"]);

export const SessionSchema = z.object({
  id: z.string(),
  status: SessionStatus,
  createdAt: z.string(),
  inputsMeta: z.array(z.object({ kind: z.string(), fileName: z.string().optional(), chars: z.number() })),
  inputsText: z.record(z.string(), z.string()).default({}),
  parsed: ParsedInputSchema,
  match: MatchResultSchema,
  profile: EnvironmentProfileSchema,
  plan: z.array(QuestionPlanItemSchema),
  hidePlan: z.boolean().default(true),
  transcript: z.array(TranscriptEntrySchema).default([]),
  answers: z.array(AnswerRecordSchema).default([]),
  recordingUrl: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  endedAt: z.string().nullable().default(null),
  report: ReportSchema.nullable().default(null),
  demo: z.boolean().default(false),
});
export type Session = z.infer<typeof SessionSchema>;
