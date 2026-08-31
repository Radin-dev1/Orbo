"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

interface SessionValue {
  supabase: SupabaseClient;
  user: Profile;
  /** Set of user ids currently online (from the global presence channel). */
  onlineIds: Set<string>;
  isOnline: (id: string) => boolean;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: Profile;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<Profile>(initialUser);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set([initialUser.id]));
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", initialUser.id).single();
    if (data) setUser(data as Profile);
  }, [supabase, initialUser.id]);

  // Global presence — who's online right now.
  useEffect(() => {
    const channel = supabase.channel("presence:online", {
      config: { presence: { key: initialUser.id } },
    });
    channelRef.current = channel;

    const sync = () => {
      const state = channel.presenceState() as Record<string, { userId: string }[]>;
      const ids = new Set<string>();
      for (const entries of Object.values(state)) {
        for (const e of entries) ids.add(e.userId);
      }
      setOnlineIds(ids);
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.on("presence", { event: "join" }, sync);
    channel.on("presence", { event: "leave" }, sync);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ userId: initialUser.id, at: Date.now() });
      }
    });

    // Keep last_seen_at fresh while the tab is open.
    const heartbeat = setInterval(() => {
      void supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", initialUser.id);
    }, 60_000);

    return () => {
      clearInterval(heartbeat);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, initialUser.id]);

  const value = useMemo<SessionValue>(
    () => ({
      supabase,
      user,
      onlineIds,
      isOnline: (id: string) => onlineIds.has(id),
      refreshUser,
    }),
    [supabase, user, onlineIds, refreshUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used within <SessionProvider>");
  return v;
}
