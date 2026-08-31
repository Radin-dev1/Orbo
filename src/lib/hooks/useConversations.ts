"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/SessionProvider";
import type {
  Conversation,
  ConversationMember,
  ConversationSummary,
  Message,
  Profile,
} from "@/lib/types";

const RECENT_LIMIT = 400;

export function useConversations() {
  const { supabase, user } = useSession();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const lastReadRef = useRef<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const { data: myMemberships } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at, muted, role")
      .eq("user_id", user.id);

    const convIds = (myMemberships ?? []).map((m) => m.conversation_id);
    lastReadRef.current = new Map(
      (myMemberships ?? []).map((m) => [m.conversation_id, m.last_read_at as string]),
    );

    if (convIds.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const [{ data: convs }, { data: allMembers }, { data: recent }] = await Promise.all([
      supabase.from("conversations").select("*").in("id", convIds),
      supabase
        .from("conversation_members")
        .select("*, profile:profiles(*)")
        .in("conversation_id", convIds),
      supabase
        .from("messages")
        .select("*")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT),
    ]);

    const membersByConv = new Map<string, (ConversationMember & { profile: Profile })[]>();
    for (const m of (allMembers ?? []) as (ConversationMember & { profile: Profile })[]) {
      const list = membersByConv.get(m.conversation_id) ?? [];
      list.push(m);
      membersByConv.set(m.conversation_id, list);
    }

    const lastByConv = new Map<string, Message>();
    const unreadByConv = new Map<string, number>();
    for (const msg of (recent ?? []) as Message[]) {
      if (!lastByConv.has(msg.conversation_id)) lastByConv.set(msg.conversation_id, msg);
      const lr = lastReadRef.current.get(msg.conversation_id);
      if (lr && msg.created_at > lr && msg.sender_id !== user.id) {
        unreadByConv.set(msg.conversation_id, (unreadByConv.get(msg.conversation_id) ?? 0) + 1);
      }
    }

    const summaries: ConversationSummary[] = ((convs ?? []) as Conversation[]).map((c) => {
      const members = membersByConv.get(c.id) ?? [];
      const peer =
        c.type === "dm" ? members.find((m) => m.user_id !== user.id)?.profile ?? null : null;
      return {
        conversation: c,
        members,
        last_message: lastByConv.get(c.id) ?? null,
        unread_count: unreadByConv.get(c.id) ?? 0,
        peer,
        title: c.type === "dm" ? peer?.display_name ?? "Direct message" : c.title || "Group chat",
        avatar_url: c.type === "dm" ? peer?.avatar_url ?? null : c.avatar_url,
      };
    });

    summaries.sort(
      (a, b) =>
        new Date(b.last_message?.created_at ?? b.conversation.last_message_at).getTime() -
        new Date(a.last_message?.created_at ?? a.conversation.last_message_at).getTime(),
    );

    setConversations(summaries);
    setLoading(false);
  }, [supabase, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: react to new messages / membership changes across all conversations.
  useEffect(() => {
    const channel = supabase
      .channel("conversations:list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        ({ new: row }) => {
          const msg = row as Message;
          setConversations((cur) => {
            const idx = cur.findIndex((s) => s.conversation.id === msg.conversation_id);
            if (idx === -1) {
              void load();
              return cur;
            }
            const copy = [...cur];
            const s = { ...copy[idx] };
            s.last_message = msg;
            const lr = lastReadRef.current.get(msg.conversation_id);
            if (msg.sender_id !== user.id && (!lr || msg.created_at > lr)) {
              s.unread_count += 1;
            }
            copy[idx] = s;
            copy.sort(
              (a, b) =>
                new Date(b.last_message?.created_at ?? 0).getTime() -
                new Date(a.last_message?.created_at ?? 0).getTime(),
            );
            return copy;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user.id, load]);

  const markReadLocally = useCallback((conversationId: string) => {
    lastReadRef.current.set(conversationId, new Date().toISOString());
    setConversations((cur) =>
      cur.map((s) =>
        s.conversation.id === conversationId ? { ...s, unread_count: 0 } : s,
      ),
    );
  }, []);

  return { conversations, loading, refetch: load, markReadLocally };
}
