"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Play, Pause, NotePencil, ArrowCounterClockwise } from "@phosphor-icons/react";
import { TopBar, DemoBadge } from "@/components/ui/top-bar";
import { Button, ButtonLink, Spinner } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/controls";
import { getSession, type PublicSession } from "@/client/api";
import { locateWords } from "@/client/metrics";
import type { AnswerEval, AnswerRecord } from "@/lib/types";

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** 답변 텍스트 안에 면접관의 빨간 펜 밑줄·동그라미 표시를 입힌다 */
function renderMarkedAnswer(
  answer: AnswerRecord,
  onSeek: (sec: number) => void,
): ReactNode {
  const text = answer.answer;
  const marks = answer.eval?.marks ?? [];
  const located = locateWords(text, answer.words);

  // 단어를 누르면 그 시점부터 재생한다. button은 바깥 밑줄을 물려받지 못해 style로 직접 입힌다
  const wordButtons = (from: number, to: number, style = ""): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let at = from;
    for (const w of located) {
      const start = Math.max(w.from, from);
      const end = Math.min(w.to, to);
      if (start >= end) continue;
      if (start > at) nodes.push(text.slice(at, start));
      nodes.push(
        <button
          key={start}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSeek(w.start);
          }}
          className={`cursor-pointer rounded text-left transition-colors hover:bg-accent-soft hover:text-accent ${style}`}
          title={`${formatSec(w.start)}부터 듣기`}
        >
          {text.slice(start, end)}
        </button>,
      );
      at = end;
    }
    if (at < to) nodes.push(text.slice(at, to));
    return nodes;
  };

  // quote 위치를 찾아 순서대로 조각낸다
  type Span = { start: number; end: number; mark?: AnswerEval["marks"][number] };
  const found: Span[] = [];
  for (const m of marks) {
    if (!m.quote) continue;
    const idx = text.indexOf(m.quote);
    if (idx >= 0 && !found.some((f) => idx < f.end && idx + m.quote.length > f.start)) {
      found.push({ start: idx, end: idx + m.quote.length, mark: m });
    }
  }
  found.sort((a, b) => a.start - b.start);

  const pieces: ReactNode[] = [];
  let cursor = 0;
  found.forEach((s, i) => {
    if (s.start > cursor) {
      pieces.push(<span key={`t_${i}`}>{wordButtons(cursor, s.start)}</span>);
    }
    const isGood = s.mark?.type === "good";
    const pen = isGood
      ? "underline decoration-positive/60 decoration-2 underline-offset-4"
      : "underline decoration-pen decoration-wavy decoration-2 underline-offset-4";
    const firstWord = located.find((w) => w.to > s.start && w.from < s.end);
    pieces.push(
      <span
        key={`m_${i}`}
        onClick={() => onSeek(firstWord?.start ?? answer.startSec)}
        className={`cursor-pointer rounded px-1 py-0.5 transition-colors ${
          isGood ? "bg-positive-soft text-positive" : "bg-pen-soft text-ink"
        } ${pen}`}
        title={s.mark?.note}
      >
        {wordButtons(s.start, s.end, pen)}
      </span>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) {
    pieces.push(<span key="tail">{wordButtons(cursor, text.length)}</span>);
  }
  return pieces;
}

function ReportInner() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingAnswerId, setPlayingAnswerId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipEndRef = useRef(Infinity);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let s = await getSession(id);
        if (!s.report) {
          const res = await fetch(`/api/sessions/${id}/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (res.ok) s = await getSession(id);
        }
        if (!alive) return;
        setSession(s);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "보고서를 불러오지 못했습니다");
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  function seekTo(sec: number, answerId: string) {
    const el = audioRef.current;
    if (!el || !session?.recordingUrl) return;
    clipEndRef.current = session.answers.find((a) => a.id === answerId)?.endSec ?? Infinity;
    el.currentTime = Math.max(0, sec);
    void el.play().catch(() => {});
    setPlayingAnswerId(answerId);
  }

  function toggleAnswerPlay(a: AnswerRecord) {
    const el = audioRef.current;
    if (!el || !session?.recordingUrl) return;
    if (playingAnswerId === a.id && !el.paused) {
      el.pause();
      setPlayingAnswerId(null);
    } else {
      seekTo(a.startSec, a.id);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas">
        <Spinner className="size-6 text-accent" />
        <p className="text-[15px] text-ink-2">면접관 평가표와 음성 분석 결과를 정리하고 있습니다...</p>
      </div>
    );
  }

  if (!session || !session.report) {
    return (
      <div className="min-h-dvh bg-canvas">
        <TopBar />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <Notice tone="error">{error ?? "보고서가 아직 준비되지 않았습니다."}</Notice>
        </main>
      </div>
    );
  }

  const { report, parsed: docs, profile, answers, transcript } = session;
  const totalSec = Math.max(
    60,
    answers.at(-1)?.endSec ?? (transcript.at(-1)?.at ? transcript.at(-1)!.at / 1000 : 180),
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <TopBar center={<span className="text-[14px] font-medium text-ink-2">3 / 3 · 면접 결과 보고서</span>}>
        <DemoBadge show={session.demo} />
        <ButtonLink href={`/reviews/new?sessionId=${id}&company=${encodeURIComponent(docs.company)}&job=${encodeURIComponent(docs.job)}`} variant="secondary" className="max-md:hidden">
          <NotePencil size={16} />
          실제 면접 후기 남기기
        </ButtonLink>
        <ButtonLink href="/new" variant="plain">
          <ArrowCounterClockwise size={16} />
          새 모의 면접
        </ButtonLink>
      </TopBar>

      {session.recordingUrl && (
        <audio
          ref={audioRef}
          src={session.recordingUrl}
          onEnded={() => setPlayingAnswerId(null)}
          onPause={() => setPlayingAnswerId(null)}
          onTimeUpdate={(e) => {
            if (e.currentTarget.currentTime >= clipEndRef.current) e.currentTarget.pause();
          }}
          className="sr-only"
        />
      )}

      <main id="main" className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
        {/* 면접관 채점표 종이 헤더 */}
        <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-hairline/80 bg-paper p-7 shadow-[var(--shadow-paper)] sm:p-10">
          <div className="flex flex-col gap-6 border-b border-hairline pb-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[13px] font-medium text-ink-3">
                면접 결과 평가표 · {docs.company} / {docs.job} ({docs.stage})
              </p>
              <h1 className="text-[28px] sm:text-[34px]">{report.headline}</h1>
              <p className="text-[15px] text-ink-2">{session.match.summary}</p>
            </div>

            {/* 빨간 펜 동그라미 총점 도장. 판정 문구가 길어도 동그라미 밖 아래에 적는다 */}
            <div className="flex shrink-0 flex-col items-center sm:w-44">
              <div className="relative px-7 py-3">
                <svg
                  aria-hidden
                  viewBox="0 0 120 76"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 size-full text-pen"
                >
                  <ellipse
                    cx="60"
                    cy="38"
                    rx="54"
                    ry="31"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                    transform="rotate(-4 60 38)"
                    className="pen-stroke"
                  />
                </svg>
                <span className="font-pen text-[42px] leading-none text-pen">{report.overallScore}점</span>
              </div>
              <span className="mt-2 text-center font-pen text-[21px] leading-tight text-pen">{report.verdict}</span>
            </div>
          </div>

          {/* 강점 & 보완할 점 */}
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-[16px] font-semibold text-positive">인상적이었던 강점</h2>
              <ul className="mt-2.5 space-y-2 text-[15px] text-ink">
                {report.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-positive">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-pen">실전 전 반드시 보완할 점</h2>
              <ul className="mt-2.5 space-y-2 text-[15px] text-ink">
                {report.improvements.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-pen">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 면접관별 한줄 손글씨 총평 */}
          {report.interviewerNotes.length > 0 && (
            <div className="mt-8 border-t border-hairline/70 pt-6">
              <h2 className="text-[15px] font-semibold text-ink-2">면접관별 메모</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {report.interviewerNotes.map((n, i) => {
                  const iv = profile.interviewers.find((p) => p.id === n.interviewerId) ?? profile.interviewers[i];
                  return (
                    <div key={i} className="rounded-[var(--radius-md)] bg-paper-2 p-3.5">
                      <p className="text-[13px] font-semibold text-ink">
                        {iv?.name ?? "면접관"} <span className="font-normal text-ink-3">· {iv?.role}</span>
                      </p>
                      <p className="mt-1 font-pen text-[21px] leading-snug text-pen">{n.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 면접 타임라인 (질문·답변·끼어들기·침묵 구간) */}
        {answers.length > 0 && (
          <Card className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[20px]">면접 흐름 타임라인</h2>
              <span className="text-[13px] text-ink-3">구간을 누르면 해당 시점의 녹음을 재생합니다</span>
            </div>

            <div className="relative h-10 w-full overflow-hidden rounded-[var(--radius-sm)] bg-canvas">
              {answers.map((a, idx) => {
                const left = Math.min(96, Math.max(0, (a.startSec / totalSec) * 100));
                const width = Math.max(4, ((a.endSec - a.startSec) / totalSec) * 100);
                const hasPause = (a.voice?.longPauses ?? 0) > 0;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAnswerPlay(a)}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={`absolute top-1.5 bottom-1.5 cursor-pointer rounded px-1.5 text-left text-[11px] font-medium text-white transition-opacity hover:opacity-90 ${
                      a.interrupted
                        ? "bg-pen"
                        : hasPause
                          ? "bg-warn"
                          : "bg-accent"
                    }`}
                    title={`질문 ${idx + 1}: ${formatSec(a.startSec)} ~ ${formatSec(a.endSec)}`}
                  >
                    Q{idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-4 text-[12px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-accent" /> 일반 답변 구간
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-warn" /> 2초 이상 침묵·머뭇거림 포함
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-pen" /> 시간 초과·말 끊김 발생
              </span>
            </div>
          </Card>
        )}

        {/* 회사 평가 기준 적합도 */}
        {report.companyFit.length > 0 && (
          <Card className="space-y-4">
            <h2 className="text-[20px]">{docs.company} 평가 기준별 채점</h2>
            <div className="divide-y divide-hairline/60">
              {report.companyFit.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div className="space-y-0.5">
                    <p className="text-[16px] font-semibold text-ink">{c.point}</p>
                    <p className="text-[14px] text-ink-2">{c.comment}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={`inline-block h-2.5 w-5 rounded-xs ${
                          n <= c.rating ? "bg-ink" : "bg-fill"
                        }`}
                      />
                    ))}
                    <span className="ml-2 tabular text-[14px] font-semibold text-ink">{c.rating} / 5</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 질문별 다시 보면서 듣는 첨삭 카드 */}
        <section className="space-y-5">
          <div>
            <h2 className="text-[22px]">질문별 답변 다시 듣기 · 빨간 펜 첨삭</h2>
            <p className="mt-1 text-[14px] text-ink-2">
              답변 문장이나 단어를 누르면 해당 시점의 내 목소리를 바로 다시 들어볼 수 있습니다.
            </p>
          </div>

          {answers.length === 0 ? (
            <Card>
              <p className="text-[15px] text-ink-2">
                기록된 음성 답변이 없습니다. 다음 면접에서는 마이크나 텍스트 입력으로 답변을 남겨보세요.
              </p>
            </Card>
          ) : (
            answers.map((a, idx) => {
              const iv = profile.interviewers.find((p) => p.id === a.interviewerId) ?? profile.interviewers[0];
              const isPlaying = playingAnswerId === a.id;
              const credit = session.plan.find((p) => p.id === transcript[a.questionEntryIndex]?.planId)?.credit;

              return (
                <Card key={a.id} className="space-y-5 border border-hairline/70 bg-paper">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline/60 pb-4">
                    <div className="space-y-1">
                      <span className="text-[13px] font-medium text-ink-3">
                        질문 {idx + 1} · {iv?.name} ({iv?.role})
                      </span>
                      <h3 className="text-[18px] leading-snug text-ink">{a.question}</h3>
                      {credit?.url && (
                        <a href={credit.url} target="_blank" rel="noreferrer" className="text-[12px] text-ink-3 underline">
                          질문 출처 ({credit.license})
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {a.eval && (
                        <span className="font-pen text-[26px] text-pen">
                          {a.eval.score} / 5점
                        </span>
                      )}
                      {session.recordingUrl && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => toggleAnswerPlay(a)}
                        >
                          {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                          {isPlaying ? "일시정지" : `${formatSec(a.startSec)} 듣기`}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 내 답변 + 인라인 빨간 펜 표시 */}
                  <div className="rounded-[var(--radius-md)] bg-white p-4 shadow-2xs">
                    <p className="text-[12px] font-medium text-ink-3">내 답변 (단어를 누르면 그 시점부터 재생)</p>
                    <p className="mt-1.5 text-[16px] leading-relaxed text-ink">
                      {renderMarkedAnswer(a, (sec) => seekTo(sec, a.id))}
                    </p>

                    {/* 빨간 펜 여백 메모 */}
                    {a.eval?.marks && a.eval.marks.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-hairline/60 pt-3">
                        {a.eval.marks.map((m, mi) => (
                          <p
                            key={mi}
                            className={`flex items-baseline gap-2 text-[14px] ${
                              m.type === "good" ? "text-positive" : "text-pen"
                            }`}
                          >
                            <span className="font-pen text-[19px]">
                              {m.type === "good" ? "좋음:" : m.type === "question" ? "근거 확인:" : "보완:"}
                            </span>
                            <span>
                              &ldquo;{m.quote}&rdquo; — {m.note}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 자소서·이력서 대조 불일치 경고 */}
                  {a.eval?.consistencyIssue && (
                    <div className="rounded-[var(--radius-sm)] bg-pen-soft px-4 py-3 text-[14px] text-pen">
                      <strong className="font-semibold">서류·답변 대조 주의: </strong>
                      {a.eval.consistencyIssue}
                    </div>
                  )}

                  {/* 음성·시선 지표 요약 */}
                  <div className="flex flex-wrap gap-3 text-[13px] text-ink-2">
                    {a.voice && (
                      <>
                        <span className="rounded-full bg-canvas px-3 py-1 tabular">
                          답변 시간 {Math.round(a.voice.durationSec)}초
                        </span>
                        <span className="rounded-full bg-canvas px-3 py-1 tabular">
                          말 빠르기 {a.voice.syllablesPerMin}음절/분
                        </span>
                        <span className="rounded-full bg-canvas px-3 py-1 tabular">
                          음량 변화 ±{a.voice.dbStdev}dB
                        </span>
                        <span className="rounded-full bg-canvas px-3 py-1 tabular">
                          출발 지연 {a.voice.latencySec}초
                        </span>
                        <span className="rounded-full bg-canvas px-3 py-1 tabular">
                          습관어(음·어·그) {a.voice.fillerCount}회
                        </span>
                        {a.voice.longPauses > 0 && (
                          <span className="rounded-full bg-warn-soft px-3 py-1 tabular text-warn">
                            2초 이상 침묵 {a.voice.longPauses}회
                          </span>
                        )}
                      </>
                    )}
                    {a.face && a.face.samples > 0 && (
                      <>
                        <span className="rounded-full bg-canvas px-3 py-1 tabular">
                          시선 이탈 {Math.round(a.face.gazeAwayRatio * 100)}%
                        </span>
                        <span className="rounded-full bg-canvas px-3 py-1 tabular">
                          눈 깜빡임 {a.face.blinkPerMin}회/분
                        </span>
                      </>
                    )}
                  </div>

                  {/* 면접관이 권장하는 다듬은 답변 예시 */}
                  {a.eval?.betterAnswer && (
                    <div className="rounded-[var(--radius-md)] bg-accent-soft/60 p-4">
                      <p className="text-[13px] font-semibold text-accent">이렇게 답했다면 더 설득력 있었습니다</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-ink">{a.eval.betterAnswer}</p>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </section>

        {/* 실제 면접 후기 환류 유도 */}
        <Card className="flex flex-wrap items-center justify-between gap-4 bg-white">
          <div className="space-y-1">
            <h2 className="text-[19px]">실제 면접에 다녀오셨나요?</h2>
            <p className="text-[14px] text-ink-2">
              실제 면접장의 질문과 분위기를 남겨주시면 다음 지원자에게 더 가까운 면접장이 열립니다.
            </p>
          </div>
          <ButtonLink
            href={`/reviews/new?sessionId=${id}&company=${encodeURIComponent(docs.company)}&job=${encodeURIComponent(docs.job)}`}
          >
            실제 면접 후기 남기기
          </ButtonLink>
        </Card>
      </main>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-canvas">
          <Spinner className="size-6 text-accent" />
        </div>
      }
    >
      <ReportInner />
    </Suspense>
  );
}
