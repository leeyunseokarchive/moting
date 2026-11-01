"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash, ArrowRight, EyeSlash, Eye } from "@phosphor-icons/react";
import { TopBar, DemoBadge } from "@/components/ui/top-bar";
import { Button, Spinner } from "@/components/ui/button";
import { Card, Field, LevelPicker, Notice, PageHeader, Segmented, Toggle } from "@/components/ui/controls";
import { SiteFooter } from "@/components/ui/site-footer";
import { getSession, patchSession, type PublicSession } from "@/client/api";
import { PERSONAS, persona, resolvePortrait } from "@/lib/interviewers";
import type {
  EnvironmentProfile,
  Interviewer,
  QuestionPlanItem,
} from "@/lib/types";

const SOURCE_BADGE: Record<
  QuestionPlanItem["source"],
  { label: string; className: string }
> = {
  review: {
    label: "실제 출제",
    className: "bg-pen-soft text-pen ring-1 ring-pen/25 font-semibold",
  },
  bank: {
    label: "직무 기본",
    className: "bg-canvas text-ink-2 font-medium",
  },
  coverLetter: {
    label: "자소서 검증",
    className: "bg-accent-soft text-accent font-medium",
  },
  resume: {
    label: "이력서 기반",
    className: "bg-fill text-ink-2 font-medium",
  },
  posting: {
    label: "공고 역량",
    className: "bg-fill text-ink-2 font-medium",
  },
  general: {
    label: "기본 필수",
    className: "bg-canvas text-ink-2 ring-1 ring-hairline font-medium",
  },
};

function ensureDefaultBookends(
  plan: QuestionPlanItem[],
  leadId: string,
  frequentProbes: string[] = [],
): QuestionPlanItem[] {
  const hasIntro = plan.some((q) => /자기소개|본인\s*소개|1분\s*소개/.test(q.question) || /자기소개/.test(q.intent));
  const hasClosing = plan.some(
    (q) => /마지막으로.*(?:말씀|질문|하고\s*싶은)|궁금한\s*점/.test(q.question) || /마지막\s*할\s*말|역질문|마무리/.test(q.intent),
  );
  const hasReview = plan.some((q) => q.source === "review");
  const extraReviews: QuestionPlanItem[] = !hasReview
    ? frequentProbes.slice(0, 2).map((probe, idx) => ({
      id: `q_review_default_${idx}`,
      interviewerId: leadId,
      question: probe,
      intent: "면접 후기 실제 기출 질문",
      source: "review" as const,
    }))
    : [];
  return [
    ...(hasIntro
      ? []
      : [
        {
          id: "q_intro_default",
          interviewerId: leadId,
          question: "먼저 1분 정도로 간단하게 본인 자기소개 부탁드립니다.",
          intent: "1분 자기소개 · 지원 직무 핵심 강점 요약",
          source: "general" as const,
        },
      ]),
    ...extraReviews,
    ...plan,
    ...(hasClosing
      ? []
      : [
        {
          id: "q_closing_default",
          interviewerId: leadId,
          question: "면접이 거의 마무리되었습니다. 마지막으로 꼭 하고 싶은 말씀이나 궁금한 점이 있다면 편하게 말씀해 주세요.",
          intent: "마지막 할 말 · 입사 의지 및 역질문",
          source: "general" as const,
        },
      ]),
  ];
}

function SetupInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<PublicSession | null>(null);
  const [profile, setProfile] = useState<EnvironmentProfile | null>(null);
  const [plan, setPlan] = useState<QuestionPlanItem[]>([]);
  const [hidePlan, setHidePlan] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSession(id)
      .then((s) => {
        if (!alive) return;
        const lead = s.profile.interviewers.find((i) => i.isLead) ?? s.profile.interviewers[0];
        setSession(s);
        // 예전 세션은 이름에 직함이 붙어 있다
        setProfile({ ...s.profile, interviewers: s.profile.interviewers.map((iv) => ({ ...iv, name: iv.name.split(/\s+/)[0] })) });
        setPlan(ensureDefaultBookends(s.plan, lead.id, s.profile.frequentProbes));
        setHidePlan(true);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "면접 구성을 불러오지 못했습니다");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Spinner className="size-6 text-accent" />
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="min-h-dvh bg-canvas">
        <TopBar />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <Notice tone="error">{error ?? "세션을 찾을 수 없습니다"}</Notice>
        </main>
      </div>
    );
  }

  function updateInterviewer(idx: number, patch: Partial<Interviewer>) {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = prev.interviewers.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv));
      if (patch.isLead) {
        next.forEach((iv, i) => {
          iv.isLead = i === idx;
        });
      }
      return { ...prev, interviewers: next };
    });
  }

  function changePersonaKey(idx: number, key: string) {
    const p = persona(key);
    updateInterviewer(idx, {
      faceId: p.faceId,
      portrait: p.portrait,
      voice: p.voice,
      gender: p.gender,
    });
  }

  function addInterviewer() {
    if (!profile || profile.interviewers.length >= 3) return;
    const used = new Set(profile.interviewers.map((i) => i.faceId));
    const pick = PERSONAS.find((p) => !used.has(p.faceId)) ?? PERSONAS[0];
    const newId = `iv_${profile.interviewers.length + 1}_${Date.now().toString(36)}`;
    const nextIv: Interviewer = {
      id: newId,
      name: pick.defaultName,
      role: profile.interviewers.length === 1 ? "인사·컬처핏 담당" : "기술 임원",
      style: "답변의 구체적인 근거와 팀 기여도를 확인함",
      pressure: profile.pressure,
      isLead: false,
      focus: ["협업 방식", "입사 후 기여"],
      faceId: pick.faceId,
      portrait: pick.portrait,
      voice: pick.voice,
      gender: pick.gender,
    };
    setProfile({
      ...profile,
      format: `${profile.interviewers.length + 1}:1 다대일 면접`,
      interviewers: [...profile.interviewers, nextIv],
    });
  }

  function removeInterviewer(idx: number) {
    if (!profile || profile.interviewers.length <= 1) return;
    const removed = profile.interviewers[idx];
    const remaining = profile.interviewers.filter((_, i) => i !== idx);
    if (!remaining.some((i) => i.isLead)) remaining[0].isLead = true;
    setProfile({
      ...profile,
      format: remaining.length === 1 ? "1:1 면접" : `${remaining.length}:1 다대일 면접`,
      interviewers: remaining,
    });
    setPlan((prev) =>
      prev.map((q) => (q.interviewerId === removed.id ? { ...q, interviewerId: remaining[0].id } : q)),
    );
  }

  function updateQuestion(idx: number, patch: Partial<QuestionPlanItem>) {
    setPlan((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    if (!profile) return;
    const lead = profile.interviewers.find((i) => i.isLead) ?? profile.interviewers[0];
    setPlan((prev) => [
      ...prev,
      {
        id: `q_${prev.length + 1}_${Date.now().toString(36)}`,
        interviewerId: lead.id,
        question: "이력서에 적어주신 프로젝트에서 가장 아쉬웠던 기술적 의사결정은 무엇이었나요?",
        intent: "의사결정 기준과 회고 깊이 확인",
        source: "resume",
      },
    ]);
  }

  function removeQuestion(idx: number) {
    if (plan.length <= 1) return;
    setPlan((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleStart() {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    try {
      await patchSession(id, { profile, plan, hidePlan });
      router.push(`/interview/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "설정을 저장하지 못했습니다");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <TopBar center={<span className="text-[14px] font-medium text-ink-2">2 / 3 · 면접장 설정</span>}>
        <DemoBadge show={session.demo} />
        <Button onClick={handleStart} loading={saving}>
          면접장 입장하기
          <ArrowRight size={16} />
        </Button>
      </TopBar>

      <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
        <PageHeader eyebrow={`${session.parsed.company} · ${session.parsed.job} (${session.parsed.stage})`} title="구성된 면접장을 확인하고 다듬어 주세요">
          {session.match.summary} — 면접관 수, 압박 강도, 예상 질문을 실제 안내받은 전형에 맞게 조정할 수 있습니다.
        </PageHeader>

        {error && <Notice tone="error">{error}</Notice>}

        {/* 매칭 근거 및 환경 설정 */}
        <Card className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline/70 pb-5">
            <div>
              <h2 className="text-[20px]">면접 환경</h2>
              <p className="mt-1 text-[14px] text-ink-2">
                후기에서 추출한 분위기: {profile.atmosphere}
              </p>
            </div>
            <span className="rounded-full bg-accent-soft px-3.5 py-1 text-[13px] font-medium text-accent">
              {profile.format}
            </span>
          </div>

          {profile.evidence.length > 0 && (
            <div className="rounded-[var(--radius-md)] bg-canvas p-4">
              <p className="text-[13px] font-semibold text-ink-2">반영된 후기·안내 근거</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[14px] text-ink-2">
                {profile.evidence.map((ev, i) => (
                  <li key={i}>{ev.note}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <Field as="div" label="예상 진행 시간">
              <Segmented
                label="예상 진행 시간"
                value={profile.durationMin}
                onChange={(durationMin) => setProfile({ ...profile, durationMin })}
                options={[
                  { value: 10, label: "10분" },
                  { value: 15, label: "15분" },
                  { value: 25, label: "25분" },
                  { value: 40, label: "40분" },
                ]}
              />
            </Field>

            <Field as="div" label="답변당 권장 제한 시간">
              <Segmented
                label="답변당 권장 제한 시간"
                value={profile.maxAnswerSec}
                onChange={(maxAnswerSec) => setProfile({ ...profile, maxAnswerSec })}
                options={[
                  { value: 60, label: "60초" },
                  { value: 90, label: "90초" },
                  { value: 120, label: "120초" },
                ]}
              />
            </Field>

            <Field as="div" label="전체 압박 강도">
              <LevelPicker
                label="전체 압박 강도"
                value={profile.pressure}
                onChange={(pressure) => setProfile({ ...profile, pressure })}
                low="온화한 대화"
                high="집요한 압박"
              />
            </Field>

            <Field as="div" label="장황한 답변 시 말 끊기 빈도">
              <Segmented
                label="말 끊기 빈도"
                value={profile.interruptRate}
                onChange={(interruptRate) => setProfile({ ...profile, interruptRate })}
                options={[
                  { value: "low", label: "거의 안 끊음" },
                  { value: "mid", label: "보통" },
                  { value: "high", label: "자주 끊음" },
                ]}
              />
            </Field>
          </div>
        </Card>

        {/* 면접관 패널 설정 */}
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[20px]">면접관 패널 ({profile.interviewers.length}명)</h2>
              <p className="mt-1 text-[14px] text-ink-2">
                1명부터 최대 3명까지 배치할 수 있습니다. 각 면접관의 역할과 압박 성향이 질문 순서에 반영됩니다.
              </p>
            </div>
            {profile.interviewers.length < 3 && (
              <Button type="button" variant="secondary" onClick={addInterviewer}>
                <Plus size={16} />
                면접관 추가
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {profile.interviewers.map((iv, idx) => (
              <div
                key={iv.id}
                className="flex min-w-0 flex-col justify-between rounded-[var(--radius-md)] border border-hairline bg-canvas/50 p-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={resolvePortrait(iv)}
                      alt={iv.name}
                      className="size-14 rounded-full object-cover ring-2 ring-white"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={iv.name}
                        onChange={(e) => updateInterviewer(idx, { name: e.target.value })}
                        className="w-full rounded-md px-1.5 py-0.5 text-[16px] font-semibold text-ink transition-colors hover:bg-fill/60 focus:bg-white"
                        aria-label="면접관 이름"
                      />
                      <input
                        type="text"
                        value={iv.role}
                        onChange={(e) => updateInterviewer(idx, { role: e.target.value })}
                        className="mt-0.5 w-full rounded-md px-1.5 py-0.5 text-[13px] text-ink-2 transition-colors hover:bg-fill/60 focus:bg-white"
                        aria-label="면접관 역할"
                      />
                    </div>
                  </div>

                  <Field label="외형 · 음성 프리셋">
                    <select
                      value={PERSONAS.find((p) => p.faceId === iv.faceId)?.key ?? PERSONAS[0].key}
                      onChange={(e) => changePersonaKey(idx, e.target.value)}
                      className="field"
                    >
                      {PERSONAS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.defaultName} ({p.look} · 음성 {p.voice})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="질문 성향">
                    <textarea
                      value={iv.style}
                      rows={2}
                      onChange={(e) => updateInterviewer(idx, { style: e.target.value })}
                      className="field"
                    />
                  </Field>

                  <Field as="div" label={`개인 압박도 (${iv.pressure}단계)`}>
                    <LevelPicker
                      label={`${iv.name} 압박도`}
                      value={iv.pressure}
                      onChange={(pressure) => updateInterviewer(idx, { pressure })}
                      low="온화"
                      high="날카로움"
                    />
                  </Field>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-hairline/60 pt-3 text-[13px]">
                  <button
                    type="button"
                    onClick={() => updateInterviewer(idx, { isLead: true })}
                    className={`cursor-pointer font-medium ${iv.isLead ? "text-accent" : "text-ink-3 hover:text-ink"
                      }`}
                  >
                    {iv.isLead ? "주 진행 면접관" : "주 진행으로 지정"}
                  </button>
                  {profile.interviewers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInterviewer(idx)}
                      className="inline-flex cursor-pointer items-center gap-1 text-ink-3 hover:text-danger"
                      aria-label={`${iv.name} 제외`}
                    >
                      <Trash size={14} />
                      제외
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 예상 질문 설계도 */}
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[20px]">예상 질문 설계도 ({plan.length}개 주제)</h2>
              <p className="mt-1 text-[14px] text-ink-2">
                실전 감각을 원하면 질문을 가린 채로 입장하고, 특정 질문을 연습하고 싶다면 미리 열어 수정하세요.
              </p>
            </div>
            <Toggle checked={hidePlan} onChange={setHidePlan} label="실전처럼 질문 가리기" />
          </div>

          {hidePlan ? (
            <div className="flex flex-col items-center justify-center rounded-[var(--radius-md)] bg-canvas py-10 text-center">
              <EyeSlash size={28} className="text-ink-3" />
              <p className="mt-2 text-[15px] font-medium text-ink">
                질문 설계도가 가려져 있습니다 ({plan.length}개 주제 준비됨)
              </p>
              <p className="mt-1 text-[13px] text-ink-2">
                입장하면 주 진행 면접관의 첫 인사부터 바로 시작됩니다.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                onClick={() => setHidePlan(false)}
              >
                <Eye size={16} />
                질문 미리 보고 편집하기
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {plan.map((q, idx) => (
                <div
                  key={q.id}
                  className="space-y-2.5 rounded-[var(--radius-md)] border border-hairline bg-canvas/40 p-4"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
                      {idx + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[15px] font-semibold text-ink">{q.intent}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] ${SOURCE_BADGE[q.source]?.className ?? SOURCE_BADGE.general.className
                          }`}
                      >
                        {SOURCE_BADGE[q.source]?.label ?? "기본 필수"}
                      </span>
                    </div>
                    {plan.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuestion(idx)}
                        className="shrink-0 inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
                        aria-label="질문 삭제"
                      >
                        <Trash size={16} />
                      </button>
                    )}
                  </div>

                  <textarea
                    value={q.question}
                    rows={2}
                    aria-label={`질문 ${idx + 1}`}
                    onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                    className="field"
                  />
                </div>
              ))}

              <Button type="button" variant="secondary" onClick={addQuestion}>
                <Plus size={16} />
                질문 주제 추가
              </Button>
            </div>
          )}
        </Card>

        <div className="flex justify-end pt-2">
          <Button size="lg" onClick={handleStart} loading={saving}>
            장비 점검하고 면접장 입장하기
            <ArrowRight size={18} />
          </Button>
        </div>
      </main>
      <SiteFooter credits={plan.map((q) => q.credit)} className="max-w-4xl" />
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-canvas">
          <Spinner className="size-6 text-accent" />
        </div>
      }
    >
      <SetupInner />
    </Suspense>
  );
}
