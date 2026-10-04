// Original ocean / metal reflection study. Shared shading for CUDA OptiX and WebCuda.
__device__ float3 v(float x,float y,float z){return make_float3(x,y,z);}
__device__ float3 add(float3 a,float3 b){return v(a.x+b.x,a.y+b.y,a.z+b.z);}
__device__ float3 sub(float3 a,float3 b){return v(a.x-b.x,a.y-b.y,a.z-b.z);}
__device__ float3 mul(float3 a,float s){return v(a.x*s,a.y*s,a.z*s);}
__device__ float3 tint(float3 a,float3 b){return v(a.x*b.x,a.y*b.y,a.z*b.z);}
__device__ float dot3(float3 a,float3 b){return a.x*b.x+a.y*b.y+a.z*b.z;}
__device__ float3 norm(float3 a){return mul(a,rsqrtf(fmaxf(1e-12f,dot3(a,a))));}
__device__ float3 cross3(float3 a,float3 b){return v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);}
__device__ float sat(float x){return fminf(1,fmaxf(0,x));}
__device__ float3 blend3(float3 a,float3 b,float t){return add(mul(a,1-t),mul(b,t));}
__device__ float4 sphere(int id){
 if(id==0)return make_float4(0,1.48f,0,1.42f);
 if(id==1)return make_float4(-2.55f,.92f,.6f,.86f);
 if(id==2)return make_float4(2.48f,1.02f,-.25f,.96f);
 if(id==3)return make_float4(-1.65f,.56f,2.55f,.51f);
 if(id==4)return make_float4(1.25f,.58f,2.6f,.53f);
 return make_float4(.5f,.70f,-2.7f,.65f);
}
__device__ float3 metal(int id){if(id==1)return v(.99f,.71f,.32f);if(id==2)return v(.90f,.45f,.28f);if(id==4)return v(.55f,.65f,.98f);return v(.94f,.97f,1);}
// QUERY_BEGIN
__device__ float2 query_spheres(float3 o,float3 d){
 float nearest=10000;int id=-1;
 for(int i=0;i<6;i++){float4 s=sphere(i);float3 q=sub(o,v(s.x,s.y,s.z));float b=dot3(q,d),c=dot3(q,q)-s.w*s.w,disc=b*b-c;if(disc<0)continue;float t=-b-sqrtf(disc);if(t<.002f)t=-b+sqrtf(disc);if(t>.002f&&t<nearest){nearest=t;id=i;}}
 return make_float2(nearest,(float)id);
}
// QUERY_END
