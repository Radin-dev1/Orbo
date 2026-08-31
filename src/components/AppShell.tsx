"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { CallOverlay } from "@/components/call/CallOverlay";
import { IncomingCallModal } from "@/components/call/IncomingCallModal";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onConversation = pathname.startsWith("/c/");

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg">
      <aside
        className={cn(
          "h-full w-full shrink-0 border-r border-border bg-bg-elev md:w-[var(--sidebar-w)]",
          onConversation ? "hidden md:block" : "block",
        )}
      >
        <Sidebar />
      </aside>

      <main className={cn("h-full min-w-0 flex-1", onConversation ? "block" : "hidden md:block")}>
        {children}
      </main>

      <CallOverlay />
      <IncomingCallModal />
    </div>
  );
}
