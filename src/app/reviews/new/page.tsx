"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Plus, Trash } from "@phosphor-icons/react";
import { TopBar } from "@/components/ui/top-bar";
import { Button, ButtonLink, Spinner } from "@/components/ui/button";
import { Card, Field, LevelPicker, Notice, PageHeader, Segmented } from "@/components/ui/controls";

const COMPANY_TYPES = ["대기업", "중견기업", "공기업", "스타트업", "외국계", "기타"] as const;

function ReviewFormInner() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? undefined;

  const [company, setCompany] = useState(params.get("company") ?? "");
  const [job, setJob] = useState(params.get("job") ?? "");
  const [industry, setIndustry] = useState("IT·플랫폼");
  const [companyType, setCompanyType] = useState<(typeof COMPANY_TYPES)[number]>("대기업");
  const [stage, setStage] = useState("1차 실무 면접");
  const [format, setFormat] = useState("3:1 다대일 면접 (약 40분)");
  const [interviewerCount, setInterviewerCount] = useState(3);
  const [questions, setQuestions] = useState<string[]>([""]);
  const [atmosphere, setAtmosphere] = useState("");
  const [pressure, setPressure] = useState(3);
  const [tips, setTips] = useState("");
  const [similarity, setSimilarity] = useState(4);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(idx: number, val: string) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? val : q)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = questions.map((q) => q.trim()).filter((q) => q.length >= 2);
    if (!company.trim() || !job.trim() || cleaned.length === 0) {
      setError("회사명, 직무, 실제 받은 질문 1개 이상을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          job: job.trim(),
          industry: industry.trim(),
          companyType,
          stage: stage.trim(),
          format: format.trim(),
          interviewerCount,
          questions: cleaned,
          atmosphere: atmosphere.trim(),
          pressure,
          tips: tips.trim(),
          similarity: sessionId ? similarity : undefined,
          sessionId,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `오류 (${res.status})`);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "후기 저장 중 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-20 text-center">
        <Card className="rise space-y-4 py-10">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-positive-soft text-positive">
            <Check size={24} weight="bold" />
          </div>
          <h1 className="text-[24px]">면접 후기를 남겨주셔서 고맙습니다</h1>
          <p className="text-[15px] text-ink-2">
            남겨주신 후기는 관리자 검수를 거쳐 같은 회사를 준비하는 다음 지원자의 면접장 재현에 반영됩니다.
          </p>
          <div className="pt-2">
            <ButtonLink href="/">첫 화면으로 돌아가기</ButtonLink>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader title="실제 면접 후기 남기기">
        다녀오신 면접장의 인원, 분위기, 기억나는 질문을 적어주시면 면접 재현 정확도가 높아집니다.
      </PageHeader>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="회사명 *">
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="예) 네이버"
                className="field"
              />
            </Field>
            <Field label="직무 *">
              <input
                type="text"
                required
                value={job}
                onChange={(e) => setJob(e.target.value)}
                placeholder="예) 백엔드 개발"
                className="field"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="기업 분류">
              <select
                value={companyType}
                onChange={(e) => setCompanyType(e.target.value as (typeof COMPANY_TYPES)[number])}
                className="field"
              >
                {COMPANY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="산업군 · 전형 단계">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="산업군"
                  className="field"
                />
                <input
                  type="text"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  placeholder="1차 면접"
                  className="field"
                />
              </div>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field as="div" label="면접관 수">
              <div>
                <Segmented
                  label="면접관 수"
                  value={interviewerCount}
                  onChange={setInterviewerCount}
                  options={[
                    { value: 1, label: "1명" },
                    { value: 2, label: "2명" },
                    { value: 3, label: "3명" },
                    { value: 4, label: "4명+" },
                  ]}
                />
              </div>
            </Field>
            <Field as="div" label="체감 압박 강도">
              <div>
                <LevelPicker
                  label="체감 압박 강도"
                  value={pressure}
                  onChange={setPressure}
                  low="편안함"
                  high="압박 심함"
                />
              </div>
            </Field>
          </div>

          <Field label="면접 진행 방식 · 분위기">
            <textarea
              rows={2}
              value={atmosphere}
              onChange={(e) => setAtmosphere(e.target.value)}
              placeholder="예) 실무 리드 두 분이 이력서 수치 위주로 꼬리질문을 이어갔고 인사 담당자는 협업 태도를 물어봤습니다."
              className="field"
            />
          </Field>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] text-ink">실제 받았던 질문 *</h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuestions((prev) => [...prev, ""])}
            >
              <Plus size={15} />
              질문 추가
            </Button>
          </div>

          {questions.map((q, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={q}
                onChange={(e) => updateQuestion(idx, e.target.value)}
                placeholder={`질문 ${idx + 1} (예: Redis 락 대신 Lua 스크립트를 쓴 이유가 무엇인가요?)`}
                className="field min-w-0 flex-1"
              />
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}
                  className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label="질문 삭제"
                >
                  <Trash size={16} />
                </button>
              )}
            </div>
          ))}
        </Card>

        <Card className="space-y-4">
          <Field label="다음 지원자를 위한 조언 (선택)">
            <textarea
              rows={2}
              value={tips}
              onChange={(e) => setTips(e.target.value)}
              placeholder="예) 자소서에 적은 트래픽 수치의 측정 도구와 조건을 꼭 준비해 가세요."
              className="field"
            />
          </Field>

          {sessionId && (
            <Field as="div" label="Moting 모의 면접이 실제 면접장과 얼마나 비슷했나요?">
              <LevelPicker
                label="모의 면접 유사도"
                value={similarity}
                onChange={setSimilarity}
                low="많이 달랐음"
                high="매우 비슷했음"
              />
            </Field>
          )}
        </Card>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={submitting}>
            후기 제출하기
          </Button>
        </div>
      </form>
    </main>
  );
}

export default function NewReviewPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <TopBar center={<span className="text-[14px] font-medium text-ink-2">실제 면접 후기 기고</span>} />
      <Suspense
        fallback={
          <div className="flex py-20 justify-center">
            <Spinner className="size-6 text-accent" />
          </div>
        }
      >
        <ReviewFormInner />
      </Suspense>
    </div>
  );
}
