import { cn } from "@/lib/utils";

export interface MatchCardPlaceholderProps {
  className?: string;
}

export function MatchCardPlaceholder({
  className,
}: MatchCardPlaceholderProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-border bg-card p-4",
        className
      )}
    >
      <div className="h-4 w-3/4 max-w-[240px] animate-pulse rounded-md bg-muted" />
      <div className="h-3 w-1/2 max-w-[160px] animate-pulse rounded-md bg-muted" />
      <div className="h-28 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-[85%] animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
