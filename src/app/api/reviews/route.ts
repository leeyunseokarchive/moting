import { z } from "zod";
import { jsonError } from "@/lib/http";
import { store } from "@/lib/store";
import { uid } from "@/lib/util";

const BodySchema = z.object({
  company: z.string().trim().min(1).max(60),
  job: z.string().trim().min(1).max(60),
  industry: z.string().trim().max(40).default(""),
  companyType: z.enum(["대기업", "중견기업", "공기업", "스타트업", "외국계", "기타"]).default("기타"),
  stage: z.string().trim().max(40).default("1차 면접"),
  format: z.string().trim().max(120).default(""),
  interviewerCount: z.number().int().min(1).max(5).default(2),
  questions: z.array(z.string().trim().min(2).max(300)).min(1).max(20),
  atmosphere: z.string().trim().max(500).default(""),
  pressure: z.number().int().min(1).max(5).default(3),
  tips: z.string().trim().max(500).default(""),
  similarity: z.number().int().min(1).max(5).optional(),
  sessionId: z.string().optional(),
});

/** 실제 면접 후기 제출. 관리자 검수 전까지 매칭에 쓰지 않는다(pending). */
export async function POST(req: Request) {
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("회사, 직무, 질문 1개 이상을 입력해 주세요.");
  const { similarity, sessionId, ...rest } = body.data;
  const review = {
    ...rest,
    id: uid("user"),
    source: `user${sessionId ? `:${sessionId}` : ""}${similarity ? `:sim${similarity}` : ""}`,
    collectedAt: new Date().toISOString().slice(0, 10),
    status: "pending" as const,
    isSample: false,
  };
  await store().saveReviews([review]);
  return Response.json({ id: review.id });
}
