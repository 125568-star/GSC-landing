begin;
-- Test fixtures exist only inside this rolled-back transaction. No emails sent.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('a16ca000-0000-4000-8000-000000000001','arcadia-test-admin@example.invalid',now(),'{"community":"kuranda","display_name":"Test Admin","unit_number":"1"}'),
('a16ca000-0000-4000-8000-000000000002','arcadia-test-owner@example.invalid',now(),'{"community":"kuranda","display_name":"Test Owner","unit_number":"2","requested_role":"owner","role":"admin","approved":true}'),
('a16ca000-0000-4000-8000-000000000003','arcadia-test-tenant@example.invalid',now(),'{}');
update public.kuranda_profiles set role='admin',approved=true,access_status='active' where user_id='a16ca000-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from public.kuranda_profiles where user_id='a16ca000-0000-4000-8000-000000000002' and role='occupier' and requested_role='owner' and not approved and access_status='pending') then raise exception 'Signup safety failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a16ca000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.kuranda_profiles)<>1 then raise exception 'Applicant can see other members'; end if;
 begin
  perform public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000002','Test Owner','2','admin','active');
  raise exception 'Self approval was allowed';
 exception when raise_exception then if sqlerrm<>'Admin access required' then raise; end if; end;
 begin
  update public.kuranda_profiles set approved=true,access_status='active' where user_id='a16ca000-0000-4000-8000-000000000002';
  raise exception 'Direct update was allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a16ca000-0000-4000-8000-000000000003',true);
select public.kuranda_request_membership('Test Tenant','3','occupier');
do $$ begin
 if not exists(select 1 from public.kuranda_profiles where user_id=auth.uid() and not approved) then raise exception 'Existing-account membership failed'; end if;
 begin
  perform public.kuranda_request_membership('Test Tenant','3','admin');raise exception 'Privileged role request was allowed';
 exception when raise_exception then if sqlerrm<>'Choose tenant or owner' then raise; end if;end;
end $$;
select set_config('request.jwt.claim.sub','a16ca000-0000-4000-8000-000000000001',true);
select public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000002','Test Owner','2','owner','active');
select public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000003','Test Manager','','manager','active');
select public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000003','Test Manager','','manager','suspended');
select set_config('request.jwt.claim.sub','a16ca000-0000-4000-8000-000000000003',true);
do $$ begin
 if kuranda_private.has_role(array['manager']) then raise exception 'Suspended member retained access';end if;
end $$;
reset role;
-- Leave only the fixture admin active within this transaction to check lockout protection.
update public.kuranda_profiles set approved=false,access_status='suspended' where role='admin' and user_id<>'a16ca000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a16ca000-0000-4000-8000-000000000001',true);
do $$ begin
 begin
  perform public.kuranda_manage_member(auth.uid(),'Test Admin','1','owner','active');raise exception 'Last admin removal was allowed';
 exception when raise_exception then if sqlerrm<>'Keep at least one active admin' then raise;end if;end;
end $$;
set local role anon;
do $$ begin
 begin
  perform public.kuranda_manage_member('a16ca000-0000-4000-8000-000000000001','Test Admin','1','admin','active');raise exception 'Anonymous management was allowed';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'Passed: safe signup, own-profile visibility, no self-approval, no direct updates, existing-account join, admin approval, manager role, suspension, last-admin protection, anonymous denial. Fixtures rolled back.' as result;
