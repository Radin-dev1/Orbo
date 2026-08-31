"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AtSign, Phone, Lock, User, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { OrboWordmark } from "@/components/ui/Logo";
import { isEmail, isPhone, normalizePhone } from "@/lib/utils";

type Mode = "login" | "signup";
type Step = "credentials" | "mfa" | "check-email";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const [step, setStep] = useState<Step>("credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "ok" | "taken" | "bad">(
    "idle",
  );

  const idKind = isEmail(identifier) ? "email" : isPhone(identifier) ? "phone" : null;

  // Debounced username availability check (signup only).
  useEffect(() => {
    if (mode !== "signup") return;
    const u = username.toLowerCase().trim();
    if (!u) return setUsernameState("idle");
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return setUsernameState("bad");
    setUsernameState("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username?u=${encodeURIComponent(u)}`);
        const json = await res.json();
        setUsernameState(json.available ? "ok" : "taken");
      } catch {
        setUsernameState("idle");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username, mode]);

  const finishLogin = useCallback(async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (totp) {
        const { data: ch, error } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (error) return toast.error(error.message);
        setFactorId(totp.id);
        setChallengeId(ch.id);
        setStep("mfa");
        return;
      }
    }
    router.replace("/");
    router.refresh();
  }, [router, supabase]);

  const onSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idKind) return toast.error("Enter a valid email or phone number.");
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "signup") {
        if (usernameState === "taken") return toast.error("That username is taken.");
        if (!/^[a-z0-9_]{3,20}$/.test(username.toLowerCase().trim()))
          return toast.error("Username must be 3–20 chars: a–z, 0–9, underscore.");

        const creds =
          idKind === "email"
            ? { email: identifier.trim() }
            : { phone: normalizePhone(identifier) };

        const { data, error } = await supabase.auth.signUp({
          ...creds,
          password,
          options: {
            data: {
              username: username.toLowerCase().trim(),
              display_name: displayName.trim() || username.toLowerCase().trim(),
            },
            emailRedirectTo:
              typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
          },
        });
        if (error) throw error;

        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setStep("check-email");
        }
      } else {
        const creds =
          idKind === "email"
            ? { email: identifier.trim(), password }
            : { phone: normalizePhone(identifier), password };
        const { error } = await supabase.auth.signInWithPassword(creds);
        if (error) throw error;
        await finishLogin();
      }
    } catch (err) {
      toast.error((err as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !challengeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      });
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Invalid code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-bg bg-grid p-4">
      <div className="animate-fade w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <OrboWordmark />
          <p className="text-sm text-text-dim">
            {step === "mfa"
              ? "Enter the 6-digit code from your authenticator app."
              : step === "check-email"
                ? "Almost there."
                : mode === "signup"
                  ? "Create your account."
                  : "Welcome back."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-bg-elev p-6">
          {step === "check-email" ? (
            <div className="space-y-4 text-center text-sm text-text-dim">
              <ShieldCheck className="mx-auto text-success" size={32} />
              <p>
                We sent a confirmation link to <span className="text-text">{identifier}</span>. Click
                it, then come back and sign in.
              </p>
              <Link href="/login" className="inline-block text-accent hover:underline">
                Go to sign in
              </Link>
            </div>
          ) : step === "mfa" ? (
            <form onSubmit={onSubmitMfa} className="space-y-4">
              <Field
                icon={<ShieldCheck size={16} />}
                value={code}
                onChange={setCode}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
                maxLength={6}
              />
              <Button type="submit" size="lg" loading={busy} className="w-full">
                Verify
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmitCredentials} className="space-y-3.5">
              <Field
                icon={idKind === "phone" ? <Phone size={16} /> : <AtSign size={16} />}
                value={identifier}
                onChange={setIdentifier}
                placeholder="Email or phone"
                autoFocus
                autoComplete="username"
              />

              {mode === "signup" && (
                <>
                  <div>
                    <Field
                      icon={<User size={16} />}
                      value={username}
                      onChange={(v) => setUsername(v.toLowerCase())}
                      placeholder="username"
                      autoComplete="off"
                    />
                    <p className="mt-1 pl-1 text-xs">
                      {usernameState === "checking" && (
                        <span className="text-text-faint">Checking…</span>
                      )}
                      {usernameState === "ok" && <span className="text-success">Available</span>}
                      {usernameState === "taken" && <span className="text-danger">Taken</span>}
                      {usernameState === "bad" && (
                        <span className="text-danger">3–20 chars: a–z, 0–9, _</span>
                      )}
                    </p>
                  </div>
                  <Field
                    icon={<User size={16} />}
                    value={displayName}
                    onChange={setDisplayName}
                    placeholder="Display name (optional)"
                    autoComplete="name"
                  />
                </>
              )}

              <Field
                icon={<Lock size={16} />}
                value={password}
                onChange={setPassword}
                placeholder="Password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />

              <Button type="submit" size="lg" loading={busy} className="w-full">
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>
          )}
        </div>

        {step === "credentials" && (
          <p className="mt-5 text-center text-sm text-text-dim">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="text-accent hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to Orbo?{" "}
                <Link href="/signup" className="text-accent hover:underline">
                  Create an account
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  icon,
  value,
  onChange,
  ...rest
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="flex items-center gap-2.5 rounded-xl border border-border bg-bg-elev-2 px-3.5 focus-within:border-accent">
      <span className="text-text-faint">{icon}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-text-faint"
        {...rest}
      />
    </label>
  );
}
