import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {createAudit,verifyAudit,compareAudit,parseAudit} from '../src/audit.js';
const config=JSON.parse(await readFile(new URL('../public/deployment.json',import.meta.url),'utf8'));
const args=process.argv.slice(2), file=args.find(x=>!x.startsWith('--'));
if(!file)throw new Error('Usage: node scripts/audit.mjs bundle.json [--export-demo] [--online]');
let bundle;
if(args.includes('--export-demo')){
 const archive=JSON.parse(await readFile(new URL('../public/evidence/demo.json',import.meta.url),'utf8'));
 bundle=await createAudit({review:archive.reviews[0],challenges:archive.challenges,config,mode:'recorded'});
 await writeFile(file,JSON.stringify(bundle,null,2)+'\n');
}else bundle=parseAudit(await readFile(file,'utf8'));
let result=await verifyAudit(bundle,config);
if(args.includes('--online')){
 const reader=createClient({chain:studionet});
 const read=async(method,id)=>{const x=await reader.readContract({address:config.address,functionName:method,args:[id]});return typeof x==='string'?JSON.parse(x):x;};
 result=await compareAudit(bundle,config,{readReview:id=>read('get_review',id),readChallenges:id=>read('get_challenges',id),readCode:()=>reader.getContractCode(config.address)});
}
console.log(JSON.stringify(result,null,2));
