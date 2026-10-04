// Benchmark frame throughput, not the new enqueue-only HUD against old GPU
// completion timing. Drain GPU work once at the end of each measured run.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const frames=200,results=[];
const browser=await chromium.launch({executablePath:'D:/ChromiumRTXCuda/src/out/RTXCuda/chrome.exe',
 headless:true,chromiumSandbox:true,args:['--disable-frame-rate-limit']});
try {
 const ctx=await browser.newContext({viewport:{width:1600,height:1000}}),page=await ctx.newPage();
 const app=(await readFile('dist/app.js','utf8')).replace('if(!paused)time+=dt;','');
 await page.route('**/app.js*',route=>route.fulfill({contentType:'application/javascript',body:app}));
 await page.goto('http://127.0.0.1:5198');
 const c=await ctx.newCDPSession(page),{targetInfo}=await c.send('Target.getTargetInfo');
 await c.send('Browser.setPermission',{permission:{name:'native-gpu'},setting:'granted',
  origin:'http://127.0.0.1:5198',browserContextId:targetInfo.browserContextId});
 for(const texture of [true,false]) {
  await page.goto('http://127.0.0.1:5198/'+(texture?'?texturePresentation':''));
  await page.waitForFunction(()=>showcaseDiagnostics.ready,null,{timeout:120000});
  await page.evaluate(()=>showcase.native(true));
  await page.waitForFunction(()=>showcaseDiagnostics.ready&&showcaseDiagnostics.native,null,{timeout:120000});
  for(let repeat=0;repeat<3;repeat++) {
   const result=await page.evaluate(async count=>{
    const tick=()=>new Promise(requestAnimationFrame);
    showcase.resume();const warm=showcaseDiagnostics.frames;while(showcaseDiagnostics.frames<warm+15)await tick();
    showcase.pause();await showcase.idle();
    const first=showcaseDiagnostics.frames,skips=showcaseDiagnostics.backpressureFrames||0,start=performance.now();
    showcase.resume();while(showcaseDiagnostics.frames<first+count){if(showcaseDiagnostics.errors.length)throw Error(showcaseDiagnostics.errors.join('\n'));await tick();}
    showcase.pause();await showcase.idle();
    const milliseconds=performance.now()-start,submittedFrames=showcaseDiagnostics.frames-first;
    return {milliseconds,submittedFrames,fps:submittedFrames*1000/milliseconds,
      millisecondsPerFrame:milliseconds/submittedFrames,backpressureFrames:(showcaseDiagnostics.backpressureFrames||0)-skips,
      presentation:showcaseDiagnostics.presentation,width:showcaseDiagnostics.width,height:showcaseDiagnostics.height,
      bounces:showcaseDiagnostics.bounces,errors:showcaseDiagnostics.errors};
   },frames);
   assert.deepEqual(result.errors,[]);assert.equal(result.presentation,texture?'Shared texture / canvas copy':'Native canvas / no copy');
   results.push(result);console.log(JSON.stringify(result));
  }
 }
 await writeFile('captures/presentation-throughput.json',JSON.stringify({
  scope:'GPU-drained submitted-frame throughput; headless frame-rate limit disabled; not monitor scan-out FPS',results},null,2));
} finally {await browser.close();}
