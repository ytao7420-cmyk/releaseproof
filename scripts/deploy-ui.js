import {connectWallet, deployProject} from '../src/chain.js';
const out=document.querySelector('#result');
document.querySelector('#connect').onclick=async()=>{try{out.textContent='Connected '+await connectWallet();}catch(e){out.textContent=e.message;}};
document.querySelector('#deploy').onclick=async()=>{const button=document.querySelector('#deploy');button.disabled=true;try{const source=await fetch('/contracts/releaseproof.py').then(r=>{if(!r.ok)throw Error('Source unavailable');return r.text()});out.textContent=JSON.stringify(await deployProject(source,p=>out.textContent=JSON.stringify(p,null,2)),null,2);}catch(e){out.textContent=e.message;}finally{button.disabled=false;}};
