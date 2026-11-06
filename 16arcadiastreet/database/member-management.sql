-- Demo membership panel. Reuses existing Kuranda accounts and profiles.
alter table public.kuranda_profiles add column requested_role text not null default 'occupier' check (requested_role in ('occupier','owner'));
alter table public.kuranda_profiles add column access_status text not null default 'pending' check (access_status in ('pending','active','suspended','declined'));
update public.kuranda_profiles set access_status=case when approved then 'active' else 'pending' end;
alter table public.kuranda_profiles add constraint kuranda_access_consistent check (approved=(access_status='active'));
alter table public.kuranda_profiles drop constraint kuranda_profiles_role_check;
alter table public.kuranda_profiles add constraint kuranda_profiles_role_check check (role in ('occupier','owner','manager','body_corp','admin'));

create or replace function kuranda_private.new_user_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.raw_user_meta_data->>'community','')='kuranda' then
  insert into public.kuranda_profiles(user_id,display_name,unit_number,requested_role)
  values(new.id,left(trim(coalesce(new.raw_user_meta_data->>'display_name','')),100),left(trim(coalesce(new.raw_user_meta_data->>'unit_number','')),30),case when new.raw_user_meta_data->>'requested_role'='owner' then 'owner' else 'occupier' end) on conflict do nothing;
 end if;
 return new;
end $$;

-- Existing accounts can request membership without creating another Auth user.
create or replace function kuranda_private.request_membership(p_name text,p_unit text,p_requested_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirm your email first'; end if;
 if p_requested_role not in ('occupier','owner') or p_requested_role is null then raise exception 'Choose tenant or owner'; end if;
 if nullif(trim(p_name),'') is null or length(p_name)>100 or nullif(trim(p_unit),'') is null or length(p_unit)>30 then raise exception 'Name and unit number are required'; end if;
 insert into public.kuranda_profiles(user_id,display_name,unit_number,requested_role) values(auth.uid(),trim(p_name),trim(p_unit),p_requested_role) on conflict(user_id) do nothing;
end $$;
create or replace function public.kuranda_request_membership(p_name text,p_unit text,p_requested_role text) returns void language sql security invoker set search_path='' as $$ select kuranda_private.request_membership(p_name,p_unit,p_requested_role) $$;

create or replace function kuranda_private.manage_member(p_user_id uuid,p_name text,p_unit text,p_role text,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare old_profile public.kuranda_profiles;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 -- Serialize changes so two admins cannot remove the last active admin together.
 perform pg_catalog.pg_advisory_xact_lock(16820416);
 if not exists(select 1 from public.kuranda_profiles where user_id=auth.uid() and role='admin' and approved) then raise exception 'Admin access required'; end if;
 if p_role is null or p_role not in ('occupier','owner','manager','body_corp','admin') then raise exception 'Invalid role'; end if;
 if p_status is null or p_status not in ('pending','active','suspended','declined') then raise exception 'Invalid status'; end if;
 if nullif(trim(p_name),'') is null or length(p_name)>100 or length(p_unit)>30 or p_unit is null then raise exception 'Enter a name and valid unit'; end if;
 if p_role in ('occupier','owner') and nullif(trim(p_unit),'') is null then raise exception 'A unit is required for tenants and owners'; end if;
 select * into old_profile from public.kuranda_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Member no longer exists'; end if;
 if old_profile.role='admin' and old_profile.approved and (p_role<>'admin' or p_status<>'active') and not exists(select 1 from public.kuranda_profiles where role='admin' and approved and user_id<>p_user_id) then raise exception 'Keep at least one active admin'; end if;
 if p_status='active' and not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'Member must confirm their email before approval'; end if;
 update public.kuranda_profiles set display_name=trim(p_name),unit_number=trim(p_unit),role=p_role,access_status=p_status,approved=(p_status='active') where user_id=p_user_id;
 -- Remove any stale role preview after changing a membership.
 delete from public.kuranda_active_roles where user_id=p_user_id;
end $$;
create or replace function public.kuranda_manage_member(p_user_id uuid,p_name text,p_unit text,p_role text,p_status text) returns void language sql security invoker set search_path='' as $$ select kuranda_private.manage_member(p_user_id,p_name,p_unit,p_role,p_status) $$;

-- All changes go through the checked function; applicants cannot self-approve.
revoke insert,update,delete on public.kuranda_profiles from anon,authenticated;
grant select on public.kuranda_profiles to authenticated;
revoke all on function kuranda_private.request_membership(text,text,text),kuranda_private.manage_member(uuid,text,text,text,text),public.kuranda_request_membership(text,text,text),public.kuranda_manage_member(uuid,text,text,text,text) from public,anon;
grant usage on schema kuranda_private to authenticated;
grant execute on function kuranda_private.request_membership(text,text,text),kuranda_private.manage_member(uuid,text,text,text,text),public.kuranda_request_membership(text,text,text),public.kuranda_manage_member(uuid,text,text,text,text) to authenticated;

alter table public.kuranda_profiles add column complex_id smallint not null default 1 check(complex_id=1); comment on column public.kuranda_profiles.complex_id is 'Demo complex flag: 1 = Kuranda / 16 Arcadia Street'; alter table public.daw82_profiles add column complex_id smallint not null default 2 check(complex_id=2); comment on column public.daw82_profiles.complex_id is 'Demo complex flag: 2 = 82 Daw Road';