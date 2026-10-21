'use strict';
const services = [
 ['general','General & family practice','Consultations for everyday health concerns, routine check-ups and preventive care.','everyday','✚'],
 ['diabetes','Diabetes & ongoing care','Ongoing diabetes management and reviews to support your long-term health.','ongoing','♡'],
 ['women','Women’s health','A confidential consultation for your health needs, with appropriate investigation and referral.','everyday','❋'],
 ['screening','Health screening','Preventive health checks and advice on appropriate screening and investigations.','everyday','⌕'],
 ['diagnostics','Blood tests & referrals','Ask about blood testing, results reviews and coordination of onward investigations.','ongoing','◇'],
 ['work','Occupational health','Health assessments for work and executive medical enquiries, arranged with the clinic.','community','▤'],
 ['school','School medicals','Medical assessments for school, with forms and requirements discussed before your visit.','community','▧'],
 ['home','Home visits & outreach','Enquire about home visits and community outreach arrangements and availability.','community','⌂'],
 ['specialist','Specialist enquiries','Discuss gynaecology, cancer care and other specialist needs with our team to arrange the appropriate next step.','ongoing','↗']
];
const config = window.HCMC_CONFIG || {};
const httpsUrl = value => {try {const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : '';}catch{return '';}};
const api=httpsUrl(config.apiBase).replace(/\/$/,'');
const staff=httpsUrl(config.tecLoginUrl);
const grid=document.querySelector('#services'), select=document.querySelector('#service-select');
services.forEach(([id,name,description,category,icon])=>{
 const card=document.createElement('article');card.className='service-card';card.dataset.category=category;
 const symbol=document.createElement('span');symbol.className='service-icon';symbol.setAttribute('aria-hidden','true');symbol.textContent=icon;
 const title=document.createElement('h3');title.textContent=name;
 const p=document.createElement('p');p.textContent=description;
 const button=document.createElement('button');button.textContent='Enquire about this service ↗';button.addEventListener('click',()=>{select.value=id;document.querySelector('#appointment').scrollIntoView();select.focus({preventScroll:true});});
 card.append(symbol,title,p,button);grid.append(card);
 select.add(new Option(name,id));
});
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('.filter').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
 document.querySelectorAll('.service-card').forEach(card=>card.hidden=button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter);
}));
const menu=document.querySelector('#menu-toggle'), nav=document.querySelector('#navigation');
menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.focus();}});
const dateInput=document.querySelector('#visit-date');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Jamaica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// ISO formatting from parts is independent of the browser's locale formatting.
const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Jamaica',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const part=t=>parts.find(p=>p.type===t).value;
dateInput.min=`${part('year')}-${part('month')}-${part('day')}`;
const maxDate=new Date(`${dateInput.min}T12:00:00Z`);maxDate.setUTCDate(maxDate.getUTCDate()+90);dateInput.max=maxDate.toISOString().slice(0,10);
document.querySelector('#year').textContent=new Date().getFullYear();
if(staff){const a=document.querySelector('#tec-login');a.href=staff;a.hidden=false;document.querySelector('#staff-status').textContent='Continue to the TEC Healthcare sign-in page. Sign in there with your existing staff credentials.';}
const shell=document.querySelector('#map-shell');const originalMap=shell.firstElementChild;
function loadMap(){const frame=document.createElement('iframe');frame.title='Google map: 58 Barnett Street, Montego Bay';frame.referrerPolicy='no-referrer';frame.src='https://maps.google.com/maps?q=58%20Barnett%20Street%2C%20Montego%20Bay%2C%20Jamaica&output=embed';frame.loading='lazy';const remove=document.createElement('button');remove.className='map-remove';remove.textContent='Remove map · withdraw map consent';remove.addEventListener('click',()=>{shell.replaceChildren(originalMap);document.querySelector('#load-map').focus();});shell.replaceChildren(frame,remove);remove.focus();}
document.querySelector('#load-map').addEventListener('click',loadMap);
const form=document.querySelector('#appointment-form'), submit=document.querySelector('#submit-request'), status=document.querySelector('#booking-status'), result=document.querySelector('#form-result');
let available=false, requestKey='', payloadSignature='';
async function checkBooking(){if(!api){status.textContent='Online requests are being connected. Please call or use WhatsApp to arrange your visit.';return;}try{const r=await fetch(`${api}/api/public/config`,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();const c=await r.json();available=c.bookingEnabled===true;if(!available)throw new Error();submit.disabled=false;submit.textContent='Send appointment request ↗';status.textContent='Our clinic team will contact you to confirm availability.';}catch{status.textContent='Online requests are currently unavailable. Please call or use WhatsApp.';}}
checkBooking();
form.addEventListener('submit',async e=>{e.preventDefault();if(!available||!form.reportValidity())return;
 const data=Object.fromEntries(new FormData(form));data.consent=data.consent==='on';
 const signature=JSON.stringify(data);if(signature!==payloadSignature){requestKey=crypto.randomUUID();payloadSignature=signature;}
 submit.disabled=true;submit.textContent='Sending…';result.textContent='';
 try{const r=await fetch(`${api}/api/appointments`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:signature,signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok)throw new Error(body.error||'We could not send your request. Please telephone the clinic.');const box=document.createElement('p');box.className='result';box.textContent=`Request received. Reference: ${body.reference}. The clinic will contact you to confirm the date, time and fees. This is not a confirmed appointment.`;result.append(box);form.reset();requestKey='';payloadSignature='';}catch(error){const box=document.createElement('p');box.className='result error';box.textContent=error.name==='TimeoutError'?'We could not confirm receipt. You may retry safely, or call the clinic before making another request.':error.message==='Failed to fetch'?'Unable to reach the clinic. Please call, or retry without changing the form.':error.message;result.append(box);}finally{submit.disabled=false;submit.textContent='Send appointment request ↗';}
});
