"use client";

import { MapPin, MessageCircle, Radar, UserCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Chat", icon: MessageCircle },
  { href: "/radar", label: "Radar (New)", icon: Radar },
  { href: "/trips", label: "My Trips", icon: MapPin },
  { href: "/account", label: "Subscription / Profile", icon: UserCircle },
];

function NavButton({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      className={cn(
        "flex items-center justify-center rounded-xl p-3 transition-colors md:p-3",
        active
          ? "bg-sidebar-accent text-primary"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className={cn("size-6 shrink-0", active && "text-primary")} aria-hidden />
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t bg-sidebar px-1 shadow-[0_-2px_12px_rgba(15,23,42,0.06)]",
          "md:static md:h-auto md:w-[4.5rem] md:shrink-0 md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:px-1 md:py-4 md:shadow-none"
        )}
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.href}
            item={item}
            active={
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href)
            }
          />
        ))}
      </aside>
    </>
  );
}
