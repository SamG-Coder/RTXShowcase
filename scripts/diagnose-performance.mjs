// Diagnostic instrumentation is routed into a test page; production rendering
// and quality settings are unchanged. CUDA intervals may include launch gaps.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=')[1]??fallback;
const variant=arg('variant','default'),webgpu=process.argv.includes('--webgpu'),texture=process.argv.includes('--texture');
const width=Number(arg('width','960')),samples=Number(arg('samples','4')),count=Number(arg('count','80'));
const browser=await chromium.launch({executablePath:'D:/ChromiumRTXCuda/src/out/RTXCuda/chrome.exe',headless:true,chromiumSandbox:true,
 args:process.argv.includes('--uncapped')?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]});
const stop=setTimeout(()=>{console.error('Diagnostic timed out');void browser.close();},240000);
try {
 const context=await browser.newContext({viewport:{width:Math.max(1600,width),height:width>1600?Math.round(width*9/16):1000}}),p=await context.newPage();
 const pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message));
 let app=await readFile('dist/app.js','utf8');
 app=app.replace('if(!paused)time+=dt;','time=10;');
 app=app.replace('const submission=await batch.submit();','const beforeSubmit=performance.now();const submission=await batch.submit();const afterSubmit=performance.now();');
 app=app.replace('const ended=performance.now();','const ended=performance.now();if(window.profileSamples)window.profileSamples.push({record:beforeSubmit-start,submit:afterSubmit-beforeSubmit,tail:ended-afterSubmit,total:ended-start,ended});');
 app=app.replace('await setup(false);requestAnimationFrame(frame);',`window.probe={
  async nativeProfile(frames=0){return JSON.parse(await runtime.native.api.execute('cuda.profile',JSON.stringify({frames,$session:runtime.native.session})));},
  describe(){return runtime.describe();},
  startTimestamps(){const device=runtime.device;const querySet=device.createQuerySet({type:'timestamp',count:256});let index=0;const original=runtime.batch.bind(runtime);
   runtime.batch=()=>original({timestampWrites:{querySet,beginningOfPassWriteIndex:index++,endOfPassWriteIndex:index++}});
   this.stopTimestamps=async()=>{runtime.batch=original;const resolve=device.createBuffer({size:2048,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});const output=device.createBuffer({size:2048,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const encoder=device.createCommandEncoder();encoder.resolveQuerySet(querySet,0,index,resolve,0);encoder.copyBufferToBuffer(resolve,0,output,0,index*8);device.queue.submit([encoder.finish()]);await output.mapAsync(GPUMapMode.READ);const timestamps=new BigUint64Array(output.getMappedRange());const values=[];for(let i=0;i<index;i+=2)values.push(Number(timestamps[i+1]-timestamps[i])/1e6);output.unmap();output.destroy();resolve.destroy();querySet.destroy();return values;};
  }
 };await setup(false);requestAnimationFrame(frame);`);
 await p.route('**/app.js*',route=>route.fulfill({contentType:'application/javascript',body:app}));
 if(variant!=='default') {
  let source=await readFile('dist/kernels/native-render.cu','utf8');
  if(variant==='inline')source=source.replaceAll('__noinline__ ','');
  else if(variant==='force-trace')source=source.replace('__noinline__ float3 trace_color','__forceinline__ float3 trace_color');
  else if(variant==='force-water')source=source.replace('__noinline__ WaterOptics water_optics','__forceinline__ WaterOptics water_optics');
  else throw Error('Unknown diagnostic variant');
  await p.route('**/kernels/native-render.cu',route=>route.fulfill({contentType:'text/plain',body:source}));
 }
 await p.goto('http://127.0.0.1:5198/'+(texture?'?texturePresentation':''));
 await p.waitForFunction(()=>showcaseDiagnostics.ready,null,{timeout:120000});
 if(!webgpu){const c=await context.newCDPSession(p),{targetInfo}=await c.send('Target.getTargetInfo');await c.send('Browser.setPermission',{permission:{name:'native-gpu'},setting:'granted',origin:'http://127.0.0.1:5198',browserContextId:targetInfo.browserContextId});const began=Date.now();await p.evaluate(()=>showcase.native(true));const state=await p.evaluate(()=>showcaseDiagnostics);console.log(JSON.stringify({setupSeconds:(Date.now()-began)/1000,native:state.native,errors:state.errors}));assert.equal(state.native,true);assert.deepEqual(state.errors,[]);}
 await p.selectOption('#quality',String(width));await p.selectOption('#samples',String(samples));
 const phases=webgpu?['all','water','render']:['all'];
 const result={variant,webgpu,texture,width,samples,uncapped:process.argv.includes('--uncapped'),phases:[],device:await p.evaluate(()=>probe.describe())};
 for(const phase of phases){
  const timing=await p.evaluate(async({count,phase,webgpu})=>{
   const tick=()=>new Promise(requestAnimationFrame);showcase.profile(phase==='all'?null:phase);showcase.resume();let start=showcaseDiagnostics.frames;
   while(showcaseDiagnostics.frames<start+30)await tick();showcase.pause();await showcase.idle();
   window.profileSamples=[];const first=showcaseDiagnostics.frames,skips=showcaseDiagnostics.backpressureFrames||0,began=performance.now();
   showcase.resume();while(showcaseDiagnostics.frames<first+count){if(showcaseDiagnostics.errors.length)throw Error(showcaseDiagnostics.errors.join('\n'));await tick();}
   showcase.pause();await showcase.idle();const elapsed=performance.now()-began,wall=window.profileSamples;window.profileSamples=null;
   if(webgpu)probe.startTimestamps();else await probe.nativeProfile(32);
   const timedFirst=showcaseDiagnostics.frames;showcase.resume();while(showcaseDiagnostics.frames<timedFirst+32)await tick();showcase.pause();await showcase.idle();
   const gpu=webgpu?await probe.stopTimestamps():await probe.nativeProfile();
   return {phase,frames:showcaseDiagnostics.frames-first-32,elapsed,wall,backpressure:(showcaseDiagnostics.backpressureFrames||0)-skips,gpu,diagnostics:showcaseDiagnostics};
  },{count,phase,webgpu});
  assert.equal(timing.diagnostics.native,!webgpu);assert.deepEqual(timing.diagnostics.errors,[]);result.phases.push(timing);
 }
 assert.deepEqual(pageErrors,[]);await mkdir('captures',{recursive:true});const label=`${webgpu?'webgpu':'native'}-${variant}-${texture?'copy':'canvas'}-${width}-${samples}${result.uncapped?'-uncapped':''}`;
 await writeFile('captures/diagnose-'+label+'.json',JSON.stringify(result,null,2));
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 for(const phase of result.phases){const data={label,phase:phase.phase,fps:phase.frames*1000/phase.elapsed,backpressure:phase.backpressure,wall:{}};for(const key of ['record','submit','tail','total'])data.wall[key]=median(phase.wall.map(s=>s[key]));if(webgpu)data.gpuMedianMs=median(phase.gpu);else{data.gpu={};const names=[...new Set(phase.gpu.frames.flatMap(f=>f.intervals.map(i=>i.phase)))];for(const name of names)data.gpu[name]=median(phase.gpu.frames.map(f=>f.intervals.filter(i=>i.phase===name).reduce((a,b)=>a+b.gpuIntervalMs,0)));data.cpu={};for(const key of Object.keys(phase.gpu.frames[0]?.cpu||{}))data.cpu[key]=median(phase.gpu.frames.map(f=>f.cpu[key]));}console.log(JSON.stringify(data));}
} finally {clearTimeout(stop);await browser.close();}
