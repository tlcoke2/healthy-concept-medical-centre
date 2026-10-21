import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {createApp} from './server.mjs';import {parseFeed,createNewsFeed} from './news.mjs';
test('News feed admits official links only, decodes titles, dates and provides a truthful fallback',async()=>{
 const xml='<rss><channel><item><title><![CDATA[Test &amp; health]]></title><link>https://www.moh.gov.jm/test/</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Bad</title><link>https://evil.example/</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
 const items=parseFeed(xml);assert.equal(items.length,1);assert.equal(items[0].title,'Test & health');
 const live=await createNewsFeed(async()=>new Response(xml))();assert.equal(live.live,true);
 const fallback=await createNewsFeed(async()=>new Response('',{status:403}))();assert.equal(fallback.live,false);assert.equal(fallback.items.length,3);
});
test('AI requires origin and consent; clinical concerns bypass provider; provider receives bounded stateless requests; rate limits apply',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hcmc-hub-'));let calls=0;
 const app=createApp({env:{DATABASE_PATH:join(dir,'db.sqlite'),ALLOWED_ORIGINS:'https://clinic.example.test',OPENAI_API_KEY:'test-only-key',ENABLE_AI_ASSISTANT:'true'},aiFetch:async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,350);assert.ok(body.instructions.includes('JA$3,000'));assert.ok(!body.previous_response_id);return Response.json({output:[{content:[{type:'output_text',text:'General consultations start at JA$3,000.'}]}]});}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`,sid=randomUUID();
 const post=(question,consent=true,origin='https://clinic.example.test')=>fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify({question,consent,sessionId:sid})});
 try{assert.equal((await post('Fees?',false)).status,400);assert.equal((await post('Fees?',true,'')).status,403);assert.equal((await post('x'.repeat(801))).status,400);const r=await post('I have chest pain');assert.equal((await r.json()).mode,'guide');assert.equal(calls,0);let q=await post('Consultation fees?');assert.equal((await q.json()).mode,'ai');assert.equal(calls,1);for(let i=0;i<13;i++)await post('Hours?');assert.equal((await post('Hours?')).status,429);}finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
