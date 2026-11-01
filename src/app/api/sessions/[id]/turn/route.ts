import { z } from "zod";
import { env, providers } from "@/lib/env";
import { generateJSON } from "@/lib/gemini";
import { jsonError, loadSession } from "@/lib/http";
import {
  directorSystem,
  directorUserPrompt,
  fallbackAction,
  normalizeAction,
  type TurnPhase,
} from "@/lib/pipeline/director";
import { store } from "@/lib/store";
import { DirectorActionSchema, TranscriptEntrySchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  phase: z.enum(["opening", "next", "timeout", "closing", "farewell"]),
  elapsedSec: z.number().min(0),
  lastAnswerSec: z.number().optional(),
  transcript: z.array(TranscriptEntrySchema).max(400),
});

/** 다음 면접관 발화를 정한다. 진행 중 대화 기록도 함께 저장한다. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await loadSession((await params).id);
  if (s instanceof Response) return s;
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("요청 형식이 올바르지 않습니다.");
  const { phase, elapsedSec, lastAnswerSec, transcript } = body.data;
  const turn = { phase: phase as TurnPhase, elapsedSec, lastAnswerSec };

  let action = fallbackAction(turn, s.profile, s.plan, transcript);
  let source: "llm" | "rule" = "rule";
  if (providers().llm) {
    try {
      const raw = await generateJSON(DirectorActionSchema, {
        model: env.models.fast,
        system: directorSystem(s.profile),
        thinking: "low",
        timeoutMs: 8000,
        useSchema: false,
        parts: [
          {
            text: directorUserPrompt(
              turn,
              s.profile,
              s.plan,
              transcript,
              s.parsed.coverLetterClaims.map((c) => c.claim),
            ),
          },
        ],
      });
      action = normalizeAction(raw, s.profile, s.plan, transcript);
      if (phase === "farewell") action.end = true;
      source = "llm";
    } catch (e) {
      console.error("[turn] 진행자 LLM 실패, 규칙 기반 사용", e);
    }
  }

  // 대화 기록 저장(실패해도 진행은 계속). 답변 평가 저장과 겹치지 않게 최신본에 기록만 바꾼다.
  void (async () => {
    try {
      const latest = (await store().getSession(s.id)) ?? s;
      if (latest.status === "finished") return;
      await store().saveSession({
        ...latest,
        status: "interviewing",
        startedAt: latest.startedAt ?? new Date().toISOString(),
        transcript,
      });
    } catch (e) {
      console.error("[turn] 저장 실패", e);
    }
  })();

  return Response.json({ action, source });
}
