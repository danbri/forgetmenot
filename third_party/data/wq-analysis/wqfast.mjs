const BASE="https://questions-statements-api.parliament.uk/api/writtenquestions/questions";
import { writeFileSync } from 'node:fs';
const from=process.argv[2], to=process.argv[3], out=process.argv[4];
const CONC=40;
const UA={headers:{"User-Agent":"forgetmenot/0.1 (+https://github.com/danbri/forgetmenot)"}};
async function page(skip){
  const u=`${BASE}?house=Commons&tabledWhenFrom=${from}&tabledWhenTo=${to}&take=100&skip=${skip}`;
  for(let i=0;i<6;i++){
    try{const r=await fetch(u,UA); if(!r.ok)throw new Error("HTTP "+r.status); return await r.json();}
    catch(e){await new Promise(r=>setTimeout(r,800*(i+1)));}
  }
  throw new Error("fail skip "+skip);
}
const t0=Date.now();
const first=await page(0);
const total=first.totalResults;
const counts={};
const tally=res=>{for(const r of res){const v=r.value||r;counts[v.askingMemberId]=(counts[v.askingMemberId]||0)+1;}};
tally(first.results||[]);
const skips=[]; for(let s=100;s<total;s+=100) skips.push(s);
const npages=skips.length+1;
let done=1;
async function worker(){
  while(skips.length){
    const s=skips.shift();
    const j=await page(s); tally(j.results||[]); done++;
    if(done%50===0) console.error(`${done}/${npages} pages  (${((Date.now()-t0)/1000).toFixed(0)}s)`);
  }
}
await Promise.all(Array.from({length:CONC},worker));
const entries=Object.entries(counts).map(([id,n])=>({id:+id,n})).sort((a,b)=>b.n-a.n);
const sum=entries.reduce((a,e)=>a+e.n,0);
writeFileSync(out,JSON.stringify({from,to,total,distinctMembers:entries.length,sum,entries},null,1));
console.error(`DONE ${out} total=${total} distinct=${entries.length} summed=${sum} in ${((Date.now()-t0)/1000).toFixed(0)}s`);
