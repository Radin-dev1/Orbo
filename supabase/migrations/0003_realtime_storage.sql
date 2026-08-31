-- ═══════════════════════════════════════════════════════════════════════════
-- Orbo — realtime publication + storage buckets
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── realtime publication ──────────────────────────
-- Add tables to the `supabase_realtime` publication so Postgres Changes stream
-- to subscribed clients (RLS is still enforced per subscriber).
do $$
declare
  t text;
begin
  foreach t in array array[
    'messages', 'conversations', 'conversation_members',
    'message_reactions', 'calls', 'call_participants'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Full row data on updates/deletes (needed to react to edits & removals).
alter table public.messages             replica identity full;
alter table public.conversation_members replica identity full;
alter table public.message_reactions    replica identity full;
alter table public.calls                replica identity full;
alter table public.call_participants    replica identity full;

-- ─────────────────────────────── storage ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- avatars: world-readable, owner-writable under a folder named by their uid
drop policy if exists "avatars readable" on storage.objects;
create policy "avatars readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars upload own" on storage.objects;
create policy "avatars upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- attachments: path is  <conversation_id>/<filename>  — visible to members only
drop policy if exists "attachments read members" on storage.objects;
create policy "attachments read members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "attachments upload members" on storage.objects;
create policy "attachments upload members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
