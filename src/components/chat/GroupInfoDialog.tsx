"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, UserPlus, Search, Check } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import type { Conversation, ConversationMember, Profile } from "@/lib/types";

type MemberWithProfile = ConversationMember & { profile: Profile };

interface Props {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  members: MemberWithProfile[];
  onChanged: () => void;
}

export function GroupInfoDialog({ open, onClose, conversation, members, onChanged }: Props) {
  const { supabase, user, isOnline } = useSession();
  const router = useRouter();
  const isGroup = conversation.type === "group";
  const meMember = members.find((m) => m.user_id === user.id);
  const amAdmin = meMember?.role === "admin";

  const [title, setTitle] = useState(conversation.title ?? "");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(conversation.title ?? "");
  }, [conversation.title]);

  useEffect(() => {
    if (!adding || query.trim().length < 1) return setResults([]);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_profiles", { q: query.trim() });
      const existing = new Set(members.map((m) => m.user_id));
      setResults(((data as Profile[]) ?? []).filter((p) => !existing.has(p.id)));
    }, 250);
    return () => clearTimeout(t);
  }, [adding, query, supabase, members]);

  async function saveTitle() {
    setBusy(true);
    await supabase.from("conversations").update({ title: title.trim() || null }).eq("id", conversation.id);
    setBusy(false);
    onChanged();
  }

  async function addMember(p: Profile) {
    const { error } = await supabase.rpc("add_group_members", {
      p_conversation_id: conversation.id,
      p_member_ids: [p.id],
    });
    if (error) return toast.error(error.message);
    setQuery("");
    setResults([]);
    setAdding(false);
    onChanged();
  }

  async function leave() {
    await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id);
    onClose();
    router.push("/");
  }

  return (
    <Modal open={open} onClose={onClose} title={isGroup ? "Group details" : "Details"}>
      <div className="space-y-4">
        {isGroup && amAdmin && (
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Group name</label>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 flex-1 rounded-xl border border-border bg-bg-elev-2 px-3 text-sm outline-none focus:border-accent"
              />
              <Button size="sm" onClick={saveTitle} loading={busy}>
                Save
              </Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
            {isGroup && amAdmin && (
              <button
                onClick={() => setAdding((v) => !v)}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <UserPlus size={13} /> Add
              </button>
            )}
          </div>

          {adding && (
            <div className="mb-2 rounded-xl border border-border bg-bg-elev-2 p-2">
              <label className="flex items-center gap-2 px-1">
                <Search size={14} className="text-text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Search people"
                  className="h-8 w-full bg-transparent text-sm outline-none"
                />
              </label>
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addMember(p)}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-bg-elev"
                >
                  <Avatar id={p.id} name={p.display_name} src={p.avatar_url} size={28} />
                  <span className="flex-1 truncate text-sm">{p.display_name}</span>
                  <Check size={14} className="text-text-faint" />
                </button>
              ))}
            </div>
          )}

          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                <Avatar
                  id={m.user_id}
                  name={m.profile.display_name}
                  src={m.profile.avatar_url}
                  size={34}
                  online={isOnline(m.user_id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {m.profile.display_name}
                    {m.user_id === user.id && " (you)"}
                  </span>
                  <span className="block truncate text-xs text-text-dim">@{m.profile.username}</span>
                </span>
                {m.role === "admin" && (
                  <span className="rounded-full bg-bg-elev-2 px-2 py-0.5 text-[10px] uppercase text-text-dim">
                    admin
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {isGroup && (
          <Button variant="ghost" className="w-full text-danger hover:bg-danger/10" onClick={leave}>
            <LogOut size={15} /> Leave group
          </Button>
        )}
      </div>
    </Modal>
  );
}
