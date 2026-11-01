import "server-only";
import { z } from "zod";
import { env } from "./env";
import { recordApiUsage } from "./usage";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

type GenerateOptions = {
  model: string;
  system?: string;
  parts: Part[];
  thinking?: "minimal" | "low" | "medium" | "high";
  temperature?: number;
  timeoutMs?: number;
  jsonSchema?: Record<string, unknown>;
};

async function post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": env.geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GeminiError(e instanceof Error && e.name === "AbortError" ? "응답 시간 초과" : String(e));
  } finally {
    clearTimeout(t);
  }
}

async function generateRaw(opts: GenerateOptions): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
  };
  if (opts.thinking) generationConfig.thinkingConfig = { thinkingLevel: opts.thinking };
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
  if (opts.jsonSchema) generationConfig.responseJsonSchema = opts.jsonSchema;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig,
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  let res = await post(`${BASE}/${opts.model}:generateContent`, body, opts.timeoutMs ?? 45000);
  if (res.status === 400 && opts.jsonSchema) {
    // 스키마를 받지 않는 모델이면 스키마 없이 재시도
    delete generationConfig.responseJsonSchema;
    res = await post(`${BASE}/${opts.model}:generateContent`, body, opts.timeoutMs ?? 45000);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new GeminiError(`Gemini ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  void recordApiUsage({ llmCalls: 1 });
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) throw new GeminiError("빈 응답");
  return text;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new GeminiError("JSON 파싱 실패");
  }
}

/** 스키마에 맞는 JSON을 생성한다. 실패 시 1회 재시도 후 예외. */
export async function generateJSON<T extends z.ZodType>(
  schema: T,
  opts: Omit<GenerateOptions, "jsonSchema"> & { useSchema?: boolean },
): Promise<z.infer<T>> {
  const jsonSchema = opts.useSchema === false ? undefined : toGeminiSchema(schema);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generateRaw({ ...opts, jsonSchema });
      return schema.parse(extractJson(raw));
    } catch (e) {
      lastErr = e;
      if (e instanceof GeminiError && e.status >= 400 && e.status < 500 && e.status !== 429) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new GeminiError(String(lastErr));
}

function toGeminiSchema(schema: z.ZodType): Record<string, unknown> | undefined {
  try {
    const js = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input", unrepresentable: "any" }) as Record<
      string,
      unknown
    >;
    delete js.$schema;
    return js;
  } catch {
    return undefined;
  }
}

/** 텍스트 임베딩(배치). 256차원으로 줄여 저장 비용을 낮춘다. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > 100) {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) out.push(...(await embed(texts.slice(i, i + 100))));
    return out;
  }
  const model = env.models.embed;
  const res = await post(
    `${BASE}/${model}:batchEmbedContents`,
    {
      requests: texts.map((t) => ({
        model: `models/${model}`,
        content: { parts: [{ text: t.slice(0, 6000) }] },
        outputDimensionality: 256,
      })),
    },
    30000,
  );
  if (!res.ok) throw new GeminiError(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  void recordApiUsage({ embedCalls: 1 });
  const json = (await res.json()) as { embeddings: { values: number[] }[] };
  return json.embeddings.map((e) => e.values);
}

/**
 * TTS 스트림. Gemini가 보내는 PCM16(24kHz, mono) 바이트를 그대로 흘려보낸다.
 * text는 글자 그대로 낭독되므로 톤 지시문을 섞으면 안 된다.
 */
export async function streamSpeech(text: string, voice: string): Promise<ReadableStream<Uint8Array>> {
  const res = await post(
    `${BASE}/${env.models.tts}:streamGenerateContent?alt=sse`,
    {
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    },
    30000,
  );
  if (!res.ok || !res.body) throw new GeminiError(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  void recordApiUsage({ ttsCalls: 1 });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let emitted = false;
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = event.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const json = JSON.parse(line.slice(5)) as {
              candidates?: { content?: { parts?: { inlineData?: { data: string } }[] } }[];
            };
            for (const part of json.candidates?.[0]?.content?.parts ?? []) {
              if (part.inlineData?.data) {
                controller.enqueue(Uint8Array.from(Buffer.from(part.inlineData.data, "base64")));
                emitted = true;
              }
            }
          } catch {
            /* 잘린 이벤트는 무시 */
          }
        }
        if (emitted) return;
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
