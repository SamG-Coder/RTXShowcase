__device__ float2 query_spheres(float3 o,float3 d){
 unsigned id=4294967295u,distance=__float_as_uint(10000.0f);
 optixTrace(params.scene,o,d,.002f,10000.0f,0.f,255,OPTIX_RAY_FLAG_NONE,0,1,0,id,distance);
 return make_float2(__uint_as_float(distance),id==4294967295u?-1.0f:(float)(id/4096u));
}
