/** Runtime configuration derived from public env vars. */

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

export function iceServers(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (!raw) return DEFAULT_ICE;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as RTCIceServer[];
  } catch {
    console.warn("NEXT_PUBLIC_ICE_SERVERS is not valid JSON — falling back to default STUN");
  }
  return DEFAULT_ICE;
}

export const MAX_CALL_PARTICIPANTS = (() => {
  const n = Number(process.env.NEXT_PUBLIC_MAX_CALL_PARTICIPANTS);
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : 6;
})();

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const APP_NAME = "Orbo";
