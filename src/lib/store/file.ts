import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ReviewSchema, SessionSchema, type Review, type Session } from "../types";
import { seedReviews } from "../seed/dataset";
import { uid } from "../util";
import type { Store } from "./index";

/** 키가 없을 때 쓰는 로컬 파일 저장소(.data/). 개발·시연용. */
export class FileStore implements Store {
  private reviewWrites: Promise<void> = Promise.resolve();

  constructor(private root = process.env.MOTING_DATA_DIR ?? path.join(process.cwd(), ".data")) {}

  private file(...parts: string[]) {
    return path.join(this.root, ...parts);
  }

  private async readJson<T>(p: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(p, "utf8")) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(p: string, data: unknown) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${uid()}.tmp`; // 동시 저장이 같은 임시 파일을 쓰면 내용이 섞인다
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, p);
  }

  async getSession(id: string): Promise<Session | null> {
    if (!/^[\w-]+$/.test(id)) return null;
    const raw = await this.readJson<unknown>(this.file("sessions", `${id}.json`));
    if (!raw) return null;
    const parsed = SessionSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async saveSession(session: Session): Promise<void> {
    await this.writeJson(this.file("sessions", `${session.id}.json`), session);
  }

  private async storedReviews(): Promise<Review[]> {
    const reviews = (await this.readJson<unknown[]>(this.file("reviews.json"))) ?? [];
    return reviews.flatMap((r) => {
      const p = ReviewSchema.safeParse(r);
      return p.success ? [p.data] : [];
    });
  }

  /** 저장본(임베딩·검수 상태 포함)이 시드를 덮는다 */
  async listReviews(filter?: { status?: Review["status"] }): Promise<Review[]> {
    const stored = await this.storedReviews();
    const ids = new Set(stored.map((r) => r.id));
    const all = [...stored, ...seedReviews().filter((r) => !ids.has(r.id))];
    return filter?.status ? all.filter((r) => r.status === filter.status) : all;
  }

  /** 읽고-고쳐-쓰기라 겹치면 나중 쓰기가 앞선 내용을 지운다. 차례대로 처리한다. */
  saveReviews(reviews: Review[]): Promise<void> {
    const write = this.reviewWrites.then(async () => {
      const byId = new Map((await this.storedReviews()).map((r) => [r.id, r]));
      for (const r of reviews) byId.set(r.id, r);
      await this.writeJson(this.file("reviews.json"), [...byId.values()]);
    });
    this.reviewWrites = write.catch(() => {});
    return write;
  }

  async saveRecording(sessionId: string, data: ArrayBuffer, contentType: string): Promise<string> {
    const p = this.file("recordings", `${sessionId}.bin`);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, Buffer.from(data));
    await fs.writeFile(`${p}.type`, contentType);
    return `/api/sessions/${sessionId}/recording`;
  }

  async readRecording(sessionId: string) {
    try {
      const p = this.file("recordings", `${sessionId}.bin`);
      const data = await fs.readFile(p);
      const contentType = (await fs.readFile(`${p}.type`, "utf8").catch(() => "audio/webm")) || "audio/webm";
      return { data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, contentType };
    } catch {
      return null;
    }
  }
}
