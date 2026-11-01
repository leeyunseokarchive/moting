"use client";

import { useState, type FormEvent } from "react";
import { Check, X } from "@phosphor-icons/react";
import { TopBar } from "@/components/ui/top-bar";
import { Button } from "@/components/ui/button";
import { Card, Notice, Segmented } from "@/components/ui/controls";
import type { Review } from "@/lib/types";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function AdminReviewsPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReviews(pw = password) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reviews", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `오류 (${res.status})`);
      }
      const list = (await res.json()) as Review[];
      setReviews(list);
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    void loadReviews(password);
  }

  async function updateStatus(id: string, status: "approved" | "rejected" | "pending") {
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("상태 변경 실패");
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태를 변경하지 못했습니다");
    }
  }

  const visible = reviews.filter((r) => (filter === "all" ? true : r.status === filter));

  return (
    <div className="min-h-dvh bg-canvas">
      <TopBar center={<span className="text-[14px] font-medium text-ink-2">후기 검수 관리</span>} />

      <main id="main" className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        {!unlocked ? (
          <Card className="mx-auto max-w-md space-y-4">
            <h1 className="text-[22px]">관리자 비밀번호 확인</h1>
            <p className="text-[14px] text-ink-2">
              제출된 면접 후기를 검수하고 매칭 DB에 승인하려면 관리자 비밀번호(`ADMIN_PASSWORD`)를 입력해 주세요.
            </p>
            {error && <Notice tone="error">{error}</Notice>}
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="관리자 비밀번호"
                className="field"
              />
              <Button type="submit" loading={loading} className="w-full">
                검수 목록 열기
              </Button>
            </form>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-[28px]">면접 후기 검수 ({visible.length}건)</h1>
                <p className="text-[14px] text-ink-2">
                  승인(approved)된 후기만 기업·직무 매칭 파이프라인에 반영됩니다.
                </p>
              </div>
              <Segmented
                label="후기 상태 필터"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "pending", label: "검수 대기" },
                  { value: "approved", label: "승인됨" },
                  { value: "rejected", label: "반려됨" },
                  { value: "all", label: "전체" },
                ]}
              />
            </div>

            {error && <Notice tone="error">{error}</Notice>}

            <div className="space-y-4">
              {visible.length === 0 ? (
                <Card>
                  <p className="text-[15px] text-ink-2">해당 상태의 면접 후기가 없습니다.</p>
                </Card>
              ) : (
                visible.map((r) => (
                  <Card key={r.id} className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="text-[13px] font-medium text-accent">
                          {r.companyType} · {r.industry} · {r.stage}
                        </span>
                        <h2 className="text-[19px]">
                          {r.company} — {r.job}
                        </h2>
                        <p className="text-[13px] text-ink-3">
                          면접관 {r.interviewerCount}명 · 압박 {r.pressure}/5 · 수집일 {r.collectedAt} ({r.source})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={r.status === "approved" ? "primary" : "secondary"}
                          onClick={() => updateStatus(r.id, "approved")}
                        >
                          <Check size={15} />
                          승인
                        </Button>
                        <Button
                          type="button"
                          variant={r.status === "rejected" ? "danger" : "secondary"}
                          onClick={() => updateStatus(r.id, "rejected")}
                        >
                          <X size={15} />
                          반려
                        </Button>
                      </div>
                    </div>

                    {r.atmosphere && (
                      <p className="text-[14px] text-ink-2">분위기: {r.atmosphere}</p>
                    )}

                    <ul className="list-disc space-y-1 pl-5 text-[14px] text-ink">
                      {r.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>

                    {r.tips && <p className="text-[13px] text-ink-2">팁: {r.tips}</p>}
                  </Card>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
