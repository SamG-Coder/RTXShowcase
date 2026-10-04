extern "C" __global__ void __raygen__main(){uint3 i=optixGetLaunchIndex(),s=optixGetLaunchDimensions();params.image[i.y*s.x+i.x]=render_pixel((int)i.x,(int)i.y,(int)s.x,(int)s.y,params.yaw,params.pitch,params.distance,params.time,params.strength,params.sunAngle,params.bounces,params.samples);}
extern "C" __global__ void __miss__main(){optixSetPayload_0(4294967295u);optixSetPayload_1(__float_as_uint(10000.0f));}
extern "C" __global__ void __closesthit__main(){optixSetPayload_0(optixGetPrimitiveIndex());optixSetPayload_1(__float_as_uint(optixGetRayTmax()));}
