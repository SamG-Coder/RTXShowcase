import {createWater} from './water.js';
import {GpuRuntime} from './vendor/webcuda/runtime/runtime.js';
const $=id=>document.getElementById(id),canvas=$('scene'),context=canvas.getContext('webgpu');
let water,runtime,kernel,image,canvasTarget=null,width=0,height=0,native=false,busy=false,inFrame=false,ready=false,time=0,last=0,yaw=.30,pitch=.21,distance=10.5,orbit=false,paused=false,dirty=true;
const diagnostics=window.showcaseDiagnostics={ready:false,backend:'initializing',errors:[],frames:0};
const sources=await Promise.all(['showcase_render.json','native-render.cu'].map(f=>fetch('./kernels/'+f).then(r=>{if(!r.ok)throw Error('Could not load '+f);return f.endsWith('.json')?r.json():r.text();})));
let tour=false,tourStart=0;
function error(e){const message=String(e.message||e);console.error(diagnostics.stage,message);diagnostics.errors.push(message);$('error').textContent=message;$('error').hidden=false;}
async function setup(wantNative){
 busy=true;diagnostics.ready=false;$('loading').hidden=false;$('loadText').textContent=wantNative?'Compiling native CUDA reflections…':'Compiling WebCuda reflections…';$('native').disabled=true;
 while(inFrame)await new Promise(r=>setTimeout(r,10));
 try{
  if(canvasTarget){canvasTarget.destroy();canvasTarget=null;}if(runtime)await runtime.dispose();runtime=await GpuRuntime.create({backend:'webgpu',onError:error});
  native=false;
  if(wantNative){await runtime.enableNativeInterop({requirements:{sharedTextures:true,sharedBuffers:true,gpuBufferToTexture:true,resources:24,maxResourceBytes:3840*2160*4,sharedBytes:128*1024*1024}});if(!runtime.native)throw Error(runtime.nativeInteropStatus?.reason||'Native CUDA is unavailable on this device.');native=true;}
  kernel=native?await runtime.native.kernel(sources[1],{entry:'showcase_render',workgroupSize:[8,8,1]}):await runtime.kernel(sources[0]);
  diagnostics.stage="water kernels";water=await createWater(runtime,native,$('loadText'));width=height=0;image=null;ready=true;dirty=true;diagnostics.backend=native?'Native CUDA':'WebCuda / WebGPU';diagnostics.native=native;diagnostics.renderer='shared analytic spheres';diagnostics.nativeOwnedBuffers=!!runtime.native?.capabilities.nativeOwnedBuffers;
  $('backend').textContent=diagnostics.backend;$('native').textContent=native?'On':'Off';$('native').setAttribute('aria-checked',String(native));$('capability').textContent=native?'Native CUDA · analytic reflections':'WebGPU · matching analytic reflections';
 }catch(e){ready=false;error(e);if(wantNative){busy=false;return setup(false);}}
 finally{busy=false;$('loading').hidden=true;$('native').disabled=!navigator.cuda?.getInteropCapabilities;}
}
async function resize(){
 const aspect=innerWidth/innerHeight,w=Math.max(64,Math.floor(Math.min(+$('quality').value,innerWidth*devicePixelRatio)/64)*64),h=Math.max(8,Math.round(w/aspect/8)*8);
 if(w===width&&h===height)return;diagnostics.ready=false;
 await runtime.idle();if(canvasTarget){canvasTarget.destroy();canvasTarget=null;image=null;}if(image){if(image.gpuTexture)runtime.destroyTexture(image);else runtime.destroyBuffer(image);}width=w;height=h;canvas.width=w;canvas.height=h;
 context.configure({device:runtime.device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});
 if(native&&runtime.native.capabilities.canvasPresentation&&!new URLSearchParams(location.search).has('texturePresentation')){canvasTarget=await runtime.native.createCanvasTarget(canvas,{context,buffers:3});image=null;}
 else image=native?await runtime.createSharedTexture({width:w,height:h,format:'rgba8unorm'}):runtime.createBuffer(w*h*4);
 diagnostics.presentation=canvasTarget?'Native canvas / no copy':native?'Shared texture / canvas copy':'WebGPU canvas';diagnostics.canvasCopiesPerFrame=canvasTarget?0:1;diagnostics.width=w;diagnostics.height=h;
}
async function draw(){
 await resize();if(canvasTarget){image=canvasTarget.acquire();if(!image){diagnostics.backpressureFrames=(diagnostics.backpressureFrames||0)+1;return false;}}const scalars={yaw,pitch,distance,time,strength:+$('waves').value,sunAngle:+$('sun').value,bounces:+$('bounces').value,samples:+$('samples').value,depth:+$('depth').value,wind:+$('wind').value};
 const start=performance.now();diagnostics.stage="water simulation";const batch=native?runtime.native.batch():runtime.batch();if(diagnostics.profilePhase!=='render')water.record(batch,scalars);diagnostics.stage="render";const resources={image,...water.resources()},renderScalars={depth:scalars.depth,bounces:scalars.bounces,samples:scalars.samples};
 if(diagnostics.profilePhase!=='water')batch.dispatch(kernel.bind(resources,{width,height,...renderScalars}),[width/8,height/8,1]);
 const submission=await batch.submit();diagnostics.nativeSubmissionsPerFrame=native?1:0;if(native)diagnostics.nativeHandoff=submission;
 if(canvasTarget)canvasTarget.present(image);else {const e=runtime.device.createCommandEncoder();if(native)e.copyTextureToTexture({texture:image.gpuTexture},{texture:context.getCurrentTexture()},[width,height]);else e.copyBufferToTexture({buffer:image.gpuBuffer,bytesPerRow:width*4},{texture:context.getCurrentTexture()},[width,height]);runtime.device.queue.submit([e.finish()]);}
 // The canvas copy waits on the CUDA completion fence for image. Waiting for
 // this queue therefore covers the whole native batch without a second IPC
 // request and a context-wide CUDA synchronization. Water-only profiling has
 // no dependency through image, so it must explicitly wait on native work.
 if(diagnostics.profilePhase==='water')await runtime.idle();
 else if(!canvasTarget)await runtime.device.queue.onSubmittedWorkDone();
 const ended=performance.now();diagnostics.frameIntervalMs=diagnostics.lastFrameAt?ended-diagnostics.lastFrameAt:0;diagnostics.lastFrameAt=ended;const interval=diagnostics.frameIntervalMs;diagnostics.averageFrameIntervalMs=interval>0&&interval<1000?(diagnostics.averageFrameIntervalMs?diagnostics.averageFrameIntervalMs*.9+interval*.1:interval):0;diagnostics.frameMs=ended-start;diagnostics.frames++;diagnostics.timingScope=canvasTarget&&diagnostics.profilePhase!=='water'?"CPU submit + presentation enqueue (not GPU completion)":"completed frame";diagnostics.ready=true;diagnostics.bounces=scalars.bounces;diagnostics.water="ClearWater6.1 FFT / PC optics";diagnostics.depth=scalars.depth;
 if(diagnostics.frames%10===0)$('stats').textContent=`${diagnostics.backend} · ${width} × ${height} · ${diagnostics.frameMs.toFixed(1)} ms${canvasTarget?" submit":""} · ${diagnostics.averageFrameIntervalMs?(1000/diagnostics.averageFrameIntervalMs).toFixed(0):"—"} fps · ${scalars.bounces} bounces`;
}
async function frame(now){
 if(!busy&&ready&&(!paused||dirty)){inFrame=true;try{const dt=Math.min(.05,last?(now-last)/1000:1/60);if(!paused)time+=dt;if(orbit&&!paused)yaw+=dt*.10;if(tour){const t=(now-tourStart)/1000;yaw=.3+t*.085;pitch=.20+.13*Math.sin(t*.14);distance=9.4+1.1*Math.sin(t*.17);$('sun').value=String(.48+.30*Math.sin(t*.08));$('depth').value=String(t<18?1.4:t<32?1.4+(t-18)*1.2:t<44?18.2:Math.max(1.4,18.2-(t-44)*1.2));}if(await draw()!==false)dirty=false;}catch(e){error(e);ready=false;}finally{inFrame=false;}}
 last=now;requestAnimationFrame(frame);
}
$('native').onclick=async()=>{if(busy)return;$('error').hidden=true;if(native){await setup(false);return;}try{if(await navigator.cuda.requestPermission()!=='granted'){$('capability').textContent='Permission denied. WebGPU remains active.';return;}await setup(true);}catch(e){error(e);}};
$('hide').onclick=()=>{document.body.classList.toggle('clean');$('hide').textContent=document.body.classList.contains('clean')?'Show controls':'Hide controls';};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};$('orbit').onclick=()=>{orbit=!orbit;$('orbit').textContent='Auto orbit: '+(orbit?'On':'Off');};
$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
for(const id of ['quality','bounces','waves','sun','samples','depth','wind'])$(id).oninput=()=>{dirty=true;$('bounceValue').textContent=$('bounces').value;};
let pointer=null,x=0,y=0;canvas.onpointerdown=e=>{pointer=e.pointerId;x=e.clientX;y=e.clientY;canvas.setPointerCapture(pointer);};canvas.onpointermove=e=>{if(e.pointerId!==pointer)return;yaw-=(e.clientX-x)*.006;pitch=Math.max(.06,Math.min(1.35,pitch+(e.clientY-y)*.006));x=e.clientX;y=e.clientY;dirty=true;};canvas.onpointerup=canvas.onpointercancel=()=>pointer=null;
canvas.onwheel=e=>{e.preventDefault();distance=Math.max(4.5,Math.min(35,distance*Math.exp(e.deltaY*.001)));dirty=true;};addEventListener('resize',()=>dirty=true);
window.showcase={resume(){paused=false;dirty=true;},async idle(){while(inFrame)await new Promise(r=>setTimeout(r,1));await runtime.idle();},profile(phase){if(![null,"water","render"].includes(phase))throw Error("Unknown profiling phase");diagnostics.profilePhase=phase;},tour(value){tour=value;tourStart=performance.now();paused=false;},async native(value){if(value&&await navigator.cuda.queryPermission()!=='granted')throw Error('Grant native GPU permission first');await setup(value);},async pose(value){while(inFrame)await new Promise(r=>setTimeout(r,5));Object.assign(diagnostics,{capturePose:value});yaw=value.yaw??yaw;pitch=value.pitch??pitch;distance=value.distance??distance;time=value.time??time;paused=true;dirty=true;},pause(){paused=true;},cinematic(value){document.body.classList.toggle('cinematic',value);},async pixels(){while(inFrame)await new Promise(r=>setTimeout(r,5));if(canvasTarget){const c=document.createElement("canvas");c.width=width;c.height=height;const ctx=c.getContext("2d");ctx.drawImage(canvas,0,0);return Array.from(new Uint32Array(ctx.getImageData(0,0,width,height).data.buffer));}if(!native)return Array.from(await runtime.read(image,Uint32Array));const copy=runtime.createBuffer(width*height*4);try{const e=runtime.device.createCommandEncoder();e.copyTextureToBuffer({texture:image.gpuTexture},{buffer:copy.gpuBuffer,bytesPerRow:width*4},[width,height]);runtime.device.queue.submit([e.finish()]);return Array.from(await runtime.read(copy,Uint32Array));}finally{runtime.destroyBuffer(copy);}}};
if(!navigator.cuda?.getInteropCapabilities){$('native').disabled=true;$('capability').textContent='Open in ChromiumRTXCuda to enable native CUDA.';}
await setup(false);requestAnimationFrame(frame);
