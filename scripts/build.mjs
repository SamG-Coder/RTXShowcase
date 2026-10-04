import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compile,serializableArtifact} from '../vendor/webcuda/compiler/compiler.js';
const read=f=>readFile('src/'+f,'utf8');
const water=await read('clearwater-water.cu'),common=await read('common.cu'),camera=await read('camera.cu'),optics=await read('water-optics.cu'),render=await read('render.cu');
const simulation=water+'\n'+camera,shading=water+'\n'+common+'\n'+optics+'\n'+render,geometry=common+'\n'+await read('geometry.cu');
const entries=['seed_modes','prepare_modes','spectrum','fft_local','resolve','sand_transport','surface_coefficients','caustic_clear','caustic_map','caustic_resolve','weather_map','weather_update','weather_sky','showcase_camera','showcase_sun'];
await mkdir('dist/kernels',{recursive:true});
for(const name of [...entries,'showcase_render','geometry']){
 const workgroupSize=['fft_local','geometry'].includes(name)?[64,1,1]:['weather_update','showcase_camera','showcase_sun'].includes(name)?[1,1,1]:[8,8,1];
 const source=name==='showcase_render'?shading:name==='geometry'?geometry:simulation;
 await writeFile('dist/kernels/'+name+'.json',JSON.stringify(serializableArtifact(compile(source,{entry:name,workgroupSize}))));console.log('Compiled '+name);
}
const declarations='__device__ float terrain_height(const float4 *camera,float3 n);\n__device__ float terrain_ray_altitude(float altitude,float3 ray,float t);\n__device__ float3 weather_sky_sample(float3 d,const float4 *camera);\n';
function removeKernels(source){return source.replace(/__global__ void \w+\([^)]*\)\s*\{/g,(m,offset)=>m).split(/(?=__global__ void )/).map((part,index)=>{if(index===0)return part;const start=part.indexOf('{');let level=1,i=start+1;for(;i<part.length&&level;i++){if(part[i]==='{')level++;if(part[i]==='}')level--;}return part.slice(i);}).join('');}
const optix=declarations+removeKernels(water)+'\n'+common.replace(/\/\/ QUERY_BEGIN[\s\S]*?\/\/ QUERY_END/,await read('optix-query.cu'))+'\n'+optics+'\n'+removeKernels(render)+'\n'+await read('optix.cu');
await writeFile('dist/kernels/optix.cu',optix.replace(/__device__/g,'__device__ __noinline__')); await writeFile('dist/kernels/water-native.cu',declarations+simulation);await writeFile('dist/kernels/geometry.cu',geometry);
await writeFile('dist/kernels/water-entries.json',JSON.stringify(entries));
for(const file of ['index.html','style.css','app.js','water.js','vendor'])await cp(file,'dist/'+file,{recursive:true});
const version=createHash('sha256').update(shading).update(await readFile('app.js')).update(await readFile('water.js')).digest('hex').slice(0,12);
await writeFile('dist/index.html',(await readFile('index.html','utf8')).replace('src="app.js"',`src="app.js?v=${version}"`));
await writeFile('dist/.nojekyll','');console.log('Built full ClearWater FFT and OptiX showcase '+version);
