-- ═══════════════════════════════════════════════════════════════════════════
-- Orbo — tighten EXECUTE grants on SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger functions must not be REST-callable at all. App RPCs and the RLS
-- helper predicates are for signed-in users only (never `anon` / `public`).

revoke all on function public.handle_new_user()  from public, anon, authenticated;
revoke all on function public.bump_conversation() from public, anon, authenticated;

revoke all on function public.is_conversation_member(uuid) from public, anon;
revoke all on function public.is_conversation_admin(uuid)  from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_conversation_admin(uuid)  to authenticated;

revoke all on function public.get_or_create_dm(uuid)              from public, anon;
revoke all on function public.create_group(text, uuid[])          from public, anon;
revoke all on function public.add_group_members(uuid, uuid[])     from public, anon;
revoke all on function public.mark_conversation_read(uuid)        from public, anon;
revoke all on function public.search_profiles(text)               from public, anon;
grant execute on function public.get_or_create_dm(uuid)           to authenticated;
grant execute on function public.create_group(text, uuid[])       to authenticated;
grant execute on function public.add_group_members(uuid, uuid[])  to authenticated;
grant execute on function public.mark_conversation_read(uuid)     to authenticated;
grant execute on function public.search_profiles(text)            to authenticated;
