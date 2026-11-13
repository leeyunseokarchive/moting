"use client";

import { BACKCHANNELS, nextSpeaker } from "@/lib/interviewers";
import type {
  AnswerRecord,
  DirectorAction,
  Interviewer,
  TranscriptEntry,
  WaitMotion,
  WordTiming,
} from "@/lib/types";
import type { PublicSession } from "@/client/api";
import type { AvatarManager } from "../avatar/simli";
import type { MicCapture } from "../audio/mic";
import { paperFlip, penScratch } from "../audio/sfx";
import type { InterviewerVoice } from "../audio/voice";
import { faceMetrics, voiceMetrics } from "../metrics";
import type { FinalSegment, Stt } from "../stt";
import type { FaceTracker } from "../vision/face";

export type EnginePhase =
  | "ready"
  | "speaking"
  | "listening"
  | "thinking"
  | "paused"
  | "finishing"
  | "ended"
  | "error";

export type EngineView = {
  phase: EnginePhase;
  speakerId: string | null;
  questionKind?: TranscriptEntry["kind"];
  motions: Record<string, WaitMotion>;
  elapsedSec: number;
  answering: boolean;
  /** 화면에 보여줄 마지막 질문(자막 켰을 때만 사용) */
  lastQuestion: string;
  /** 이번 질문에 대해 확정된 답변 */
  answer: string;
  interim: string;
  /** 침묵이 이어지면 답변을 끝으로 볼 시각(performance.now() 기준). 예정이 없으면 null */
  endAt: number | null;
  notice: string | null;
};

type Deps = {
  session: PublicSession;
  mic: MicCapture;
  stt: Stt;
  voice: InterviewerVoice;
  avatars: AvatarManager | null;
  face: FaceTracker | null;
  onView: (v: EngineView) => void;
  onFinished: (id: string) => void;
};

const END_GRACE_MS = 3800; // 망설임·생각 정리 시간을 충분히 기다린 뒤 답변 끝으로 본다
const UTTERANCE_GRACE_MS = 3200; // STT가 발화 끝을 알린 뒤의 대기
const NO_ANSWER_MS = 14000; // 질문 후 이만큼 말이 없으면 재촉
const PREROLL_SEC = 0.8; // 질문 끝나기 직전 성급하게 시작한 첫 음절이 잘리지 않도록 여유분 확보
const UNFINISHED_EXTRA_MS = 2800; // 말이 문장 중간에서 멈췄을 때 한 번 더 기다리는 시간
// 면접관 음성이 나기 시작한 뒤 이만큼까지 끝난 말도 이전 답변의 꼬리로 본다.
// STT 단어 시각·시계 맞춤 오차(0.1~0.3초)를 덮고, 질문이 나온 지 0.5초 안에 그 질문에 답할 수는 없기 때문
const STALE_TOL_SEC = 0.5;

const FILLERS = new Set(["음", "어", "그", "저", "아", "뭐", "이제", "약간"]);
const CONNECTIVES = new Set(["그리고", "그래서", "그런데", "근데", "하지만", "그러나", "그러면", "그래도", "그러니까", "왜냐하면", "또", "또는", "및"]);
// 연결 어미(~고, ~며, ~서, ~는데, ~지만, ~면, ~니까 …)와 조사(은/는/이/가/을/를/에/의/와/과/도/로/만 …)
const OPEN_ENDING = /(고|며|서|데|지만|면|니까|거나|려고|도록|다가|위해|대해|통해|은|는|이|가|을|를|에|의|와|과|도|로|만|랑|에게|한테|부터|까지|보다|처럼)$/;

/**
 * 답변이 문장 중간에서 멈춘 것처럼 보이는지. 마지막 어절의 끝 글자만 본다.
 * 한계: 형태소 분석이 아니라서 "결과", "정도"처럼 조사·어미와 같은 글자로 끝나는 명사는 미완성으로 잘못 보고(대기만 길어진다),
 * 명사로 뚝 끊긴 문장("제가 맡은 역할")은 잡지 못한다.
 */
export function looksUnfinished(text: string): boolean {
  // punctuate가 문장 중간에도 마침표를 붙일 수 있어 끝 문장부호는 떼고 본다
  const last = text.replace(/[\s.,!?…~]+$/, "").split(/\s+/).at(-1) ?? "";
  if (!last) return false;
  if (FILLERS.has(last) || CONNECTIVES.has(last)) return true;
  return last.length >= 2 && OPEN_ENDING.test(last);
}

export class InterviewEngine {
  private d: Deps;
  private view: EngineView;
  private transcript: TranscriptEntry[] = [];
  private answers: AnswerRecord[] = [];
  private segments: FinalSegment[] = [];
  private lastQuestionEntry: TranscriptEntry | null = null;
  private questionEndSec = 0;
  private answerStartSec: number | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private endDeadline = 0;
  private endExtended = false; // 이번 침묵에서 마감을 이미 한 번 미뤘는지
  private noAnswerTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private elapsedBase = 0;
  private resumedAt = 0;
  private closingAsked = false;
  private farewellDone = false;
  private nudged = false;
  private interruptedThisAnswer = false;
  private stopped = false;
  private pendingPosts: Promise<unknown>[] = [];
  private turnSeq = 0;
  private speakingStartedAt = 0;
  private spokeAtSec = 0; // 지금 면접관 음성이 나기 시작한 시각(mic.now() 기준, 초)

  constructor(deps: Deps) {
    this.d = deps;
    this.view = {
      phase: "ready",
      speakerId: null,
      motions: Object.fromEntries(deps.session.profile.interviewers.map((i) => [i.id, "still" as WaitMotion])),
      elapsedSec: 0,
      answering: false,
      lastQuestion: "",
      answer: "",
      interim: "",
      endAt: null,
      notice: null,
    };
  }

  /* ───────── 공개 API ───────── */

  async start() {
    this.d.mic.startRecording();
    this.resumedAt = performance.now();
    this.clock = setInterval(() => this.emit({ elapsedSec: this.elapsed() }), 500);
    await this.d.stt.start();
    if (this.d.face) {
      const video = document.getElementById("self-video") as HTMLVideoElement | null;
      if (video) this.d.face.start(video, () => this.d.mic.now());
    }
    // 맞장구를 미리 받아 둔다(지연 없이 재생하기 위해)
    for (const iv of this.panel) for (const b of BACKCHANNELS.slice(0, 2)) void this.d.voice.preload(iv.voice, b);
    this.retainAvatars(this.lead.id);
    await this.turn("opening");
  }

  pause() {
    if (this.view.phase !== "listening") return;
    this.clearTimers();
    this.elapsedBase = this.elapsed();
    this.resumedAt = 0;
    this.d.mic.setMuted(true);
    this.emit({ phase: "paused" });
  }

  resume() {
    if (this.view.phase !== "paused") return;
    this.resumedAt = performance.now();
    this.d.mic.setMuted(false);
    this.emit({ phase: "listening" });
    this.armNoAnswer();
  }

  /** 지원자가 나가기를 눌렀을 때 */
  async leave() {
    if (this.stopped) return;
    this.d.voice.stop(this.view.speakerId ?? undefined);
    await this.finish();
  }

  setMicMuted(muted: boolean) {
    this.d.mic.setMuted(muted);
  }

  /** 지원자가 직접 답변 완료 버튼을 눌렀을 때 즉시 다음 차례로 넘긴다 */
  finishAnswer() {
    if (this.stopped || this.view.phase !== "listening") return;
    this.flushInterim();
    if (this.segments.length === 0) return;
    void this.onAnswerDone("normal");
  }

  private flushInterim() {
    const trailing = this.view.interim.trim();
    if (!trailing) return;
    const now = this.d.mic.now();
    const tokens = trailing.split(/\s+/);
    const start = this.segments.at(-1)?.end ?? this.answerStartSec ?? Math.max(0, now - tokens.length * 0.3);
    const step = Math.max(0.15, (now - start) / Math.max(1, tokens.length));
    this.segments.push({
      text: trailing,
      start,
      end: now,
      words: tokens.map((w, i) => ({ word: w, start: start + i * step, end: start + (i + 1) * step })),
    });
    this.emit({ answer: this.answerText, interim: "" });
  }

  private get answerText(): string {
    return this.segments.map((s) => s.text).join(" ").trim();
  }

  /* ───────── STT 이벤트 ───────── */

  onSpeechStart = () => {
    if (this.stopped) return;
    // 면접관이 말하는 중 지원자가 말을 시작하면 바로 멈춘다(끼어들기 및 질문 끝 무렵 조기 답변)
    if (this.view.phase === "speaking" && this.view.speakerId) {
      const loud = this.d.mic.levels.at(-1)?.[1] ?? -100;
      if (loud > -44) {
        this.d.voice.stop(this.view.speakerId);
        this.toListening(false);
      }
    }
  };

  /** 면접관 음성이 나기 전에 한 말(이전 답변의 꼬리)이 뒤늦게 도착한 것인지. 시각이 없으면 판단하지 않는다 */
  private stale(sec?: number): boolean {
    return sec !== undefined && sec < this.spokeAtSec + STALE_TOL_SEC;
  }

  private ensureListeningFromEarlySpeech(): boolean {
    if (this.view.phase === "listening") return true;
    if (this.view.phase === "speaking" && performance.now() - this.speakingStartedAt > 800) {
      if (this.view.speakerId) this.d.voice.stop(this.view.speakerId);
      this.toListening(false);
      return true;
    }
    return false;
  }

  onInterim = (text: string, startSec?: number) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.stale(startSec)) return;
    if (!this.ensureListeningFromEarlySpeech()) return;
    if (this.noAnswerTimer) clearTimeout(this.noAnswerTimer);
    if (this.answerStartSec === null) {
      this.answerStartSec = Math.max(0, this.d.mic.now() - PREROLL_SEC);
      this.armMaxAnswer();
    }
    const changed = trimmed !== this.view.interim.trim();
    if (changed || !this.endTimer) {
      this.armEnd(END_GRACE_MS + 1200);
    }
    this.emit({ interim: trimmed, answering: true });
  };

  onFinal = (seg: FinalSegment) => {
    if (this.stale(seg.end)) return;
    if (!this.ensureListeningFromEarlySpeech()) return;
    if (this.noAnswerTimer) clearTimeout(this.noAnswerTimer);
    this.segments.push(seg);
    if (this.answerStartSec === null) {
      this.answerStartSec = Math.max(0, seg.start - PREROLL_SEC);
      this.armMaxAnswer();
    }
    this.armEnd(END_GRACE_MS);
    this.emit({ answer: this.answerText, interim: "", answering: true });
  };

  onUtteranceEnd = () => {
    if (this.view.phase !== "listening") return;
    if (this.segments.length === 0 && !this.view.interim.trim()) return;
    // 마감은 당기기만 한다. speech_final 뒤에 오는 UtteranceEnd와 침묵 중 빈 결과가 대기를 늘리지 않도록
    if (!this.endTimer || performance.now() + UTTERANCE_GRACE_MS < this.endDeadline) {
      this.armEnd(UTTERANCE_GRACE_MS);
      this.emit({});
    }
  };

  /* ───────── 진행 ───────── */

  private get panel(): Interviewer[] {
    return this.d.session.profile.interviewers;
  }

  private get lead(): Interviewer {
    return this.panel.find((i) => i.isLead) ?? this.panel[0];
  }

  private interviewer(id: string): Interviewer {
    return this.panel.find((i) => i.id === id) ?? this.lead;
  }

  private elapsed(): number {
    return this.elapsedBase + (this.resumedAt ? (performance.now() - this.resumedAt) / 1000 : 0);
  }

  private emit(patch: Partial<EngineView>) {
    this.view = { ...this.view, ...patch };
    // 마감 예정 시각은 타이머 상태에서 그대로 따온다(듣는 중이 아니면 없다).
    // 문장이 덜 끝나 한 번 더 기다릴 참이면 그 시간까지 더해, 예고가 끝났다가 다시 시작하지 않게 한다
    this.view.endAt =
      this.endTimer && this.view.phase === "listening"
        ? this.endDeadline + (!this.endExtended && looksUnfinished(`${this.view.answer} ${this.view.interim}`) ? UNFINISHED_EXTRA_MS : 0)
        : null;
    this.d.onView(this.view);
  }

  private setMotion(id: string | null, m: WaitMotion) {
    const motions = Object.fromEntries(this.panel.map((i) => [i.id, i.id === id ? m : this.view.motions[i.id] === "nod" ? "still" : this.view.motions[i.id]])) as Record<string, WaitMotion>;
    this.emit({ motions });
    if (m === "flipPages") paperFlip();
    if (m === "takeNotes") penScratch();
  }

  private retainAvatars(currentId: string) {
    if (!this.d.avatars) return;
    // 현재 화자 + 다음 계획 질문의 면접관을 연결해 둔다
    const used = new Set(this.transcript.filter((t) => t.planId).map((t) => t.planId));
    const next = this.d.session.plan.find((p) => !used.has(p.id));
    void this.d.avatars.retain([
      currentId,
      next?.interviewerId ?? this.lead.id,
      this.lead.id,
      ...this.panel.map((i) => i.id),
    ]);
  }

  private async turn(phase: "opening" | "next" | "timeout" | "closing" | "farewell") {
    if (this.stopped) return;
    const seq = ++this.turnSeq;
    this.emit({ phase: "thinking", answering: false, interim: "" });
    const lastAnswerSec =
      this.answerStartSec !== null ? Math.max(0, this.d.mic.now() - this.answerStartSec) : undefined;

    let action: DirectorAction | null = null;
    try {
      const res = await fetch(`/api/sessions/${this.d.session.id}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, elapsedSec: Math.round(this.elapsed()), lastAnswerSec, transcript: this.transcript }),
      });
      if (res.ok) action = ((await res.json()) as { action: DirectorAction }).action;
    } catch {
      /* 아래에서 처리 */
    }
    if (this.stopped || seq !== this.turnSeq) return;
    if (!action) {
      this.emit({ notice: "네트워크가 불안정합니다. 잠시 후 다시 이어갑니다." });
      setTimeout(() => this.turn(phase), 2500);
      return;
    }
    this.emit({ notice: null });
    await this.say(action, phase);
  }

  private async say(action: DirectorAction, phase: string) {
    const iv = this.interviewer(action.speakerId);
    this.retainAvatars(iv.id);
    if (this.d.avatars) await this.d.avatars.ensure(iv.id, 3500);
    if (this.stopped) return;

    const kind: TranscriptEntry["kind"] =
      phase === "opening" ? "greeting" : action.kind === "reaction" ? "reaction" : action.kind;
    const entry: TranscriptEntry = {
      speaker: iv.id,
      text: action.say,
      at: Math.round(this.d.mic.now() * 1000),
      kind,
      planId: action.planId ?? undefined,
    };
    this.resetAnswerBuffer();
    this.speakingStartedAt = performance.now();
    this.spokeAtSec = this.d.mic.now(); // 소리가 나지 않고 끝나는 경우를 위한 임시값. 실제 시작은 onStart에서 잡는다
    this.setMotion(null, "still");
    this.emit({ phase: "speaking", speakerId: iv.id, questionKind: kind });
    // 자막은 소리와 함께 시작한다. 소리가 나지 않고 끝난 경우에도 질문은 보여 준다
    const showCaption = () => this.emit({ lastQuestion: action.say, answer: this.answerText });
    const completed = await this.d.voice.speak({
      speakerId: iv.id,
      voice: iv.voice,
      text: action.say,
      onStart: () => {
        this.speakingStartedAt = performance.now();
        this.spokeAtSec = this.d.mic.now();
        entry.at = Math.round(this.d.mic.now() * 1000);
        showCaption();
      },
    });
    showCaption();
    entry.endAt = Math.round(this.d.mic.now() * 1000);
    this.transcript.push(entry);
    if (this.stopped) return;

    if (action.end) {
      this.farewellDone = true;
      this.emit({ speakerId: null });
      await new Promise((r) => setTimeout(r, 900));
      await this.finish();
      return;
    }
    if (phase === "closing" || action.kind === "closing") this.closingAsked = true;
    this.lastQuestionEntry = entry;
    if (completed || this.view.phase === "speaking") this.toListening(false);
    // 아바타는 1명만 연결하므로 듣는 동안 다음 화자로 바꿔 둔다
    this.retainAvatars(nextSpeaker(this.panel, this.transcript).id);
    this.pendingMotion = action.waitMotion;
    this.pendingBackchannel = action.backchannel;
  }

  private pendingMotion: WaitMotion = "nod";
  private pendingBackchannel = true;

  private resetAnswerBuffer() {
    this.segments = [];
    this.answerStartSec = null;
    this.interruptedThisAnswer = false;
    this.nudged = false;
    this.questionEndSec = Math.max(0, this.d.mic.now() - PREROLL_SEC);
  }

  private toListening(reset = true) {
    const alreadySpeaking = this.segments.length > 0 || Boolean(this.view.interim.trim());
    if (reset && !alreadySpeaking) {
      this.resetAnswerBuffer();
    } else if (!alreadySpeaking) {
      this.questionEndSec = Math.max(0, this.d.mic.now() - PREROLL_SEC);
    }
    this.emit({
      phase: "listening",
      speakerId: null,
      answering: alreadySpeaking,
      interim: alreadySpeaking ? this.view.interim : "",
    });
    if (!alreadySpeaking) this.armNoAnswer();
  }

  private armEnd(ms = END_GRACE_MS, extension = false) {
    this.clearEndTimer();
    this.endExtended = extension;
    // 연장은 앞서 알린 마감 시각에 그대로 이어 붙인다(타이머 오차로 예고가 깜빡이지 않게)
    this.endDeadline = extension ? this.endDeadline + ms : performance.now() + ms;
    this.endTimer = setTimeout(() => this.onSilence(), Math.max(0, this.endDeadline - performance.now()));
  }

  /** 침묵 타이머가 끝났을 때. 문장이 끝나지 않은 채 멈췄으면 한 번만 더 기다린다 */
  private onSilence() {
    if (this.view.phase === "listening" && !this.endExtended && looksUnfinished(`${this.answerText} ${this.view.interim}`)) {
      this.armEnd(UNFINISHED_EXTRA_MS, true);
      this.emit({});
      return;
    }
    void this.onAnswerDone();
  }

  private clearEndTimer() {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private armNoAnswer() {
    if (this.noAnswerTimer) clearTimeout(this.noAnswerTimer);
    const ms = Math.max(NO_ANSWER_MS, this.d.session.profile.silenceToleranceSec * 1000 * 2);
    this.noAnswerTimer = setTimeout(async () => {
      if (this.view.phase !== "listening" || this.segments.length > 0 || this.view.interim.trim()) return;
      if (!this.nudged) {
        this.nudged = true;
        const asker = this.lastQuestionEntry ? this.interviewer(this.lastQuestionEntry.speaker) : this.lead;
        const line = asker.pressure >= 4 ? "답변하기 어려우신가요? 아는 범위에서 말씀해 주세요." : "천천히 생각하시고 편하게 말씀해 주세요.";
        await this.say({ speakerId: asker.id, say: line, kind: "reaction", planId: null, waitMotion: "still", backchannel: false, end: false }, "next");
        return;
      }
      void this.onAnswerDone();
    }, ms);
  }

  private armMaxAnswer() {
    if (this.maxTimer) clearTimeout(this.maxTimer);
    const limit = this.d.session.profile.maxAnswerSec;
    this.maxTimer = setTimeout(() => {
      if (this.view.phase !== "listening") return;
      this.interruptedThisAnswer = true;
      void this.onAnswerDone("timeout");
    }, limit * 1000);
  }

  private clearTimers() {
    this.clearEndTimer();
    if (this.noAnswerTimer) clearTimeout(this.noAnswerTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.noAnswerTimer = null;
    this.maxTimer = null;
  }

  private async onAnswerDone(reason: "normal" | "timeout" = "normal") {
    if (this.view.phase !== "listening") return;
    this.clearTimers();
    this.flushInterim();
    const asker = this.lastQuestionEntry ? this.interviewer(this.lastQuestionEntry.speaker) : this.lead;

    // 1) 즉시 대기 연출 + 맞장구(지연을 가린다)
    this.emit({ phase: "thinking", answering: false, interim: "" });
    if (reason === "normal") {
      this.setMotion(asker.id, this.pendingMotion);
      if (this.pendingBackchannel && asker.pressure < 4 && this.segments.length > 0) {
        const line = BACKCHANNELS[Math.floor(Math.random() * 2)];
        void this.d.voice.speak({ speakerId: asker.id, voice: asker.voice, text: line });
      }
    }

    // 2) 답변 기록
    const text = this.answerText;
    if (text) {
      this.transcript.push({
        speaker: "candidate",
        text,
        at: Math.round((this.segments[0]?.start ?? this.questionEndSec) * 1000),
        endAt: Math.round((this.segments.at(-1)?.end ?? this.d.mic.now()) * 1000),
        kind: "answer",
      });
      this.recordAnswer(text, asker.id);
    }

    // 3) 다음 발화
    const left = this.d.session.profile.durationMin * 60 - this.elapsed();
    if (reason === "timeout") return this.turn("timeout");
    if (this.closingAsked && !this.farewellDone) return this.turn("farewell");
    if (left < 75 && !this.closingAsked) return this.turn("closing");
    return this.turn("next");
  }

  private recordAnswer(text: string, interviewerId: string) {
    const words: WordTiming[] = this.segments.flatMap((s) => s.words);
    const rawStart = words[0]?.start ?? this.segments[0]?.start ?? this.questionEndSec;
    const start = Math.max(0, rawStart - PREROLL_SEC);
    const end = words.at(-1)?.end ?? this.segments.at(-1)?.end ?? this.d.mic.now();
    const q = this.lastQuestionEntry;
    const record: AnswerRecord = {
      id: crypto.randomUUID(),
      questionEntryIndex: q ? this.transcript.indexOf(q) : -1,
      interviewerId,
      question: q?.text ?? "",
      answer: text,
      startSec: start,
      endSec: end,
      words,
      voice: voiceMetrics(words, this.d.mic.levels, this.questionEndSec),
      face: this.d.face ? faceMetrics(this.d.face.samples, start, end) : undefined,
      interrupted: this.interruptedThisAnswer,
    };
    this.answers.push(record);
    const p = fetch(`/api/sessions/${this.d.session.id}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch(() => null);
    this.pendingPosts.push(p);
  }

  private async finish() {
    if (this.stopped) return;
    this.stopped = true;
    this.clearTimers();
    if (this.clock) clearInterval(this.clock);
    this.flushInterim();
    this.emit({ phase: "finishing", speakerId: null });
    // 듣던 중 나갔다면 그때까지의 답변도 남긴다
    if (this.segments.length && this.view.phase !== "ended") {
      const text = this.answerText;
      if (text && !this.answers.some((a) => a.answer === text)) this.recordAnswer(text, this.lastQuestionEntry?.speaker ?? this.lead.id);
    }
    this.d.stt.stop();
    this.d.face?.stop();
    const blob = await this.d.mic.stopRecording();
    await this.d.avatars?.closeAll();
    const upload = blob
      ? fetch(`/api/sessions/${this.d.session.id}/recording`, {
          method: "PUT",
          headers: { "Content-Type": blob.type || "audio/webm" },
          body: blob,
        }).catch(() => null)
      : Promise.resolve(null);
    await Promise.allSettled([upload, ...this.pendingPosts]);
    try {
      const res = await fetch(`/api/sessions/${this.d.session.id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: this.transcript, answers: this.answers }),
      });
      if (!res.ok) throw new Error(String(res.status));
      this.emit({ phase: "ended" });
      this.d.onFinished(this.d.session.id);
    } catch {
      this.emit({ phase: "error", notice: "보고서를 만들지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요." });
    }
  }

  /** 보고서 생성 재시도 */
  async retryFinish() {
    this.stopped = false;
    await this.finish();
  }

  dispose() {
    this.stopped = true;
    this.clearTimers();
    if (this.clock) clearInterval(this.clock);
    this.d.stt.stop();
    this.d.voice.close();
    this.d.face?.close();
    void this.d.avatars?.closeAll();
    this.d.mic.close();
  }
}
