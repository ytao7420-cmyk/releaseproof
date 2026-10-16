// Resumeable, zero-value end-to-end test on simulated GenLayer Studionet only.
// The creator and challenger are self-controlled auxiliary test actors.
// This harness does not read another project's wallets or transact on mainnet.
import {createClient, createAccount, generatePrivateKey} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {assertExecutionSucceeded, terminalStatus} from '../src/receipt.js';

let config=JSON.parse(await readFile(new URL('../public/deployment.json',import.meta.url),'utf8'));
const preset=JSON.parse(await readFile(new URL('../public/demo-preset.json',import.meta.url),'utf8'));
const deploying=process.argv.includes('--deploy');
if(studionet.id!==61999 || config.chainId!==61999 || (!deploying && (!config.deployed || !/^0x[\da-f]{40}$/i.test(config.address||'')))) {
  throw new Error('Requires the deployed ReleaseProof Studionet contract. No transaction was sent.');
}
const local=new URL('../.local/',import.meta.url);
await mkdir(local,{recursive:true,mode:0o700});
const keyPath=new URL('live-test-wallets.json',local);
let keys;
try{keys=JSON.parse(await readFile(keyPath,'utf8'));}
catch(error){
  if(error.code!=='ENOENT')throw error;
  keys={creator:generatePrivateKey(),challenger:generatePrivateKey()};
  await writeFile(keyPath,JSON.stringify(keys),{mode:0o600,flag:'wx'});
}
await chmod(keyPath,0o600);
const creator=createClient({chain:studionet,account:createAccount(keys.creator)});
const challenger=createClient({chain:studionet,account:createAccount(keys.challenger)});
const reader=createClient({chain:studionet});
if(deploying){
 const source=await readFile(new URL('../contracts/releaseproof.py',import.meta.url),'utf8');
 const sourceSha256=createHash('sha256').update(source).digest('hex');
 const expectedSha=process.argv.find(arg=>arg.startsWith('--source-sha='))?.slice('--source-sha='.length);
 assert.equal(sourceSha256,expectedSha,'Deployment requires --source-sha matching the reviewed source.');
 assert.ok(source.includes('class ReleaseProof(gl.Contract):'),'Unexpected contract source.');
 const deployKeyPath=new URL('deploy-test-wallet.json',local);
 let deployKey;
 try{deployKey=JSON.parse(await readFile(deployKeyPath,'utf8')).privateKey;}
 catch(error){if(error.code!=='ENOENT')throw error;deployKey=generatePrivateKey();await writeFile(deployKeyPath,JSON.stringify({privateKey:deployKey}),{mode:0o600,flag:'wx'});}
 await chmod(deployKeyPath,0o600);
 const deployer=createClient({chain:studionet,account:createAccount(deployKey)});
 const deployStatePath=new URL(`deployment-${sourceSha256}.json`,local);
 let deployed;
 try{deployed=JSON.parse(await readFile(deployStatePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!deployed){
  const hash=await deployer.deployContract({code:source,args:[],leaderOnly:false});
  deployed={hash,sourceSha256,deployer:deployer.account.address};
  await writeFile(deployStatePath,JSON.stringify(deployed,null,2));
 }
 assert.equal(deployed.sourceSha256,sourceSha256);
 assert.equal(deployed.deployer,deployer.account.address);
 console.log(JSON.stringify({label:'Deploy reviewed ReleaseProof on Studionet',hash:deployed.hash,sourceSha256}));
 const receipt=await wait(deployed.hash);
 const address=receipt.data?.contract_address||receipt.txDataDecoded?.contractAddress||receipt.to_address;
 assert.match(address||'',/^0x[\da-f]{40}$/i,'Deployment receipt has no valid contract address.');
 const chainCode=await reader.getContractCode(address);
 assert.equal(createHash('sha256').update(chainCode).digest('hex'),sourceSha256,'Deployed source hash mismatch.');
 config={network:'GenLayer Studionet',chainId:61999,rpc:'https://studio.genlayer.com/api',explorer:'https://explorer-studio.genlayer.com',deployed:true,address,deployer:deployer.account.address,deployerNotice:'Self-controlled auxiliary test deployer, not the Portal wallet or a customer.',deploymentTransaction:deployed.hash,deploymentStatus:receipt.statusName,deploymentConsensus:receipt.result_name??receipt.resultName??receipt.result,sourceSha256};
 await writeFile(new URL('../public/deployment.json',import.meta.url),JSON.stringify(config,null,2));
 await writeFile(deployStatePath,JSON.stringify({...deployed,...config},null,2));
 console.log(JSON.stringify({deployed:true,address,sourceSha256,actor:deployer.account.address,status:receipt.statusName}));
}

assert.notEqual(creator.account.address,challenger.account.address,'Separate test actors are required.');
const transcriptPath=new URL(`live-transcript-${config.address.toLowerCase()}.json`,local);
let transcript=[];
try{transcript=JSON.parse(await readFile(transcriptPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const save=()=>writeFile(transcriptPath,JSON.stringify(transcript,null,2));
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const canonical=value=>JSON.stringify(sort(value));
function sort(value){
 if(Array.isArray(value))return value.map(sort);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
 return value;
}
const digestOf=value=>{const {digest,...preimage}=value;return sha(canonical(preimage));};
async function read(method,args=[]){return JSON.parse(await reader.readContract({address:config.address,functionName:method,args}));}
async function wait(hash){
 for(let n=0;n<150;n++){
  let receipt;
  try{receipt=await reader.getTransaction({hash});}
  catch(error){if(n===149)throw error;await new Promise(resolve=>setTimeout(resolve,4000));continue;}
  if(terminalStatus(receipt)){
   try{return assertExecutionSucceeded(receipt);}
   catch(error){
    await writeFile(new URL(`failed-receipt-${hash}.json`,local),JSON.stringify(receipt,null,2));
    Object.defineProperty(error,'receipt',{value:receipt,enumerable:false});
    throw error;
   }
  }
  if(n%8===0)console.log(JSON.stringify({hash,status:receipt.statusName||receipt.status}));
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
 throw new Error(`Pending ${hash}. Rerun resumes this transaction; no blind resubmission.`);
}
function capture(receipt,item){
 item.status=receipt.statusName||String(receipt.status);
 item.execution='SUCCESS';
 item.consensusResult=receipt.result_name??receipt.resultName??receipt.result;
 item.votes=receipt.consensus_data?.votes||{};
 item.leaderOnly=receipt.leader_only;
 item.createdAt=receipt.created_at;
 item.observedAt=new Date().toISOString();
}
async function write(label,client,method,args){
 let item=transcript.find(entry=>entry.label===label);
 if(item){
  assert.equal(item.method,method,'Resume method differs from recorded transaction.');
  assert.deepEqual(item.args,args,'Resume arguments differ from recorded transaction.');
  assert.equal(item.actor.toLowerCase(),client.account.address.toLowerCase(),'Resume actor differs.');
 }else{
  const hash=await client.writeContract({address:config.address,functionName:method,args,value:0n,leaderOnly:false});
  item={label,hash,method,args,actor:client.account.address,status:'PENDING',execution:'UNCONFIRMED',submittedAt:new Date().toISOString()};
  transcript.push(item);await save();
 }
 console.log(JSON.stringify({label,hash:item.hash}));
 let receipt;
 try{receipt=await wait(item.hash);}
 catch(error){
  if(error.receipt){
   item.status=error.receipt.statusName||String(error.receipt.status);
   item.execution='NOT_COMMITTED';
   item.consensusResult=error.receipt.result_name??error.receipt.resultName??error.receipt.result;
   item.votes=error.receipt.consensus_data?.votes||{};
   item.leaderOnly=error.receipt.leader_only;
   item.failure=error.message;
   item.observedAt=new Date().toISOString();
   await save();
  }
  throw error;
 }
 capture(receipt,item);await save();return item.hash;
}
function verifyFrozen(review){
 const snapshot=review.snapshot;
 assert.ok(snapshot?.digest,'Source snapshot missing.');
 assert.equal(snapshot.repo,preset.repo);
 assert.equal(snapshot.commit_sha,preset.commitSha);
 assert.equal(snapshot.release.tag_name,preset.tag);
 assert.equal(snapshot.tag_chain.at(-1).sha,preset.commitSha);
 assert.equal(snapshot.tag_chain.at(-1).type,'commit');
 assert.equal(snapshot.digest,digestOf(snapshot),'Snapshot canonical digest mismatch.');
 assert.equal(snapshot.sources.length,2);
 assert.equal(snapshot.sources.find(source=>source.id==='release').text,snapshot.release.body);
 for(const source of snapshot.sources){assert.equal(source.sha256,sha(source.text),'Frozen original source digest mismatch.');}
 return snapshot.digest;
}
function verifyCitations(citations,snapshot){
 for(const citation of citations){
  const source=snapshot.sources.find(s=>s.id===citation.source_id);assert.ok(source,'Unknown source citation.');
  const ids=citation.line_ids;assert.ok(ids.length&&ids.every(Number.isInteger));
  assert.deepEqual(ids,[...new Set(ids)].sort((a,b)=>a-b));
  const lines=source.text.split('\n');assert.ok(ids[0]>=1&&ids.at(-1)<=lines.length);
  assert.equal(citation.quote,lines.slice(ids[0]-1,ids.at(-1)).join('\n'),'Citation is not original frozen text.');
 }
}
function verifyHistory(review,snapshotDigest){
 assert.equal(verifyFrozen(review),snapshotDigest,'Source snapshot mutated during workflow.');
 let parent='';
 for(const [index,revision] of review.revisions.entries()){
  assert.equal(revision.number,index+1);
  assert.equal(revision.parent_digest,parent,'Revision parent does not link to prior digest.');
  assert.equal(revision.snapshot_digest,snapshotDigest,'Revision uses different source evidence.');
  assert.equal(revision.digest,digestOf(revision),'Revision canonical digest mismatch.');
  assert.deepEqual(revision.items.map(item=>item.dimension),['runtime','api','deployment']);
  for(const item of revision.items)verifyCitations(item.citations,review.snapshot);
  verifyCitations(revision.challenge_citations,review.snapshot);
  parent=revision.digest;
 }
 assert.equal(review.head.digest,parent);
 assert.deepEqual(review.head,review.revisions.at(-1));
 assert.equal(review.current_revision,review.revisions.length);
}

const reviewId=preset.id;
await write('Create frozen upgrade request',creator,'create_review',[reviewId,preset.repo,preset.tag,preset.commitSha,preset.changelogPath,preset.integrationContext]);
let review=await read('get_review',[reviewId]);
assert.equal(review.creator.toLowerCase(),creator.account.address.toLowerCase());
assert.equal(review.integration_context,preset.integrationContext);
await write('Snapshot official upstream sources',creator,'snapshot_sources',[reviewId]);
review=await read('get_review',[reviewId]);
const snapshotDigest=verifyFrozen(review);
await write('Assess upgrade against frozen sources',creator,'assess',[reviewId]);
review=await read('get_review',[reviewId]);
verifyHistory(review,snapshotDigest);
const initial=review.revisions[0];
const actualInitial=Object.fromEntries(initial.items.map(item=>[item.dimension,item.status]));
console.log(JSON.stringify({initialVerdict:initial.verdict,actualInitial,expectedInitial:preset.expectedInitial,expectationsMatched:canonical(actualInitial)===canonical(preset.expectedInitial)}));

// Resume must retain the original targeted revision, even after a successful resolution.
const challengeArgs=transcript.find(item=>item.method==='challenge')?.args || [reviewId,preset.challenge.id,preset.challenge.explanation,review.current_revision];
await write('Different test actor challenges runtime conclusion',challenger,'challenge',challengeArgs);
let challenge=await read('get_challenge',[preset.challenge.id]);
assert.equal(challenge.challenger.toLowerCase(),challenger.account.address.toLowerCase());
assert.equal(challenge.explanation,preset.challenge.explanation);
assert.equal(challenge.snapshot_digest,snapshotDigest);
assert.equal(challenge.base_digest,review.revisions[challenge.base_revision-1].digest);
await write('Resolve challenge using same frozen evidence',creator,'resolve_challenge',[preset.challenge.id]);
review=await read('get_review',[reviewId]);challenge=await read('get_challenge',[preset.challenge.id]);
verifyHistory(review,snapshotDigest);
assert.equal(challenge.status,'RESOLVED');
assert.ok(['UPHELD','REJECTED','INCONCLUSIVE'].includes(challenge.outcome));
assert.equal(review.pending_challenge_id,'');
assert.equal(challenge.resolution_revision,review.current_revision);
assert.equal(review.head.challenge_id,challenge.id);
assert.equal(review.head.challenge_outcome,challenge.outcome);
const prior=review.revisions[challenge.base_revision-1];
if(['REJECTED','INCONCLUSIVE'].includes(challenge.outcome))assert.deepEqual(review.head.items,prior.items,'Non-upheld challenge changed original findings.');
else assert.notDeepEqual(review.head.items.map(item=>item.status),prior.items.map(item=>item.status),'Upheld challenge did not change a conclusion.');
verifyCitations(challenge.citations,review.snapshot);
console.log(JSON.stringify({challengeOutcome:challenge.outcome,currentRevision:review.current_revision,verdict:review.head.verdict}));
const ackArgs=transcript.find(item=>item.method==='acknowledge_revision')?.args || [reviewId,review.current_revision];
await write('Creator acknowledges current reviewed revision',creator,'acknowledge_revision',ackArgs);
review=await read('get_review',[reviewId]);
verifyHistory(review,snapshotDigest);
assert.equal(review.acknowledged_revision,review.current_revision);
assert.ok(review.acknowledged_revisions.includes(review.current_revision));
for(const item of transcript){const receipt=await reader.getTransaction({hash:item.hash});assertExecutionSucceeded(receipt);capture(receipt,item);}
await save();
const challenges=await read('get_challenges',[reviewId]);
const archive={
 recordedAt:new Date().toISOString(),contractAddress:config.address,chainId:61999,network:config.network,explorer:config.explorer,
 notice:preset.notice,actors:{creator:creator.account.address,challenger:challenger.account.address},
 verification:{snapshotDigest,sourceHashesVerified:true,revisionDigestChainVerified:true,exactSourceCitationsVerified:true,acknowledgmentReadBack:true,expectedInitial:preset.expectedInitial,actualInitial,expectationsMatched:canonical(actualInitial)===canonical(preset.expectedInitial)},
 reviews:[review],challenges,transactions:transcript
};
await mkdir(new URL('../public/evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/evidence/demo.json',import.meta.url),JSON.stringify(archive,null,2));
console.log(JSON.stringify({complete:true,transactions:transcript.length,initialVerdict:initial.verdict,challengeOutcome:challenge.outcome,currentRevision:review.current_revision,acknowledgedRevision:review.acknowledged_revision,output:'public/evidence/demo.json'}));
