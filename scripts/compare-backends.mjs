import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'D:/ChromiumRTXCuda/src/out/RTXCuda/chrome.exe',headless:true,chromiumSandbox:true});
try {
 const results=[],pages=[];
 const app=(await readFile('dist/app.js','utf8')).replace('time=0,last=0','time=10,last=0').replace('paused=false,dirty=true','paused=true,dirty=true');
 for(const native of [false,true]){
  const context=await browser.newContext({viewport:{width:1600,height:1000}}),p=await context.newPage();
  await p.route('**/app.js*',r=>r.fulfill({contentType:'application/javascript',body:app}));
  await p.goto('http://127.0.0.1:5198/');await p.waitForFunction(()=>showcaseDiagnostics.ready,null,{timeout:120000});
  if(native){const c=await context.newCDPSession(p),{targetInfo}=await c.send('Target.getTargetInfo');await c.send('Browser.setPermission',{permission:{name:'native-gpu'},setting:'granted',origin:'http://127.0.0.1:5198',browserContextId:targetInfo.browserContextId});await p.evaluate(()=>showcase.native(true));await p.waitForFunction(()=>showcaseDiagnostics.ready,null,{timeout:120000});}
  const d=await p.evaluate(()=>showcaseDiagnostics);assert.equal(d.native,native);assert.equal(d.renderer,'shared analytic spheres');assert.deepEqual(d.errors,[]);pages.push(p);
 }
 const poses=[{yaw:.3,pitch:.21,distance:10.5,time:10},{yaw:2.4,pitch:.8,distance:4.5,time:10},{yaw:4.8,pitch:.08,distance:35,time:10}];
 await mkdir('captures',{recursive:true});
 for(let view=0;view<poses.length;view++){
  const pixels=[];
  for(let backend=0;backend<pages.length;backend++){
   const p=pages[backend];for(let i=0;i<8;i++){const n=await p.evaluate(()=>showcaseDiagnostics.frames);await p.evaluate(pose=>showcase.pose(pose),poses[view]);await p.waitForFunction(n=>showcaseDiagnostics.frames>n,n);}
   await p.evaluate(()=>showcase.idle());pixels.push(await p.evaluate(()=>showcase.pixels()));
   await p.screenshot({path:`captures/matched-${backend?'native':'webgpu'}-${view}.png`});
  }
  let changed=0,maxDelta=0,total=0,large=0,squared=0;
  assert.equal(pixels[0].length,pixels[1].length);
  for(let i=0;i<pixels[0].length;i++){let peak=0;for(let c=0;c<3;c++){const d=Math.abs(((pixels[0][i]>>>(8*c))&255)-((pixels[1][i]>>>(8*c))&255));total+=d;squared+=d*d;maxDelta=Math.max(maxDelta,d);peak=Math.max(peak,d);}if(peak)changed++;if(peak>8)large++;}
  const result={pose:poses[view],pixels:pixels[0].length,changed,maxDelta,meanChannelDelta:total/(pixels[0].length*3),rmsChannelDelta:Math.sqrt(squared/(pixels[0].length*3)),fractionOver8:large/pixels[0].length};console.log(JSON.stringify(result));results.push(result);
 }
 await writeFile('captures/matched-backends.json',JSON.stringify({algorithm:'same analytic CUDA source; native CUDA versus compiled WGSL; identical samples and bounce settings',results},null,2));
 // Different GPU compilers can round arithmetic differently; require close
 // output, without falsely calling the two compilers bit-identical.
 for(const r of results){assert.ok(r.meanChannelDelta<1,JSON.stringify(r));assert.ok(r.fractionOver8<.01,JSON.stringify(r));}
} finally {await browser.close();}
