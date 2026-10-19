// Portable evidence verification. Local consistency is not chain authenticity.
export const AUDIT_SCHEMA = 'releaseproof-audit-v1';
export const MAX_AUDIT_BYTES = 2_000_000;
const check = (ok, message) => { if (!ok) throw new Error(message); };
const eq = (a,b) => canonical(a) === canonical(b);
export function canonical(value, depth=0) {
  check(depth <= 40, 'Evidence nesting exceeds forty levels.');
  if(value===null || typeof value==='string' || typeof value==='boolean') return JSON.stringify(value);
  if(typeof value==='number') {check(Number.isSafeInteger(value),'Evidence numbers must be safe integers.');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(x=>canonical(x,depth+1)).join(',')+']';
  check(value && typeof value==='object','Unsupported evidence value.');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';
}
export async function sha256(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
const withoutDigest = value => Object.fromEntries(Object.entries(value).filter(([k])=>k!=='digest'));
const digestOf = value => sha256(canonical(withoutDigest(value)));
export function parseAudit(text) {
  check(typeof text==='string' && new TextEncoder().encode(text).length<=MAX_AUDIT_BYTES,'Audit package exceeds 2 MB.');
  return JSON.parse(text);
}
export async function createAudit({review,challenges,config,mode,exportedAt=new Date().toISOString()}) {
  const data=structuredClone({schema:AUDIT_SCHEMA,exportedAt,origin:mode==='live'?'live-rpc-read':'recorded-archive',
    chainId:config.chainId,contractAddress:config.address,contractSourceSha256:config.sourceSha256,
    review,challenges:challenges.filter(c=>c.review_id===review.id)});
  data.digest=await digestOf(data);
  await verifyAudit(data,config);
  return data;
}
function citations(items,sources,required=false) {
  check(Array.isArray(items)&&items.length<=6,'Invalid citation collection.');
  check(!required||items.length>0,'Definite finding lacks source citations.');
  for(const c of items){
    const s=sources.find(x=>x.id===c.source_id), ids=c.line_ids;
    check(s && Array.isArray(ids) && ids.length>=1 && ids.length<=20,'Unknown source or invalid citation lines.');
    check(ids.every(Number.isSafeInteger)&&eq(ids,[...new Set(ids)].sort((a,b)=>a-b)),'Citation lines are not unique ordered integers.');
    const lines=s.text.split('\n');
    check(ids[0]>=1 && ids.at(-1)<=lines.length,'Citation is outside frozen source.');
    check(c.quote===lines.slice(ids[0]-1,ids.at(-1)).join('\n'),'Citation text differs from frozen source.');
  }
}
export async function verifyAudit(bundle,config) {
  check(bundle?.schema===AUDIT_SCHEMA,'Unsupported audit schema.');
  const serialized=canonical(bundle);
  check(new TextEncoder().encode(serialized).length<=MAX_AUDIT_BYTES,'Audit package exceeds 2 MB.');
  check(config.chainId===61999 && bundle.chainId===config.chainId,'Unexpected chain.');
  check(bundle.contractAddress?.toLowerCase()===config.address?.toLowerCase(),'Package belongs to another contract.');
  check(bundle.contractSourceSha256===config.sourceSha256,'Contract source commitment differs.');
  check(bundle.digest===await digestOf(bundle),'Package digest mismatch.');
  const r=bundle.review, s=r?.snapshot;
  check(r && typeof r.id==='string'&&r.id.length<=80 && s,'Assessed review with source snapshot required.');
  check(s.repo===r.repo && s.commit_sha===r.commit_sha && s.release?.tag_name===r.tag,'Source identity differs from review.');
  check(s.tag_chain?.at(-1)?.type==='commit'&&s.tag_chain.at(-1).sha===r.commit_sha,'Tag does not resolve to pinned commit.');
  check(s.digest===await digestOf(s),'Snapshot digest mismatch.');
  check(Array.isArray(s.sources)&&s.sources.length===2&&eq(s.sources.map(x=>x.id),['release','migration']),'Expected release and migration evidence.');
  for(const source of s.sources){
    check(typeof source.text==='string'&&source.sha256===await sha256(source.text),'Source content hash mismatch.');
  }
  check(s.sources[0].text===s.release.body,'Release body and source text differ.');
  check(Array.isArray(r.revisions)&&r.revisions.length>=1&&r.revisions.length<=4,'Expected one to four revisions.');
  let parent='';
  for(const [i,v] of r.revisions.entries()){
    check(v.number===i+1&&v.parent_digest===parent&&v.snapshot_digest===s.digest,'Broken revision chain or source binding.');
    check(v.digest===await digestOf(v),'Revision digest mismatch.');
    check(Array.isArray(v.items)&&eq(v.items.map(x=>x.dimension),['runtime','api','deployment']),'Review dimensions are missing or reordered.');
    for(const item of v.items){
      check(['NEEDS_CHANGE','NO_CHANGE','UNKNOWN'].includes(item.status),'Invalid finding status.');
      citations(item.citations,s.sources,item.status!=='UNKNOWN');
    }
    const verdict=v.items.some(x=>x.status==='NEEDS_CHANGE')?'NEEDS_CHANGE':v.items.some(x=>x.status==='UNKNOWN')?'UNKNOWN':'NO_CHANGE';
    check(v.verdict===verdict,'Verdict does not follow findings.');
    citations(v.challenge_citations,s.sources);
    check(i===0?v.kind==='INITIAL'&&!v.challenge_id:v.kind==='CHALLENGE'&&Boolean(v.challenge_id),'Invalid revision kind.');
    parent=v.digest;
  }
  check(r.current_revision===r.revisions.length&&eq(r.head,r.revisions.at(-1))&&r.verdict===r.head.verdict,'Current head does not match history.');
  check(Array.isArray(bundle.challenges)&&Array.isArray(r.challenge_ids)&&eq(bundle.challenges.map(c=>c.id).sort(),[...r.challenge_ids].sort()),'Missing, duplicate or foreign challenge records.');
  check(new Set(r.challenge_ids).size===r.challenge_ids.length,'Duplicate challenge id.');
  for(const c of bundle.challenges){
    const base=r.revisions[c.base_revision-1];
    check(c.review_id===r.id&&base?.digest===c.base_digest&&c.snapshot_digest===s.digest,'Challenge binds to a different review, revision or snapshot.');
    check(c.challenger?.toLowerCase()!==r.creator?.toLowerCase(),'Creator challenged own review.');
    check(c.claim_digest===await sha256(c.explanation.trim().replace(/\s+/gu,' ').toLowerCase()),'Counterclaim hash mismatch.');
    citations(c.citations,s.sources);
    if(c.status==='RESOLVED'){
      const v=r.revisions[c.resolution_revision-1];
      check(c.resolution_revision===c.base_revision+1&&v?.challenge_id===c.id&&v.challenge_outcome===c.outcome,'Challenge resolution linkage differs.');
      check(['UPHELD','REJECTED','INCONCLUSIVE'].includes(c.outcome),'Unknown challenge outcome.');
      check(eq(v.challenge_citations,c.citations)&&v.reason===c.reason,'Challenge resolution evidence differs.');
      if(c.outcome!=='UPHELD')check(eq(v.items,base.items),'Rejected/inconclusive challenge rewrote findings.');
    }else check(c.status==='PENDING'&&r.pending_challenge_id===c.id,'Unexpected pending challenge state.');
  }
  for(const v of r.revisions.slice(1))check(bundle.challenges.some(c=>c.id===v.challenge_id&&c.resolution_revision===v.number),'Revision lacks corresponding challenge.');
  const pending=bundle.challenges.filter(c=>c.status==='PENDING');
  check(pending.length<=1&&r.pending_challenge_id===(pending[0]?.id||''),'Pending challenge pointer differs.');
  check(r.status===(pending.length?'CHALLENGED':'ASSESSED'),'Review lifecycle differs.');
  const ack=r.acknowledged_revisions;
  check(Array.isArray(ack)&&ack.every(n=>Number.isSafeInteger(n)&&n>=1&&n<=r.current_revision)&&eq(ack,[...new Set(ack)].sort((a,b)=>a-b)),'Invalid acknowledged revision list.');
  check(r.acknowledged_revision===(ack.at(-1)||0),'Acknowledgement points to a different revision.');
  return {status:'CONSISTENT',reviewId:r.id,revisions:r.revisions.length,sources:s.sources.length,challengeCount:bundle.challenges.length,
    currentAcknowledged:ack.includes(r.current_revision),packageDigest:bundle.digest,
    trust:'Local consistency only. A package and its hashes can be rewritten together. Compare against live contract state to establish RPC-observed provenance.'};
}
export async function compareAudit(bundle,config,{readReview,readChallenges,readCode}) {
  const local=await verifyAudit(bundle,config);
  const code=await readCode();
  const text=typeof code==='string'?code:new TextDecoder().decode(code);
  check(await sha256(text)===config.sourceSha256,'Live contract source differs from configured source hash.');
  const live=await readReview(bundle.review.id);
  const challenges=await readChallenges(bundle.review.id);
  const fields=['id','repo','tag','commit_sha','changelog_path','integration_context','creator','snapshot'];
  check(fields.every(k=>eq(live[k],bundle.review[k])),'Live review identity or frozen evidence differs.');
  check(live.revisions.length>=bundle.review.revisions.length && bundle.review.revisions.every((v,i)=>eq(v,live.revisions[i])),'Live revision history differs.');
  for(const c of bundle.challenges){
    const current=challenges.find(x=>x.id===c.id);
    check(current,'Challenge is absent from live contract.');
    if(c.status==='RESOLVED')check(eq(c,current),'Resolved challenge differs from live state.');
    else for(const field of ['id','review_id','base_revision','base_digest','snapshot_digest','explanation','challenger','claim_digest'])check(eq(c[field],current[field]),'Challenge origin differs from live state.');
  }
  check(bundle.review.acknowledged_revisions.every(n=>live.acknowledged_revisions.includes(n)),'Claimed acknowledgement is absent from live contract.');
  const status=eq(bundle.review,live)&&eq([...bundle.challenges].sort((a,b)=>a.id.localeCompare(b.id)),[...challenges].sort((a,b)=>a.id.localeCompare(b.id)))?'CURRENT_MATCH':'HISTORICAL_MATCH';
  return {...local,status,liveRevision:live.current_revision,checkedAt:new Date().toISOString(),trust:'Matched reads from the configured Studionet RPC and contract source. This is not an independently verified consensus-signature or state-root proof.'};
}
