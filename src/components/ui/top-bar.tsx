import Link from "next/link";
import type { ReactNode } from "react";
import { ApiStatusButton } from "./api-status";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 whitespace-nowrap rounded-lg font-display text-[19px] font-semibold tracking-tight text-ink">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png?v=3" alt="" aria-hidden width={26} height={26} className="size-[26px] shrink-0 object-contain" />
      Moting
    </Link>
  );
}

/** 반투명 블러 상단 바 */
export function TopBar({ children, center }: { children?: ReactNode; center?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b [view-transition-name:topbar] border-black/[0.06] bg-white/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[auto_1fr] items-center px-4 sm:grid-cols-[1fr_auto_1fr] sm:px-6">
        <Wordmark />
        <div className="hidden justify-self-center sm:block">{center}</div>
        <div className="flex items-center justify-self-end gap-2">
          <div className="hidden sm:block">
            <ApiStatusButton />
          </div>
          {children}
        </div>
      </div>
    </header>
  );
}

export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="hidden whitespace-nowrap rounded-full bg-warn-soft px-3 py-1 text-[13px] font-medium text-warn sm:inline-block"
      title="API 키가 없어 일부 기능이 예시 응답으로 동작합니다"
    >
      데모 모드
    </span>
  );
}
