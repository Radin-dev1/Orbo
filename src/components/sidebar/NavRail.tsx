"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, SquarePen, Settings, LogOut } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import { Avatar } from "@/components/ui/Avatar";
import { OrboMark } from "@/components/ui/Logo";
import { NewChatDialog } from "@/components/sidebar/NewChatDialog";
import { cn } from "@/lib/utils";

/**
 * Discord-style slim rail: app-level navigation on the far left.
 * Hidden on mobile, where the conversation list already fills the screen.
 */
export function NavRail() {
  const { user } = useSession();
  const pathname = usePathname();
  const [showNew, setShowNew] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const onChats = pathname === "/" || pathname.startsWith("/c/");
  const onSettings = pathname.startsWith("/settings");

  return (
    <nav className="hidden h-full shrink-0 flex-col items-center gap-1 bg-rail-bg py-3 md:flex md:w-[var(--rail-w)]">
      <Link
        href="/"
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 transition-transform hover:scale-105"
        title="Orbo"
      >
        <OrboMark size={24} />
      </Link>

      <span className="my-1 h-px w-8 bg-white/10" />

      <RailButton as={Link} href="/" active={onChats} label="Chats">
        <MessagesSquare size={21} />
      </RailButton>

      <RailButton onClick={() => setShowNew(true)} label="New chat">
        <SquarePen size={20} />
      </RailButton>

      <RailButton as={Link} href="/settings" active={onSettings} label="Settings">
        <Settings size={20} />
      </RailButton>

      <div className="relative mt-auto">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="block rounded-full ring-2 ring-white/15 transition hover:ring-white/40"
          title={user.display_name}
        >
          <Avatar id={user.id} name={user.display_name} src={user.avatar_url} size={38} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="animate-pop absolute bottom-0 left-12 z-20 w-52 overflow-hidden rounded-xl border border-border bg-bg-elev py-1 shadow-xl">
              <div className="border-b border-border px-3 py-2">
                <p className="truncate text-sm font-medium">{user.display_name}</p>
                <p className="truncate text-xs text-text-dim">@{user.username}</p>
              </div>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-dim hover:bg-bg-elev-2 hover:text-text"
              >
                <Settings size={15} /> Settings
              </Link>
              <form action="/auth/signout" method="post">
                <button className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-bg-elev-2">
                  <LogOut size={15} /> Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      <NewChatDialog open={showNew} onClose={() => setShowNew(false)} />
    </nav>
  );
}

type RailButtonProps = {
  children: React.ReactNode;
  label: string;
  active?: boolean;
} & (
  | { as: typeof Link; href: string; onClick?: never }
  | { as?: undefined; href?: never; onClick: () => void }
);

function RailButton({ children, label, active, as, href, onClick }: RailButtonProps) {
  const cls = cn(
    "group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
    active
      ? "bg-[var(--rail-active)] text-white"
      : "text-rail-fg hover:bg-white/10 hover:text-white",
  );
  const indicator = (
    <span
      className={cn(
        "absolute -left-3 w-1 rounded-r-full bg-white transition-all",
        active ? "h-6" : "h-0 group-hover:h-3",
      )}
    />
  );

  if (as === Link && href) {
    return (
      <Link href={href} title={label} className={cls}>
        {indicator}
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} title={label} className={cls}>
      {indicator}
      {children}
    </button>
  );
}
