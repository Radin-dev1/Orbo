"use client";

import { useState } from "react";
import { Pencil, Trash2, SmilePlus, Check, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useSession } from "@/lib/session/SessionProvider";
import { cn, formatTime } from "@/lib/utils";
import type { MessageWithSender } from "@/lib/types";

const QUICK = ["👍", "❤️", "😂", "🔥", "🙏", "😮"];

interface Props {
  message: MessageWithSender;
  mine: boolean;
  grouped: boolean;
  showSender: boolean;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
}

export function MessageBubble({ message, mine, grouped, showSender, onEdit, onDelete, onReact }: Props) {
  const { user } = useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  if (message.type === "call_event") {
    return (
      <div className="my-2 flex items-center justify-center">
        <span className="rounded-full bg-bg-elev-2 px-3 py-1 text-xs text-text-dim">
          {message.content}
        </span>
      </div>
    );
  }

  const isImage = message.type === "image" && message.attachment_url;
  const isFile = message.type === "file" && message.attachment_url;

  const reactionGroups = message.reactions.reduce<Record<string, string[]>>((acc, r) => {
    (acc[r.emoji] ??= []).push(r.user_id);
    return acc;
  }, {});

  return (
    <div
      className={cn(
        "group flex gap-2.5",
        grouped ? "mt-0.5" : "mt-3",
        mine ? "flex-row-reverse" : "flex-row",
      )}
    >
      {!mine ? (
        <div className="w-8 shrink-0">
          {!grouped && (
            <Avatar
              id={message.sender?.id ?? "?"}
              name={message.sender?.display_name ?? "?"}
              src={message.sender?.avatar_url}
              size={32}
            />
          )}
        </div>
      ) : null}

      <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
        {showSender && (
          <span className="mb-0.5 pl-1 text-xs font-medium text-text-dim">
            {message.sender?.display_name}
          </span>
        )}

        <div className={cn("flex items-center gap-1.5", mine ? "flex-row-reverse" : "flex-row")}>
          <div
            className={cn(
              "relative rounded-2xl px-3.5 py-2 text-[14.5px] leading-relaxed",
              mine ? "bg-[var(--bubble-me)] text-white" : "bg-[var(--bubble-them)] text-text",
              grouped && (mine ? "rounded-tr-md" : "rounded-tl-md"),
            )}
          >
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onEdit(message.id, draft);
                      setEditing(false);
                    }
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-52 bg-transparent text-sm outline-none"
                />
                <button onClick={() => { onEdit(message.id, draft); setEditing(false); }}>
                  <Check size={14} />
                </button>
                <button onClick={() => setEditing(false)}>
                  <X size={14} />
                </button>
              </div>
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.attachment_url!}
                alt="attachment"
                className="max-h-72 rounded-lg"
              />
            ) : isFile ? (
              <a
                href={message.attachment_url!}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {(message.attachment_meta?.name as string) ?? "Download file"}
              </a>
            ) : (
              <span className="whitespace-pre-wrap break-words">{message.content}</span>
            )}
            <span
              className={cn(
                "ml-2 inline-block align-bottom text-[10px]",
                mine ? "text-white/70" : "text-text-faint",
              )}
            >
              {message.edited_at ? "edited · " : ""}
              {formatTime(message.created_at)}
            </span>
          </div>

          <div className="relative flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded-md p-1 text-text-faint hover:text-text"
            >
              <SmilePlus size={14} />
            </button>
            {mine && message.type === "text" && (
              <button
                onClick={() => { setEditing(true); setDraft(message.content ?? ""); }}
                className="rounded-md p-1 text-text-faint hover:text-text"
              >
                <Pencil size={13} />
              </button>
            )}
            {mine && (
              <button
                onClick={() => onDelete(message.id)}
                className="rounded-md p-1 text-text-faint hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            )}
            {pickerOpen && (
              <div
                className={cn(
                  "animate-pop absolute bottom-7 z-10 flex gap-1 rounded-full border border-border bg-bg-elev-2 px-2 py-1.5 shadow-xl",
                  mine ? "right-0" : "left-0",
                )}
              >
                {QUICK.map((e) => (
                  <button
                    key={e}
                    onClick={() => { onReact(message.id, e); setPickerOpen(false); }}
                    className="text-base transition-transform hover:scale-125"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {Object.keys(reactionGroups).length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
            {Object.entries(reactionGroups).map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs",
                  users.includes(user.id)
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-bg-elev-2 text-text-dim",
                )}
              >
                <span>{emoji}</span>
                <span>{users.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
