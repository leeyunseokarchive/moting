"use client";

import type { Session } from "@/lib/types";

export type PublicSession = Omit<Session, "inputsText">;

export type ProvidersInfo = {
  llm: boolean;
  tts: boolean;
  stt: boolean;
  avatar: boolean;
  storage: "supabase" | "file";
};

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `요청에 실패했습니다(${res.status}).`;
  } catch {
    return `요청에 실패했습니다(${res.status}).`;
  }
}

export async function getSession(id: string): Promise<PublicSession> {
  const res = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function patchSession(
  id: string,
  patch: Partial<Pick<PublicSession, "profile" | "plan" | "hidePlan">>,
): Promise<PublicSession> {
  const res = await fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function getProviders(): Promise<ProvidersInfo> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) return { llm: false, tts: false, stt: false, avatar: false, storage: "file" };
  return res.json();
}

export type CreateStep = "upload" | "parse" | "match" | "setup";

/** 면접 만들기: 진행 단계를 콜백으로 알려주고 id를 돌려준다 */
export async function createSession(form: FormData, onStep: (s: CreateStep, detail?: string) => void): Promise<string> {
  onStep("upload");
  const res = await fetch("/api/sessions", { method: "POST", body: form });
  if (!res.ok || !res.body) throw new Error(await errorMessage(res));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { step?: CreateStep; match?: string; done?: boolean; id?: string; error?: string };
      if (msg.error) throw new Error(msg.error);
      if (msg.step) onStep(msg.step, msg.match);
      if (msg.done && msg.id) return msg.id;
    }
  }
  throw new Error("면접을 만들지 못했습니다. 다시 시도해 주세요.");
}
