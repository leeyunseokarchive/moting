import { connection } from "next/server";
import { getApiQuotaStatus } from "@/lib/usage";

/** 어떤 기능이 실제 API로 동작하는지 및 로컬 API 잔여 한도를 알려준다(키 값은 노출하지 않음). */
export async function GET() {
  await connection();
  const status = await getApiQuotaStatus();
  return Response.json(
    { ...status.providers, usage: status.usage, quotas: status.quotas },
    { headers: { "Cache-Control": "no-store" } },
  );
}
