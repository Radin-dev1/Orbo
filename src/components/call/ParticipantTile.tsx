"use client";

import { useEffect, useRef } from "react";
import { MicOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

interface Props {
  stream: MediaStream | null;
  name: string;
  userId: string;
  avatarUrl?: string | null;
  muted: boolean;
  isLocal?: boolean;
  micOn: boolean;
  camOn: boolean;
  connecting?: boolean;
}

export function ParticipantTile({
  stream,
  name,
  userId,
  avatarUrl,
  muted,
  isLocal,
  micOn,
  camOn,
  connecting,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === "live") && camOn;

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30",
        connecting && "animate-pulse",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn("h-full w-full object-cover", hasVideo ? "block" : "hidden", isLocal && "-scale-x-100")}
      />
      {!hasVideo && (
        <div className="flex flex-col items-center gap-3">
          <Avatar id={userId} name={name} src={avatarUrl} size={84} />
          {connecting && <span className="text-xs text-white/60">connecting…</span>}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
        <span className="truncate text-sm font-medium text-white">
          {name}
          {isLocal && " (you)"}
        </span>
        {!micOn && (
          <span className="rounded-full bg-black/50 p-1 text-white">
            <MicOff size={13} />
          </span>
        )}
      </div>
    </div>
  );
}
