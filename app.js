import {GpuRuntime} from './vendor/webcuda/runtime/runtime.js';
const $=id=>document.getElementById(id),canvas=$('scene'),context=canvas.getContext('webgpu');
let runtime,kernel,pipeline,scene,vertices,image,width=0,height=0,native=false,busy=false,inFrame=false,ready=false,time=0,last=0,yaw=.30,pitch=.21,distance=10.5,orbit=false,paused=false,dirty=true;
const diagnostics=window.showcaseDiagnostics={ready:false,backend:'initializing',errors:[],frames:0};
const sources=await Promise.all(['render.json','geometry.json','geometry.cu','optix.cu'].map(f=>fetch('./kernels/'+f).then(r=>{if(!r.ok)throw Error('Could not load '+f);return f.endsWith('.json')?r.json():r.text();})));
let tour=false,tourStart=0;
function error(e){const message=String(e.message||e);diagnostics.errors.push(message);$('error').textContent=message;$('error').hidden=false;}
async function setup(wantNative){
 busy=true;diagnostics.ready=false;$('loading').hidden=false;$('loadText').textContent=wantNative?'Compiling native RTX reflections…':'Compiling WebCuda reflections…';$('native').disabled=true;
 while(inFrame)await new Promise(r=>setTimeout(r,10));
 try{
  if(runtime)await runtime.dispose();runtime=await GpuRuntime.create({backend:'webgpu',onError:error});
  native=false;
  if(wantNative){await runtime.enableNativeInterop({requirements:{optix:true,sharedBuffers:true,gpuBufferToTexture:true,resources:2,maxResourceBytes:3840*2160*4,sharedBytes:64*1024*1024}});if(!runtime.native)throw Error(runtime.nativeInteropStatus?.reason||runtime.nativeInteropStatus?.optix?.reason||'OptiX is unavailable on this device.');native=true;}
  if(native){
   vertices=await runtime.createSharedBuffer(73728*16);
   const geometry=await runtime.native.kernel(sources[2],{entry:'geometry',workgroupSize:[64,1,1]});
   scene=await runtime.native.createAccelerationStructure({vertexCount:73728,vertexStride:16,allowUpdate:false});
   pipeline=await runtime.native.rayTracingPipeline(sources[3],{maxTraceDepth:1,numPayloadValues:2,parameters:[{name:'image',type:'buffer',element:'uint'},...['yaw','pitch','distance','time','strength','sunAngle'].map(name=>({name,type:'f32'})),{name:'bounces',type:'i32'},{name:'samples',type:'i32'}]});
   await runtime.native.batch().dispatch(geometry.bind({vertices}),[1152,1,1]).buildAccelerationStructure(scene,vertices).submit();
  }else kernel=await runtime.kernel(sources[0]);
  width=height=0;image=null;ready=true;dirty=true;diagnostics.backend=native?'OptiX RTX':'WebCuda / WebGPU';diagnostics.native=native;
  $('backend').textContent=diagnostics.backend;$('native').textContent=native?'On':'Off';$('native').setAttribute('aria-checked',String(native));$('capability').textContent=native?'Hardware ray tracing · all shading in CUDA':'Software ray tracing · CUDA compiled to WebGPU';
 }catch(e){ready=false;error(e);if(wantNative){busy=false;return setup(false);}}
 finally{busy=false;$('loading').hidden=true;$('native').disabled=!navigator.cuda?.getInteropCapabilities;}
}
async function resize(){
 const aspect=innerWidth/innerHeight,w=Math.max(64,Math.floor(Math.min(+$('quality').value,innerWidth*devicePixelRatio)/64)*64),h=Math.max(8,Math.round(w/aspect/8)*8);
 if(w===width&&h===height)return;
 await runtime.idle();if(image)runtime.destroyBuffer(image);image=native?await runtime.createSharedBuffer(w*h*4):runtime.createBuffer(w*h*4);width=w;height=h;canvas.width=w;canvas.height=h;
 context.configure({device:runtime.device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});diagnostics.width=w;diagnostics.height=h;
}
async function draw(){
 await resize();const scalars={yaw,pitch,distance,time,strength:+$('waves').value,sunAngle:+$('sun').value,bounces:+$('bounces').value,samples:+$('samples').value};
 const start=performance.now();
 if(native)await runtime.native.batch().trace(pipeline.bind(scene,{image},scalars),[width,height]).submit();
 else runtime.batch().dispatch(kernel.bind({image},{width,height,...scalars}),[width/8,height/8,1]).submit();
 const e=runtime.device.createCommandEncoder();e.copyBufferToTexture({buffer:image.gpuBuffer,bytesPerRow:width*4},{texture:context.getCurrentTexture()},[width,height]);runtime.device.queue.submit([e.finish()]);await runtime.idle();
 diagnostics.frameMs=performance.now()-start;diagnostics.frames++;diagnostics.ready=true;diagnostics.bounces=scalars.bounces;
 if(diagnostics.frames%10===0)$('stats').textContent=`${diagnostics.backend} · ${width} × ${height} · ${diagnostics.frameMs.toFixed(1)} ms · ${scalars.bounces} bounces`;
}
async function frame(now){
 if(!busy&&ready&&(!paused||dirty)){inFrame=true;try{const dt=Math.min(.05,last?(now-last)/1000:1/60);if(!paused)time+=dt;if(orbit&&!paused)yaw+=dt*.10;if(tour){const t=(now-tourStart)/1000;yaw=.3+t*.085;pitch=.20+.13*Math.sin(t*.14);distance=9.4+1.1*Math.sin(t*.17);$('sun').value=String(.48+.25*Math.sin(t*.08));}await draw();dirty=false;}catch(e){error(e);ready=false;}finally{inFrame=false;}}
 last=now;requestAnimationFrame(frame);
}
$('native').onclick=async()=>{if(busy)return;$('error').hidden=true;if(native){await setup(false);return;}try{if(await navigator.cuda.requestPermission()!=='granted'){$('capability').textContent='Permission denied. WebGPU remains active.';return;}await setup(true);}catch(e){error(e);}};
$('hide').onclick=()=>{document.body.classList.toggle('clean');$('hide').textContent=document.body.classList.contains('clean')?'Show controls':'Hide controls';};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};$('orbit').onclick=()=>{orbit=!orbit;$('orbit').textContent='Auto orbit: '+(orbit?'On':'Off');};
$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
for(const id of ['quality','bounces','waves','sun','samples'])$(id).oninput=()=>{dirty=true;$('bounceValue').textContent=$('bounces').value;};
let pointer=null,x=0,y=0;canvas.onpointerdown=e=>{pointer=e.pointerId;x=e.clientX;y=e.clientY;canvas.setPointerCapture(pointer);};canvas.onpointermove=e=>{if(e.pointerId!==pointer)return;yaw-=(e.clientX-x)*.006;pitch=Math.max(.06,Math.min(1.35,pitch+(e.clientY-y)*.006));x=e.clientX;y=e.clientY;dirty=true;};canvas.onpointerup=canvas.onpointercancel=()=>pointer=null;
canvas.onwheel=e=>{e.preventDefault();distance=Math.max(4.5,Math.min(35,distance*Math.exp(e.deltaY*.001)));dirty=true;};addEventListener('resize',()=>dirty=true);
window.showcase={tour(value){tour=value;tourStart=performance.now();paused=false;},async native(value){if(value&&await navigator.cuda.queryPermission()!=='granted')throw Error('Grant native GPU permission first');await setup(value);},async pose(value){while(inFrame)await new Promise(r=>setTimeout(r,5));Object.assign(diagnostics,{capturePose:value});yaw=value.yaw??yaw;pitch=value.pitch??pitch;distance=value.distance??distance;time=value.time??time;paused=true;dirty=true;},pause(){paused=true;},cinematic(value){document.body.classList.toggle('cinematic',value);},async pixels(){while(inFrame)await new Promise(r=>setTimeout(r,5));return Array.from(await runtime.read(image,Uint32Array));}};
if(!navigator.cuda?.getInteropCapabilities){$('native').disabled=true;$('capability').textContent='Open in ChromiumRTXCuda to enable native RTX.';}
await setup(false);requestAnimationFrame(frame);
