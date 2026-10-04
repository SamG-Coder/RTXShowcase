// Diagnostic-only empty workload: never changes deployed kernels or settings.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const empty=process.argv.includes('--empty'),webgpu=process.argv.includes('--webgpu'),texture=process.argv.includes('--texture');
if(empty&&webgpu)throw Error('Empty probe only supports native');
function emptyKernels(source){
 const matches=[...source.matchAll(/__global__ void \w+\([^)]*\)\s*\{/g)].reverse();
 for(const m of matches){let end=m.index+m[0].length,depth=1;while(depth&&end<source.length){depth+=(source[end]==='{')-(source[end]==='}');end++;}source=source.slice(0,m.index+m[0].length)+'return;}'+source.slice(end);}
 return source;
}
const b=await chromium.launch({executablePath:'D:/ChromiumRTXCuda/src/out/RTXCuda/chrome.exe',headless:true,chromiumSandbox:true});
try{
 const ctx=await b.newContext({viewport:{width:1600,height:1000}}),p=await ctx.newPage();
 let app=await readFile('dist/app.js','utf8');
 app=app.replace('const submission=await batch.submit();','const beforeSubmit=performance.now();const submission=await batch.submit();const afterSubmit=performance.now();');
 app=app.replace('const ended=performance.now();', 'const ended=performance.now();diagnostics.split={record:beforeSubmit-start,submit:afterSubmit-beforeSubmit,tail:ended-afterSubmit};');
 await p.route('**/app.js*',r=>r.fulfill({contentType:'application/javascript',body:app}));
 if(empty){
  const water=emptyKernels(await readFile('dist/kernels/water-native.cu','utf8'));
  const optix=(await readFile('dist/kernels/optix.cu','utf8')).replace(/unsigned pixel=render_pixel\([^;]+;/,'unsigned pixel=0xff000000u;');
  await p.route('**/kernels/water-native.cu',r=>r.fulfill({contentType:'text/plain',body:water}));
  await p.route('**/kernels/optix.cu',r=>r.fulfill({contentType:'text/plain',body:optix}));
 }
 await p.goto('http://127.0.0.1:5198/'+(texture?'?texturePresentation':''));await p.waitForFunction(()=>showcaseDiagnostics.ready,null,{timeout:120000});
 if(!webgpu){const c=await ctx.newCDPSession(p),{targetInfo}=await c.send('Target.getTargetInfo');await c.send('Browser.setPermission',{permission:{name:'native-gpu'},setting:'granted',origin:'http://127.0.0.1:5198',browserContextId:targetInfo.browserContextId});await p.evaluate(()=>showcase.native(true));}
 const d=await p.evaluate(()=>showcaseDiagnostics);assert.equal(d.native,!webgpu);assert.deepEqual(d.errors,[]);
 const samples=[];
 for(let i=0;i<70;i++){const n=await p.evaluate(()=>showcaseDiagnostics.frames);await p.evaluate(()=>showcase.pose({yaw:.3,pitch:.21,distance:10.5,time:10}));await p.waitForFunction(n=>showcaseDiagnostics.frames>n,n);if(i>=10)samples.push(await p.evaluate(()=>({...showcaseDiagnostics.split,total:showcaseDiagnostics.frameMs})));}
 const metrics={};for(const key of ['record','submit','tail','total']){const v=samples.map(s=>s[key]).sort((a,b)=>a-b);metrics[key]={median:v[30],p95:v[57]};}
 const result={presentation:texture?'texture-copy':'auto',timingScope:(await p.evaluate(()=>showcaseDiagnostics.timingScope)),mode:empty?'native-empty':webgpu?'webgpu':'native',metrics,diagnostics:await p.evaluate(()=>showcaseDiagnostics)};console.log(JSON.stringify(result));await writeFile('captures/profile-'+result.mode+'-'+result.presentation+'.json',JSON.stringify(result,null,2));
}finally{await b.close();}
