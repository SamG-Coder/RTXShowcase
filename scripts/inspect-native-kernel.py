"""Inspect the showcase using the browser's NVRTC options and CUDA driver JIT.
No kernels are launched and no rendering resources are changed.
"""
import ctypes as c, json, os, time, sys
from pathlib import Path
base=Path('C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.3/bin/x64')
os.add_dll_directory(str(base));nv=c.CDLL(str(base/'nvrtc64_130_0.dll'));cu=c.WinDLL('nvcuda.dll')
def api(lib,name,args):
 f=getattr(lib,name);f.argtypes=args;f.restype=c.c_int;return f
P=c.c_void_p;I=c.c_int;U=c.c_uint;S=c.c_char_p;Z=c.c_size_t
init=api(cu,'cuInit',[U]);device=api(cu,'cuDeviceGet',[c.POINTER(I),I]);attr=api(cu,'cuDeviceGetAttribute',[c.POINTER(I),I,I]);retain=api(cu,'cuDevicePrimaryCtxRetain',[c.POINTER(P),I]);current=api(cu,'cuCtxSetCurrent',[P])
create=api(nv,'nvrtcCreateProgram',[c.POINTER(P),S,S,I,P,P]);nameexpr=api(nv,'nvrtcAddNameExpression',[P,S]);compile_=api(nv,'nvrtcCompileProgram',[P,I,c.POINTER(S)]);logsize=api(nv,'nvrtcGetProgramLogSize',[P,c.POINTER(Z)]);logget=api(nv,'nvrtcGetProgramLog',[P,P]);ptxsize=api(nv,'nvrtcGetPTXSize',[P,c.POINTER(Z)]);ptxget=api(nv,'nvrtcGetPTX',[P,P]);lowered=api(nv,'nvrtcGetLoweredName',[P,S,c.POINTER(S)]);destroy=api(nv,'nvrtcDestroyProgram',[c.POINTER(P)])
load=api(cu,'cuModuleLoadDataEx',[c.POINTER(P),P,U,P,P]);function=api(cu,'cuModuleGetFunction',[c.POINTER(P),P,S]);funattr=api(cu,'cuFuncGetAttribute',[c.POINTER(I),I,P]);occupancy=api(cu,'cuOccupancyMaxActiveBlocksPerMultiprocessor',[c.POINTER(I),P,I,Z]);unload=api(cu,'cuModuleUnload',[P])
def check(code):
 if code:raise RuntimeError(f'CUDA/NVRTC error {code}')
def get_attr(a):
 v=I();check(attr(c.byref(v),a,dev.value));return v.value
check(init(0));dev=I();check(device(c.byref(dev),0));ctx=P();check(retain(c.byref(ctx),dev.value));check(current(ctx))
arch=f'compute_{get_attr(75)}{get_attr(76)}';max_threads_sm=get_attr(39)
variant=sys.argv[1] if len(sys.argv)>1 else 'optimized-auto-inline'
source=Path('dist/kernels/native-render.cu').read_bytes()
if variant=='inline-trace':source=source.replace(b'__noinline__ float3 trace_color',b'__forceinline__ float3 trace_color')
if variant=='inline-water':source=source.replace(b'__noinline__ WaterOptics water_optics',b'__forceinline__ WaterOptics water_optics')
program=P();check(create(c.byref(program),source,b'browser.cu',0,None,None));check(nameexpr(program,b'showcase_render'))
options=[f'--gpu-architecture={arch}'.encode(),b'--std=c++17',b'--no-source-include',b'--use_fast_math',b'--dopt=on',b'--Ofast-compile=0',b'--extra-device-vectorization'];opts=(S*len(options))(*options)
began=time.perf_counter();result=compile_(program,len(options),opts);size=Z();check(logsize(program,c.byref(size)));log=c.create_string_buffer(size.value);check(logget(program,log));check(result)
check(ptxsize(program,c.byref(size)));ptx=c.create_string_buffer(size.value);check(ptxget(program,ptx));entry=S();check(lowered(program,b'showcase_render',c.byref(entry)));module=P();jit_options=(I*3)(7,11,13);jit_values=(P*3)(4,None,None);check(load(c.byref(module),ptx,3,jit_options,jit_values));fn=P();check(function(c.byref(fn),module,entry))
values={}
for label,a in [('maxThreadsPerBlock',0),('sharedBytes',1),('constantBytes',2),('localBytesPerThread',3),('registersPerThread',4),('ptxVersion',5),('binaryVersion',6)]:
 v=I();check(funattr(c.byref(v),a,fn));values[label]=v.value
values['occupancy']=[]
for threads in [64,128,256,512]:
 v=I();code=occupancy(c.byref(v),fn,threads,0);values['occupancy'].append({'threads':threads,'activeBlocksPerSM':v.value,'theoreticalOccupancy':v.value*threads/max_threads_sm,'error':code})
values.update(architecture=arch,options=[x.decode() for x in options],compileAndJitSeconds=time.perf_counter()-began,compilerLog=log.value.decode(),maxThreadsPerSM=max_threads_sm)
Path('captures').mkdir(exist_ok=True);Path(f'captures/native-kernel-resources-{variant}.json').write_text(json.dumps(values,indent=2));Path(f'captures/native-render-{variant}.ptx').write_bytes(ptx.value);print(json.dumps(values,indent=2));check(unload(module));check(destroy(c.byref(program)))
