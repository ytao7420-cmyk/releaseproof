import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAudit,verifyAudit,compareAudit,parseAudit,canonical,sha256,normalizeCounterclaim} from '../src/audit.js';
const archive=JSON.parse(fs.readFileSync(new URL('../public/evidence/demo.json',import.meta.url)));
const config=JSON.parse(fs.readFileSync(new URL('../public/deployment.json',import.meta.url)));
const code=fs.readFileSync(new URL('../contracts/releaseproof.py',import.meta.url),'utf8');
const make=()=>createAudit({review:archive.reviews[0],challenges:archive.challenges,config,mode:'recorded'});
const redigest=async b=>{const {digest,...rest}=b;b.digest=await sha256(canonical(rest));return b;};
const reads=()=>({readReview:async()=>structuredClone(archive.reviews[0]),readChallenges:async()=>structuredClone(archive.challenges),readCode:async()=>code});
test('real recorded review exports and verifies without relying on archive verification booleans',async()=>{
 const b=await make(),r=await verifyAudit(b,config);assert.equal(r.status,'CONSISTENT');assert.equal(r.revisions,2);assert.equal(r.packageRevisionAcknowledged,true);assert.match(r.trust,/not chain|rewritten/);
});
test('matching independent contract reads provide current RPC match, not signature proof',async()=>{
 const result=await compareAudit(await make(),config,reads());assert.equal(result.status,'CURRENT_MATCH');assert.match(result.trust,/not an independently verified/);
});
const cases=[
 ['modified package',b=>b.review.tag='evil',false,/Package digest/],
 ['foreign contract',b=>b.contractAddress='0x'+'1'.repeat(40),true,/another contract/],
 ['foreign network',b=>b.chainId=1,true,/Unexpected chain/],
 ['forged source code commitment',b=>b.contractSourceSha256='a'.repeat(64),true,/source commitment/],
 ['mutated source',b=>b.review.snapshot.sources[1].text+=' forged',true,/Snapshot digest/],
 ['reordered revisions',b=>b.review.revisions.reverse(),true,/revision chain/],
 ['removed challenge',b=>b.challenges=[],true,/challenge records/],
 ['rebound challenge',b=>b.challenges[0].base_digest='a'.repeat(64),true,/Challenge binds/],
 ['forged resolved evidence',b=>b.challenges[0].reason='forged',true,/resolution evidence/],
 ['forged acknowledgement pointer',b=>b.review.acknowledged_revision=1,true,/Acknowledgement/],
 ['future acknowledged revision',b=>b.review.acknowledged_revisions=[99],true,/acknowledged revision/],
 ['duplicated challenge',b=>b.challenges.push(structuredClone(b.challenges[0])),true,/challenge records/],
 ['tampered counterclaim',b=>b.challenges[0].explanation+=' tampered',true,/Counterclaim hash/],
 ['forged source origin',b=>b.review.snapshot.repo='fake/repo',true,/Source identity/],
 ['inconsistent lifecycle',b=>b.review.status='CHALLENGED',true,/lifecycle/],
];
for(const [name,mutate,recompute,pattern] of cases)test('rejects '+name,async()=>{const b=await make();mutate(b);if(recompute)await redigest(b);await assert.rejects(verifyAudit(b,config),pattern);});
test('recomputed package hash does not authenticate altered context; RPC comparison detects it',async()=>{
 const b=await make();b.review.integration_context='Forged caller context';await redigest(b);assert.equal((await verifyAudit(b,config)).status,'CONSISTENT');await assert.rejects(compareAudit(b,config,reads()),/identity/);
});
test('fake acknowledged state cannot pass live provenance despite consistent local structure',async()=>{
 const b=await make();b.review.acknowledged_revisions=[1,2];await redigest(b);await verifyAudit(b,config);await assert.rejects(compareAudit(b,config,reads()),/acknowledgement is absent/);
});
test('changed live contract bytecode is rejected',async()=>{await assert.rejects(compareAudit(await make(),config,{...reads(),readCode:async()=>code+'\n'}),/Live contract source/);});
test('historical package remains labeled historical when acknowledgement happens later',async()=>{
 const b=await make();b.review.acknowledged_revision=0;b.review.acknowledged_revisions=[];await redigest(b);assert.equal((await compareAudit(b,config,reads())).status,'HISTORICAL_MATCH');
});
test('offline source citation check catches a rehashed fabricated quote',async()=>{
 const b=await make(),v=b.review.revisions[0];v.items[0].citations[0].quote='invented';const {digest,...rest}=v;v.digest=await sha256(canonical(rest));await redigest(b);await assert.rejects(verifyAudit(b,config),/Citation text/);
});
test('bounded parser rejects oversize and malformed evidence',()=>{assert.throws(()=>parseAudit(' '.repeat(2_000_001)),/2 MB/);assert.throws(()=>parseAudit('{'));});
test('canonical serialization rejects unsupported numeric values and excessive nesting',()=>{assert.throws(()=>canonical({x:NaN}));assert.throws(()=>canonical({x:1.5}));let x=[];for(let i=0;i<42;i++)x=[x];assert.throws(()=>canonical(x),/nesting/);});

async function pendingHistoricalPackage() {
 const b=await make(),c=b.challenges[0];
 b.review.revisions=b.review.revisions.slice(0,1);b.review.current_revision=1;
 b.review.head=b.review.revisions[0];b.review.verdict=b.review.head.verdict;
 b.review.acknowledged_revisions=[];b.review.acknowledged_revision=0;
 b.review.status='CHALLENGED';b.review.pending_challenge_id=c.id;
 Object.assign(c,{status:'PENDING',outcome:'',resolution_revision:0,reason:'',citations:[]});
 return redigest(b);
}
test('historical package acknowledgement is separate from a newer unacknowledged live head',async()=>{
 const b=await make();b.review.revisions=b.review.revisions.slice(0,1);b.review.current_revision=1;
 b.review.head=b.review.revisions[0];b.review.verdict=b.review.head.verdict;
 b.challenges=[];b.review.challenge_ids=[];b.review.pending_challenge_id='';b.review.status='ASSESSED';
 b.review.acknowledged_revisions=[1];b.review.acknowledged_revision=1;await redigest(b);
 const live=structuredClone(archive.reviews[0]);live.acknowledged_revisions=[1];live.acknowledged_revision=1;
 const result=await compareAudit(b,config,{...reads(),readReview:async()=>live});
 assert.equal(result.status,'HISTORICAL_MATCH');
 assert.equal(result.packageRevision,1);assert.equal(result.packageRevisionAcknowledged,true);
 assert.equal(result.liveRevision,2);assert.equal(result.liveRevisionAcknowledged,false);
});
test('counterclaim normalization follows Python whitespace rather than JavaScript trim or whitespace',()=>{
 assert.equal(normalizeCounterclaim('\u0085Alpha\u001c\u001fBeta\u0085'),'alpha beta');
 assert.equal(normalizeCounterclaim('\ufeffAlpha\ufeff'),'\ufeffalpha\ufeff');
 assert.equal(normalizeCounterclaim(' A\u00a0B\u1680C\u2007D\u202fE\u3000'),'a b c d e');
});
test('valid Python-normalized Unicode counterclaim passes package verification',async()=>{
 const b=await make();b.challenges[0].explanation='Alpha\u0085Beta\u001cGamma';
 b.challenges[0].claim_digest=await sha256('alpha beta gamma');await redigest(b);
 assert.equal((await verifyAudit(b,config)).status,'CONSISTENT');
});
test('legitimate pending historical challenge still matches after live resolution',async()=>{
 const b=await pendingHistoricalPackage();
 assert.equal((await verifyAudit(b,config)).status,'CONSISTENT');
 assert.equal((await compareAudit(b,config,reads())).status,'HISTORICAL_MATCH');
});
for(const [name,value] of [['outcome','UPHELD'],['resolution_revision',2],['reason','Invented decision']]) {
 test('pending challenge rejects fabricated '+name+' before live provenance comparison',async()=>{
  const b=await pendingHistoricalPackage();b.challenges[0][name]=value;await redigest(b);
  await assert.rejects(verifyAudit(b,config),/fabricated resolution/);
  await assert.rejects(compareAudit(b,config,reads()),/fabricated resolution/);
 });
}
test('pending challenge cannot carry otherwise-valid resolved citations',async()=>{
 const b=await pendingHistoricalPackage();b.challenges[0].citations=structuredClone(b.review.revisions[0].items[0].citations);await redigest(b);
 assert.ok(b.challenges[0].citations.length);
 await assert.rejects(compareAudit(b,config,reads()),/fabricated resolution/);
});
test('pending challenge must bind to package head rather than an older known revision',async()=>{
 const b=await make(),pending=structuredClone(b.challenges[0]);
 Object.assign(pending,{id:'next-pending',explanation:'A distinct claim',status:'PENDING',outcome:'',resolution_revision:0,reason:'',citations:[]});
 pending.claim_digest=await sha256(normalizeCounterclaim(pending.explanation));
 b.challenges.push(pending);b.review.challenge_ids.push(pending.id);b.review.status='CHALLENGED';b.review.pending_challenge_id=pending.id;
 await redigest(b);await assert.rejects(verifyAudit(b,config),/package current revision/);
});
