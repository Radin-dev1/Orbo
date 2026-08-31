"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, SquarePen, Settings, LogOut } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import { useConversations } from "@/lib/hooks/useConversations";
import { Avatar } from "@/components/ui/Avatar";
import { OrboWordmark } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { ConversationRow } from "@/components/sidebar/ConversationRow";
import { NewChatDialog } from "@/components/sidebar/NewChatDialog";
import type { Profile } from "@/lib/types";
import { relativeShort } from "@/lib/utils";

export function Sidebar() {
  const { supabase, user, isOnline } = useSession();
  const { conversations, loading } = useConversations();
  const router = useRouter();
  const params = useParams<{ id?: string }>();

  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.members.some(
          (m) =>
            m.profile.username.toLowerCase().includes(q) ||
            m.profile.display_name.toLowerCase().includes(q),
        ),
    );
  }, [conversations, query]);

  async function onSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 1) return setPeople([]);
    const { data } = await supabase.rpc("search_profiles", { q: value.trim() });
    setPeople((data as Profile[]) ?? []);
  }

  async function startDm(other: Profile) {
    const { data, error } = await supabase.rpc("get_or_create_dm", { other_user: other.id });
    if (error || !data) return toast.error(error?.message ?? "Could not open chat");
    setQuery("");
    setPeople([]);
    router.push(`/c/${data as string}`);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <OrboWordmark />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNew(true)}
            className="rounded-lg p-2 text-text-dim transition-colors hover:bg-bg-elev-2 hover:text-text"
            title="New chat"
          >
            <SquarePen size={18} />
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="block rounded-full">
              <Avatar id={user.id} name={user.display_name} src={user.avatar_url} size={30} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="animate-pop absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-bg-elev-2 py-1 shadow-xl">
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-medium">{user.display_name}</p>
                    <p className="truncate text-xs text-text-dim">@{user.username}</p>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-dim hover:bg-bg-elev hover:text-text"
                  >
                    <Settings size={15} /> Settings
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-bg-elev">
                      <LogOut size={15} /> Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-bg-elev-2 px-3">
          <Search size={15} className="text-text-faint" />
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search people and chats"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-text-faint"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {people.length > 0 && (
          <div className="mb-2">
            <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-faint">
              People
            </p>
            {people.map((p) => (
              <button
                key={p.id}
                onClick={() => startDm(p)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bg-elev-2"
              >
                <Avatar id={p.id} name={p.display_name} src={p.avatar_url} size={38} online={isOnline(p.id)} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.display_name}</span>
                  <span className="block truncate text-xs text-text-dim">@{p.username}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {query && <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-faint">Chats</p>}

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-text-dim">
            {query ? "No matching chats." : "No conversations yet. Search for someone to start."}
          </div>
        ) : (
          filtered.map((s) => (
            <ConversationRow
              key={s.conversation.id}
              summary={s}
              active={params.id === s.conversation.id}
              online={s.peer ? isOnline(s.peer.id) : false}
              subtitle={
                s.last_message
                  ? `${s.last_message.sender_id === user.id ? "You: " : ""}${
                      s.last_message.content ?? "Attachment"
                    }`
                  : "No messages yet"
              }
              time={s.last_message ? relativeShort(s.last_message.created_at) : ""}
            />
          ))
        )}
      </div>

      <NewChatDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
