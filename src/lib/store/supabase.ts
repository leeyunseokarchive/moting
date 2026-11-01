import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { ReviewSchema, SessionSchema, type Review, type Session } from "../types";
import { seedReviews } from "../seed/dataset";
import type { Store } from "./index";

const BUCKET = "recordings";

const reviewRow = (r: Review) => ({ id: r.id, status: r.status, company: r.company, data: r });

/**
 * Supabase 저장소. 테이블은 supabase/schema.sql 참고.
 * 세션·후기는 jsonb 한 칸(data)에 통째로 저장해 스키마 변경 부담을 줄였다.
 */
export class SupabaseStore implements Store {
  private db: SupabaseClient;
  private seeded = false;

  constructor() {
    this.db = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getSession(id: string): Promise<Session | null> {
    const { data, error } = await this.db.from("sessions").select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(`세션을 불러오지 못했습니다: ${error.message}`);
    if (!data) return null;
    const parsed = SessionSchema.safeParse(data.data);
    return parsed.success ? parsed.data : null;
  }

  async saveSession(session: Session): Promise<void> {
    const { error } = await this.db
      .from("sessions")
      .upsert({ id: session.id, status: session.status, data: session, updated_at: new Date().toISOString() });
    if (error) throw new Error(`세션을 저장하지 못했습니다: ${error.message}`);
  }

  /** 시드를 넣되 이미 있는 후기(검수 상태·임베딩)는 건드리지 않는다 */
  private async seed() {
    if (this.seeded) return;
    this.seeded = true;
    await this.db
      .from("reviews")
      .upsert(seedReviews().map(reviewRow), { onConflict: "id", ignoreDuplicates: true });
  }

  async listReviews(filter?: { status?: Review["status"] }): Promise<Review[]> {
    await this.seed();
    let q = this.db.from("reviews").select("data").order("created_at", { ascending: false }).limit(5000);
    if (filter?.status) q = q.eq("status", filter.status);
    const { data, error } = await q;
    if (error) throw new Error(`후기를 불러오지 못했습니다: ${error.message}`);
    return (data ?? []).flatMap((row) => {
      const p = ReviewSchema.safeParse(row.data);
      return p.success ? [p.data] : [];
    });
  }

  async saveReviews(reviews: Review[]): Promise<void> {
    const { error } = await this.db.from("reviews").upsert(reviews.map(reviewRow));
    if (error) throw new Error(`후기를 저장하지 못했습니다: ${error.message}`);
  }

  async saveRecording(sessionId: string, data: ArrayBuffer, contentType: string): Promise<string> {
    const path = `${sessionId}.webm`;
    const { error } = await this.db.storage.from(BUCKET).upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`녹음을 저장하지 못했습니다: ${error.message}`);
    return `/api/sessions/${sessionId}/recording`;
  }

  async readRecording(sessionId: string) {
    const { data, error } = await this.db.storage.from(BUCKET).download(`${sessionId}.webm`);
    if (error || !data) return null;
    return { data: await data.arrayBuffer(), contentType: data.type || "audio/webm" };
  }
}
