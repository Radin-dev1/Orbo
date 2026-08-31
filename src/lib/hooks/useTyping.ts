"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSession } from "@/lib/session/SessionProvider";

const TIMEOUT = 4000;

/**
 * Broadcast-based typing indicator for one conversation. No DB writes.
 */
export function useTyping(conversationId: string) {
  const { supabase, user } = useSession();
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSent = useRef(0);

  useEffect(() => {
    const activeTimers = timers.current;
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const { userId, name } = payload as { userId: string; name: string };
      if (userId === user.id) return;
      setTypingUsers((cur) => ({ ...cur, [userId]: name }));
      const existing = timers.current.get(userId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        userId,
        setTimeout(() => {
          setTypingUsers((cur) => {
            const next = { ...cur };
            delete next[userId];
            return next;
          });
          timers.current.delete(userId);
        }, TIMEOUT),
      );
    });

    channel.on("broadcast", { event: "stop-typing" }, ({ payload }) => {
      const { userId } = payload as { userId: string };
      setTypingUsers((cur) => {
        const next = { ...cur };
        delete next[userId];
        return next;
      });
    });

    channel.subscribe();

    return () => {
      activeTimers.forEach((t) => clearTimeout(t));
      activeTimers.clear();
      setTypingUsers({});
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, conversationId, user.id]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < 1500) return;
    lastSent.current = now;
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id, name: user.display_name },
    });
  }, [user.id, user.display_name]);

  const notifyStopTyping = useCallback(() => {
    lastSent.current = 0;
    void channelRef.current?.send({
      type: "broadcast",
      event: "stop-typing",
      payload: { userId: user.id },
    });
  }, [user.id]);

  return { typingUsers: Object.values(typingUsers), notifyTyping, notifyStopTyping };
}
