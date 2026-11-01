import { z } from "zod";
import { env, providers } from "@/lib/env";
import { PERSONAS } from "@/lib/interviewers";
import { recordApiUsage } from "@/lib/usage";

const BodySchema = z.object({ faceId: z.string().uuid() });
const ALLOWED = new Set(PERSONAS.map((p) => p.faceId));

/** Simli 세션 토큰 발급. 허용된 얼굴만, 세션은 짧게 잡아 비용을 묶어 둔다. */
export async function POST(req: Request) {
  if (!providers().avatar) return new Response(null, { status: 204 });
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success || !ALLOWED.has(body.data.faceId)) return Response.json({ error: "허용되지 않은 얼굴입니다." }, { status: 400 });
  try {
    const res = await fetch("https://api.simli.ai/compose/token", {
      method: "POST",
      headers: { "x-simli-api-key": env.simliKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        faceId: body.data.faceId,
        maxSessionLength: 1800,
        maxIdleTime: 120,
        handleSilence: true,
      }),
    });
    if (!res.ok) {
      console.error("[simli] 토큰 실패", res.status, await res.text());
      return new Response(null, { status: 204 });
    }
    void recordApiUsage({ simliTokens: 1, interviewMinutes: 0.8 });
    const json = (await res.json()) as { session_token: string };
    return Response.json({ sessionToken: json.session_token }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[simli] 토큰 오류", e);
    return new Response(null, { status: 204 });
  }
}
