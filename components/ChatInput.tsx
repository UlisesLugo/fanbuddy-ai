"use client";

import { SendHorizontal } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ChatInputProps {
  placeholder?: string;
  className?: string;
  onSend?: (value: string) => void;
}

export function ChatInput({
  placeholder = "Where to?",
  className,
  onSend,
}: ChatInputProps) {
  const [value, setValue] = useState("");

  const submit = useCallback(() => {
    const v = value.trim();
    if (!v) return;
    onSend?.(v);
  }, [value, onSend]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-input bg-card p-1.5 shadow-sm",
        className
      )}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        aria-label="Trip request"
      />
      <Button
        type="button"
        size="icon"
        className="h-11 w-11 shrink-0 rounded-lg"
        onClick={submit}
        aria-label="Send message"
      >
        <SendHorizontal className="size-5" />
      </Button>
    </div>
  );
}
