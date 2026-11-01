import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "plain" | "danger";
type Size = "md" | "lg" | "icon";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,color,transform,opacity,box-shadow] active:scale-[0.97] active:duration-75 disabled:pointer-events-none disabled:opacity-40 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-[0_1px_2px_rgb(0_113_227/24%)] hover:bg-accent-press hover:shadow-[0_6px_16px_rgb(0_113_227/26%)]",
  secondary: "bg-fill text-ink hover:bg-fill-press",
  plain: "text-accent hover:bg-accent-soft",
  danger: "bg-danger-soft text-danger hover:bg-danger-press",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-[52px] px-7 text-[17px]",
  icon: "size-11 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}
