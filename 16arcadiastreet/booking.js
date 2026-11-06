'use strict';
(async()=>{
 const $=id=>document.getElementById(id);
 const options={
  tennis:{name:'Tennis court',photo:'https://images.unsplash.com/photo-1618548723848-1b339b8a7999?auto=format&fit=crop&w=1600&q=85',alt:'Outdoor tennis court viewed from above'},
  pool:{name:'Pool',photo:'https://unsplash.com/photos/a-swimming-pool-is-shown-outside-Ckg7AtPTPEY/download?force=true&w=1600',alt:'Outdoor swimming pool'},
  barbecue:{name:'Barbecue area',photo:'https://unsplash.com/photos/chicken-pieces-cooking-on-an-outdoor-barbecue-grill-PUTdG2idU6Y/download?force=true&w=1600',alt:'Outdoor barbecue grill'}
 };
 const facility=new URLSearchParams(location.search).get('facility');
 if(!options[facility]){location.replace('members.html');return}
 const cfg=options[facility],zone='Australia/Brisbane';
 const client=window.supabase?.createClient('https://pulbcpjwxliwnmkiyfhe.supabase.co','sb_publishable_ljmRZCY1QvS4G64eDgTuUQ_GfWXky0x');
 const status=(msg,bad=false)=>{$('status').textContent=msg;$('status').className='booking-status '+(bad?'error':'success')};
 const pad=n=>String(n).padStart(2,'0');
 const parts=(date=new Date())=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const today=()=>{const p=parts();return p.year+'-'+p.month+'-'+p.day};
 const toISO=(day,hour)=>new Date(day+'T'+pad(hour)+':00:00+10:00').toISOString();
 const nice=day=>new Date(day+'T12:00:00+10:00').toLocaleDateString('en-AU',{timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const now=new Date(),base=parts(now);
 let shownYear=Number(base.year),shownMonth=Number(base.month)-1,day=today(),hour=null,user=null,bookings=[];
 $('facility-title').textContent='Book the '+cfg.name.toLowerCase();
 document.title='Book '+cfg.name+' | Kuranda';
 $('facility-image').src=cfg.photo;$('facility-image').alt=cfg.alt;
 function calendar(){
  const first=shownYear+'-'+pad(shownMonth+1)+'-01';
  $('prev-month').disabled=first.slice(0,7)<=today().slice(0,7);
  $('month-label').textContent=new Date(Date.UTC(shownYear,shownMonth,1)).toLocaleDateString('en-AU',{month:'long',year:'numeric',timeZone:'UTC'});
  const c=$('calendar');c.replaceChildren();
  for(const name of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const e=document.createElement('span');e.className='weekday';e.textContent=name;c.append(e)}
  const offset=(new Date(Date.UTC(shownYear,shownMonth,1)).getUTCDay()+6)%7;
  for(let i=0;i<offset;i++)c.append(document.createElement('span'));
  const total=new Date(Date.UTC(shownYear,shownMonth+1,0)).getUTCDate();
  for(let d=1;d<=total;d++){
   const value=shownYear+'-'+pad(shownMonth+1)+'-'+pad(d),b=document.createElement('button');b.type='button';b.textContent=d;b.disabled=value<today();b.classList.toggle('selected',value===day);
   b.setAttribute('aria-label',nice(value));b.setAttribute('aria-pressed',String(value===day));
   b.onclick=()=>{day=value;hour=null;calendar();slots()};c.append(b)
  }
 }
 function slots(){
  $('date-title').textContent=nice(day);const root=$('slots');root.replaceChildren();
  for(let h=6;h<22;h++){
   const start=toISO(day,h),reserved=bookings.some(b=>b.facility===facility&&b.starts_at===start),past=new Date(start)<=new Date();
   const b=document.createElement('button');b.type='button';b.textContent=pad(h)+':00';b.disabled=reserved||past;b.title=reserved?'Already booked':past?'Past time':'Available';b.className=reserved?'booked':hour===h?'selected':'';
   b.setAttribute('aria-pressed',String(hour===h));b.onclick=()=>{hour=h;slots()};root.append(b)
  }
  const confirm=$('confirm');confirm.disabled=hour===null||new Date(toISO(day,hour))<=new Date()||bookings.some(b=>b.facility===facility&&b.starts_at===toISO(day,hour));
  confirm.textContent=hour===null?'Choose a time':'Confirm '+pad(hour)+':00–'+pad(hour+1)+':00';
 }
 function mine(){
  const rows=bookings.filter(b=>b.user_id===user.id&&new Date(b.starts_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)),root=$('my-bookings');root.replaceChildren();
  if(!rows.length){const p=document.createElement('p');p.className='muted';p.textContent='No upcoming bookings.';root.append(p);return}
  for(const item of rows){
   const line=document.createElement('div');line.className='booking-line';
   const info=document.createElement('span');const d=new Date(item.starts_at);
   info.textContent=nice((()=>{const p=parts(d);return p.year+'-'+p.month+'-'+p.day})())+' · '+d.toLocaleTimeString('en-AU',{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false});
   const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancel booking';
   cancel.onclick=async()=>{if(!window.confirm('Cancel this booking?'))return;cancel.disabled=true;const {error}=await client.from('kuranda_facility_bookings').delete().eq('id',item.id).eq('user_id',user.id);if(error){status(error.message,true);cancel.disabled=false}else{status('Booking cancelled.');await refreshBookings()}};
   line.append(info,cancel);root.append(line)
  }
 }
 async function refreshBookings(){
  const {data,error}=await client.from('kuranda_facility_bookings').select('id,user_id,facility,starts_at').eq('facility',facility).gte('starts_at',new Date(today()+'T00:00:00+10:00').toISOString()).order('starts_at');
  if(error)throw error;bookings=data||[];
  if(hour!==null&&bookings.some(b=>b.starts_at===toISO(day,hour)))hour=null;
  calendar();slots();mine()
 }
 $('prev-month').onclick=()=>{shownMonth--;if(shownMonth<0){shownMonth=11;shownYear--}calendar()};
 $('next-month').onclick=()=>{shownMonth++;if(shownMonth>11){shownMonth=0;shownYear++}calendar()};
 $('confirm').onclick=async()=>{
  if(hour===null)return;
  const chosen=toISO(day,hour);if(new Date(chosen)<=new Date()){status('That time has already passed.',true);slots();return}
  $('confirm').disabled=true;status('Saving reservation…');
  const {error}=await client.from('kuranda_facility_bookings').insert({facility,starts_at:chosen,user_id:user.id});
  if(error){status(error.code==='23505'?'This time was just booked by someone else. Please select another.':error.message,true)}else{status('Booking confirmed for '+nice(day)+' at '+pad(hour)+':00.');hour=null}
  try{await refreshBookings()}catch(e){status(e.message,true)}
 };
 function denied(message){$('access-message').querySelector('h1').textContent='Member access required';$('access-message').querySelector('p').textContent=message}
 if(!client){denied('Could not load sign-in. Please refresh the page.');return}
 const {data:{user:loggedIn},error:authError}=await client.auth.getUser();
 if(authError||!loggedIn){denied('Please sign in through the members area first.');return}
 const {data:profile,error:profileError}=await client.from('kuranda_profiles').select('approved,access_status').eq('user_id',loggedIn.id).maybeSingle();
 if(profileError||!profile?.approved||profile.access_status!=='active'){denied('Your Kuranda membership must be active and approved before you can book.');return}
 user=loggedIn;$('access-message').hidden=true;$('booking-page').hidden=false;
 try{await refreshBookings()}catch(e){status('Could not load booking availability: '+e.message,true)}
})();