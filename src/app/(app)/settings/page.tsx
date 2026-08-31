"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { SecuritySettings } from "@/components/settings/SecuritySettings";

export default function SettingsPage() {
  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="rounded-lg p-1.5 text-text-dim hover:bg-bg-elev-2 hover:text-text"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <div className="space-y-8 pb-16">
        <ProfileSettings />
        <SecuritySettings />
      </div>
    </div>
  );
}
