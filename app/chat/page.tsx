import type { Metadata } from "next";

import { PlanningChat } from "@/components/chat/PlanningChat";

export const metadata: Metadata = {
  title: "FanBuddy.AI | Planning Chat",
  description:
    "Plan your football trip with FanBuddy.AI — flights, stays, and match day in one conversation.",
};

export default function ChatPage() {
  return <PlanningChat />;
}
