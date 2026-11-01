"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Microphone,
  MicrophoneSlash,
  VideoCamera,
  VideoCameraSlash,
  SpeakerHigh,
  Keyboard,
  Pause,
  Play,
  SignOut,
  ClosedCaptioning,
  PaperPlaneRight,
  Check,
} from "@phosphor-icons/react";
import { TopBar, DemoBadge } from "@/components/ui/top-bar";
import { ApiStatusButton } from "@/components/ui/api-status";
import { Button, Spinner } from "@/components/ui/button";
import { Captions } from "@/components/ui/captions";
import { Card, Field, Notice, PageHeader } from "@/components/ui/controls";
import { getSession, type PublicSession } from "@/client/api";
import { resolvePortrait } from "@/lib/interviewers";
import { MicCapture } from "@/client/audio/mic";
import { InterviewerVoice } from "@/client/audio/voice";
import { chime } from "@/client/audio/sfx";
import { createStt } from "@/client/stt";
import { AvatarManager } from "@/client/avatar/simli";
import { FaceTracker } from "@/client/vision/face";
import { InterviewEngine, type EnginePhase, type EngineView } from "@/client/interview/engine";
import type { WaitMotion } from "@/lib/types";

type Stage = "check" | "entering" | "room";

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function motionClass(m: WaitMotion | undefined): string {
  switch (m) {
    case "nod":
      return "motion-nod";
    case "flipPages":
      return "motion-flipPages";
    case "takeNotes":
      return "motion-takeNotes";
    case "glance":
      return "motion-glance";
    default:
      return "motion-breathe";
  }
}

const MOTION_CAPTION: Record<WaitMotion, string | null> = {
  still: null,
  nod: "고개를 끄덕이며 경청 중",
  flipPages: "이력서·자소서를 넘겨 보는 중",
  takeNotes: "답변 내용을 평가표에 기록 중",
  glance: "옆 면접관과 시선을 교환 중",
};

function statusText(phase: EnginePhase, answering: boolean): string {
  switch (phase) {
    case "speaking":
      return "면접관이 말하고 있습니다";
    case "listening":
      return answering ? "답변을 듣고 있습니다" : "답변을 시작해 주세요";
    case "thinking":
      return "면접관이 답변을 정리하고 있습니다";
    case "paused":
      return "면접이 일시정지되었습니다";
    case "finishing":
      return "평가표를 작성하고 있습니다";
    default:
      return "면접을 준비하고 있습니다";
  }
}

function InterviewInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<PublicSession | null>(null);
  const [stage, setStage] = useState<Stage>("check");
  const [error, setError] = useState<string | null>(null);

  // 장비 점검 상태
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");
  const [cameraOn, setCameraOn] = useState<boolean>(true);
  const [dbLevel, setDbLevel] = useState<number>(-90);
  const [devicesReady, setDevicesReady] = useState<boolean>(false);

  // 면접장 상태
  const [view, setView] = useState<EngineView | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __setInterviewView: typeof setView; __setInterviewStage: typeof setStage }).__setInterviewView = setView;
      (window as unknown as { __setInterviewView: typeof setView; __setInterviewStage: typeof setStage }).__setInterviewStage = setStage;
    }
  }, []);
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [showCaptions, setShowCaptions] = useState<boolean>(true);
  const [confirmExit, setConfirmExit] = useState<boolean>(false);
  const [liveAvatars, setLiveAvatars] = useState<Record<string, boolean>>({});
  const [manualText, setManualText] = useState<string>("");
  const [typing, setTyping] = useState<boolean>(false);

  const micRef = useRef<MicCapture | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<InterviewEngine | null>(null);
  const avatarsRef = useRef<AvatarManager | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // 세션 로드
  useEffect(() => {
    let alive = true;
    getSession(id)
      .then((s) => {
        if (!alive) return;
        setSession(s);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "면접 세션을 불러올 수 없습니다");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // 마이크 및 카메라 준비
  useEffect(() => {
    if (!session || stage !== "check") return;
    let alive = true;
    const mic = new MicCapture();
    micRef.current = mic;
    const offFrame = mic.onFrame((f) => {
      if (alive) setDbLevel(f.db);
    });

    (async () => {
      try {
        await mic.open(micId || undefined);
        if (cameraOn) {
          camStreamRef.current?.getTracks().forEach((t) => t.stop());
          camStreamRef.current = await navigator.mediaDevices
            .getUserMedia({
              video: cameraId ? { deviceId: { exact: cameraId }, width: 640, height: 480 } : { width: 640, height: 480 },
              audio: false,
            })
            .catch(() => null);
          if (selfVideoRef.current && camStreamRef.current) {
            selfVideoRef.current.srcObject = camStreamRef.current;
          }
        } else {
          camStreamRef.current?.getTracks().forEach((t) => t.stop());
          camStreamRef.current = null;
          if (selfVideoRef.current) selfVideoRef.current.srcObject = null;
        }
        const list = await MicCapture.devices();
        if (!alive) return;
        setInputs(list.inputs);
        setOutputs(list.outputs);
        setCameras(list.cameras);
        setDevicesReady(true);
      } catch {
        if (!alive) return;
        setError("마이크 권한이 필요합니다. 브라우저 주소창에서 마이크 권한을 허용해 주세요.");
      }
    })();

    return () => {
      alive = false;
      offFrame();
    };
  }, [session, stage, micId, cameraId, cameraOn]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      micRef.current?.close();
    };
  }, []);

  // 면접장 화면 전환 시 self-video 연결 및 엔진 시작
  useEffect(() => {
    if (stage !== "room" || !session || engineRef.current) return;

    if (selfVideoRef.current && camStreamRef.current) {
      selfVideoRef.current.srcObject = camStreamRef.current;
    }

    let cancelled = false;
    (async () => {
      const mic = micRef.current ?? new MicCapture();
      if (!mic.stream) {
        await mic.open(micId || undefined).catch(() => {});
      }
      micRef.current = mic;

      const avatars = new AvatarManager(1);
      avatars.onChange = (ivId, state) => {
        setLiveAvatars((prev) => ({ ...prev, [ivId]: state === "live" }));
      };
      for (const iv of session.profile.interviewers) {
        const vEl = videoRefs.current[iv.id];
        const aEl = audioRefs.current[iv.id];
        if (vEl && aEl) avatars.register(iv.id, iv.faceId, vEl, aEl);
      }
      avatarsRef.current = avatars;

      const voice = new InterviewerVoice(avatars);
      if (speakerId) await voice.setSink(speakerId);

      let face: FaceTracker | null = null;
      if (cameraOn && camStreamRef.current) {
        const tracker = new FaceTracker();
        const ok = await tracker.init();
        if (ok) face = tracker;
      }

      const stt = await createStt(mic, {
        onInterim: (t) => engineRef.current?.onInterim(t),
        onFinal: (seg) => engineRef.current?.onFinal(seg),
        onSpeechStart: () => engineRef.current?.onSpeechStart(),
        onUtteranceEnd: () => engineRef.current?.onUtteranceEnd(),
        onError: (msg) => setError(msg),
      });

      if (cancelled) return;

      const engine = new InterviewEngine({
        session,
        mic,
        stt,
        voice,
        avatars,
        face,
        onView: (v) => setView({ ...v }),
        onFinished: (finishedId) => router.push(`/report/${finishedId}`),
      });
      engineRef.current = engine;
      if (typeof window !== "undefined") {
        (window as unknown as { __interviewEngine: typeof engine }).__interviewEngine = engine;
      }
      await engine.start();
    })();

    return () => {
      cancelled = true;
    };
  }, [stage, session, micId, speakerId, cameraOn, router]);

  async function enterRoom(withCamera: boolean) {
    setCameraOn(withCamera);
    if (!withCamera) {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    setStage("entering");
    setTimeout(() => setStage("room"), 1600);
  }

  function toggleMute() {
    const next = !micMuted;
    setMicMuted(next);
    engineRef.current?.setMicMuted(next);
  }

  function submitManualAnswer() {
    const text = manualText.trim();
    if (!text || !engineRef.current || !micRef.current) return;
    const now = micRef.current.now();
    const words = text.split(/\s+/).map((w, i, arr) => ({
      word: w,
      start: Math.max(0, now - arr.length * 0.35 + i * 0.35),
      end: Math.max(0, now - arr.length * 0.35 + (i + 1) * 0.35),
    }));
    engineRef.current.onFinal({
      text,
      words,
      start: words[0]?.start ?? now,
      end: words.at(-1)?.end ?? now,
    });
    engineRef.current.onUtteranceEnd();
    setManualText("");
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        {error ? <Notice tone="error">{error}</Notice> : <Spinner className="size-6 text-accent" />}
      </div>
    );
  }

  // 1) 장비 점검 화면
  if (stage === "check") {
    const meterPct = Math.min(100, Math.max(4, Math.round(((dbLevel + 65) / 55) * 100)));
    return (
      <div className="min-h-dvh bg-canvas">
        <TopBar center={<span className="text-[14px] font-medium text-ink-2">입장 전 장비 점검</span>}>
          <DemoBadge show={session.demo} />
        </TopBar>

        <main
          id="main"
          className="mx-auto grid min-h-[calc(100dvh-57px)] max-w-5xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14"
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] bg-ink shadow-[var(--shadow-paper)]">
            {cameraOn ? (
              <video
                ref={selfVideoRef}
                autoPlay
                playsInline
                muted
                className="size-full scale-x-[-1] object-cover"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 text-white/60">
                <VideoCameraSlash size={28} />
                <span className="text-[14px]">카메라 꺼짐</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setCameraOn((v) => !v)}
              className="absolute bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-black/60 px-4 text-[14px] font-medium text-white backdrop-blur-md transition-colors hover:bg-black/75"
            >
              {cameraOn ? <VideoCamera size={16} /> : <VideoCameraSlash size={16} />}
              {cameraOn ? "카메라 끄기" : "카메라 켜기"}
            </button>
          </div>

          <div className="space-y-6">
            <PageHeader eyebrow={`${session.parsed.company} · ${session.parsed.job}`} title="입장 전 카메라와 마이크를 확인해 주세요">
              카메라 영상은 브라우저 안에서 시선·표정 수치로만 바뀌며 서버로 전송되거나 저장되지 않습니다.
            </PageHeader>

            {error && <Notice tone="error">{error}</Notice>}

            <div className="space-y-4">
              <Field label="마이크">
                <select value={micId} onChange={(e) => setMicId(e.target.value)} className="field">
                  {inputs.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `마이크 ${i + 1}`}
                    </option>
                  ))}
                </select>
                <div role="meter" aria-label="마이크 음량" aria-valuenow={meterPct} className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill">
                  <div className="h-full origin-left rounded-full bg-accent transition-transform duration-75" style={{ transform: `scaleX(${meterPct / 100})` }} />
                </div>
              </Field>

              {outputs.length > 0 && (
                <Field label="스피커">
                  <div className="flex gap-2">
                    <select value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} className="field min-w-0 flex-1">
                      {outputs.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `스피커 ${i + 1}`}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="secondary" onClick={() => chime()}>
                      <SpeakerHigh size={16} />
                      소리 확인
                    </Button>
                  </div>
                </Field>
              )}

              {cameras.length > 1 && cameraOn && (
                <Field label="카메라">
                  <select value={cameraId} onChange={(e) => setCameraId(e.target.value)} className="field">
                    {cameras.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `카메라 ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <Button type="button" size="lg" className="w-full" onClick={() => enterRoom(cameraOn)} disabled={!devicesReady}>
              면접장 입장하기
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // 2) 대기실 → 면접장 입장 연출
  if (stage === "entering") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 text-center">
        <div className="rise space-y-3">
          <p className="text-[14px] font-medium text-accent">
            {session.parsed.company} · {session.parsed.stage}
          </p>
          <h1 className="text-[28px]">면접실로 입장하고 있습니다</h1>
          <p className="text-[15px] text-ink-2">
            면접관 {session.profile.interviewers.length}명이 자리에서 서류를 확인하고 있습니다.
          </p>
        </div>
      </div>
    );
  }

  // 3) 오프라인 면접장 본 화면
  const panel = session.profile.interviewers;
  const phase = view?.phase ?? "ready";
  const activeSpeaker = phase === "speaking" ? view?.speakerId : null;
  const answering = phase === "listening" && (Boolean(view?.answering) || Boolean(view?.interim));
  const typingOpen = typing && phase === "listening";
  // 상태 바, 제어 바, 자막을 뺀 높이 안에서 창을 키운다
  const tile = "clamp(300px, calc(100dvh - 330px), 560px)";

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* 상단 상태 바 */}
      <header className="relative z-30 flex h-14 items-center justify-between gap-3 border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 whitespace-nowrap text-[15px] font-semibold text-ink">{session.parsed.company}</span>
          <span className="hidden truncate text-[13px] text-ink-2 sm:block">{session.parsed.job}</span>
          <DemoBadge show={session.demo} />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="tabular whitespace-nowrap text-[14px] font-medium text-ink-2">
            {formatClock(view?.elapsedSec ?? 0)}
            <span className="hidden sm:inline"> / {session.profile.durationMin}:00</span>
          </span>
          <button
            type="button"
            onClick={() => setShowCaptions((v) => !v)}
            aria-pressed={showCaptions}
            aria-label="자막"
            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors ${
              showCaptions ? "bg-accent-soft text-accent" : "bg-fill text-ink-2"
            }`}
            title="질문·답변 자막 표시 전환"
          >
            <ClosedCaptioning size={16} />
            <span className="hidden sm:inline">자막 {showCaptions ? "켜짐" : "꺼짐"}</span>
          </button>
          <ApiStatusButton />
        </div>
      </header>

      {/* 면접실 공간 */}
      <main id="main" className="relative mx-auto flex w-full max-w-[1680px] flex-1 flex-col justify-center gap-5 px-4 py-4 sm:px-6">
        {view?.notice && <Notice>{view.notice}</Notice>}

        {/* 면접관 패널 책상 너머 배치 */}
        <div
          className={`mx-auto grid w-full grid-cols-1 gap-5 ${
            panel.length === 2 ? "sm:grid-cols-2" : panel.length === 3 ? "sm:grid-cols-3" : ""
          }`}
          style={{ maxWidth: `calc(${tile} * ${panel.length} + ${(panel.length - 1) * 20}px)` }}
        >
          {panel.map((iv) => {
            const isSpeaking = activeSpeaker === iv.id;
            const motion = view?.motions[iv.id] ?? "still";
            const caption = !isSpeaking ? MOTION_CAPTION[motion] : null;
            const avatarLive = liveAvatars[iv.id] ?? false;

            return (
              <div
                key={iv.id}
                role="group"
                tabIndex={0}
                aria-label={`${iv.name}, ${iv.role}${iv.isLead ? ", 주 진행" : ""}${isSpeaking ? ", 말하는 중" : ""}`}
                data-focus={activeSpeaker ? (isSpeaking ? "on" : "off") : undefined}
                className="tile group relative isolate rounded-[var(--radius-lg)]"
              >
                <div className="tile-face overflow-hidden rounded-[var(--radius-lg)] bg-white">
                  <div className={`relative aspect-square w-full overflow-hidden bg-fill ${motionClass(motion)}`}>
                    <img
                      src={resolvePortrait(iv)}
                      alt={iv.name}
                      className={`size-full object-cover object-center transition-opacity duration-300 ${
                        avatarLive ? "opacity-0" : "opacity-100"
                      }`}
                    />
                    <video
                      ref={(el) => {
                        videoRefs.current[iv.id] = el;
                      }}
                      autoPlay
                      playsInline
                      className={`absolute inset-0 size-full object-cover object-center transition-opacity duration-300 ${
                        avatarLive ? "opacity-100" : "opacity-0 pointer-events-none"
                      }`}
                    />
                    <audio
                      ref={(el) => {
                        audioRefs.current[iv.id] = el;
                      }}
                      autoPlay
                    />

                    {/* 대기 중 미세 상태 표시 */}
                    {caption && (
                      <span className="fade absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[12px] text-white backdrop-blur-md">
                        {caption}
                      </span>
                    )}
                  </div>
                </div>

                {/* 면접관 명패: 화면 뒤에 숨어 있다가 호버·포커스 때 아래로 나온다 */}
                <div className="absolute inset-x-3 top-[calc(100%-22px)] -z-10 flex -translate-y-full items-center justify-between rounded-b-[var(--radius-md)] bg-white px-4 pb-3 pt-[34px] opacity-0 shadow-[var(--shadow-card)] transition-[translate,opacity] duration-300 ease-[var(--ease-spring)] group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100">
                  <div>
                    <p className="text-[16px] font-semibold text-ink">{iv.name}</p>
                    <p className="text-[13px] text-ink-2">{iv.role}</p>
                  </div>
                  {iv.isLead && (
                    <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[12px] text-ink-2">
                      주 진행
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 자막 */}
        {showCaptions && (
          <Captions
            question={view?.lastQuestion ?? ""}
            answer={[view?.answer, view?.interim].filter(Boolean).join(" ")}
            speaking={phase === "speaking"}
          />
        )}

        {/* 우측 하단 내 카메라 작은 화면 (#self-video: FaceTracker가 참조) */}
        <div
          className={`fixed bottom-20 right-5 z-30 overflow-hidden rounded-[var(--radius-md)] border border-white/40 bg-ink shadow-[var(--shadow-float)] ${
            cameraOn ? "h-28 w-36" : "sr-only"
          }`}
        >
          <video
            id="self-video"
            ref={selfVideoRef}
            autoPlay
            playsInline
            muted
            className="size-full scale-x-[-1] object-cover"
          />
        </div>
      </main>

      {/* 하단 제어 바 */}
      <footer className="border-t border-black/[0.06] bg-white/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1632px] items-center justify-between gap-3">
          {typingOpen ? (
            <div className="fade flex min-w-0 flex-1 items-center gap-2">
              <input
                type="text"
                autoFocus
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setTyping(false);
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submitManualAnswer();
                  }
                }}
                aria-label="답변 입력"
                placeholder="소리를 낼 수 없다면 여기에 답변을 입력하세요"
                className="field max-w-xl rounded-full px-4"
              />
              {manualText.trim() && (
                <Button type="button" size="icon" className="shrink-0" onClick={submitManualAnswer} aria-label="답변 전송" title="답변 전송">
                  <PaperPlaneRight size={18} />
                </Button>
              )}
            </div>
          ) : (
            <div aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2.5 text-[14px] text-ink-2">
              <span
                className={`size-2.5 shrink-0 rounded-full transition-colors ${
                  phase === "listening" ? "animate-pulse bg-positive" : phase === "speaking" ? "bg-accent" : "bg-ink-3"
                }`}
              />
              <span className="truncate">{statusText(phase, answering)}</span>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2">
            {answering && (
              <Button type="button" className="rise" onClick={() => engineRef.current?.finishAnswer()}>
                <Check size={16} weight="bold" />
                답변 마침
              </Button>
            )}

            {phase === "listening" && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className={typingOpen ? "bg-accent-soft text-accent hover:bg-accent-soft" : ""}
                onClick={() => setTyping((v) => !v)}
                aria-pressed={typingOpen}
                aria-label="키보드로 답변"
                title="키보드로 답변"
              >
                <Keyboard size={20} />
              </Button>
            )}

            <Button
              type="button"
              size="icon"
              variant={micMuted ? "danger" : "secondary"}
              onClick={toggleMute}
              aria-pressed={micMuted}
              aria-label={micMuted ? "마이크 켜기" : "마이크 끄기"}
              title={micMuted ? "마이크 켜기" : "마이크 끄기"}
            >
              {micMuted ? <MicrophoneSlash size={20} /> : <Microphone size={20} />}
            </Button>

            {phase === "listening" && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={() => engineRef.current?.pause()}
                aria-label="잠시 멈춤"
                title="잠시 멈춤"
              >
                <Pause size={20} />
              </Button>
            )}
            {phase === "paused" && (
              <Button type="button" onClick={() => engineRef.current?.resume()}>
                <Play size={16} />
                다시 이어가기
              </Button>
            )}

            <Button
              type="button"
              variant="danger"
              className="max-sm:size-11 max-sm:px-0"
              onClick={() => setConfirmExit(true)}
              disabled={phase === "finishing"}
              aria-label="면접 마치기"
            >
              <SignOut size={18} />
              <span className="hidden sm:inline">면접 마치기</span>
            </Button>
          </div>
        </div>
      </footer>

      {/* 중도 퇴장 확인 모달 */}
      {confirmExit && (
        <div className="fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <Card className="rise max-w-md space-y-4">
            <h2 className="text-[20px]">지금 면접을 마치고 나가시겠습니까?</h2>
            <p className="text-[15px] text-ink-2">
              지금까지 답변한 내용을 바탕으로 면접관 채점표와 다시 듣기 보고서를 바로 생성합니다.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmExit(false)}>
                계속 진행하기
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  setConfirmExit(false);
                  void engineRef.current?.leave();
                }}
              >
                마치고 보고서 보기
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-canvas">
          <Spinner className="size-6 text-accent" />
        </div>
      }
    >
      <InterviewInner />
    </Suspense>
  );
}
