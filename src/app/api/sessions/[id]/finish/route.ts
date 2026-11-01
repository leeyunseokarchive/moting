import { z } from "zod";
import { jsonError, loadSession, publicSession } from "@/lib/http";
import { buildReport, evaluateAnswer } from "@/lib/pipeline/evaluate";
import { store } from "@/lib/store";
import { AnswerRecordSchema, TranscriptEntrySchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 120;

const BodySchema = z.object({
  transcript: z.array(TranscriptEntrySchema).max(400),
  /** 아직 서버에 도착하지 않은 답변(마지막 답변 등) */
  answers: z.array(AnswerRecordSchema).max(60).default([]),
});

/** 면접 종료: 남은 답변을 평가하고 최종 보고서를 만든다. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const s = await loadSession(id);
  if (s instanceof Response) return s;
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("요청 형식이 올바르지 않습니다.");

  const latest = (await store().getSession(id)) ?? s;
  const byId = new Map(latest.answers.map((a) => [a.id, a]));
  for (const a of body.data.answers) if (!byId.get(a.id)?.eval) byId.set(a.id, a);
  const answers = await Promise.all(
    [...byId.values()].map(async (a) => (a.eval ? a : { ...a, eval: await evaluateAnswer(a, latest.profile, latest.parsed) })),
  );
  answers.sort((a, b) => a.startSec - b.startSec);
  const report = await buildReport(answers, latest.profile, latest.parsed);
  const finished = {
    ...latest,
    status: "finished" as const,
    transcript: body.data.transcript,
    answers,
    report,
    endedAt: new Date().toISOString(),
  };
  await store().saveSession(finished);
  return Response.json(publicSession(finished));
}
