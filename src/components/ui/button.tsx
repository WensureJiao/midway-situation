import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3.5 text-sm",
        variant === "primary" &&
          "bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110",
        variant === "secondary" &&
          "bg-[var(--panel-2)] text-[var(--ink)] ring-1 ring-[var(--line)] hover:bg-[var(--panel-3)]",
        variant === "ghost" &&
          "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--ink)]",
        className,
      )}
      {...props}
    />
  );
}
