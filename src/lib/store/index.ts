import "server-only";
import type { Review, Session } from "../types";
import { providers } from "../env";
import { FileStore } from "./file";
import { SupabaseStore } from "./supabase";

export interface Store {
  getSession(id: string): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;
  listReviews(filter?: { status?: Review["status"] }): Promise<Review[]>;
  saveReviews(reviews: Review[]): Promise<void>;
  saveRecording(sessionId: string, data: ArrayBuffer, contentType: string): Promise<string>;
  readRecording(sessionId: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
}

let instance: Store | null = null;

export function store(): Store {
  if (!instance) instance = providers().storage === "supabase" ? new SupabaseStore() : new FileStore();
  return instance;
}
