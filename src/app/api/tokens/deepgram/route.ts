import { env, providers } from "@/lib/env";
import { recordApiUsage } from "@/lib/usage";

/** 브라우저가 Deepgram에 직접 붙을 수 있도록 10분짜리 임시 토큰을 준다. */
export async function POST() {
  if (!providers().stt) return new Response(null, { status: 204 });
  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${env.deepgramKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 600 }),
    });
    if (!res.ok) {
      console.error("[deepgram] grant 실패", res.status, await res.text());
      return new Response(null, { status: 204 });
    }
    void recordApiUsage({ deepgramTokens: 1 });
    const json = (await res.json()) as { access_token: string; expires_in: number };
    return Response.json({ token: json.access_token, expiresIn: json.expires_in }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[deepgram] grant 오류", e);
    return new Response(null, { status: 204 });
  }
}
