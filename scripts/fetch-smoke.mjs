// Independent, zero-value test-only deployment on simulated GenLayer Studionet.
// No mainnet support. The auxiliary test wallet is self-controlled, not a user.
import {createClient, createAccount, generatePrivateKey} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises';
import {assertExecutionSucceeded, terminalStatus} from '../src/receipt.js';

if (studionet.id !== 61999) throw new Error('This diagnostic is Studionet-only.');
const local = new URL('../.local/', import.meta.url);
await mkdir(local, {recursive:true, mode:0o700});
const keyPath = new URL('fetch-smoke-wallet.json', local);
let privateKey;
try {privateKey = JSON.parse(await readFile(keyPath,'utf8')).privateKey;}
catch (error) {if(error.code !== 'ENOENT') throw error; privateKey=generatePrivateKey(); await writeFile(keyPath, JSON.stringify({privateKey}), {mode:0o600, flag:'wx'});}
await chmod(keyPath, 0o600);
const client=createClient({chain:studionet, account:createAccount(privateKey)});
const statePath=new URL('fetch-smoke.json',local);
let state={network:'GenLayer Studionet',chainId:61999,actor:client.account.address,testOnly:true};
try {state=JSON.parse(await readFile(statePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const save=()=>writeFile(statePath,JSON.stringify(state,null,2));
const source=`# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import hashlib
import json

class FetchSmoke(gl.Contract):
    result: str
    def __init__(self):
        self.result = "{}"

    @gl.public.write
    def inspect(self):
        def fetch():
            result = []
            urls = [
                "https://api.github.com/repos/fastify/fastify/releases/tags/v5.0.0",
                "https://raw.githubusercontent.com/fastify/fastify/6bde7d7b0a51010d56df901cab9be5d9351b0d91/docs/Guides/Migration-Guide-V5.md"
            ]
            for url in urls:
                response = gl.nondet.web.get(url)
                body = response.body
                result.append({"url": url, "status": getattr(response, "status", None), "status_code": getattr(response, "status_code", None), "body_bytes":len(body), "body_sha256":hashlib.sha256(body).hexdigest(), "body_preview":body[:160].decode("utf-8")})
            return result
        result = gl.eq_principle.strict_eq(fetch)
        self.result = json.dumps(result, sort_keys=True)

    @gl.public.view
    def get_result(self) -> str:
        return self.result
`;
async function wait(hash){
 for(let n=0;n<100;n++){
  const receipt=await client.getTransaction({hash});
  if(terminalStatus(receipt)){assertExecutionSucceeded(receipt); return receipt;}
  if(n%6===0)console.log(JSON.stringify({hash,status:receipt.statusName}));
  await new Promise(r=>setTimeout(r,3000));
 }
 throw new Error(`Pending ${hash}. Rerun resumes.`);
}
if(!state.deploymentHash){state.deploymentHash=await client.deployContract({code:source,args:[],leaderOnly:false});await save();}
let receipt=await wait(state.deploymentHash);
state.address=receipt.data?.contract_address || receipt.txDataDecoded?.contractAddress || receipt.to_address;
if(!state.address)throw new Error(`Deployment returned no address: ${JSON.stringify(Object.keys(receipt))}`);
state.deploymentStatus=receipt.statusName;await save();
if(!state.fetchHash){state.fetchHash=await client.writeContract({address:state.address,functionName:'inspect',args:[],value:0n,leaderOnly:false});await save();}
receipt=await wait(state.fetchHash);
state.fetchStatus=receipt.statusName;
state.votes=receipt.consensus_data?.votes||{};
state.leaderOnly=receipt.leader_only;
state.execution='SUCCESS';
state.result=JSON.parse(await client.readContract({address:state.address,functionName:'get_result',args:[]}));
state.recordedAt=new Date().toISOString(); await save();
console.log(JSON.stringify(state,null,2));
