import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
await mkdir('captures',{recursive:true});const native=process.argv.includes('--native');
const b=await chromium.launch(native?{executablePath:'D:/ChromiumRTXCuda/src/out/RTXCuda/chrome.exe',headless:true,chromiumSandbox:true}:{channel:'msedge',headless:true});
try{const ctx=await b.newContext({viewport:{width:1600,height:1000}}),p=await ctx.newPage();p.on('console',m=>console.log(m.type(),m.text()));p.on('pageerror',e=>console.log('ERROR',e.message));await p.goto('http://127.0.0.1:5198/');await p.waitForFunction(()=>showcaseDiagnostics.ready||showcaseDiagnostics.errors.length,null,{timeout:120000});assert.deepEqual(await p.evaluate(()=>showcaseDiagnostics.errors),[]);
if(native){const c=await ctx.newCDPSession(p),{targetInfo}=await c.send('Target.getTargetInfo');await c.send('Browser.setPermission',{permission:{name:'native-gpu'},setting:'granted',origin:'http://127.0.0.1:5198',browserContextId:targetInfo.browserContextId});await p.evaluate(()=>showcase.native(true));await p.waitForFunction(()=>showcaseDiagnostics.ready||showcaseDiagnostics.errors.length,null,{timeout:120000});assert.deepEqual(await p.evaluate(()=>showcaseDiagnostics.errors),[]);assert.equal(await p.evaluate(()=>showcaseDiagnostics.native),true);}
await p.waitForFunction(()=>showcaseDiagnostics.frames>12);if(native){const d=await p.evaluate(()=>showcaseDiagnostics);assert.equal(d.nativeSubmissionsPerFrame,1);assert.ok(d.nativeHandoff.waitFenceCount<=d.nativeHandoff.resourceCount);if(d.nativeOwnedBuffers)assert.equal(d.nativeHandoff.resourceCount,1);}await p.screenshot({path:'captures/'+(native?'native':'webgpu')+'.png'});const d=await p.evaluate(()=>showcaseDiagnostics);console.log(JSON.stringify(d));await writeFile('captures/'+(native?'native':'webgpu')+'.json',JSON.stringify(d,null,2));if(native){
await p.setViewportSize({width:2560,height:1440});await p.selectOption('#quality','2560');await p.selectOption('#samples','1');
await p.evaluate(()=>{document.getElementById('depth').value='18';document.getElementById('depth').dispatchEvent(new Event('input'));});
await p.waitForFunction(()=>showcaseDiagnostics.depth===18&&showcaseDiagnostics.width===2560);
await p.screenshot({path:'captures/native-deep-1440p.png'});console.log('1440P',JSON.stringify(await p.evaluate(()=>showcaseDiagnostics)));
await p.setViewportSize({width:3840,height:2160});await p.selectOption('#quality','3840');await p.waitForFunction(()=>showcaseDiagnostics.width===3840);
await p.screenshot({path:'captures/native-deep-4k.png'});console.log('4K',JSON.stringify(await p.evaluate(()=>showcaseDiagnostics)));
await p.evaluate(()=>showcase.native(false));await p.waitForFunction(()=>showcaseDiagnostics.ready&&!showcaseDiagnostics.native);assert.deepEqual(await p.evaluate(()=>showcaseDiagnostics.errors),[]);console.log('SWITCH_BACK_OK');
}
}finally{await b.close();}
