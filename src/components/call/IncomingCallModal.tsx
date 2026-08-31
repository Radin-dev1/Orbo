"use client";

import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useCall } from "@/lib/rtc/CallProvider";
import { Avatar } from "@/components/ui/Avatar";

/** A short WebAudio ring tone — no asset file needed. */
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    let stop = false;

    const beep = () => {
      if (stop) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 520;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.65);
    };
    beep();
    const iv = setInterval(beep, 2500);
    return () => {
      stop = true;
      clearInterval(iv);
      ctx.close().catch(() => {});
    };
  }, [active]);
}

export function IncomingCallModal() {
  const { incoming, acceptIncoming, declineIncoming } = useCall();
  useRingtone(!!incoming);

  if (!incoming) return null;
  const isVideo = incoming.call.kind === "video";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="animate-pop w-full max-w-xs rounded-3xl border border-border bg-bg-elev p-6 text-center">
        <div className="mb-4 flex justify-center">
          <div className="ringing rounded-full">
            <Avatar
              id={incoming.from?.id ?? incoming.call.id}
              name={incoming.from?.display_name ?? incoming.conversationTitle}
              src={incoming.from?.avatar_url}
              size={88}
            />
          </div>
        </div>
        <p className="text-lg font-semibold">{incoming.conversationTitle}</p>
        <p className="mt-1 text-sm text-text-dim">
          Incoming {isVideo ? "video" : "voice"} call…
        </p>

        <div className="mt-6 flex items-center justify-center gap-8">
          <button
            onClick={declineIncoming}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white transition-transform hover:scale-105"
          >
            <PhoneOff size={22} />
          </button>
          <button
            onClick={acceptIncoming}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-white transition-transform hover:scale-105"
          >
            {isVideo ? <Video size={22} /> : <Phone size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
}
