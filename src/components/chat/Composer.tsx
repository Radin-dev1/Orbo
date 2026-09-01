"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, SendHorizontal, Loader2 } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import type { Message } from "@/lib/types";

interface Props {
  conversationId: string;
  onSend: (content: string, extra?: Partial<Message>) => Promise<void>;
  onTyping: () => void;
  onStopTyping: () => void;
}

const YEAR = 60 * 60 * 24 * 365;

export function Composer({ conversationId, onSend, onTyping, onStopTyping }: Props) {
  const { supabase, user } = useSession();
  const [value, setValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  async function submit() {
    const text = value.trim();
    if (!text) return;
    setValue("");
    onStopTyping();
    requestAnimationFrame(autosize);
    try {
      await onSend(text);
    } catch (e) {
      setValue(text);
      toast.error((e as Error).message || "Failed to send");
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return toast.error("Files must be under 25 MB.");

    setUploading(true);
    try {
      const path = `${conversationId}/${user.id}-${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) throw error;
      const { data } = await supabase.storage.from("attachments").createSignedUrl(path, YEAR);
      const url = data?.signedUrl;
      if (!url) throw new Error("Could not create link");

      await onSend(file.type.startsWith("image/") ? "" : file.name, {
        type: file.type.startsWith("image/") ? "image" : "file",
        attachment_url: url,
        attachment_meta: { name: file.name, size: file.size, mime: file.type },
      });
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-bg-elev px-3 py-3 md:px-4">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-bg-elev-2 px-2 py-1.5 transition-colors focus-within:border-accent">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg p-2 text-text-dim transition-colors hover:bg-bg-elev hover:text-text"
          title="Attach a file"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        <input ref={fileRef} type="file" hidden onChange={onPickFile} />

        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autosize();
            if (e.target.value.trim()) onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          onBlur={onStopTyping}
          placeholder="Message"
          className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[14.5px] outline-none placeholder:text-text-faint"
        />

        <button
          onClick={submit}
          disabled={!value.trim()}
          className="rounded-lg bg-accent-strong p-2 text-white transition-opacity hover:bg-accent disabled:opacity-40"
          title="Send"
        >
          <SendHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
