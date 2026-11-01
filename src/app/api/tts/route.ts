import { z } from "zod";
import { providers } from "@/lib/env";
import { streamSpeech } from "@/lib/gemini";
import { jsonError } from "@/lib/http";

const VOICES = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi",
  "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Sadachbia", "Sadaltager", "Sulafat", "Vindemiatrix",
]);

const BodySchema = z.object({
  text: z.string().min(1).max(600),
  voice: z.string(),
});

/**
 * 면접관 음성. 응답 본문은 헤더 없는 PCM16(24kHz, mono) 스트림.
 * TTS를 쓸 수 없으면 204를 돌려 브라우저 음성 합성으로 대체하게 한다.
 */
export async function POST(req: Request) {
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("음성 요청이 올바르지 않습니다.");
  if (!providers().tts) return new Response(null, { status: 204 });
  const voice = VOICES.has(body.data.voice) ? body.data.voice : "Charon";
  try {
    const stream = await streamSpeech(body.data.text, voice);
    return new Response(stream, {
      headers: {
        "Content-Type": "audio/l16; rate=24000; channels=1",
        "Cache-Control": "no-store",
        "X-Sample-Rate": "24000",
      },
    });
  } catch (e) {
    console.error("[tts] 실패", e);
    return new Response(null, { status: 204 });
  }
}
