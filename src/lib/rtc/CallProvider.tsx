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
import { useSession } from "@/lib/session/SessionProvider";
import { CallEngine, type CallEngineState } from "@/lib/rtc/CallEngine";
import type { Call, CallKind, Profile } from "@/lib/types";

interface ActiveCall {
  callId: string;
  conversationId: string;
  kind: CallKind;
  engine: CallEngine;
}

interface IncomingCall {
  call: Call;
  from: Profile | null;
  conversationTitle: string;
}

interface CallValue {
  active: ActiveCall | null;
  engineState: CallEngineState | null;
  incoming: IncomingCall | null;
  /** Start a brand-new call in a conversation and join it. */
  startCall: (conversationId: string, kind: CallKind) => Promise<void>;
  /** Join an already-ringing / active call. */
  joinCall: (callId: string, conversationId: string, kind: CallKind) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => Promise<void>;
  hangUp: () => Promise<void>;
}

const Ctx = createContext<CallValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { supabase, user } = useSession();
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [engineState, setEngineState] = useState<CallEngineState | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // ── listen for calls in conversations we belong to ───────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("calls:inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls" },
        async ({ new: row }) => {
          const call = row as Call;
          if (call.started_by === user.id) return;
          if (activeRef.current) return;
          if (call.status !== "ringing" && call.status !== "active") return;

          const [{ data: from }, { data: conv }] = await Promise.all([
            call.started_by
              ? supabase.from("profiles").select("*").eq("id", call.started_by).single()
              : Promise.resolve({ data: null }),
            supabase.from("conversations").select("*").eq("id", call.conversation_id).single(),
          ]);

          setIncoming({
            call,
            from: (from as Profile) ?? null,
            conversationTitle:
              (conv?.title as string) ||
              (from as Profile)?.display_name ||
              "Incoming call",
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls" },
        ({ new: row }) => {
          const call = row as Call;
          setIncoming((cur) => (cur && cur.call.id === call.id && call.status === "ended" ? null : cur));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, user.id]);

  const teardown = useCallback(() => {
    setActive(null);
    setEngineState(null);
    activeRef.current = null;
  }, []);

  const beginEngine = useCallback(
    async (callId: string, conversationId: string, kind: CallKind) => {
      const engine = new CallEngine({
        supabase,
        callId,
        selfId: user.id,
        withVideo: kind === "video",
      });
      const next: ActiveCall = { callId, conversationId, kind, engine };
      activeRef.current = next;
      setActive(next);
      engine.subscribe((s) => {
        setEngineState(s);
        if (s.status === "ended") teardown();
      });

      await supabase.from("call_participants").upsert(
        { call_id: callId, user_id: user.id, joined_at: new Date().toISOString(), left_at: null },
        { onConflict: "call_id,user_id" },
      );
      await supabase
        .from("calls")
        .update({ status: "active" })
        .eq("id", callId)
        .eq("status", "ringing");

      await engine.join();
    },
    [supabase, user.id, teardown],
  );

  const startCall = useCallback(
    async (conversationId: string, kind: CallKind) => {
      if (activeRef.current) return;
      const { data, error } = await supabase
        .from("calls")
        .insert({
          conversation_id: conversationId,
          started_by: user.id,
          kind,
          status: "ringing",
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error("Could not start call");

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        type: "call_event",
        content: kind === "video" ? "📹 Started a video call" : "📞 Started a call",
        attachment_meta: { call_id: (data as Call).id, kind },
      });

      await beginEngine((data as Call).id, conversationId, kind);
    },
    [supabase, user.id, beginEngine],
  );

  const joinCall = useCallback(
    async (callId: string, conversationId: string, kind: CallKind) => {
      if (activeRef.current) return;
      setIncoming(null);
      await beginEngine(callId, conversationId, kind);
    },
    [beginEngine],
  );

  const acceptIncoming = useCallback(async () => {
    if (!incoming) return;
    await joinCall(incoming.call.id, incoming.call.conversation_id, incoming.call.kind);
  }, [incoming, joinCall]);

  const declineIncoming = useCallback(async () => {
    if (!incoming) return;
    const c = incoming.call;
    setIncoming(null);
    // Only mark the whole call declined for 1:1; groups keep ringing for others.
    const { data: conv } = await supabase
      .from("conversations")
      .select("type")
      .eq("id", c.conversation_id)
      .single();
    if (conv?.type === "dm") {
      await supabase
        .from("calls")
        .update({ status: "declined", ended_at: new Date().toISOString() })
        .eq("id", c.id)
        .eq("status", "ringing");
    }
  }, [incoming, supabase]);

  const hangUp = useCallback(async () => {
    const cur = activeRef.current;
    if (!cur) return;
    await cur.engine.leave();
    await supabase
      .from("call_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("call_id", cur.callId)
      .eq("user_id", user.id);

    const { count } = await supabase
      .from("call_participants")
      .select("*", { count: "exact", head: true })
      .eq("call_id", cur.callId)
      .is("left_at", null);

    if (!count || count === 0) {
      await supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", cur.callId)
        .neq("status", "ended");
    }
    teardown();
  }, [supabase, user.id, teardown]);

  const value = useMemo<CallValue>(
    () => ({
      active,
      engineState,
      incoming,
      startCall,
      joinCall,
      acceptIncoming,
      declineIncoming,
      hangUp,
    }),
    [active, engineState, incoming, startCall, joinCall, acceptIncoming, declineIncoming, hangUp],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCall(): CallValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCall must be used within <CallProvider>");
  return v;
}
