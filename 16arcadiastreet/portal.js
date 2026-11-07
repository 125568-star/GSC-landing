'use strict';
(() => {
const $=id=>document.getElementById(id);
const roles={occupier:'Tenant',owner:'Owner',manager:'Manager',body_corp:'Body corporate'};
const statuses={pending:'Pending',active:'Active',suspended:'Suspended',declined:'Declined'};
const screens=['loading','login','signup','forgot','reset','join','account'];
let client,user,profile,isSuperAdmin=false,members=[],demoRole=null,recovery=location.hash.includes('type=recovery');
const show=(id,on)=>$(id).classList.toggle('hidden',!on);
function message(text,error=false){$('message').textContent=text;$('message').className='message '+(error?'error':'success')}
function screen(id){screens.forEach(x=>show(x,x===id));message('')}
function value(form,name){return form.elements.namedItem(name).value.trim()}
function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el}
async function busy(form,action){const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);message('Please wait…');try{await action()}catch(e){message(e.message||'Unable to connect. Please try again.',true)}finally{buttons.forEach(b=>b.disabled=false)}}
const dashboardDetails={
 occupier:{heading:'Tenant Dashboard',subtitle:'Everything you need for day-to-day life in your community.',icon:'🏡',cards:[['🎾','Book facilities','Reserve the tennis court, swimming pool or barbecue area.','#facility-bookings'],['📌','Community notices','Read updates from your community manager.','#notices'],['🔧','Maintenance','Report common-area issues to management.','#maintenance'],['📞','Useful contacts','Find management and emergency information.','#contacts']]},
 owner:{heading:'Owner Dashboard',subtitle:'Stay informed about your property and community.',icon:'🏘️',cards:[['🎾','Book facilities','Reserve shared facilities.','#facility-bookings'],['📌','Community notices','View manager announcements and updates.','#notices'],['📋','Body corporate updates','See important community information.','#body-corporate'],['🔧','Maintenance','Follow common-property matters.','#maintenance']]},
 manager:{heading:'Manager Dashboard',subtitle:'Manage membership and help the community stay organised.',icon:'🗂️',cards:[['👥','Manage members','Review residents, approvals and account roles.','#admin-panel'],['📌','Manage notices','Publish announcements and bin-day reminders.','#notices'],['🎾','Facility bookings','Review shared facility reservations.','#facility-bookings'],['🔧','Maintenance','See common-property reports.','#maintenance']]},
 body_corp:{heading:'Body Corporate Dashboard',subtitle:'Community governance and shared-property information.',icon:'📋',cards:[['📌','Community notices','Read manager announcements.','#notices'],['🏘️','Community information','View body corporate updates.','#body-corporate'],['🔧','Maintenance','Follow shared-property issues.','#maintenance'],['🎾','Book facilities','Reserve shared facilities.','#facility-bookings']]}
};
function renderDashboard(){
 const active=profile?.approved===true&&profile?.access_status==='active';show('role-dashboard',active);if(!active)return;
 const role=isSuperAdmin?'manager':profile.role,details=dashboardDetails[role]||dashboardDetails.occupier;
 $('dashboard-role').textContent=(isSuperAdmin?'Super admin · ':'')+'Kuranda community';
 $('dashboard-title').textContent=isSuperAdmin?'Super Admin Dashboard':details.heading;
 $('dashboard-subtitle').textContent=details.subtitle;
 document.querySelector('.dashboard-symbol').textContent=details.icon;
 const container=$('dashboard-links');container.replaceChildren();
 for(const [icon,title,desc,href] of details.cards){
  const a=element(demoRole||!['#facility-bookings','#admin-panel'].includes(href)?'div':'a',undefined,'dashboard-tile');if(a.tagName==='A')a.href=href;
  const mark=element('span',icon,'dashboard-tile-icon');mark.setAttribute('aria-hidden','true');
  const heading=element('strong',title),body=element('span',desc,'muted');
  if(demoRole||!['#facility-bookings','#admin-panel'].includes(href)){const note=element('small',demoRole?'Demo preview only':'Coming soon','muted');a.append(mark,heading,body,note)}else a.append(mark,heading,body);container.append(a)
 }
}
function startDemo(role){
 demoRole=role;isSuperAdmin=false;user={id:'demo-'+role};profile={role,display_name:role==='occupier'?'Demo Tenant':role==='owner'?'Demo Owner':'Demo Manager',unit_number:'Demo',approved:true,access_status:'active',complex_id:1};
 screen('account');show('logout',true);show('demo-preview-warning',true);show('facility-bookings',false);show('admin-panel',false);
 $('welcome').textContent='Welcome, '+profile.display_name;
 $('identity').textContent=(roles[role]||role)+' · Demo preview · Kuranda';
 $('account-title').textContent='Dashboard preview';
 $('account-description').textContent='This is a demonstration of the '+(roles[role]||role).toLowerCase()+' view. Sign in with an approved community account to use real booking and management features.';
 $('refresh').classList.add('hidden');
 renderDashboard();
}
async function refresh(){
 demoRole=null;show('demo-preview-warning',false);$('refresh').classList.remove('hidden');
 show('admin-panel',false);show('facility-bookings',false);show('role-dashboard',false);members=[];$('member-list').replaceChildren();
 const {data,error}=await client.auth.getUser();user=error?null:data.user;show('logout',!!user);
 if(!user){isSuperAdmin=false;screen('login');return}
 const privilege=await client.rpc('community_is_super_admin');if(privilege.error)throw privilege.error;isSuperAdmin=privilege.data===true;
 if(recovery){screen('reset');return}
 const result=await client.from('kuranda_profiles').select('user_id,display_name,unit_number,role,approved,requested_role,access_status,created_at,complex_id').eq('user_id',user.id).maybeSingle();
 if(result.error)throw result.error;profile=result.data;
 if(!profile){screen('join');return}
 screen('account');renderDashboard();show('facility-bookings',profile.approved===true&&profile.access_status==='active');$('welcome').textContent='Welcome'+(profile.display_name?', '+profile.display_name:'');
 $('identity').textContent=[isSuperAdmin?'Super admin':roles[profile.role]||profile.role,profile.unit_number?'Unit '+profile.unit_number:'',statuses[profile.access_status],'Kuranda · Complex '+profile.complex_id].filter(Boolean).join(' · ');
 const copy={pending:['Membership pending','Your request is waiting for manager review. Private community access is not enabled until approval.'],active:['Your membership is active',(isSuperAdmin||profile.role==='manager')?'You can review applications and manage members below.':'Your approved role is '+roles[profile.role]+'. This demonstration currently includes account access; community services can be added next.'],suspended:['Access suspended','Your membership access has been suspended. Contact the community manager if you need help.'],declined:['Membership not approved','Your request was not approved. Contact the community manager if you believe this needs review.']};
 const [title,description]=copy[profile.access_status]||copy.pending;$('account-title').textContent=title;$('account-description').textContent=description;
 if((isSuperAdmin||profile.role==='manager')&&profile.approved){show('admin-panel',true);await loadMembers()}
}
async function loadMembers(){
 $('list-status').textContent='Loading members…';
 const {data,error}=await client.from('kuranda_profiles').select('user_id,display_name,unit_number,role,approved,requested_role,access_status,created_at,complex_id').order('created_at',{ascending:false});
 if(error){members=[];renderMembers();throw error}members=data||[];renderMembers();
}
function renderMembers(){
 $('pending-total').textContent=members.filter(x=>x.access_status==='pending').length;
 $('active-total').textContent=members.filter(x=>x.access_status==='active').length;
 $('other-total').textContent=members.filter(x=>['suspended','declined'].includes(x.access_status)).length;
 const query=$('search').value.trim().toLowerCase();const visible=members.filter(x=>(!query||[x.display_name,x.unit_number].join(' ').toLowerCase().includes(query))&&(!$('role-filter').value||x.role===$('role-filter').value)&&(!$('status-filter').value||x.access_status===$('status-filter').value));
 $('list-status').textContent=visible.length+' of '+members.length+' members';$('member-list').replaceChildren();
 if(!visible.length){$('member-list').append(element('p',members.length?'No members match your search.':'No applications yet.','muted'));return}
 visible.forEach(member=>{
  const card=element('article',undefined,'card');const top=element('div',undefined,'member-top');const info=element('div');info.append(element('h3',member.display_name||'Unnamed member'),element('div',(member.unit_number?'Unit '+member.unit_number+' · ':'')+(member.role==='admin'?'Super admin':roles[member.role])+(member.user_id===user.id?' · You':''),'member-meta'));top.append(info,element('span',statuses[member.access_status],'badge '+member.access_status));card.append(top);
  if(member.access_status==='pending')card.append(element('p','Requested role: '+roles[member.requested_role],'muted'));
  const date=new Date(member.created_at).toLocaleDateString('en-AU');card.append(element('p','Kuranda · Complex '+member.complex_id+' · Joined '+date,'member-meta'));
  if(member.role==='admin'||(!isSuperAdmin&&member.role==='manager')){$('member-list').append(card);return}
  const assignableRoles=Object.fromEntries(Object.entries(roles).filter(([key])=>isSuperAdmin||key!=='manager'));
  const edit=element('button','Review / edit','secondary');edit.type='button';edit.setAttribute('aria-expanded','false');card.append(edit);
  const form=element('form',undefined,'member-editor hidden');const grid=element('div',undefined,'edit-grid');
  function field(label,name,initial,options){const lab=element('label',label);const input=element(options?'select':'input');input.name=name;if(options)Object.entries(options).forEach(([key,text])=>{const opt=element('option',text);opt.value=key;input.append(opt)});else{input.type='text';input.maxLength=name==='name'?100:30;input.required=name==='name'}input.value=initial;lab.append(input);grid.append(lab);return input}
  field('Full name','name',member.display_name);const unit=field('Unit number','unit',member.unit_number);const role=field('Role','role',member.access_status==='pending'?member.requested_role:member.role,assignableRoles);field('Access status','status',member.access_status,statuses);
  const requireUnit=()=>unit.required=['occupier','owner'].includes(role.value);role.onchange=requireUnit;requireUnit();form.append(grid);
  const actions=element('div',undefined,'actions');const save=element('button','Save changes');const approve=element('button','Approve membership');approve.type='button';approve.className='secondary';const cancel=element('button','Cancel','secondary');cancel.type='button';actions.append(save);if(member.access_status==='pending')actions.append(approve);actions.append(cancel);form.append(actions);card.append(form);
  edit.onclick=()=>{form.classList.toggle('hidden');edit.setAttribute('aria-expanded',String(!form.classList.contains('hidden')))};
  cancel.onclick=()=>{form.classList.add('hidden');edit.setAttribute('aria-expanded','false')};
  approve.onclick=()=>{form.elements.namedItem('status').value='active';form.requestSubmit()};
  form.onsubmit=e=>{e.preventDefault();busy(form,async()=>{
   const {error}=await client.rpc('kuranda_manage_member',{p_user_id:member.user_id,p_name:value(form,'name'),p_unit:value(form,'unit'),p_role:value(form,'role'),p_status:value(form,'status')});if(error)throw error;
   await refresh();message('Membership updated.');
  })};$('member-list').append(card);
 });
}

document.querySelectorAll('[data-screen]').forEach(button=>button.onclick=()=>screen(button.dataset.screen));
$('login-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const entered=value(e.target,'email').toLowerCase();const demos={tenant:'occupier',owner:'owner',manager:'manager'};if(Object.prototype.hasOwnProperty.call(demos,entered)){if(e.target.elements.namedItem('password').value!=='password 123')throw new Error('Incorrect demo password.');startDemo(demos[entered]);return}const {error}=await client.auth.signInWithPassword({email:entered,password:e.target.elements.namedItem('password').value});if(error)throw error;await refresh()})};
$('signup-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{
 const form=e.target;const {data,error}=await client.auth.signUp({email:value(form,'email'),password:form.elements.namedItem('password').value,options:{emailRedirectTo:location.origin+'/16arcadiastreet/members.html',data:{community:'kuranda',display_name:value(form,'name'),unit_number:value(form,'unit'),requested_role:value(form,'role')}}});if(error)throw error;
 form.reset();if(data.session)await refresh();message('Check your email to confirm your account, then sign in for manager review. If you already have an account, use Sign in.');
 })};
$('join-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const {error}=await client.rpc('kuranda_request_membership',{p_name:value(e.target,'name'),p_unit:value(e.target,'unit'),p_requested_role:value(e.target,'role')});if(error)throw error;await refresh();message('Your membership request is ready for manager review.')})};
$('forgot-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const {error}=await client.auth.resetPasswordForEmail(value(e.target,'email'),{redirectTo:location.origin+'/16arcadiastreet/members.html'});if(error)throw error;message('If an account exists for that email, a reset link has been requested. Check your inbox and spam folder.')})};
$('reset-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const {error}=await client.auth.updateUser({password:e.target.elements.namedItem('password').value});if(error)throw error;recovery=false;e.target.reset();await refresh();message('Your password has been updated.')})};
$('resend').onclick=()=>busy($('login-form'),async()=>{const email=value($('login-form'),'email');if(!email)throw new Error('Enter your email address first.');const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin+'/16arcadiastreet/members.html'}});if(error)throw error;message('If confirmation is pending, an email has been requested. Check your inbox and spam folder.')});
$('logout').onclick=()=>{if(demoRole){demoRole=null;user=null;profile=null;show('demo-preview-warning',false);show('role-dashboard',false);show('logout',false);screen('login');return}busy($('account'),async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;profile=null;user=null;recovery=false;await refresh()})};
$('refresh').onclick=()=>busy($('account'),refresh);
['search','role-filter','status-filter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderMembers));
if(!window.supabase){screen('login');document.querySelectorAll('button').forEach(b=>b.disabled=true);message('The sign-in service did not load. Please reload the page.',true);return}
client=window.supabase.createClient('https://pulbcpjwxliwnmkiyfhe.supabase.co','sb_publishable_ljmRZCY1QvS4G64eDgTuUQ_GfWXky0x');
client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recovery=true;screen('reset')}});
refresh().catch(e=>{screen('login');message(e.message,true)});
})();
