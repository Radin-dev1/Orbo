"use client";

import { ArrowLeft, Phone, Video, Users, Info } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";

interface Props {
  title: string;
  subtitle: string;
  avatarId: string;
  avatarUrl?: string | null;
  isGroup: boolean;
  online: boolean;
  inCall: boolean;
  onBack: () => void;
  onInfo: () => void;
  onAudioCall: () => void;
  onVideoCall: () => void;
}

export function ChatHeader({
  title,
  subtitle,
  avatarId,
  avatarUrl,
  isGroup,
  online,
  inCall,
  onBack,
  onInfo,
  onAudioCall,
  onVideoCall,
}: Props) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3 md:px-4">
      <button onClick={onBack} className="rounded-lg p-1.5 text-text-dim hover:bg-bg-elev-2 md:hidden">
        <ArrowLeft size={20} />
      </button>

      <button onClick={onInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {isGroup && !avatarUrl ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elev-2 text-text-dim">
            <Users size={18} />
          </span>
        ) : (
          <Avatar id={avatarId} name={title} src={avatarUrl} size={40} online={isGroup ? undefined : online} />
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-xs text-text-dim">
            {inCall ? "In call now" : subtitle}
          </span>
        </span>
      </button>

      <div className="flex items-center gap-1">
        <button
          onClick={onAudioCall}
          className="rounded-xl p-2.5 text-text-dim transition-colors hover:bg-bg-elev-2 hover:text-text"
          title="Audio call"
        >
          <Phone size={19} />
        </button>
        <button
          onClick={onVideoCall}
          className="rounded-xl p-2.5 text-text-dim transition-colors hover:bg-bg-elev-2 hover:text-text"
          title="Video call"
        >
          <Video size={19} />
        </button>
        <button
          onClick={onInfo}
          className="hidden rounded-xl p-2.5 text-text-dim transition-colors hover:bg-bg-elev-2 hover:text-text sm:block"
          title="Details"
        >
          <Info size={19} />
        </button>
      </div>
    </header>
  );
}
