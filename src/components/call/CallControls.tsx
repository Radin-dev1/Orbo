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
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-bg-elev/90 px-3 py-2.5 backdrop-blur">
      <Ctl active={micOn} onClick={onToggleMic} on={<Mic size={20} />} off={<MicOff size={20} />} label="Mic" />
      <Ctl active={camOn} onClick={onToggleCam} on={<Video size={20} />} off={<VideoOff size={20} />} label="Camera" />
      <button
        onClick={onToggleScreen}
        title="Share screen"
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
          screenSharing ? "bg-accent-strong text-white" : "bg-bg-elev-2 text-text hover:bg-[#26263a]",
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
        className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-elev-2 text-text hover:bg-[#26263a]"
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
        active ? "bg-bg-elev-2 text-text hover:bg-[#26263a]" : "bg-white text-bg",
      )}
    >
      {active ? on : off}
    </button>
  );
}
