import { jsonError, loadSession } from "@/lib/http";
import { store } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

const MAX = 60 * 1024 * 1024;

/** 지원자 음성 녹음 업로드(원본 바이트). */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const s = await loadSession(id);
  if (s instanceof Response) return s;
  const data = await req.arrayBuffer();
  if (data.byteLength === 0) return jsonError("녹음이 비어 있습니다.");
  if (data.byteLength > MAX) return jsonError("녹음 파일이 너무 큽니다.", 413);
  const contentType = req.headers.get("content-type") || "audio/webm";
  const url = await store().saveRecording(id, data, contentType);
  const latest = (await store().getSession(id)) ?? s;
  await store().saveSession({ ...latest, recordingUrl: url });
  return Response.json({ url });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const s = await loadSession(id);
  if (s instanceof Response) return s;
  const rec = await store().readRecording(id);
  if (!rec) return jsonError("녹음이 없습니다.", 404);
  return new Response(rec.data, {
    headers: { "Content-Type": rec.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
