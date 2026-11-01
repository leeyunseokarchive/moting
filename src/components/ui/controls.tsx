"use client";

import { useId, type ReactNode } from "react";

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-grid auto-cols-fr grid-flow-col rounded-[11px] bg-fill p-[3px]">
      {index >= 0 && (
        <span
          aria-hidden
          className="absolute inset-y-[3px] left-[3px] rounded-[9px] bg-white shadow-[0_1px_3px_rgb(0_0_0/12%)] transition-transform duration-300 ease-[var(--ease-spring)]"
          style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative min-h-9 min-w-12 cursor-pointer whitespace-nowrap rounded-[9px] px-3 text-[14px] font-medium transition-colors ${
              active ? "text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 압박 강도 같은 1~5 단계 선택 */
export function LevelPicker({
  value,
  onChange,
  label,
  low,
  high,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  low: string;
  high: string;
}) {
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${label} ${n}단계`}
            onClick={() => onChange(n)}
            className={`h-9 flex-1 cursor-pointer rounded-[9px] text-[14px] font-medium transition-[background-color,color,transform] active:scale-95 ${
              n <= value ? "bg-ink text-white" : "bg-fill text-ink-2 hover:bg-fill-press"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-ink-3">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 py-1">
      <span className="text-[15px]">{label}</span>
      <span className="relative inline-flex">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-[31px] w-[51px] rounded-full bg-fill transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-accent/50" />
        <span className="absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/15%),0_1px_1px_rgb(0_0_0/16%)] transition-transform duration-300 ease-[var(--ease-overshoot)] peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[var(--radius-lg)] bg-white p-6 shadow-[var(--shadow-card)] sm:p-7 ${className}`}>{children}</section>;
}

/** 라벨이 붙은 입력 칸. 버튼 묶음을 감쌀 때는 라벨 클릭이 첫 버튼을 누르지 않도록 as="div"로 쓴다 */
export function Field({ label, as: Tag = "label", children }: { label: ReactNode; as?: "label" | "div"; children: ReactNode }) {
  return (
    <Tag className="block space-y-1.5">
      <span className="block text-[14px] font-medium text-ink-2">{label}</span>
      {children}
    </Tag>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div>
      {eyebrow && <p className="mb-1 text-[14px] font-medium text-accent">{eyebrow}</p>}
      <h1 className="text-[28px] sm:text-[34px]">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-[16px] text-ink-2">{children}</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[var(--radius-md)] px-4 py-3 text-[15px] ${
        tone === "error" ? "bg-danger-soft text-danger" : "bg-canvas text-ink-2"
      }`}
    >
      {children}
    </div>
  );
}
