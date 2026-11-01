import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { store } from "@/lib/store";

function authorized(req: Request): boolean {
  const given = Buffer.from(req.headers.get("x-admin-password") ?? "");
  const expected = Buffer.from(env.adminPassword);
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!env.adminPassword) return jsonError("ADMIN_PASSWORD가 설정되지 않았습니다.", 503);
  if (!authorized(req)) return jsonError("비밀번호가 맞지 않습니다.", 401);
  const status = new URL(req.url).searchParams.get("status");
  const reviews = await store().listReviews(
    status === "pending" || status === "approved" || status === "rejected" ? { status } : undefined,
  );
  return Response.json(reviews.map(({ embedding: _e, ...r }) => (void _e, r)), { headers: { "Cache-Control": "no-store" } });
}

const PatchSchema = z.object({ id: z.string(), status: z.enum(["approved", "rejected", "pending"]) });

export async function PATCH(req: Request) {
  if (!env.adminPassword) return jsonError("ADMIN_PASSWORD가 설정되지 않았습니다.", 503);
  if (!authorized(req)) return jsonError("비밀번호가 맞지 않습니다.", 401);
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("요청이 올바르지 않습니다.");
  const all = await store().listReviews();
  const review = all.find((r) => r.id === body.data.id);
  if (!review) return jsonError("후기를 찾을 수 없습니다.", 404);
  await store().saveReviews([{ ...review, status: body.data.status }]);
  return Response.json({ ok: true });
}
