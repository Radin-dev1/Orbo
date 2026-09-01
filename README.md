# Orbo

Real-time messaging and group calling. Next.js + Supabase, full-mesh WebRTC.

![stack](https://img.shields.io/badge/Next.js-16-black) ![stack](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Realtime-3ecf8e) ![stack](https://img.shields.io/badge/WebRTC-mesh-7c6cff)

## What's inside

| Area | Details |
| --- | --- |
| **Auth** | Email **or** phone + password, unique `@username`, optional TOTP two-step verification (authenticator app — no SMS costs). |
| **Direct messages** | 1:1 conversations, realtime delivery, edit / delete, emoji reactions, read state, typing indicators, image & file attachments. |
| **Group chats** | Create with any number of people, rename, add members, leave. Admin roles. |
| **Calls** | 1:1 and **group** audio/video calls over WebRTC. Mic / camera toggle, screen share, minimizable call window, in-app ringtone, incoming-call screen. |
| **Presence** | Global online/offline, per-conversation "in call now". |
| **Security** | Postgres Row-Level Security on every table; storage policies scoped to conversation membership. |

Calls use a **full-mesh** topology — every participant connects directly to every
other participant. That keeps infrastructure to zero (Supabase Realtime carries
only signalling) and works well up to ~6 people. Past that you'd swap the mesh
for an SFU; the engine's public surface (`src/lib/rtc/CallEngine.ts`) is written
so that stays a contained change.

## Prerequisites

- Node 20+
- A Supabase project (free tier is fine). Create one at [supabase.com](https://supabase.com).

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` from **Supabase → Project Settings**:

| Var | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` key (secret) |
| `DATABASE_URL` | Settings → Database → Connection string → **Session pooler** (URI). Contains your DB password. |

`NEXT_PUBLIC_ICE_SERVERS` defaults to public STUN. For calls that must cross
strict NATs / firewalls, add a TURN server (a free relay from
[metered.ca](https://www.metered.ca/tools/openrelay/) or self-hosted
[coturn](https://github.com/coturn/coturn)):

```
NEXT_PUBLIC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:your.turn.host:3478","username":"user","credential":"pass"}]
```

### 3. Run migrations

```bash
npm run migrate            # applies supabase/migrations/*.sql in order
npm run migrate -- --list  # show applied / pending
```

This creates all tables, RLS policies, RPC functions, the realtime publication,
and the `avatars` / `attachments` storage buckets.

### 4. Supabase dashboard settings

- **Authentication → Providers → Email**: keep enabled. To skip the email
  confirmation step during development, turn **"Confirm email"** off.
- **Authentication → Providers → Phone**: enable it if you want phone sign-ups.
  Turn **"Confirm phone"** off so no SMS provider is needed (phone acts purely as
  a login identifier alongside the password).
- **Authentication → Multi-Factor**: enable **TOTP** so two-step verification works.
- **Authentication → URL Configuration**: add `http://localhost:3000` (and your
  deployed URL) to the redirect allow-list.

### 5. Start

```bash
npm run dev
```

Open <http://localhost:3000>, create two accounts in two browsers (or a normal +
private window), search each other by username, and start messaging / calling.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build & serve |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Deployment (GitHub Actions → Vercel)

`.github/workflows/deploy.yml` builds the app and deploys it to Vercel on every
push to `main` (and via **Run workflow**). Each run is recorded under the repo's
**Deployments** tab against the `production` environment, with the live URL.

One-time setup:

1. Create a Vercel access token at <https://vercel.com/account/tokens>.
2. In the repo: **Settings → Secrets and variables → Actions → Secrets** →
   add `VERCEL_TOKEN` with that value.
3. The workflow already carries the Vercel project/org IDs and the public
   Supabase credentials. Nothing else is required for a first deploy.
4. After the first deploy, add the Vercel URL to
   Supabase → Authentication → URL Configuration.

Optional overrides (repo **Variables**, not secrets): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_MAX_CALL_PARTICIPANTS`. Set
`SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_ICE_SERVERS` in the Vercel project if
you need them (both degrade gracefully). Run `npm run migrate` locally against the
same project whenever you add migrations.

## Project layout

```
src/
  app/
    (app)/                 authenticated shell — sidebar + conversation + call overlay
      c/[id]/              a conversation
      settings/            profile + security (2FA)
    login/  signup/        auth screens
    auth/                  callback + signout route handlers
    api/username/          username availability check
  components/
    chat/                  ChatView, MessageList, MessageBubble, Composer, …
    call/                  CallOverlay, ParticipantTile, CallControls, IncomingCallModal
    sidebar/               Sidebar, ConversationRow, NewChatDialog
    settings/              ProfileSettings, SecuritySettings
    ui/                    Avatar, Button, Modal, Spinner, Logo
  lib/
    supabase/              browser / server / proxy clients
    session/               SessionProvider (current user + global presence)
    rtc/                   CallEngine (mesh WebRTC) + CallProvider (React glue)
    hooks/                 useConversations, useMessages, useTyping
supabase/migrations/       0001_init · 0002_rpc · 0003_realtime_storage
scripts/migrate.ts         migration runner
```

## How calling works

1. Starting a call inserts a `calls` row. Every member's client is subscribed to
   `calls` inserts (RLS-scoped) and shows the incoming-call screen.
2. Joining opens a Supabase Realtime channel `call:<id>`:
   - **presence** = who's in the room, plus mic/cam flags
   - **broadcast `signal`** = SDP offers/answers and ICE candidates, addressed peer-to-peer
3. For each other participant the client creates an `RTCPeerConnection` and runs
   the [perfect-negotiation](https://developer.mozilla.org/docs/Web/API/WebRTC_API/Perfect_negotiation)
   pattern, so simultaneous offers (e.g. two people toggling camera at once)
   never deadlock.
4. Leaving untracks presence and closes peer connections; the last one out marks
   the `calls` row `ended`.
