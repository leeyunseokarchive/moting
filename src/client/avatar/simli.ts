"use client";

import { LogLevel, SimliClient } from "simli-client";

type Slot = {
  faceId: string;
  video: HTMLVideoElement;
  audio: HTMLAudioElement;
  client: SimliClient | null;
  state: "idle" | "connecting" | "live" | "failed";
  connecting: Promise<boolean> | null;
  lastUsed: number;
  speaking: boolean;
  silentWaiters: (() => void)[];
};

/**
 * 면접관별 Simli 세션 관리. 비용을 줄이려고 maxLive개까지만 연결을 유지하고,
 * 나머지는 정지 사진으로 둔다. 연결 실패 시 false를 돌려 로컬 오디오로 대체하게 한다.
 */
export class AvatarManager {
  private slots = new Map<string, Slot>();
  private enabled: boolean | null = null;
  onChange?: (id: string, state: Slot["state"], speaking: boolean) => void;

  constructor(private maxLive = 1) {}

  register(id: string, faceId: string, video: HTMLVideoElement, audio: HTMLAudioElement) {
    const existing = this.slots.get(id);
    if (existing && existing.video === video) return;
    this.slots.set(id, {
      faceId,
      video,
      audio,
      client: null,
      state: "idle",
      connecting: null,
      lastUsed: 0,
      speaking: false,
      silentWaiters: [],
    });
  }

  isLive(id: string) {
    return this.slots.get(id)?.state === "live";
  }

  /** id들은 연결을 유지하고, 한도를 넘는 나머지는 오래된 순으로 끊는다 */
  async retain(ids: string[]): Promise<void> {
    if (this.enabled === false) return;
    const wanted = ids.filter((id, i) => ids.indexOf(id) === i && this.slots.has(id)).slice(0, this.maxLive);
    const live = [...this.slots.entries()].filter(([, s]) => s.state === "live" || s.state === "connecting");
    const extra = live.filter(([id]) => !wanted.includes(id)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const overflow = live.length + wanted.filter((id) => !live.some(([lid]) => lid === id)).length - this.maxLive;
    for (let i = 0; i < Math.max(0, overflow) && i < extra.length; i++) await this.disconnect(extra[i][0]);
    for (const id of wanted) await this.ensure(id);
  }

  /** 연결을 보장한다. 이미 연결 중이면 그 결과를 기다린다. */
  async ensure(id: string, timeoutMs = 6000): Promise<boolean> {
    const slot = this.slots.get(id);
    if (!slot || this.enabled === false) return false;
    if (slot.state === "live") return true;
    if (slot.state === "failed") slot.state = "idle";
    if (!slot.connecting) slot.connecting = this.connect(id, slot);
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs));
    return Promise.race([slot.connecting, timeout]);
  }

  private async connect(id: string, slot: Slot): Promise<boolean> {
    slot.state = "connecting";
    this.onChange?.(id, slot.state, false);
    try {
      const res = await fetch("/api/tokens/simli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceId: slot.faceId }),
      });
      if (res.status !== 200) {
        this.enabled = false;
        slot.state = "failed";
        this.onChange?.(id, slot.state, false);
        return false;
      }
      const { sessionToken } = (await res.json()) as { sessionToken: string };
      const client = new SimliClient(sessionToken, slot.video, slot.audio, null, LogLevel.ERROR);
      client.on("speaking", () => {
        slot.speaking = true;
        this.onChange?.(id, slot.state, true);
      });
      client.on("silent", () => {
        slot.speaking = false;
        this.onChange?.(id, slot.state, false);
        slot.silentWaiters.splice(0).forEach((w) => w());
      });
      client.on("stop", () => {
        slot.state = "idle";
        slot.client = null;
        slot.connecting = null;
        this.onChange?.(id, slot.state, false);
      });
      client.on("error", () => {
        slot.state = "idle";
        slot.client = null;
        slot.connecting = null;
        this.onChange?.(id, slot.state, false);
      });
      slot.client = client;
      await client.start();
      slot.state = "live";
      slot.lastUsed = Date.now();
      this.onChange?.(id, slot.state, false);
      return true;
    } catch (e) {
      console.warn("[avatar] 연결 실패", e);
      slot.state = "failed";
      slot.client = null;
      this.onChange?.(id, slot.state, false);
      return false;
    } finally {
      slot.connecting = null;
    }
  }

  /** PCM16 16kHz 바이트를 보낸다. 연결돼 있지 않으면 false */
  send(id: string, pcm16k: Uint8Array): boolean {
    const slot = this.slots.get(id);
    if (!slot?.client || slot.state !== "live") return false;
    try {
      slot.client.sendAudioData(pcm16k);
      slot.lastUsed = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  /** 아바타가 말을 멈출 때까지 기다린다(최대 maxMs) */
  waitSilent(id: string, maxMs: number): Promise<void> {
    const slot = this.slots.get(id);
    if (!slot) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, maxMs);
      slot.silentWaiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  clear(id: string) {
    const slot = this.slots.get(id);
    try {
      slot?.client?.ClearBuffer();
    } catch {
      /* noop */
    }
    slot?.silentWaiters.splice(0).forEach((w) => w());
  }

  async disconnect(id: string) {
    const slot = this.slots.get(id);
    if (!slot?.client) return;
    const c = slot.client;
    slot.client = null;
    slot.state = "idle";
    slot.connecting = null;
    this.onChange?.(id, "idle", false);
    await c.stop().catch(() => {});
  }

  async closeAll() {
    await Promise.all([...this.slots.keys()].map((id) => this.disconnect(id)));
  }
}
