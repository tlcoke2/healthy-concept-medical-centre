import { aiAnswer, safetyReply } from './assistant.mjs';
import { createNewsFeed } from './news.mjs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const SERVICES=new Set(['general','diabetes','women','screening','diagnostics','work','school','home','specialist']);
const hash=v=>createHash('sha256').update(v).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
const jamaicaDay=()=>new Date(Date.now()-5*3600000).toISOString().slice(0,10);
export function validate(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return 'Invalid request.';
 if(data.website)return 'Request could not be accepted.';
 if(typeof data.name!=='string'||data.name.trim().length<2||data.name.length>100||/[\x00-\x1f<>]/.test(data.name))return 'Enter your name (2–100 characters).';
 if(typeof data.phone!=='string'||!/^\+?[\d ()-]{7,25}$/.test(data.phone)||data.phone.replace(/\D/g,'').length<7)return 'Enter a valid telephone number.';
 if(data.email!==undefined&&(typeof data.email!=='string'||data.email.length>254||(data.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email))))return 'Enter a valid email address.';
 if(!SERVICES.has(data.service))return 'Choose a listed service.';
 if(typeof data.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.date))return 'Choose a valid date.';
 const day=new Date(data.date+'T12:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==data.date||data.date<jamaicaDay()||day.getTime()>Date.now()+91*86400000)return 'Choose a date within the next 90 days.';
 if(!['any','morning','afternoon'].includes(data.time))return 'Choose a valid time preference.';
 if(data.consent!==true)return 'Consent is required to process your appointment request.';
 return null;
}
export function createApp(options={}){
 const env=options.env||process.env;
 const dbPath=env.DATABASE_PATH||'/data/hcmc.sqlite';mkdirSync(dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested', created INTEGER NOT NULL, notified INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
 const newsFeed=createNewsFeed(options.newsFetch);
 const assistantEnabled=Boolean(env.OPENAI_API_KEY&&env.ENABLE_AI_ASSISTANT==='true');
 const origins=(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
 const enabled=Boolean(env.ADMIN_API_TOKEN?.length>=32&&env.RESEND_API_KEY&&env.MAIL_FROM&&env.CLINIC_EMAIL&&origins.length);
 const notify=options.notify||async function(record){
  const data=JSON.parse(record.data);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':record.id},body:JSON.stringify({from:env.MAIL_FROM,to:[env.CLINIC_EMAIL],subject:`HCMC appointment request ${record.id}`,text:`New appointment request — not confirmed.\nReference: ${record.id}\nName: ${data.name}\nPhone: ${data.phone}\nEmail: ${data.email||'Not provided'}\nService: ${data.service}\nPreferred date: ${data.date}\nPreferred time: ${data.time}\n\nContact the patient to confirm availability and fees. Handle this message as confidential.`}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Notification provider unavailable');
 };
 let sending=false;
 async function flush(){if(sending)return;sending=true;try{const records=db.prepare('SELECT * FROM requests WHERE notified=0 ORDER BY created LIMIT 10').all();for(const row of records){try{await notify(row);db.prepare('UPDATE requests SET notified=1 WHERE id=?').run(row.id);}catch{break;}}}finally{sending=false;}}
 function purge(){db.prepare('DELETE FROM requests WHERE created < ?').run(Date.now()-30*86400000);db.prepare('DELETE FROM rate_limits WHERE expires < ?').run(Date.now());}
 purge();
 const timer=setInterval(()=>{purge();if(enabled)void flush();},60000);timer.unref();
 function limited(key,max){const now=Date.now(),row=db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);if(!row||row.expires<now){db.prepare('INSERT OR REPLACE INTO rate_limits VALUES (?,1,?)').run(key,now+3600000);return false;}if(row.count>=max)return true;db.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(key);return false;}
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Vary','Origin');
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  if(origin&&!origins.includes(origin))return send(403,{error:'Origin not permitted.'});
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Idempotency-Key, Authorization');res.setHeader('Access-Control-Max-Age','600');res.writeHead(204);return res.end();}
  const path=new URL(req.url,'http://internal').pathname;
  try{
   if(req.method==='GET'&&path==='/health')return send(200,{status:'ok'});
   if(req.method==='GET'&&path==='/api/public/config')return send(200,{bookingEnabled:enabled,assistantEnabled});
   if(req.method==='GET'&&path==='/api/news')return send(200,await newsFeed());
   if(req.method==='POST'&&path==='/api/assistant'){
    if(!assistantEnabled)return send(503,{error:'AI assistant unavailable. Use the clinic guide.'});
    if(!origin||!origins.includes(origin))return send(403,{error:'Website origin required.'});
    if(!(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON required.'});
    const body=await readBody(req);
    if(body.consent!==true||typeof body.question!=='string'||!body.question.trim()||body.question.length>800||typeof body.sessionId!=='string'||!/^[a-f\d-]{36}$/i.test(body.sessionId))return send(400,{error:'A short question, session identifier and consent are required.'});
    if(limited('ai:session:'+hash(body.sessionId),15)||limited('ai:global',100))return send(429,{error:'Assistant request limit reached. Please call the clinic.'});
    const safety=safetyReply(body.question);if(safety)return send(200,{answer:safety,mode:'guide'});
    try{return send(200,{answer:await aiAnswer(body.question,env,options.aiFetch),mode:'ai'});}catch{return send(503,{error:'AI assistant unavailable. Use the clinic guide or telephone the clinic.'});}
   }
   // Do not trust arbitrary forwarded client addresses. Phone limits are persisted as hashes.
   if(path.startsWith('/api/admin/')){
    if(!env.ADMIN_API_TOKEN||env.ADMIN_API_TOKEN.length<32||!equal(req.headers.authorization||'',`Bearer ${env.ADMIN_API_TOKEN}`))return send(401,{error:'Unauthorised.'});
    if(path==='/api/admin/appointments'&&req.method==='GET'){
     purge();const rows=db.prepare('SELECT id,data,status,created,notified FROM requests ORDER BY created DESC LIMIT 500').all();return send(200,{requests:rows.map(r=>({...r,data:JSON.parse(r.data)}))});
    }
    const id=path.match(/^\/api\/admin\/appointments\/(HCMC-[a-f0-9-]{36})$/)?.[1];
    if(id&&req.method==='DELETE'){const r=db.prepare('DELETE FROM requests WHERE id=?').run(id);return send(r.changes?200:404,r.changes?{deleted:true}:{error:'Not found.'});}
    if(id&&req.method==='PATCH'){const body=await readBody(req);if(!['requested','contacted','confirmed','cancelled','completed'].includes(body.status))return send(400,{error:'Invalid status.'});const r=db.prepare('UPDATE requests SET status=? WHERE id=?').run(body.status,id);return send(r.changes?200:404,r.changes?{updated:true}:{error:'Not found.'});}
    return send(404,{error:'Not found.'});
   }
   if(path==='/api/appointments'&&req.method==='POST'){
    if(!enabled)return send(503,{error:'Online booking is not available. Please telephone the clinic.'});
    if(!(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON required.'});
    const data=await readBody(req),error=validate(data);if(error)return send(400,{error});
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[a-f\d-]{36}$/i.test(key))return send(400,{error:'A valid request key is required.'});
    const clean={name:data.name.trim(),phone:data.phone.trim(),email:(data.email||'').trim(),service:data.service,date:data.date,time:data.time,consent:true,privacyVersion:'2026-10-20'};
    const text=JSON.stringify(clean),fingerprint=hash(text),existing=db.prepare('SELECT id,fingerprint FROM requests WHERE request_key=?').get(key);
    if(existing){if(existing.fingerprint!==fingerprint)return send(409,{error:'This request key was already used for different details.'});return send(200,{reference:existing.id,status:'requested'});}
    if(limited('phone:'+hash(clean.phone.replace(/\D/g,'')),5)||limited('global',1000))return send(429,{error:'Too many requests. Please telephone the clinic.'});
    const id='HCMC-'+randomUUID();db.prepare('INSERT INTO requests(id,request_key,fingerprint,data,created) VALUES (?,?,?,?,?)').run(id,key,fingerprint,text,Date.now());
    send(201,{reference:id,status:'requested'});void flush();return;
   }
   return send(404,{error:'Not found.'});
  }catch(e){if(!res.headersSent)send(e.status||500,{error:e.status===413?'Request too large.':e.status===400?'Invalid JSON.':'Unable to process the request. Please telephone the clinic.'});}
 });
 server.headersTimeout=10000;server.requestTimeout=15000;
 return {server,db,flush,close:async()=>{clearInterval(timer);await new Promise(resolve=>server.close(resolve));while(sending)await new Promise(resolve=>setTimeout(resolve,10));db.close();}};
}
async function readBody(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw Object.assign(new Error('Body too large'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Bad JSON'),{status:400});}}
if(process.argv[1]===fileURLToPath(import.meta.url)){const app=createApp();app.server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>console.log('HCMC API started'));process.on('SIGTERM',async()=>{await app.close();process.exit(0);});}
