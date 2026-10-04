import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'D:/ChromiumRTXCuda/src/out/RTXCuda/chrome.exe',headless:true,chromiumSandbox:true});
try {
 const source=await readFile('dist/kernels/optix.cu','utf8');
 const referenceApp=execFileSync('git',['show','6e3efb8:app.js'],{encoding:'utf8'}).replace('time=0,last=0','time=10,last=0').replace('paused=false,dirty=true','paused=true,dirty=true');
 const pages=[];const app=(await readFile('dist/app.js','utf8')).replace('time=0,last=0','time=10,last=0').replace('paused=false,dirty=true','paused=true,dirty=true');
 for(const variant of ['reference','optimized']) {
  const ctx=await browser.newContext({viewport:{width:1600,height:1000}}),p=await ctx.newPage();
  await p.route('**/app.js*',r=>r.fulfill({contentType:'application/javascript',body:variant==='reference'?referenceApp:app}));
  if(variant==='reference')await p.route('**/kernels/optix.cu',r=>r.fulfill({contentType:'text/plain',body:source.replace(/__device__ (?:__noinline__ )?/g,'__device__ __noinline__ ')}));
  await p.goto('http://127.0.0.1:5198');await p.waitForFunction(()=>showcaseDiagnostics.ready);
  const c=await ctx.newCDPSession(p),{targetInfo}=await c.send('Target.getTargetInfo');
  await c.send('Browser.setPermission',{permission:{name:'native-gpu'},setting:'granted',origin:'http://127.0.0.1:5198',browserContextId:targetInfo.browserContextId});
  await p.evaluate(()=>showcase.native(true));await p.evaluate(()=>showcase.pose({yaw:.3,pitch:.21,distance:10.5,time:10}));
  assert.equal(await p.evaluate(()=>showcaseDiagnostics.native),true);assert.deepEqual(await p.evaluate(()=>showcaseDiagnostics.errors),[]);pages.push(p);
 }
 const values=[[],[]],poses=[{yaw:.3,pitch:.21,distance:10.5,time:10},{yaw:2.4,pitch:.8,distance:4.5,time:10},{yaw:4.8,pitch:.08,distance:35,time:10}];
 const images=[];
 for(const pose of poses){
  for(let i=0;i<30;i++)for(const j of (i%2?[1,0]:[0,1])){
   const p=pages[j],n=await p.evaluate(()=>showcaseDiagnostics.frames);await p.evaluate(pose=>showcase.pose(pose),pose);await p.waitForFunction(n=>showcaseDiagnostics.frames>n,n);
   if(i>=5)values[j].push(await p.evaluate(()=>showcaseDiagnostics.frameMs));
  }
  const pixels=[];for(const p of pages)pixels.push(await p.evaluate(()=>showcase.pixels()));
  let changed=0;for(let i=0;i<pixels[0].length;i++)if(pixels[0][i]!==pixels[1][i])changed++;
  images.push({pose,pixels:pixels[0].length,changed});let maxDelta=0,totalDelta=0;for(let i=0;i<pixels[0].length;i++)for(let c=0;c<3;c++){const d=Math.abs(((pixels[0][i]>>>(c*8))&255)-((pixels[1][i]>>>(c*8))&255));maxDelta=Math.max(maxDelta,d);totalDelta+=d;}Object.assign(images.at(-1),{maxChannelDelta:maxDelta,meanChannelDelta:totalDelta/(pixels[0].length*3)});assert.ok(totalDelta/(pixels[0].length*3)<0.1,'Visible image drift');
 }
 const timings=values.map(v=>{v.sort((a,b)=>a-b);return {median:v[Math.floor(v.length/2)],p95:v[Math.floor(v.length*.95)],count:v.length};});
 const result={reference:timings[0],optimized:timings[1],images};console.log(JSON.stringify(result));await writeFile('captures/native-comparison.json',JSON.stringify(result,null,2));
}finally{await browser.close();}
