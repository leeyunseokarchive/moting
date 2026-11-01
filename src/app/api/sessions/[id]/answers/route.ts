import { jsonError, loadSession } from "@/lib/http";
import { evaluateAnswer } from "@/lib/pipeline/evaluate";
import { store } from "@/lib/store";
import { AnswerRecordSchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** 답변 하나를 저장하고 바로 평가한다. 면접 중 백그라운드로 호출된다. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const s = await loadSession(id);
  if (s instanceof Response) return s;
  const body = AnswerRecordSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("답변 형식이 올바르지 않습니다.");
  const answer = body.data;
  answer.eval = await evaluateAnswer(answer, s.profile, s.parsed);

  // 평가 사이에 다른 답변이 저장됐을 수 있으니 최신 세션을 다시 읽어 병합한다
  const latest = (await store().getSession(id)) ?? s;
  const answers = latest.answers.filter((a) => a.id !== answer.id);
  answers.push(answer);
  answers.sort((a, b) => a.startSec - b.startSec);
  await store().saveSession({ ...latest, answers });
  return Response.json({ eval: answer.eval });
}
