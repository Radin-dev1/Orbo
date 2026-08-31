-- ═══════════════════════════════════════════════════════════════════════════
-- Orbo — RPC functions the client calls via supabase.rpc(...)
-- ═══════════════════════════════════════════════════════════════════════════

-- Find the existing 1:1 conversation between the caller and `other_user`,
-- or create one. Returns the conversation id.
create or replace function public.get_or_create_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  conv uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if me = other_user then
    raise exception 'cannot open a DM with yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'user not found';
  end if;

  select c.id
    into conv
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = me
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = other_user
  where c.type = 'dm'
  limit 1;

  if conv is not null then
    return conv;
  end if;

  insert into public.conversations (type, created_by)
  values ('dm', me)
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (conv, me, 'admin'),
         (conv, other_user, 'member');

  return conv;
end;
$$;

-- Create a group conversation with the caller as admin plus the given members.
create or replace function public.create_group(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  conv uuid;
  mid  uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  insert into public.conversations (type, title, created_by)
  values ('group', nullif(trim(p_title), ''), me)
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (conv, me, 'admin');

  if p_member_ids is not null then
    foreach mid in array p_member_ids loop
      if mid <> me then
        insert into public.conversation_members (conversation_id, user_id, role)
        values (conv, mid, 'member')
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return conv;
end;
$$;

-- Add members to an existing group (admins only, enforced by RLS on insert).
create or replace function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  mid uuid;
begin
  if not public.is_conversation_admin(p_conversation_id) then
    raise exception 'only admins can add members';
  end if;

  foreach mid in array coalesce(p_member_ids, '{}') loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (p_conversation_id, mid, 'member')
    on conflict do nothing;
  end loop;
end;
$$;

-- Mark a conversation as read up to now for the calling user.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
$$;

-- Fuzzy search over profiles by username / display name (excludes the caller).
create or replace function public.search_profiles(q text)
returns setof public.profiles
language sql
security definer
stable
set search_path = public
as $$
  select p.*
  from public.profiles p
  where p.id <> auth.uid()
    and length(trim(q)) >= 1
    and (p.username ilike '%' || trim(q) || '%'
      or p.display_name ilike '%' || trim(q) || '%')
  order by
    (p.username ilike trim(q) || '%') desc,
    p.username
  limit 20;
$$;

grant execute on function public.get_or_create_dm(uuid)             to authenticated;
grant execute on function public.create_group(text, uuid[])         to authenticated;
grant execute on function public.add_group_members(uuid, uuid[])    to authenticated;
grant execute on function public.mark_conversation_read(uuid)       to authenticated;
grant execute on function public.search_profiles(text)              to authenticated;
