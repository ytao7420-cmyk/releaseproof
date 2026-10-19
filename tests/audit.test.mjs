import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAudit,verifyAudit,compareAudit,parseAudit,canonical,sha256} from '../src/audit.js';
const archive=JSON.parse(fs.readFileSync(new URL('../public/evidence/demo.json',import.meta.url)));
const config=JSON.parse(fs.readFileSync(new URL('../public/deployment.json',import.meta.url)));
const code=fs.readFileSync(new URL('../contracts/releaseproof.py',import.meta.url),'utf8');
const make=()=>createAudit({review:archive.reviews[0],challenges:archive.challenges,config,mode:'recorded'});
const redigest=async b=>{const {digest,...rest}=b;b.digest=await sha256(canonical(rest));return b;};
const reads=()=>({readReview:async()=>structuredClone(archive.reviews[0]),readChallenges:async()=>structuredClone(archive.challenges),readCode:async()=>code});
test('real recorded review exports and verifies without relying on archive verification booleans',async()=>{
 const b=await make(),r=await verifyAudit(b,config);assert.equal(r.status,'CONSISTENT');assert.equal(r.revisions,2);assert.equal(r.currentAcknowledged,true);assert.match(r.trust,/not chain|rewritten/);
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
