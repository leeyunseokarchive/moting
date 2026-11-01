import "server-only";
import { store } from "./store";
import type { Session } from "./types";

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function loadSession(id: string): Promise<Session | Response> {
  if (!/^[\w-]{8,64}$/.test(id)) return jsonError("잘못된 면접 주소입니다.", 404);
  try {
    const s = await store().getSession(id);
    return s ?? jsonError("면접을 찾을 수 없습니다. 처음부터 다시 만들어 주세요.", 404);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "저장소 오류", 500);
  }
}

/** 클라이언트에 보낼 때 원문 서류는 뺀다 */
export function publicSession(s: Session) {
  const { inputsText: _omit, ...rest } = s;
  void _omit;
  return rest;
}
