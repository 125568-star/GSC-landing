begin;
select set_config('test.platform_owner',(select user_id::text from community_private.platform_owner),true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('a16ca000-0000-4000-8000-000000000011','manager-check@example.invalid',now(),'{"community":"kuranda","display_name":"Test Manager","unit_number":"1"}'),
('a16ca000-0000-4000-8000-000000000012','tenant-check@example.invalid',now(),'{"community":"kuranda","display_name":"Test Tenant","unit_number":"2","role":"admin","super_admin":true}');
update public.kuranda_profiles set role='manager',approved=true,access_status='active' where user_id='a16ca000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','a16ca000-0000-4000-8000-000000000012',true);
do $$ begin
 if public.community_is_super_admin() then raise exception 'Metadata granted platform access';end if;
 if (select count(*) from public.kuranda_profiles)<>1 then raise exception 'Tenant can see other users';end if;
 begin
  perform public.kuranda_manage_member(auth.uid(),'Test Tenant','2','owner','active');raise exception 'Tenant self approval allowed';
 exception when raise_exception then if sqlerrm<>'Manager access required' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','a16ca000-0000-4000-8000-000000000011',true);
select public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000012','Test Tenant','2','owner','active');
select public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000012','Test Tenant','2','body_corp','suspended');
do $$ begin
 if public.community_is_super_admin() then raise exception 'Manager has global access';end if;
 if exists(select 1 from public.kuranda_profiles where role='admin') then raise exception 'Manager can see reserved account';end if;
 begin
  perform public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000012','Test Tenant','2','admin','active');raise exception 'Admin assignment allowed';
 exception when raise_exception then if sqlerrm<>'Choose a community role' then raise;end if;end;
 begin
  perform public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000012','Test Tenant','2','manager','active');raise exception 'Manager appointment allowed';
 exception when raise_exception then if sqlerrm<>'Manager appointments are managed by the site owner' then raise;end if;end;
 begin
  perform public.kuranda_manage_member(current_setting('test.platform_owner')::uuid,'Owner','1','owner','active');raise exception 'Owner modification allowed';
 exception when raise_exception then if sqlerrm<>'This account cannot be changed here' then raise;end if;end;
 begin
  insert into community_private.platform_owner(user_id) values(auth.uid());raise exception 'Owner registration allowed';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.platform_owner'),true);
do $$ begin if not public.community_is_super_admin() then raise exception 'Owner not recognized';end if;end $$;
select public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000012','Test Manager 2','','manager','active');
do $$ begin
 if not exists(select 1 from public.kuranda_profiles where user_id='a16ca000-0000-4000-8000-000000000012' and role='manager' and approved) then raise exception 'Owner manager appointment failed';end if;
end $$;
rollback;
select 'Passed: manager approval and suspension; no self-approval; hidden protected account; no admin assignment; no manager promotion by managers; owner-only appointments; metadata cannot grant global access; platform owner table protected. Test fixtures rolled back.' as result;

