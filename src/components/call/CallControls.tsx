"use client";

import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen: () => void;
  onHangUp: () => void;
  onMinimize: () => void;
}

export function CallControls({
  micOn,
  camOn,
  screenSharing,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onHangUp,
  onMinimize,
}: Props) {
  return (
    <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-[#0b2b28]/90 px-3 py-2.5 backdrop-blur">
      <Ctl active={micOn} onClick={onToggleMic} on={<Mic size={20} />} off={<MicOff size={20} />} label="Mic" />
      <Ctl active={camOn} onClick={onToggleCam} on={<Video size={20} />} off={<VideoOff size={20} />} label="Camera" />
      <button
        onClick={onToggleScreen}
        title="Share screen"
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          screenSharing ? "bg-accent-strong text-white" : "bg-white/12 text-white hover:bg-white/20",
        )}
      >
        <MonitorUp size={20} />
      </button>
      <button
        onClick={onHangUp}
        title="Leave call"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-danger text-white transition-transform hover:scale-105"
      >
        <PhoneOff size={20} />
      </button>
      <button
        onClick={onMinimize}
        title="Minimize"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white/20"
      >
        <Minimize2 size={18} />
      </button>
    </div>
  );
}

function Ctl({
  active,
  onClick,
  on,
  off,
  label,
}: {
  active: boolean;
  onClick: () => void;
  on: React.ReactNode;
  off: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
        active ? "bg-white/12 text-white hover:bg-white/20" : "bg-white text-[#0f1a1e]",
      )}
    >
      {active ? on : off}
    </button>
  );
}
