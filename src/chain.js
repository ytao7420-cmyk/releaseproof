import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import deployment from '../public/deployment.json';
import { assertExecutionSucceeded, terminalStatus, hasConsensusFailure } from './receipt.js';

const readClient = createClient({ chain: studionet });
let walletClient;
let walletAddress = '';
let connectedProvider;
const announcedProviders = new Map();
if (typeof window !== 'undefined') {
  // Keep listening: extensions may announce after the application has loaded.
  window.addEventListener('eip6963:announceProvider', event => {
    const detail = event.detail;
    if (typeof detail?.provider?.request !== 'function' || typeof detail?.info?.uuid !== 'string' || typeof detail?.info?.rdns !== 'string') return;
    if (!announcedProviders.has(detail.info.uuid)) announcedProviders.set(detail.info.uuid, detail);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
let listener = () => {};
let busy = false;
const notify = (status, message, hash = '') => listener({status, message, hash});
const pendingKey = 'releaseproof.pending.v1';
function definitiveFailure(receipt) {
  if (!terminalStatus(receipt)) return false;
  if (hasConsensusFailure(receipt)) return true;
  const status=String(receipt.statusName || receipt.status_name || receipt.status).toUpperCase();
  if (!['ACCEPTED','FINALIZED','5','7'].includes(status)) return true;
  const list=receipt.consensus_data?.leader_receipt;
  const leader=(Array.isArray(list)?list:[list]).filter(x=>x?.mode==='leader').at(-1);
  return leader?.execution_result==='ERROR' || leader?.result?.status==='error';
}
export function onStatus(callback) { listener = callback || (() => {}); }
export const getWalletAddress = () => walletAddress;
export const loadDeployment = async () => getConfig();
export const txUrl = hash => /^0x[0-9a-f]{64}$/i.test(hash || '') ? `${deployment.explorer}/tx/${hash}` : '';
export const DEPLOYMENT = deployment;
export function getConfig() { return {...deployment, ready: deployment.deployed && /^0x[0-9a-fA-F]{40}$/.test(deployment.address)}; }
function requireDeployment() { if (!getConfig().ready) throw new Error('The project contract has not been deployed yet.'); }
function provider() {
  if (!connectedProvider) throw new Error('Connect MetaMask first.');
  return connectedProvider;
}
async function discoverMetaMask() {
  const announced = () => [...announcedProviders.values()].find(detail => detail.info.rdns === 'io.metamask')?.provider;
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  if (!announced()) await new Promise(resolve => setTimeout(resolve, 250));
  if (announced()) return announced();
  // Older MetaMask versions may expose only the legacy injected provider.
  const injected = window.ethereum;
  const candidates = [...(Array.isArray(injected?.providers) ? injected.providers : []), injected];
  const legacy = candidates.find(candidate => typeof candidate?.request === 'function' && candidate.isMetaMask && !candidate.isSubWallet && !candidate.isSubwallet && ![...announcedProviders.values()].some(detail => detail.provider === candidate && detail.info.rdns !== 'io.metamask'));
  if (!legacy) throw new Error('MetaMask was not found. Enable MetaMask for this site, then reconnect.');
  return legacy;
}
async function ensureNetwork(p) {
  let id = await p.request({method:'eth_chainId'});
  if (Number(id) !== deployment.chainId) {
    try { await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xf22f'}]}); }
    catch (e) {
      if (e.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
      await p.request({method:'wallet_addEthereumChain',params:[{chainId:'0xf22f',chainName:'GenLayer Studio',nativeCurrency:{name:'GEN',symbol:'GEN',decimals:18},rpcUrls:[deployment.rpc],blockExplorerUrls:[deployment.explorer]}]});
    }
    id = await p.request({method:'eth_chainId'});
  }
  if (Number(id) !== deployment.chainId) throw new Error('Switch your wallet to GenLayer Studio (61999) before submitting.');
}
export async function connectWallet() {
  const p = await discoverMetaMask();
  const accounts = await p.request({method:'eth_requestAccounts'});
  if (!accounts[0]) throw new Error('No wallet account was selected.');
  await ensureNetwork(p);
  walletAddress = accounts[0];
  walletClient = createClient({chain:studionet,account:walletAddress,provider:p});
  connectedProvider = p;
  notify('connected',`Connected ${walletAddress}`);
  return walletAddress;
}
async function read(method,args=[]) {
  requireDeployment();
  const value = await readClient.readContract({address:deployment.address,functionName:method,args});
  return typeof value === 'string' ? JSON.parse(value) : value;
}
export const readContract = (method, args=[]) => read(method, args);

export async function waitForExecution(hash, {attempts=90, interval=4000}={}) {
  for (let n=0;n<attempts;n++) {
    let receipt;
    try { receipt = await readClient.getTransaction({hash}); }
    catch (e) {
      if (n === attempts-1) throw new Error(`Could not retrieve transaction ${hash}. Use its explorer link before retrying.`);
      notify('pending','Waiting for the network to return the transaction…',hash);
      await new Promise(r=>setTimeout(r,interval)); continue;
    }
    notify('pending',`Consensus status: ${receipt.statusName || receipt.status}. Waiting for execution…`,hash);
    if (terminalStatus(receipt)) return assertExecutionSucceeded(receipt);
    await new Promise(r=>setTimeout(r,interval));
  }
  throw new Error(`The network is still processing ${hash}. Do not resubmit blindly; use “Resume pending transaction”.`);
}
async function verifyAction(method,args) {
  const v=await read(method==='challenge'||method==='resolve_challenge'?'get_challenge':'get_review', [method==='challenge'?args[1]:args[0]]);
  if(method==='create_review'&&(v.id!==args[0]||v.repo!==args[1]||v.commit_sha!==args[3])) throw new Error('Created review read-back mismatch.');
  if(method==='snapshot_sources'&&(!v.snapshot?.digest||v.snapshot.commit_sha!==v.commit_sha)) throw new Error('Source snapshot was not confirmed.');
  if(method==='assess'&&(!v.head?.digest||v.current_revision<1)) throw new Error('Assessment was not found after execution.');
  if(method==='challenge'&&(v.id!==args[1]||v.base_revision!==args[3]||v.explanation!==args[2])) throw new Error('Challenge read-back mismatch.');
  if(method==='resolve_challenge'&&(v.status!=='RESOLVED'||!v.resolution_revision)) throw new Error('Challenge resolution was not confirmed.');
  if(method==='acknowledge_revision'&&!v.acknowledged_revisions?.includes(args[1])) throw new Error('Acknowledged revision read-back mismatch.');
  return v;
}
async function write(method,args) {
  requireDeployment();
  if (busy) throw new Error('Another transaction is still being processed.');
  if (localStorage.getItem(pendingKey)) throw new Error('A transaction is pending. Resume its status before creating another.');
  if (!walletClient) throw new Error('Connect your wallet first.');
  busy=true;
  let hash;
  try {
    const p=provider();
    const accounts=await p.request({method:'eth_accounts'});
    if (accounts[0]?.toLowerCase()!==walletAddress.toLowerCase()) throw new Error('Your wallet account changed. Reconnect before submitting.');
    await ensureNetwork(p);
    notify('signing','Review the zero-value Studionet transaction in your wallet.');
    hash=await walletClient.writeContract({address:deployment.address,functionName:method,args,value:0n,leaderOnly:false});
    localStorage.setItem(pendingKey,JSON.stringify({hash,method,args,address:deployment.address}));
    notify('pending','Transaction submitted. Waiting for validator consensus…',hash);
    let receipt;
    try {receipt=await waitForExecution(hash);} catch(e) {
      // Keep uncertain transactions recoverable; clear only known terminal failures.
      try {if(definitiveFailure(await readClient.getTransaction({hash}))) localStorage.removeItem(pendingKey);} catch {}
      throw e;
    }
    const value=await verifyAction(method,args);
    localStorage.removeItem(pendingKey);
    notify('success','Execution succeeded and the resulting contract state was read back.',hash);
    return {hash,value};
  } catch(e) {notify('error',e.shortMessage||e.message||'Transaction failed.',hash);throw e;}
  finally {busy=false;}
}
export function pendingTransaction() {try {return JSON.parse(localStorage.getItem(pendingKey));} catch{return null;}}
export async function resumePendingTransaction() {
  const pending=pendingTransaction();
  if(!pending) throw new Error('There is no pending transaction.');
  if(pending.address!==deployment.address) throw new Error('The pending transaction belongs to a different contract. Inspect its explorer link.');
  if(busy) throw new Error('A transaction is already processing.');
  busy=true;
  try {
    await waitForExecution(pending.hash);
    await verifyAction(pending.method,pending.args);
    localStorage.removeItem(pendingKey);
    notify('success','Pending transaction completed; contract state verified.',pending.hash);
    return pending;
  } catch(e) {
    try {if(definitiveFailure(await readClient.getTransaction({hash:pending.hash}))) localStorage.removeItem(pendingKey);}catch{}
    notify('error',e.message,pending.hash); throw e;
  } finally{busy=false;}
}
export async function sendWrite(method,args,onProgress) {
  const allowed=['create_review','snapshot_sources','assess','challenge','resolve_challenge','acknowledge_revision'];
  if(!allowed.includes(method)) throw new Error('Unknown ReleaseProof action.');
  onStatus(onProgress);
  return write(method,args);
}
export const getPending = pendingTransaction;
export async function resumePending(onProgress) { onStatus(onProgress); return resumePendingTransaction(); }
export async function loadDemo() {
  const response=await fetch(`${import.meta.env.BASE_URL}evidence/demo.json`);
  if(!response.ok) throw new Error('Recorded evidence is not available yet. Switch to Live to inspect the contract.');
  let data;
  try {data=await response.json();} catch {throw new Error('Recorded evidence is unavailable: invalid archive response.');}
  if(!data?.recordedAt||!data?.contractAddress||!data?.transactions?.length||!data?.reviews?.length) throw new Error('The demonstration has not been recorded yet.');
  return data;
}

// Used by deploy.html during local development; the production entry has no deployment control.
export async function deployProject(source, onProgress) {
  if(!walletClient) throw new Error('Connect MetaMask first.');
  if(!source.includes('class ReleaseProof(')) throw new Error('Unexpected contract source.');
  const account=(await provider().request({method:'eth_accounts'}))[0];
  if(account?.toLowerCase()!==walletAddress.toLowerCase()) throw new Error('Reconnect the wallet after switching accounts.');
  await ensureNetwork(provider());
  const code=new TextEncoder().encode(source);
  const sourceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',code))).map(x=>x.toString(16).padStart(2,'0')).join('');
  onStatus(onProgress);
  let pending; try {pending=JSON.parse(localStorage.getItem('releaseproof.deploy.pending') || 'null');} catch {}
  if(pending && (pending.sourceSha256!==sourceSha256||pending.account.toLowerCase()!==account.toLowerCase())) throw new Error('A different deployment is still pending. Inspect its saved hash before deploying again.');
  const hash=pending?.hash || await walletClient.deployContract({code,args:[],leaderOnly:false});
  localStorage.setItem('releaseproof.deploy.pending',JSON.stringify({hash,sourceSha256,account}));
  notify('pending','Deployment submitted',hash);
  const receipt=await waitForExecution(hash,{attempts:120,interval:4000});
  const result={hash,status:receipt.statusName,address:receipt.to_address||receipt.toAddress||receipt.contract_address,sourceSha256,account};
  localStorage.setItem('releaseproof.deploy.completed',JSON.stringify(result));
  localStorage.removeItem('releaseproof.deploy.pending');
  return result;
}
