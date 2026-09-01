"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, PhoneOff, Wifi } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import { useCall } from "@/lib/rtc/CallProvider";
import { ParticipantTile } from "@/components/call/ParticipantTile";
import { CallControls } from "@/components/call/CallControls";
import { formatCallDuration, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export function CallOverlay() {
  const { supabase, user } = useSession();
  const { active, engineState, hangUp } = useCall();
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    startedAt.current = Date.now();
    setMinimized(false);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    (async () => {
      const { data } = await supabase
        .from("conversation_members")
        .select("profile:profiles(*)")
        .eq("conversation_id", active.conversationId);
      const map: Record<string, Profile> = {};
      for (const row of (data ?? []) as unknown as { profile: Profile | null }[]) {
        if (row.profile) map[row.profile.id] = row.profile;
      }
      map[user.id] = user;
      setProfiles(map);
    })();
  }, [active, supabase, user]);

  const peers = engineState?.peers ?? [];
  const total = peers.length + 1;

  const gridCls = useMemo(() => {
    if (total <= 1) return "grid-cols-1";
    if (total === 2) return "grid-cols-1 sm:grid-cols-2";
    if (total <= 4) return "grid-cols-2";
    return "grid-cols-2 sm:grid-cols-3";
  }, [total]);

  if (!active || !engineState) return null;

  const connecting = engineState.status === "connecting" && peers.length === 0;

  if (minimized) {
    return (
      <div className="animate-pop fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-border bg-bg-elev px-4 py-3 shadow-2xl">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
        <span className="text-sm">
          Call · <span className="tabular-nums text-text-dim">{formatCallDuration(elapsed)}</span>
        </span>
        <button
          onClick={() => setMinimized(false)}
          className="rounded-lg p-1.5 text-text-dim hover:bg-bg-elev-2 hover:text-text"
        >
          <Maximize2 size={16} />
        </button>
        <button
          onClick={hangUp}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white"
        >
          <PhoneOff size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#061f1d]">
      <header className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">Orbo call</p>
          <p className="flex items-center gap-1.5 text-xs text-white/55">
            <Wifi size={12} />
            {connecting ? "Connecting…" : `${total} in call`} ·{" "}
            <span className="tabular-nums">{formatCallDuration(elapsed)}</span>
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 px-3 pb-2 md:px-6">
        <div className={cn("grid h-full gap-3", gridCls)}>
          <ParticipantTile
            stream={engineState.localStream}
            name={user.display_name}
            userId={user.id}
            avatarUrl={user.avatar_url}
            muted
            isLocal
            micOn={engineState.micOn}
            camOn={engineState.camOn || engineState.screenSharing}
          />
          {peers.map((p) => (
            <ParticipantTile
              key={p.id}
              stream={p.stream}
              name={profiles[p.id]?.display_name ?? "Guest"}
              userId={p.id}
              avatarUrl={profiles[p.id]?.avatar_url}
              muted={false}
              micOn={p.micOn}
              camOn={p.camOn}
              connecting={p.connectionState !== "connected" && !p.stream}
            />
          ))}
        </div>
      </div>

      {engineState.error && (
        <p className="px-6 pb-1 text-center text-xs text-warning">{engineState.error}</p>
      )}

      <div className="flex justify-center px-4 pb-6 pt-2">
        <CallControls
          micOn={engineState.micOn}
          camOn={engineState.camOn}
          screenSharing={engineState.screenSharing}
          onToggleMic={() => active.engine.toggleMic()}
          onToggleCam={() => active.engine.toggleCamera()}
          onToggleScreen={() => active.engine.toggleScreenShare()}
          onHangUp={hangUp}
          onMinimize={() => setMinimized(true)}
        />
      </div>
    </div>
  );
}
