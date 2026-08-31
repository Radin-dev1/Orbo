"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldPlus, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session/SessionProvider";
import { Button } from "@/components/ui/Button";

interface Factor {
  id: string;
  friendly_name?: string;
  status: string;
}

export function SecuritySettings() {
  const { supabase } = useSession();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);

  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.totp ?? []) as Factor[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnroll() {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(true);
  }

  async function confirmEnroll() {
    if (!factorId) return;
    setBusy(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) {
      setBusy(false);
      return toast.error(chErr.message);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Two-step verification enabled");
    setEnrolling(false);
    setQr(null);
    setSecret(null);
    setCode("");
    setFactorId(null);
    await refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error(error.message);
    toast.success("Removed");
    await refresh();
  }

  const hasMfa = factors.some((f) => f.status === "verified");

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-faint">Security</h2>
      <div className="space-y-4 rounded-2xl border border-border bg-bg-elev p-5">
        <div className="flex items-start gap-3">
          <span className={hasMfa ? "text-success" : "text-text-dim"}>
            <ShieldCheck size={22} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">Two-step verification (TOTP)</p>
            <p className="text-xs text-text-dim">
              Require a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…) at sign-in.
            </p>
          </div>
        </div>

        {loading ? null : (
          <>
            {factors.length > 0 && (
              <ul className="space-y-1.5">
                {factors.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-bg-elev-2 px-3 py-2 text-sm"
                  >
                    <span>
                      {f.friendly_name || "Authenticator"}{" "}
                      <span className="text-xs text-text-dim">({f.status})</span>
                    </span>
                    <button onClick={() => remove(f.id)} className="text-text-dim hover:text-danger">
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {enrolling ? (
              <div className="space-y-3 rounded-xl border border-border bg-bg-elev-2 p-4">
                <p className="text-xs text-text-dim">
                  Scan this QR code in your authenticator app, then enter the current code.
                </p>
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="TOTP QR code" className="mx-auto h-44 w-44 rounded-lg bg-white p-2" />
                )}
                {secret && (
                  <p className="break-all text-center text-xs text-text-dim">
                    or enter key: <span className="font-mono text-text">{secret}</span>
                  </p>
                )}
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="h-10 w-full rounded-xl border border-border bg-bg-elev px-3 text-center text-sm tracking-widest outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <Button onClick={confirmEnroll} loading={busy} className="flex-1">
                    Verify & enable
                  </Button>
                  <Button variant="secondary" onClick={() => setEnrolling(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" onClick={startEnroll} loading={busy}>
                <ShieldPlus size={15} /> Add authenticator
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
