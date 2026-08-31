"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { Spinner } from "@/components/ui/Spinner";
import { useSession } from "@/lib/session/SessionProvider";
import { formatDayLabel } from "@/lib/utils";
import type { ConversationMember, MessageWithSender, Profile } from "@/lib/types";

interface Props {
  messages: MessageWithSender[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  members: (ConversationMember & { profile: Profile })[];
  isGroup: boolean;
  typingUsers: string[];
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function MessageList({
  messages,
  loading,
  hasMore,
  onLoadMore,
  isGroup,
  typingUsers,
  onEdit,
  onDelete,
  onReact,
}: Props) {
  const { user } = useSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const prevHeight = useRef(0);
  const prevLen = useRef(0);

  // Keep pinned to bottom for new messages when already near the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevLen.current;
    const prependedOlder =
      grew && messages.length - prevLen.current > 1 && el.scrollTop < 200;

    if (prependedOlder) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
    } else if (atBottom) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    prevHeight.current = el.scrollHeight;
    prevLen.current = messages.length;
  }, [messages, atBottom]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(dist < 120);
    if (el.scrollTop < 80 && hasMore) onLoadMore();
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
      {hasMore && (
        <div className="flex justify-center pb-3">
          <button onClick={onLoadMore} className="rounded-full bg-bg-elev-2 px-3 py-1 text-xs text-text-dim hover:text-text">
            Load earlier messages
          </button>
        </div>
      )}

      {messages.length === 0 && (
        <p className="py-16 text-center text-sm text-text-dim">
          No messages yet. Say hello 👋
        </p>
      )}

      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const day = formatDayLabel(m.created_at);
        const showDay = !prev || formatDayLabel(prev.created_at) !== day;

        const mine = m.sender_id === user.id;
        const grouped =
          !showDay &&
          prev &&
          prev.sender_id === m.sender_id &&
          new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS &&
          m.type !== "call_event" &&
          prev.type !== "call_event";

        return (
          <div key={m.id}>
            {showDay && (
              <div className="my-4 flex items-center justify-center">
                <span className="rounded-full bg-bg-elev-2 px-3 py-1 text-[11px] font-medium text-text-dim">
                  {day}
                </span>
              </div>
            )}
            <MessageBubble
              message={m}
              mine={mine}
              grouped={!!grouped}
              showSender={isGroup && !mine && !grouped}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
            />
          </div>
        );
      })}

      {typingUsers.length > 0 && <TypingIndicator names={typingUsers} />}
      <div ref={bottomRef} />
    </div>
  );
}
