import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from './server.mjs';
test('Booking validation, persistence, retries, authorisation, origin restrictions and retention',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hcmc-'));let delivered=0;
 const env={DATABASE_PATH:join(dir,'db.sqlite'),ADMIN_API_TOKEN:'test-only-'.repeat(8),RESEND_API_KEY:'test-only',MAIL_FROM:'test@example.test',CLINIC_EMAIL:'clinic@example.test',ALLOWED_ORIGINS:'https://clinic.example.test'};
 let app=createApp({env,notify:async()=>{delivered++;}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));let base=`http://127.0.0.1:${app.server.address().port}`;
 const payload={name:'Test Patient',phone:'+18765550123',email:'patient@example.test',service:'general',date:new Date(Date.now()+86400000).toISOString().slice(0,10),time:'morning',consent:true};
 const headers={'Content-Type':'application/json','Idempotency-Key':randomUUID(),Origin:'https://clinic.example.test'};
 const post=(body=payload,custom=headers)=>fetch(base+'/api/appointments',{method:'POST',headers:custom,body:JSON.stringify(body)});
 try{
  let r=await post({...payload,consent:false});assert.equal(r.status,400);
  r=await post({...payload,date:'2027-02-30'});assert.equal(r.status,400);
  r=await post({...payload,website:'spam'});assert.equal(r.status,400);
  r=await post(payload,{...headers,Origin:'https://attacker.example.test'});assert.equal(r.status,403);
  r=await post();assert.equal(r.status,201);const receipt=await r.json();assert.match(receipt.reference,/^HCMC-/);
  r=await post();assert.equal(r.status,200);assert.equal((await r.json()).reference,receipt.reference);
  r=await post({...payload,name:'Other Name'});assert.equal(r.status,409);
  r=await fetch(base+'/api/admin/appointments');assert.equal(r.status,401);
  const auth={Authorization:`Bearer ${env.ADMIN_API_TOKEN}`};
  r=await fetch(base+'/api/admin/appointments',{headers:auth});let rows=(await r.json()).requests;assert.equal(rows.length,1);assert.equal(rows[0].data.name,'Test Patient');
  r=await fetch(base+'/api/admin/appointments/'+receipt.reference,{method:'PATCH',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({status:'confirmed'})});assert.equal(r.status,200);
  for(let i=0;i<4;i++)assert.equal((await post(payload,{...headers,'Idempotency-Key':randomUUID()})).status,201);
  assert.equal((await post(payload,{...headers,'Idempotency-Key':randomUUID()})).status,429);
  await app.close();assert.ok(delivered>=1);
  app=createApp({env,notify:async()=>{}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;
  r=await fetch(base+'/api/admin/appointments',{headers:auth});rows=(await r.json()).requests;assert.equal(rows.length,5);assert.equal(rows.find(x=>x.id===receipt.reference).status,'confirmed');
  r=await fetch(base+'/api/admin/appointments/'+receipt.reference,{method:'DELETE',headers:auth});assert.equal(r.status,200);
  app.db.prepare('UPDATE requests SET created=?').run(Date.now()-31*86400000);
  r=await fetch(base+'/api/admin/appointments',{headers:auth});assert.equal((await r.json()).requests.length,0);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('Missing notification and administrator configuration disables intake',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hcmc-'));const app=createApp({env:{DATABASE_PATH:join(dir,'db.sqlite')}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{const base=`http://127.0.0.1:${app.server.address().port}`;assert.equal((await(await fetch(base+'/api/public/config')).json()).bookingEnabled,false);assert.equal((await fetch(base+'/api/appointments',{method:'POST'})).status,503);}finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
