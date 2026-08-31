-- ═══════════════════════════════════════════════════════════════════════════
-- Orbo — core schema (profiles, conversations, messages, contacts, calls)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ─────────────────────────────── profiles ──────────────────────────────────
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text unique not null,
  display_name   text not null,
  avatar_url     text,
  bio            text,
  status_message text,
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

create policy "profiles readable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Create a profile row automatically whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  dname text;
begin
  uname := lower(coalesce(new.raw_user_meta_data ->> 'username',
                          'user_' || substr(replace(new.id::text, '-', ''), 1, 10)));
  dname := coalesce(new.raw_user_meta_data ->> 'display_name', uname);

  insert into public.profiles (id, username, display_name)
  values (new.id, uname, dname)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── conversations ───────────────────────────────
do $$ begin
  create type public.conversation_type as enum ('dm', 'group');
exception when duplicate_object then null; end $$;

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            public.conversation_type not null default 'dm',
  title           text,
  avatar_url      text,
  created_by      uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table public.conversations enable row level security;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('member', 'admin')),
  last_read_at    timestamptz not null default now(),
  muted           boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_members enable row level security;
create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

-- SECURITY DEFINER helper — runs as owner, bypassing RLS, so it can be called
-- from inside conversation_members' own policies without infinite recursion.
create or replace function public.is_conversation_member(conv uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_admin(conv uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid() and role = 'admin'
  );
$$;

create policy "members read conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

create policy "authenticated create conversations"
  on public.conversations for insert to authenticated
  with check (created_by = auth.uid());

create policy "admins update group conversations"
  on public.conversations for update to authenticated
  using (public.is_conversation_admin(id))
  with check (public.is_conversation_admin(id));

create policy "members read member list"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "join self, or creator/admin adds others"
  on public.conversation_members for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.conversations c
               where c.id = conversation_id and c.created_by = auth.uid())
    or public.is_conversation_admin(conversation_id)
  );

create policy "update own membership"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "leave self, or admin removes"
  on public.conversation_members for delete to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id));

-- ─────────────────────────────── messages ──────────────────────────────────
do $$ begin
  create type public.message_type as enum ('text', 'image', 'file', 'system', 'call_event');
exception when duplicate_object then null; end $$;

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  type            public.message_type not null default 'text',
  content         text,
  attachment_url  text,
  attachment_meta jsonb,
  reply_to        uuid references public.messages (id) on delete set null,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.messages enable row level security;
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create policy "members read messages"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "members send messages"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

create policy "senders edit own messages"
  on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

create policy "senders delete own messages"
  on public.messages for delete to authenticated
  using (sender_id = auth.uid());

create or replace function public.bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
    set last_message_at = new.created_at
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_conversation on public.messages;
create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation();

-- ────────────────────────── message reactions ──────────────────────────────
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "members read reactions"
  on public.message_reactions for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id and public.is_conversation_member(m.conversation_id)
  ));

create policy "members add reactions"
  on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.messages m
    where m.id = message_id and public.is_conversation_member(m.conversation_id)
  ));

create policy "remove own reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ──────────────────────────── contacts / friends ───────────────────────────
create table if not exists public.contacts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id),
  constraint no_self_contact check (user_id <> contact_id)
);

alter table public.contacts enable row level security;

create policy "see own contact rows"
  on public.contacts for select to authenticated
  using (user_id = auth.uid() or contact_id = auth.uid());

create policy "create own contact requests"
  on public.contacts for insert to authenticated
  with check (user_id = auth.uid());

create policy "either side updates the link"
  on public.contacts for update to authenticated
  using (user_id = auth.uid() or contact_id = auth.uid());

create policy "either side deletes the link"
  on public.contacts for delete to authenticated
  using (user_id = auth.uid() or contact_id = auth.uid());

-- ──────────────────────────────── calls ────────────────────────────────────
do $$ begin
  create type public.call_status as enum ('ringing', 'active', 'ended', 'missed', 'declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.call_kind as enum ('audio', 'video');
exception when duplicate_object then null; end $$;

create table if not exists public.calls (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  started_by      uuid references public.profiles (id) on delete set null,
  kind            public.call_kind not null default 'audio',
  status          public.call_status not null default 'ringing',
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

alter table public.calls enable row level security;
create index if not exists calls_conversation_idx
  on public.calls (conversation_id, started_at desc);

create table if not exists public.call_participants (
  call_id   uuid not null references public.calls (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz,
  left_at   timestamptz,
  primary key (call_id, user_id)
);

alter table public.call_participants enable row level security;

create policy "members read calls"
  on public.calls for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "members start calls"
  on public.calls for insert to authenticated
  with check (started_by = auth.uid() and public.is_conversation_member(conversation_id));

create policy "members update calls"
  on public.calls for update to authenticated
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

create policy "members read call participants"
  on public.call_participants for select to authenticated
  using (exists (
    select 1 from public.calls c
    where c.id = call_id and public.is_conversation_member(c.conversation_id)
  ));

create policy "manage own participation (insert)"
  on public.call_participants for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.calls c
    where c.id = call_id and public.is_conversation_member(c.conversation_id)
  ));

create policy "manage own participation (update)"
  on public.call_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
