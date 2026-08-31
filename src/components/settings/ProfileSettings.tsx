"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

export function ProfileSettings() {
  const { supabase, user, refreshUser } = useSession();
  const [displayName, setDisplayName] = useState(user.display_name);
  const [bio, setBio] = useState(user.bio ?? "");
  const [status, setStatus] = useState(user.status_message ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    displayName !== user.display_name ||
    bio !== (user.bio ?? "") ||
    status !== (user.status_message ?? "") ||
    avatarUrl !== user.avatar_url;

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file.");
    setUploading(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || user.username,
        bio: bio.trim() || null,
        status_message: status.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await refreshUser();
    toast.success("Profile updated");
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-faint">Profile</h2>
      <div className="space-y-4 rounded-2xl border border-border bg-bg-elev p-5">
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative">
            <Avatar id={user.id} name={displayName} src={avatarUrl} size={64} />
            <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-bg-elev bg-accent-strong p-1 text-white">
              <Camera size={12} />
            </span>
          </button>
          <input ref={fileRef} type="file" hidden accept="image/*" onChange={onAvatar} />
          <div>
            <p className="text-sm font-medium">@{user.username}</p>
            <p className="text-xs text-text-dim">{uploading ? "Uploading…" : "Tap the avatar to change"}</p>
          </div>
        </div>

        <LabeledInput label="Display name" value={displayName} onChange={setDisplayName} />
        <LabeledInput label="Status" value={status} onChange={setStatus} placeholder="e.g. 🎧 focusing" />
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <Button onClick={save} loading={busy} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-dim">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-border bg-bg-elev-2 px-3 text-sm outline-none focus:border-accent"
      />
    </div>
  );
}
