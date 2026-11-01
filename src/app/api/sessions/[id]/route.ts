import { z } from "zod";
import { jsonError, loadSession, publicSession } from "@/lib/http";
import { store } from "@/lib/store";
import { EnvironmentProfileSchema, QuestionPlanItemSchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const s = await loadSession((await params).id);
  if (s instanceof Response) return s;
  return Response.json(publicSession(s), { headers: { "Cache-Control": "no-store" } });
}

const PatchSchema = z.object({
  profile: EnvironmentProfileSchema.optional(),
  plan: z.array(QuestionPlanItemSchema).min(1).max(20).optional(),
  hidePlan: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const s = await loadSession((await params).id);
  if (s instanceof Response) return s;
  if (s.status === "finished") return jsonError("이미 끝난 면접은 수정할 수 없습니다.", 409);
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("수정 내용이 올바르지 않습니다.");
  const next = { ...s, ...body.data };
  // 질문 계획의 면접관이 사라졌다면 주 질문자에게 넘긴다
  const ids = new Set(next.profile.interviewers.map((i) => i.id));
  const lead = next.profile.interviewers.find((i) => i.isLead) ?? next.profile.interviewers[0];
  next.plan = next.plan.map((p) => (ids.has(p.interviewerId) ? p : { ...p, interviewerId: lead.id }));
  await store().saveSession(next);
  return Response.json(publicSession(next));
}
