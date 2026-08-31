"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Search, Users } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/lib/types";

export function NewChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { supabase } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected([]);
      setGroupName("");
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 1) return setResults([]);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_profiles", { q: query.trim() });
      setResults((data as Profile[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, supabase]);

  const isGroup = selected.length > 1;

  function toggle(p: Profile) {
    setSelected((cur) =>
      cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p],
    );
  }

  async function create() {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      if (!isGroup) {
        const { data, error } = await supabase.rpc("get_or_create_dm", {
          other_user: selected[0].id,
        });
        if (error || !data) throw error ?? new Error("failed");
        router.push(`/c/${data as string}`);
      } else {
        const { data, error } = await supabase.rpc("create_group", {
          p_title: groupName.trim() || selected.map((s) => s.display_name.split(" ")[0]).join(", "),
          p_member_ids: selected.map((s) => s.id),
        });
        if (error || !data) throw error ?? new Error("failed");
        router.push(`/c/${data as string}`);
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Could not create chat");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New conversation">
      <div className="space-y-3">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((p) => (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-1 text-xs text-accent"
              >
                <Avatar id={p.id} name={p.display_name} src={p.avatar_url} size={16} />
                {p.display_name}
                <span className="text-accent/70">×</span>
              </button>
            ))}
          </div>
        )}

        {isGroup && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
            className="h-10 w-full rounded-xl border border-border bg-bg-elev-2 px-3 text-sm outline-none focus:border-accent"
          />
        )}

        <label className="flex items-center gap-2 rounded-xl border border-border bg-bg-elev-2 px-3">
          <Search size={15} className="text-text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder="Search by name or @username"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-text-faint"
          />
        </label>

        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {results.map((p) => {
            const on = selected.some((x) => x.id === p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bg-elev-2"
              >
                <Avatar id={p.id} name={p.display_name} src={p.avatar_url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.display_name}</span>
                  <span className="block truncate text-xs text-text-dim">@{p.username}</span>
                </span>
                <span
                  className={
                    on
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent-strong text-white"
                      : "h-5 w-5 rounded-full border border-border"
                  }
                >
                  {on && <Check size={13} />}
                </span>
              </button>
            );
          })}
          {query && results.length === 0 && (
            <p className="py-6 text-center text-sm text-text-dim">No people found.</p>
          )}
        </div>

        <Button onClick={create} loading={busy} disabled={selected.length === 0} className="w-full" size="lg">
          {isGroup ? (
            <>
              <Users size={16} /> Create group ({selected.length})
            </>
          ) : (
            "Start chat"
          )}
        </Button>
      </div>
    </Modal>
  );
}
