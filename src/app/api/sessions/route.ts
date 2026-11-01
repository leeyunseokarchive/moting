import { fileToText } from "@/lib/doc-text";
import { providers } from "@/lib/env";
import { embed } from "@/lib/gemini";
import { jsonError } from "@/lib/http";
import { parseInputs } from "@/lib/pipeline/parse";
import { matchReviews } from "@/lib/pipeline/match";
import { buildSetup } from "@/lib/pipeline/setup";
import { store } from "@/lib/store";
import type { InputDoc, Session } from "@/lib/types";

export const maxDuration = 120;

const KINDS: InputDoc["kind"][] = ["posting", "coverLetter", "resume", "guideEmail", "review"];
const REQUIRED: InputDoc["kind"][] = ["posting", "coverLetter", "resume"];
const MAX_FILE = 8 * 1024 * 1024;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

async function fetchPostingFromUrl(rawUrl: string): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error("올바른 채용공고 URL을 입력해 주세요.");
  }
  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return `[채용공고 URL] ${parsedUrl.toString()}`;
    }
    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    const metas = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:title|og:description)["'][^>]*>/gi)]
      .map((m) => m[0].match(/content=["']([^"']+)["']/i)?.[1] ?? "")
      .filter(Boolean);
    const ldJson = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1]?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
    const bodyText = decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 1)
      .join("\n")
      .slice(0, 12000);

    return [
      `[채용공고 URL] ${parsedUrl.toString()}`,
      title ? `제목: ${decodeHtmlEntities(title)}` : "",
      metas.length ? `요약: ${decodeHtmlEntities(metas.join(" / "))}` : "",
      ldJson ? `구조화 데이터:\n${ldJson}` : "",
      bodyText ? `본문:\n${bodyText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return `[채용공고 URL] ${parsedUrl.toString()}`;
  }
}

async function readDoc(form: FormData, kind: InputDoc["kind"]): Promise<InputDoc | null> {
  let text = String(form.get(kind) ?? "").trim();
  if (kind === "posting") {
    const postingUrl = String(form.get("postingUrl") ?? "").trim();
    if (postingUrl) {
      const fetched = await fetchPostingFromUrl(postingUrl);
      text = [fetched, text].filter(Boolean).join("\n\n");
    } else if (/^https?:\/\/\S+$/i.test(text)) {
      text = await fetchPostingFromUrl(text);
    }
  }
  const file = form.get(`${kind}File`);
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) throw new Error(`${file.name} 파일이 8MB를 넘습니다. 더 작은 파일을 올려 주세요.`);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      const buf = Buffer.from(await file.arrayBuffer());
      return { kind, text, pdfBase64: buf.toString("base64"), fileName: file.name };
    }
    const fileText = await fileToText(file);
    return { kind, text: [text, fileText].filter(Boolean).join("\n"), fileName: file.name };
  }
  return text ? { kind, text } : null;
}

/**
 * 면접 만들기. 진행 단계를 NDJSON으로 흘려보내고 마지막 줄에 id를 준다.
 * {"step":"parse"} → {"step":"match"} → {"step":"setup"} → {"done":true,"id":"..."}
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("입력 형식이 올바르지 않습니다.");
  }

  let docs: InputDoc[];
  try {
    docs = (await Promise.all(KINDS.map((k) => readDoc(form, k)))).filter((d): d is InputDoc => d !== null);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
  }
  const missing = REQUIRED.filter((k) => !docs.some((d) => d.kind === k));
  if (missing.length) {
    const names = { posting: "채용공고", coverLetter: "자기소개서", resume: "이력서" } as Record<string, string>;
    return jsonError(`${missing.map((m) => names[m]).join(", ")}를 넣어 주세요.`);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        send({ step: "parse" });
        const parsed = await parseInputs(docs);

        send({ step: "match" });
        const reviews = await store().listReviews({ status: "approved" });
        let queryEmbedding: number[] | undefined;
        if (providers().llm) {
          try {
            const missingEmb = reviews.filter((r) => !r.embedding);
            const texts = [
              `${parsed.company} ${parsed.job} ${parsed.industry} ${parsed.companyType} ${parsed.postingSummary}`,
              ...missingEmb.map((r) => `${r.company} ${r.job} ${r.industry} ${r.companyType} ${r.format} ${r.questions.join(" ")}`),
            ];
            const vecs = await embed(texts);
            queryEmbedding = vecs[0];
            missingEmb.forEach((r, i) => (r.embedding = vecs[i + 1]));
            // 계산한 후기 임베딩은 저장해 두고 재사용한다
            await store().saveReviews(missingEmb).catch(() => {});
          } catch (e) {
            console.error("[sessions] 임베딩 실패, 키워드 매칭만 사용", e);
          }
        }
        const match = matchReviews(parsed, reviews, { queryEmbedding });

        send({ step: "setup", match: match.summary });
        const userReview = docs.filter((d) => d.kind === "review").map((d) => d.text).join("\n");
        const { profile, plan } = await buildSetup(parsed, match, reviews, userReview);

        const p = providers();
        const session: Session = {
          id: crypto.randomUUID(),
          status: "setup",
          createdAt: new Date().toISOString(),
          inputsMeta: docs.map((d) => ({ kind: d.kind, fileName: d.fileName, chars: d.text.length + (d.pdfBase64 ? 1 : 0) })),
          inputsText: Object.fromEntries(docs.map((d) => [d.kind, d.text.slice(0, 20000)])),
          parsed,
          match,
          profile,
          plan,
          hidePlan: true,
          transcript: [],
          answers: [],
          recordingUrl: null,
          startedAt: null,
          endedAt: null,
          report: null,
          demo: !p.llm,
        };
        await store().saveSession(session);
        send({ done: true, id: session.id });
      } catch (e) {
        console.error("[sessions] 생성 실패", e);
        send({ error: e instanceof Error ? e.message : "면접을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
