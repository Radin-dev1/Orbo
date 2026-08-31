"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/types";

interface Props {
  summary: ConversationSummary;
  active: boolean;
  online: boolean;
  subtitle: string;
  time: string;
}

export function ConversationRow({ summary, active, online, subtitle, time }: Props) {
  const isGroup = summary.conversation.type === "group";
  return (
    <Link
      href={`/c/${summary.conversation.id}`}
      className={cn(
        "flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors",
        active ? "bg-accent-soft" : "hover:bg-bg-elev-2",
      )}
    >
      <div className="relative">
        {isGroup && !summary.avatar_url ? (
          <span
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-bg-elev-2 text-text-dim"
          >
            <Users size={18} />
          </span>
        ) : (
          <Avatar
            id={summary.peer?.id ?? summary.conversation.id}
            name={summary.title}
            src={summary.avatar_url}
            size={42}
            online={isGroup ? undefined : online}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-medium">{summary.title}</span>
          <span className="shrink-0 text-xs text-text-faint">{time}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-[13px]",
              summary.unread_count > 0 ? "font-medium text-text" : "text-text-dim",
            )}
          >
            {subtitle}
          </span>
          {summary.unread_count > 0 && (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-strong px-1 text-[11px] font-semibold text-white">
              {summary.unread_count > 99 ? "99+" : summary.unread_count}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
