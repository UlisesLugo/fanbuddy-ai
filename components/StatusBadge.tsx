import { cn } from "@/lib/utils";

export type MatchConfirmationStatus = "provisional" | "confirmed";

export interface StatusBadgeProps {
  status: MatchConfirmationStatus;
  className?: string;
}

const STATUS_STYLES: Record<
  MatchConfirmationStatus,
  { label: string; dotClass: string }
> = {
  provisional: {
    label: "Provisional",
    dotClass: "bg-amber-400 ring-amber-500/60",
  },
  confirmed: {
    label: "Confirmed",
    dotClass: "bg-primary ring-primary/50",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, dotClass } = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground",
        className
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-background",
          dotClass
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
