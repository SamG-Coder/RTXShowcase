// Render exactly one measured frame at a time, without requestAnimationFrame.
// Compile/allocation/warm-up and timing readback are outside the measured interval.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const arg=(key,fallback)=>process.argv.find(x=>x.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const width=Number(arg('width','3840')),height=width*9/16,repeats=Number(arg('repeats','3'));
const layouts=process.argv.includes('--layouts'),variant=arg('variant','default');
let nativeSource=await readFile('dist/kernels/native-render.cu','utf8');
if(variant==='inline-water')nativeSource=nativeSource.replace('__noinline__ WaterOptics water_optics','__forceinline__ WaterOptics water_optics');
else if(variant==='inline-trace')nativeSource=nativeSource.replace('__noinline__ float3 trace_color','__forceinline__ float3 trace_color');
else assert.equal(variant,'default');
const url=arg('url','http://127.0.0.1:5198/');
assert(width%64===0&&height%8===0);
let app=await readFile('dist/app.js','utf8');
const replace=(from,to)=>{assert(app.includes(from),`Missing instrumentation anchor: ${from}`);app=app.replace(from,to);};
if(layouts)replace('[width/8,height/8,1]','[width/kernel.block[0],height/kernel.block[1],1]');
replace('const submission=await batch.submit();','const submittedAt=performance.now();const submission=await batch.submit();const returnedAt=performance.now();');
replace('if(canvasTarget)canvasTarget.present(image);','const presentationAt=performance.now();if(canvasTarget)canvasTarget.present(image);');
replace("if(diagnostics.profilePhase==='water')await runtime.idle();","const presentationEnqueuedAt=performance.now();if(diagnostics.profilePhase==='water')await runtime.idle();");
replace('const ended=performance.now();','const ended=performance.now();window.lastFrameTiming={recordMs:submittedAt-start,submitResponseMs:returnedAt-submittedAt,presentationEnqueueMs:presentationEnqueuedAt-presentationAt,drawReturnMs:ended-start};');
replace('await setup(false);requestAnimationFrame(frame);',`await setup(false);window.singleFrame={
 layout(block){kernel.block=block;},
 async select(value){await setup(value);if(native!==value)throw Error('Requested backend unavailable');time=10;await resize();},
 async warm(){diagnostics.profilePhase=null;for(let i=0;i<12;i++){while(await draw()===false)await new Promise(r=>setTimeout(r,5));await runtime.idle();}},
 async measure(phase){
  diagnostics.profilePhase=phase==='all'?null:phase;await runtime.idle();
  let query,original;
  if(native)await runtime.native.api.execute('cuda.profile',JSON.stringify({frames:1,$session:runtime.native.session}));
  else {query=runtime.device.createQuerySet({type:'timestamp',count:2});original=runtime.batch.bind(runtime);runtime.batch=()=>original({timestampWrites:{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}});}
  // Wait for a free compositor surface BEFORE measuring; no prior GPU work remains.
  if(canvasTarget){const deadline=performance.now()+5000;while(!canvasTarget.surfaces.some(s=>s.nativeResource.available)){if(performance.now()>deadline)throw Error('Timed out waiting for a compositor surface');await new Promise(r=>setTimeout(r,5));}}
  const began=performance.now();const drawn=await draw();if(drawn===false)throw Error('Surface backpressure invalidated single-frame measurement');
  await runtime.idle();const completedMs=performance.now()-began;
  let gpu;
  if(native)gpu=JSON.parse(await runtime.native.api.execute('cuda.profile',JSON.stringify({frames:0,$session:runtime.native.session})));
  else {runtime.batch=original;const d=runtime.device,resolve=d.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),read=d.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const e=d.createCommandEncoder();e.resolveQuerySet(query,0,2,resolve,0);e.copyBufferToBuffer(resolve,0,read,0,16);d.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(read.getMappedRange());gpu={computeMs:Number(t[1]-t[0])/1e6};read.unmap();read.destroy();resolve.destroy();query.destroy();}
  return {phase,completedMs,...window.lastFrameTiming,gpu,gpuTimingAvailable:!native||gpu.frames.length>0,width,height,backend:diagnostics.backend,presentation:diagnostics.presentation};
 },describe(){return runtime.describe();}
};`);
const browser=await chromium.launch({executablePath:arg('browser','D:/ChromiumRTXCuda/src/out/RTXCuda/chrome.exe'),headless:true,chromiumSandbox:true});
const timeout=setTimeout(()=>{console.error('Single-frame benchmark timed out');void browser.close();},240000);
const results={width,height,samples:4,bounces:6,repeats,notes:['Identical frozen scene at time=10, analytic sphere renderer, 12 warm-up frames.','Native renderer uses one full-image dispatch with hardware grid limits.','No animation loop or FPS measurement. Each sample is exactly one isolated frame.','CUDA event intervals can include host launch gaps; WebGPU timestamps enclose its compute pass.','completedMs includes explicit GPU idle IPC and is not kernel time or display scanout.'],backends:[]};
try{
 for(const native of (layouts?[true]:[false,true])){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1}),page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/app.js*',route=>route.fulfill({contentType:'application/javascript',body:app}));
  await page.route('**/kernels/native-render.cu',route=>route.fulfill({contentType:'text/plain',body:nativeSource}));
  await page.goto(url);await page.waitForFunction(()=>window.singleFrame,null,{timeout:120000});
  await page.selectOption('#quality',String(width));await page.selectOption('#samples','4');await page.fill('#bounces','6');
  if(native){const cdp=await ctx.newCDPSession(page);const {targetInfo}=await cdp.send('Target.getTargetInfo');await cdp.send('Browser.setPermission',{permission:{name:'native-gpu'},setting:'granted',origin:new URL(url).origin,browserContextId:targetInfo.browserContextId});}
  await page.evaluate(v=>singleFrame.select(v),native);await page.evaluate(()=>singleFrame.warm());
  const result={native,device:await page.evaluate(()=>singleFrame.describe()),frames:[]};
  for(const block of (layouts?[[8,8,1],[16,4,1],[32,2,1],[16,8,1]]:[null])){if(block)await page.evaluate(b=>singleFrame.layout(b),block);
  for(const phase of (layouts?['render']:['all','render','water']))for(let i=0;i<repeats;i++){
   const frame=await page.evaluate(phase=>singleFrame.measure(phase),phase);assert.equal(frame.width,width);assert.equal(frame.height,height);frame.block=block;result.frames.push(frame);console.log(JSON.stringify({native,repeat:i,...frame}));
  }
  }
  assert.deepEqual(errors,[]);results.backends.push(result);await mkdir('captures',{recursive:true});await writeFile('captures/single-frame-'+width+(layouts?'-layouts':'')+(variant==='default'?'':'-'+variant)+'.json',JSON.stringify(results,null,2));await ctx.close();
 }
 await mkdir('captures',{recursive:true});await writeFile('captures/single-frame-'+width+(layouts?'-layouts':'')+(variant==='default'?'':'-'+variant)+'.json',JSON.stringify(results,null,2));
}finally{clearTimeout(timeout);await browser.close();}
