-- Platform access is separate from assignable community roles.
create schema if not exists community_private;
revoke all on schema community_private from public,anon;
create table community_private.platform_owner(singleton boolean primary key default true check(singleton),user_id uuid not null unique references auth.users(id));
alter table community_private.platform_owner enable row level security;
revoke all on community_private.platform_owner from public,anon,authenticated;
insert into community_private.platform_owner(user_id)
select u.id from auth.users u join public.kuranda_profiles k on k.user_id=u.id join public.daw82_profiles d on d.user_id=u.id
where u.email_confirmed_at is not null and k.role='admin' and k.approved and d.role='admin' and d.approved;
do $$ begin if (select count(*) from community_private.platform_owner)<>1 then raise exception 'Expected the existing verified platform owner'; end if; end $$;
create function community_private.is_super_admin() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from community_private.platform_owner where user_id=auth.uid())
$$;
revoke all on function community_private.is_super_admin() from public,anon;
grant usage on schema community_private to authenticated;
grant execute on function community_private.is_super_admin() to authenticated;
create function public.community_is_super_admin() returns boolean language sql stable security invoker set search_path='' as $$ select community_private.is_super_admin() $$;
revoke all on function public.community_is_super_admin() from public,anon;
grant execute on function public.community_is_super_admin() to authenticated;

-- Retain the owner's internal admin value for compatibility with existing portals.
update public.kuranda_profiles set role='manager' where role='admin' and user_id not in(select user_id from community_private.platform_owner);
create or replace function kuranda_private.has_role(allowed text[]) returns boolean language sql stable security definer set search_path='' as $$
select (community_private.is_super_admin() and 'admin'=any(allowed)) or exists(
select 1 from public.kuranda_profiles p left join public.kuranda_active_roles a on a.user_id=p.user_id
where p.user_id=auth.uid() and p.approved and (
 (p.role='manager' and ('manager'=any(allowed) or 'admin'=any(allowed))) or
 (p.role<>'manager' and (case when a.user_id is null then p.role
 when a.active_role=p.role and (a.active_role in ('admin','body_corp') or a.unit_number=p.unit_number) then p.role
 when exists(select 1 from public.kuranda_memberships m where m.user_id=p.user_id and m.role=a.active_role and m.unit_number=a.unit_number) then a.active_role else 'invalid' end)=any(allowed))))
$$;
drop policy kuranda_profile_read on public.kuranda_profiles;
create policy kuranda_profile_read on public.kuranda_profiles for select to authenticated using(
user_id=(select auth.uid()) or community_private.is_super_admin() or
(role<>'admin' and kuranda_private.has_role(array['manager'])));
-- No browser client can update profiles outside the checked management function.
drop policy kuranda_profile_admin_update on public.kuranda_profiles;
drop policy kuranda_profile_bodycorp_update on public.kuranda_profiles;

create or replace function kuranda_private.manage_member(p_user_id uuid,p_name text,p_unit text,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare old_profile public.kuranda_profiles; owner_access boolean;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 perform pg_catalog.pg_advisory_xact_lock(16820416);
 owner_access:=community_private.is_super_admin();
 if not owner_access and not exists(select 1 from public.kuranda_profiles where user_id=auth.uid() and role='manager' and approved) then raise exception 'Manager access required'; end if;
 if p_role is null or p_role not in ('occupier','owner','manager','body_corp') then raise exception 'Choose a community role'; end if;
 if p_status is null or p_status not in ('pending','active','suspended','declined') then raise exception 'Invalid status'; end if;
 if nullif(trim(p_name),'') is null or length(p_name)>100 or p_unit is null or length(p_unit)>30 then raise exception 'Enter a name and valid unit'; end if;
 if p_role in ('occupier','owner') and nullif(trim(p_unit),'') is null then raise exception 'A unit is required for tenants and owners'; end if;
 select * into old_profile from public.kuranda_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Member no longer exists'; end if;
 if exists(select 1 from community_private.platform_owner where user_id=p_user_id) or old_profile.role='admin' then raise exception 'This account cannot be changed here'; end if;
 -- Only the platform owner can appoint, demote or suspend community managers.
 if not owner_access and (old_profile.role='manager' or p_role='manager') then raise exception 'Manager appointments are managed by the site owner'; end if;
 if p_status='active' and not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'Member must confirm their email before approval'; end if;
 update public.kuranda_profiles set display_name=trim(p_name),unit_number=trim(p_unit),role=p_role,access_status=p_status,approved=(p_status='active') where user_id=p_user_id;
 delete from public.kuranda_active_roles where user_id=p_user_id;
end $$;

