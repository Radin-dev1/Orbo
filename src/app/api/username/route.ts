import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const RE = /^[a-z0-9_]{3,20}$/;

export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get("u")?.toLowerCase().trim() ?? "";
  if (!RE.test(u)) {
    return NextResponse.json({ available: false, reason: "format" });
  }
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("id").eq("username", u).maybeSingle();
    return NextResponse.json({ available: !data });
  } catch {
    // If the service role key isn't set yet, don't block signup — the DB
    // unique constraint is still the source of truth.
    return NextResponse.json({ available: true, reason: "unverified" });
  }
}
