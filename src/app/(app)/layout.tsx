import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionProvider } from "@/lib/session/SessionProvider";
import { CallProvider } from "@/lib/rtc/CallProvider";
import { AppShell } from "@/components/AppShell";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) {
    const fallbackUsername =
      (user.user_metadata?.username as string) ??
      `user_${user.id.replace(/-/g, "").slice(0, 10)}`;
    const { data: created } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        username: fallbackUsername.toLowerCase(),
        display_name:
          (user.user_metadata?.display_name as string) ?? fallbackUsername.toLowerCase(),
      })
      .select()
      .single();
    profile = created;
  }

  if (!profile) redirect("/login");

  return (
    <SessionProvider initialUser={profile as Profile}>
      <CallProvider>
        <AppShell>{children}</AppShell>
      </CallProvider>
    </SessionProvider>
  );
}
