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
// Height and analytic derivatives; independent directional wave bands.
__device__ float3 waves(float x,float z,float time,float strength){
 float h=0,dx=0,dz=0;
 for(int i=0;i<7;i++){
  float fi=(float)i,angle=fi*2.399963f+.3f,k=.65f*powf(1.72f,fi),amp=.065f*powf(.54f,fi)*strength;
  float ax=cosf(angle),az=sinf(angle),p=(x*ax+z*az)*k-sqrtf(9.81f*k)*time;
  h+=sinf(p)*amp;dx+=cosf(p)*amp*k*ax;dz+=cosf(p)*amp*k*az;
 }
 return v(h,dx,dz);
}
// QUERY_BEGIN
__device__ float2 query_spheres(float3 o,float3 d){
 float nearest=10000;int id=-1;
 for(int i=0;i<6;i++){float4 s=sphere(i);float3 q=sub(o,v(s.x,s.y,s.z));float b=dot3(q,d),c=dot3(q,q)-s.w*s.w,disc=b*b-c;if(disc<0)continue;float t=-b-sqrtf(disc);if(t<.002f)t=-b+sqrtf(disc);if(t>.002f&&t<nearest){nearest=t;id=i;}}
 return make_float2(nearest,(float)id);
}
// QUERY_END
__device__ float water_hit(float3 o,float3 d,float time,float strength){
 if(d.y>=-.0001f)return 10000;
 float t=-o.y/d.y;if(t<.002f)return 10000;
 if(t>250)return t;
 for(int i=0;i<9;i++){float3 p=add(o,mul(d,t)),w=waves(p.x,p.z,time,strength);float f=p.y-w.x,den=d.y-w.y*d.x-w.z*d.z;if(fabsf(den)<.01f)break;t-=fminf(2,fmaxf(-2,f/den));}
 return t>.002f?t:10000;
}
__device__ float3 sky(float3 d,float sunAngle){
 float3 sun=norm(v(-.5f,sunAngle,-.65f));float elevation=sat(d.y);
 float3 c=blend3(v(.73f,.88f,1.03f),v(.085f,.27f,.54f),sqrtf(elevation));
 float horizon=expf(-fabsf(d.y)*14);c=add(c,mul(v(.35f,.25f,.13f),horizon));
 if(d.y>.025f){float x=d.x/fmaxf(.12f,d.y),z=d.z/fmaxf(.12f,d.y);float cloud=sinf(x*.65f+z*.31f)+sinf(z*.8f-x*.18f)*.6f+sinf(x*1.9f+z*1.3f)*.2f;cloud=sat((cloud-.5f)*1.4f)*sat(d.y*8);c=blend3(c,v(1.3f,1.35f,1.4f),cloud*.75f);}
 float sd=fmaxf(0,dot3(d,sun));c=add(c,mul(v(1,.86f,.64f),powf(sd,1100)*75+powf(sd,30)*.22f));return c;
}
__device__ float3 trace_color(float3 o,float3 d,float time,float strength,float sunAngle,int bounces){
 float3 result=v(0,0,0),through=v(1,1,1),sun=norm(v(-.5f,sunAngle,-.65f));
 for(int bounce=0;bounce<10;bounce++){
  if(bounce>=bounces)break;
  float2 hit=query_spheres(o,d);float water=water_hit(o,d,time,strength);float t=fminf(hit.x,water);
  if(t>9999){result=add(result,tint(through,sky(d,sunAngle)));return result;}
  float3 p=add(o,mul(d,t)),n=v(0,1,0);float3 reflectance=v(1,1,1);
  if(water<hit.x){
   float3 w=waves(p.x,p.z,time,strength);n=norm(v(-w.y,1,-w.z));float cosine=sat(-dot3(d,n));float fresnel=.0204f+.9796f*powf(1-cosine,5);
   float shadow=query_spheres(add(p,mul(n,.006f)),sun).y<0?1:.24f;
   float3 waterColour=mul(v(.012f,.13f,.15f),(.25f+.75f*shadow)*(1-fresnel));
   result=add(result,tint(through,waterColour));reflectance=v(fresnel,fresnel,fresnel);
  }else{
   int id=(int)hit.y;float4 s=sphere(id);n=norm(sub(p,v(s.x,s.y,s.z)));float cosView=sat(-dot3(d,n));
   float3 base=metal(id);reflectance=blend3(base,v(1,1,1),powf(1-cosView,5));
   float diffuse=fmaxf(0,dot3(n,sun))*.025f;result=add(result,tint(through,mul(base,.008f+diffuse)));
  }
  through=tint(through,reflectance);d=norm(sub(d,mul(n,2*dot3(d,n))));o=add(p,mul(n,.006f));
  if(fmaxf(through.x,fmaxf(through.y,through.z))<.002f)return result;
 }
 return add(result,tint(through,sky(d,sunAngle)));
}
__device__ unsigned render_pixel(int x,int y,int width,int height,float yaw,float pitch,float distance,float time,float strength,float sunAngle,int bounces,int samples){
 float3 target=v(0,1,0),o=add(target,mul(v(sinf(yaw)*cosf(pitch),sinf(pitch),cosf(yaw)*cosf(pitch)),distance));
 float3 f=norm(sub(target,o)),r=norm(cross3(f,v(0,1,0))),u=cross3(r,f),sum=v(0,0,0);
 for(int sample=0;sample<4;sample++){if(sample>=samples)break;float ox=samples==1?.5f:((float)(sample&1)+.5f)*.5f,oy=samples==1?.5f:((float)(sample>>1)+.5f)*.5f;
 float sx=(2*((float)x+ox)-(float)width)/(float)height,sy=1-2*((float)y+oy)/(float)height;
 float3 ray=norm(add(f,add(mul(r,sx*.52f),mul(u,sy*.52f))));sum=add(sum,trace_color(o,ray,time,strength,sunAngle,bounces));}
 sum=mul(sum,1/(float)samples);float3 mapped=v(sum.x/(1+sum.x),sum.y/(1+sum.y),sum.z/(1+sum.z));
 unsigned rr=(unsigned)(powf(sat(mapped.x),.454545f)*255),gg=(unsigned)(powf(sat(mapped.y),.454545f)*255),bb=(unsigned)(powf(sat(mapped.z),.454545f)*255);return rr|(gg<<8)|(bb<<16)|4278190080u;
}
