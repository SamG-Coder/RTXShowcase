// Resource and dispatch glue only. All water simulation and shading are CUDA.
export async function createWater(runtime,native,loading){
 const names=await fetch('./kernels/water-entries.json').then(r=>r.json()),kernels={},buffers={};
 const source=native?await fetch('./kernels/water-native.cu').then(r=>r.text()):null;
 for(const name of names){loading.textContent='Preparing ClearWater FFT · '+name;const artifact=await fetch('./kernels/'+name+'.json').then(r=>r.json());kernels[name]=native?await runtime.native.kernel(source,{entry:name,workgroupSize:artifact.metadata.workgroupSize}):await runtime.kernel(artifact);}
 const sizes={motion:114688*4,twiddles:64*8,seed:49152*16,fft0:49152*8,fft1:49152*8,surface:49152*16,coefficientTemp:49152*16,coefficients:49152*16,sandState:16384*16,seaMemory:32768*4,brush:48,disturbance:16384*16,light:512*512*16,monoLight:4,photons:512*512*16,camera:131104*16};
 for(const [name,size] of Object.entries(sizes))buffers[name]=native?await runtime.createSharedBuffer(new Uint8Array(size)):runtime.createBuffer(new Uint8Array(size));
 let previousDepth=-1,previousWind=-1,previousSky=-Infinity,lastTime=0;
 function batch(){return native?runtime.native.batch():runtime.batch();}
 function dispatch(b,name,resources,scalars,grid){return b.dispatch(kernels[name].bind(resources,scalars),grid);}
 const B=buffers;
 return {buffers:B,async update({yaw,pitch,distance,depth,sunAngle,time,strength,wind}){
  const b=batch(),dt=Math.max(0,Math.min(.05,time-lastTime));lastTime=time;
  dispatch(b,'showcase_camera',{camera:B.camera},{yaw,pitch,distance,depth,sunAngle},[1,1,1]);
  if(previousWind<0)dispatch(b,'weather_map',{camera:B.camera},{clock:40000,season:172,mapSize:256},[32,16,1]);
  dispatch(b,'weather_update',{camera:B.camera},{clock:40000,season:172,time,dt,baseWind:wind,enabled:1,mapSize:256,skyWidth:512,refresh:0},[1,1,1]);
  dispatch(b,'showcase_sun',{camera:B.camera},{sunAngle},[1,1,1]);
  if(time-previousSky>.15||previousDepth<0||sunAngle!==this.sun){dispatch(b,'weather_sky',{camera:B.camera},{skyWidth:512},[64,16,1]);previousSky=time;this.sun=sunAngle;}
  if(wind!==previousWind){dispatch(b,'seed_modes',{seed:B.seed,twiddles:B.twiddles},{wind},[16,16,3]);previousWind=wind;}
  if(depth!==previousDepth){dispatch(b,'prepare_modes',{motion:B.motion,camera:B.camera},{depth,time},[16,16,3]);previousDepth=depth;}
  dispatch(b,'spectrum',{output:B.fft0,seed:B.seed,disturbance:B.disturbance,motion:B.motion,camera:B.camera,seaMemory:B.seaMemory},{time,energy:strength},[16,16,2]);
  dispatch(b,'fft_local',{input:B.fft0,output:B.fft1,twiddles:B.twiddles},{axis:0},[128,1,2]);
  dispatch(b,'fft_local',{input:B.fft1,output:B.fft0,twiddles:B.twiddles},{axis:1},[128,1,2]);
  dispatch(b,'resolve',{input:B.fft0,surface:B.surface},{},[16,16,2]);
  dispatch(b,'sand_transport',{brush:B.brush,surface:B.surface,camera:B.camera,sandState:B.sandState},{dt,depth,pressureActive:0,useGlobeDepth:0},[16,16,1]);
  dispatch(b,'surface_coefficients',{input:B.surface,output:B.coefficientTemp},{axis:0},[16,16,2]);
  dispatch(b,'surface_coefficients',{input:B.coefficientTemp,output:B.coefficients},{axis:1},[16,16,2]);
  dispatch(b,'caustic_clear',{photons:B.photons},{dispersion:1,lightSize:512},[64,64,1]);
  dispatch(b,'caustic_map',{surface:B.coefficients,camera:B.camera,photons:B.photons},{depth,rays:1024,dispersion:1,lightSize:512},[128,128,1]);
  dispatch(b,'caustic_resolve',{photons:B.photons,light:B.light,monoLight:B.monoLight},{normalization:16384,dispersion:1,lightSize:512},[64,64,1]);
  await b.submit();
 },resources(){return Object.fromEntries(['brush','sandState','surface','coefficients','light','monoLight','camera'].map(n=>[n,B[n]]));}};
}
