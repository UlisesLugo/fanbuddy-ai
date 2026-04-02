"use client";

import { motion } from "framer-motion";
import { Radar } from "lucide-react";

import { MatchCardPlaceholder } from "@/components/MatchCardPlaceholder";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

interface RadarIdleAnimationProps {
  className?: string;
}

function RadarIdleAnimation({ className }: RadarIdleAnimationProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center py-8",
        className
      )}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border border-primary/25"
          style={{ width: 52 + i * 36, height: 52 + i * 36 }}
          initial={{ opacity: 0.35 }}
          animate={{
            opacity: [0.15, 0.45, 0.15],
            scale: [0.94, 1.02, 0.94],
          }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.4,
          }}
        />
      ))}
      <Radar className="relative size-9 text-primary" strokeWidth={1.5} />
    </div>
  );
}

export interface ItineraryPreviewPanelProps {
  className?: string;
}

export function ItineraryPreviewPanel({
  className,
}: ItineraryPreviewPanelProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[320px] flex-col gap-6 lg:min-h-0",
        className
      )}
    >
      <div className="space-y-1 px-6 pt-6 lg:pt-8">
        <h2 className="text-sm font-semibold text-foreground">Itinerary</h2>
        <p className="text-sm text-muted-foreground">
          Waiting for your match selection…
        </p>
      </div>
      <div className="mx-6 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-4 py-8">
        <RadarIdleAnimation className="w-full" />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Flights, stays, and kickoff times will show up here.
        </p>
      </div>
      <div className="space-y-3 px-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Status
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="provisional" />
            <StatusBadge status="confirmed" />
          </div>
        </div>
        <MatchCardPlaceholder />
      </div>
    </div>
  );
}
