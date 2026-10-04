import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {compile,serializableArtifact} from '../vendor/webcuda/compiler/compiler.js';
const common=await readFile('src/common.cu','utf8'),render=common+'\n'+await readFile('src/render.cu','utf8'),geometry=common+'\n'+await readFile('src/geometry.cu','utf8');
await mkdir('dist/kernels',{recursive:true});
for(const [name,source,workgroupSize] of [['render',render,[8,8,1]],['geometry',geometry,[64,1,1]]]){await writeFile('dist/kernels/'+name+'.json',JSON.stringify(serializableArtifact(compile(source,{entry:name,workgroupSize}))));}
const optix=common.replace(/\/\/ QUERY_BEGIN[\s\S]*?\/\/ QUERY_END/,await readFile('src/optix-query.cu','utf8'))+'\n'+await readFile('src/optix.cu','utf8');
await writeFile('dist/kernels/optix.cu',optix);await writeFile('dist/kernels/geometry.cu',geometry);
for(const file of ['index.html','style.css','app.js','vendor'])await cp(file,'dist/'+file,{recursive:true});
await writeFile('dist/.nojekyll','');console.log('Built shared CUDA shading, WebGPU artifacts and OptiX ray programs.');
