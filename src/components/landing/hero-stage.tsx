"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, type CaptionAlign } from "@/components/ui/captions";
import { PERSONAS } from "@/lib/interviewers";

/**
 * 첫 화면의 작은 면접장. 실제 면접장과 같은 초점·자막을 짧은 대본으로 돌린다.
 * 질문 장면은 실제 Simli 아바타에 같은 문장을 TTS로 말하게 해 녹화한 클립(public/hero)이다.
 */
const PANEL = [
  { p: PERSONAS[1], name: "김서연", role: "인사팀 과장" },
  { p: PERSONAS[0], name: "박도현", role: "개발팀 팀장" },
  { p: PERSONAS[2], name: "이정민", role: "기술본부 상무" },
];
const ALIGN: CaptionAlign[] = ["start", "center", "end"];

// 꼬리질문이 이어지는 흐름. askMs는 클립에서 말이 끝나는 시점, note는 그동안 다른 면접관이 하는 일
// 대본을 바꾸면 클립도 다시 찍어야 입 모양이 맞는다
const SCRIPT = [
  {
    who: 1,
    askMs: 4900,
    q: "응답 시간을 줄였다고 하셨는데, 측정은 어떻게 하셨어요?",
    a: "부하 테스트로 p95 지연을 배포 전후로 비교했습니다",
    note: { who: 0, text: "답변 내용을 평가표에 기록 중" },
  },
  {
    who: 2,
    askMs: 4300,
    q: "그 수치를 보고 본인이 내린 판단은 뭐였나요?",
    a: "캐시보다 쿼리 수를 먼저 줄여야 한다고 봤습니다",
    note: { who: 1, text: "이력서·자소서를 넘겨 보는 중" },
  },
  {
    who: 0,
    askMs: 4450,
    q: "팀에서 의견이 갈렸을 때는 어떻게 정리하셨어요?",
    a: "측정 결과를 공유하고 작은 범위로 먼저 시험해 봤습니다",
    note: { who: 2, text: "고개를 끄덕이며 경청 중" },
  },
];

const WORD_MS = 230;
const ENDING_MS = 1400; // 답변이 끝나고 다음 면접관으로 넘어가기 전 쉼

type Phase = "ask" | "answer" | "ending";

export function HeroStage() {
  const [beat, setBeat] = useState(0);
  const [phase, setPhase] = useState<Phase>("ask");
  const [words, setWords] = useState(0);
  const [still, setStill] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    setStill(reduce.matches);
    const onChange = () => setStill(reduce.matches);
    reduce.addEventListener("change", onChange);
    return () => reduce.removeEventListener("change", onChange);
  }, []);

  const line = SCRIPT[beat];
  const answerWords = line.a.split(" ");

  // 질문 → 답변 → 잠깐 쉼 → 다음 면접관. 움직임을 줄이면 첫 장면에 멈춘다
  useEffect(() => {
    if (still) {
      setPhase("answer");
      setWords(answerWords.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    setPhase("ask");
    setWords(0);
    // 질문하는 면접관의 클립을 처음부터 튼다. 자동 재생이 막히면 사진으로 남는다
    const v = videos.current[line.who];
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    const askEnd = line.askMs;
    at(askEnd, () => setPhase("answer"));
    answerWords.forEach((_, i) => at(askEnd + 500 + i * WORD_MS, () => setWords(i + 1)));
    const answerEnd = askEnd + 500 + answerWords.length * WORD_MS + 600;
    at(answerEnd, () => setPhase("ending"));
    at(answerEnd + ENDING_MS, () => setBeat((b) => (b + 1) % SCRIPT.length));
    return () => {
      timers.forEach(clearTimeout);
      setPlaying(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, still]);

  const speaking = phase === "ask";
  const asker = PANEL[line.who];

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-canvas" aria-hidden>
      <div className="px-4 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-14">
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-3 sm:gap-6">
          {PANEL.map(({ p, name }, i) => (
            <div key={p.key} data-focus={i === line.who ? "on" : "off"} className="tile relative isolate rounded-[18px]">
              <div className="tile-face overflow-hidden rounded-[18px] bg-white">
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-fill">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.portrait} alt={name} width={600} height={750} className="tile-media size-full object-cover" />
                  {!still && (
                    <video
                      ref={(el) => {
                        videos.current[i] = el;
                      }}
                      muted
                      playsInline
                      preload="auto"
                      poster={p.portrait}
                      onPlaying={() => setPlaying(i)}
                      className={`tile-media absolute inset-0 size-full object-cover ${playing === i && i === line.who ? "opacity-100" : "opacity-0"}`}
                    >
                      <source src={`/hero/${p.key}.webm`} type='video/webm; codecs="av01.0.04M.08"' />
                      <source src={`/hero/${p.key}.mp4`} type="video/mp4" />
                    </video>
                  )}
                  {phase !== "ask" && line.note.who === i && (
                    <span className="fade absolute bottom-2 left-2 hidden rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur-md sm:block">
                      {line.note.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 자막은 질문한 면접관 자리 아래에 놓인다 */}
        <div className="mx-auto mt-6 max-w-3xl text-left [&_.caption-stream]:h-[112px]! sm:[&_.caption-stream]:h-[96px]! sm:[&_.caption]:max-w-[440px]">
          <Captions
            question={line.q}
            answer={answerWords.slice(0, words).join(" ")}
            speaking={speaking}
            speakerName={asker.name}
            speakerRole={asker.role}
            align={ALIGN[line.who]}
          />
        </div>
      </div>

    </div>
  );
}
