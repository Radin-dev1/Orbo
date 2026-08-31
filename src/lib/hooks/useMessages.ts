"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/SessionProvider";
import type { Message, MessageReaction, MessageWithSender, Profile } from "@/lib/types";

const PAGE = 40;

export function useMessages(conversationId: string) {
  const { supabase, user } = useSession();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const profileCache = useRef<Map<string, Profile>>(new Map());

  const hydrateSender = useCallback(
    async (senderId: string | null): Promise<Profile | null> => {
      if (!senderId) return null;
      const cached = profileCache.current.get(senderId);
      if (cached) return cached;
      const { data } = await supabase.from("profiles").select("*").eq("id", senderId).single();
      if (data) profileCache.current.set(senderId, data as Profile);
      return (data as Profile) ?? null;
    },
    [supabase],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*, sender:profiles(*), reactions:message_reactions(*)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(PAGE);

    const rows = ((data ?? []) as MessageWithSender[]).reverse();
    for (const r of rows) if (r.sender) profileCache.current.set(r.sender.id, r.sender);
    setMessages(rows);
    setHasMore((data?.length ?? 0) === PAGE);
    setLoading(false);
  }, [supabase, conversationId]);

  const loadMore = useCallback(async () => {
    if (messages.length === 0) return;
    const oldest = messages[0].created_at;
    const { data } = await supabase
      .from("messages")
      .select("*, sender:profiles(*), reactions:message_reactions(*)")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE);

    const rows = ((data ?? []) as MessageWithSender[]).reverse();
    setMessages((cur) => [...rows, ...cur]);
    setHasMore((data?.length ?? 0) === PAGE);
  }, [supabase, conversationId, messages]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Realtime: messages + reactions for this conversation.
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async ({ new: row }) => {
          const msg = row as Message;
          const sender = await hydrateSender(msg.sender_id);
          setMessages((cur) => {
            if (cur.some((m) => m.id === msg.id)) return cur;
            // Replace an optimistic echo if present.
            const withoutTemp = cur.filter(
              (m) =>
                !(
                  m.id.startsWith("temp-") &&
                  m.sender_id === msg.sender_id &&
                  m.content === msg.content
                ),
            );
            return [...withoutTemp, { ...msg, sender, reactions: [] }];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        ({ new: row }) => {
          const msg = row as Message;
          setMessages((cur) =>
            cur.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        ({ old: row }) => {
          const msg = row as Message;
          setMessages((cur) => cur.filter((m) => m.id !== msg.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        ({ new: row }) => {
          const r = row as MessageReaction;
          setMessages((cur) =>
            cur.map((m) =>
              m.id === r.message_id && !m.reactions.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)
                ? { ...m, reactions: [...m.reactions, r] }
                : m,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        ({ old: row }) => {
          const r = row as MessageReaction;
          setMessages((cur) =>
            cur.map((m) =>
              m.id === r.message_id
                ? {
                    ...m,
                    reactions: m.reactions.filter(
                      (x) => !(x.user_id === r.user_id && x.emoji === r.emoji),
                    ),
                  }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, hydrateSender]);

  const sendMessage = useCallback(
    async (content: string, extra?: Partial<Message>) => {
      const trimmed = content.trim();
      if (!trimmed && !extra?.attachment_url) return;

      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: MessageWithSender = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        type: extra?.type ?? "text",
        content: trimmed || null,
        attachment_url: extra?.attachment_url ?? null,
        attachment_meta: extra?.attachment_meta ?? null,
        reply_to: extra?.reply_to ?? null,
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        sender: user,
        reactions: [],
      };
      setMessages((cur) => [...cur, optimistic]);

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          type: extra?.type ?? "text",
          content: trimmed || null,
          attachment_url: extra?.attachment_url ?? null,
          attachment_meta: extra?.attachment_meta ?? null,
          reply_to: extra?.reply_to ?? null,
        })
        .select()
        .single();

      if (error) {
        setMessages((cur) => cur.filter((m) => m.id !== tempId));
        throw error;
      }
      setMessages((cur) =>
        cur.map((m) => (m.id === tempId ? { ...(data as Message), sender: user, reactions: [] } : m)),
      );
    },
    [supabase, conversationId, user],
  );

  const editMessage = useCallback(
    async (id: string, content: string) => {
      await supabase
        .from("messages")
        .update({ content: content.trim(), edited_at: new Date().toISOString() })
        .eq("id", id);
    },
    [supabase],
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      setMessages((cur) => cur.filter((m) => m.id !== id));
      await supabase.from("messages").delete().eq("id", id);
    },
    [supabase],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const msg = messages.find((m) => m.id === messageId);
      const mine = msg?.reactions.find((r) => r.user_id === user.id && r.emoji === emoji);
      if (mine) {
        await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
      } else {
        await supabase
          .from("message_reactions")
          .insert({ message_id: messageId, user_id: user.id, emoji });
      }
    },
    [supabase, messages, user.id],
  );

  return {
    messages,
    loading,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  };
}
