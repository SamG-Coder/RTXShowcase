__device__ float water_hit(const float4 *surface,const float4 *coefficients,const float4 *brush,float3 o,float3 d){
 if(d.y>=-.0001f)return 100000;
 float t=globe_hit(o.y,d);if(t<.002f)return 100000;
 if(t>1200)return t;
 WaveRegionCache regions=wave_cache(o.x+d.x*t,o.z+d.z*t);
 for(int i=0;i<6;i++){float h=cached_wave_height(surface,coefficients,brush,o.x+d.x*t,o.z+d.z*t,1/(1+t*t*.0008f),0,1,regions);h-=(d.x*d.x+d.z*d.z)*t*t/(2*earth_radius());t=mixf(t,(h-o.y)/d.y,.75f);}
 return t>.002f?t:100000;
}
__device__ float3 trace_color(const float4 *brush,const float4 *sandState,const float4 *surface,const float4 *coefficients,const float4 *light,const float *monoLight,const float4 *camera,float3 o,float3 d,float depth,int height,int bounces,int samples){
 float3 result=v(0,0,0),through=v(1,1,1),sun=v(camera[9].x,camera[9].y,camera[9].z);
 float path=0;
 for(int bounce=0;bounce<10;bounce++){
  if(bounce>=bounces)break;
  float2 hit=query_spheres(o,d);float water=water_hit(surface,coefficients,brush,o,d);float t=fminf(hit.x,water);
  if(hit.y<0&&water>=100000){return add(result,tint(through,weather_sky_sample(d,camera)));}
  if(water>250&&hit.y<0){float3 far=planet_radiance(d,camera,water,0,0,0,-1,1.04f/(float)height);return add(result,tint(through,far));}
  if(hit.y<0)t=water;
  path+=t;float3 p=add(o,mul(d,t)),n=v(0,1,0),reflectance=v(1,1,1);
  if(water<hit.x||hit.y<0){
   float footprint=path/((float)height*(samples>1?2:1));
   float4 w=wave_pc(coefficients,brush,p.x,p.z,1/(1+t*t*.0008f),0,1);
   float3 rain=rain_surface(p.x,p.z,camera[13].y,camera[11].x,footprint);
   n=norm(v(-w.y-rain.x+d.x*t/earth_radius(),1,-w.z-rain.z+d.z*t/earth_radius()));
   WaterOptics optics=water_optics(sandState,light,monoLight,camera,p,d,n,t,depth,footprint);
   result=add(result,tint(through,optics.base));reflectance=v(optics.reflection,optics.reflection,optics.reflection);
  }else{
   int id=(int)hit.y;float4 s=sphere(id);n=norm(sub(p,v(s.x,s.y,s.z)));float cosView=sat(-dot3(d,n));
   float3 base=metal(id);reflectance=blend3(base,v(1,1,1),powf(1-cosView,5));
   result=add(result,tint(through,mul(base,.008f+fmaxf(0,dot3(n,sun))*.025f)));
  }
  through=tint(through,reflectance);d=norm(sub(d,mul(n,2*dot3(d,n))));o=add(p,mul(n,.006f));
  if(fmaxf(through.x,fmaxf(through.y,through.z))<.002f)return result;
 }
 return add(result,tint(through,weather_sky_sample(d,camera)));
}
__device__ unsigned render_pixel(const float4 *brush,const float4 *sandState,const float4 *surface,const float4 *coefficients,const float4 *light,const float *monoLight,const float4 *camera,int x,int y,int width,int height,float depth,int bounces,int samples){
 float3 o=v(camera[0].x,camera[0].y,camera[0].z),f=v(camera[2].x,camera[2].y,camera[2].z),r=v(camera[3].x,camera[3].y,camera[3].z),u=v(camera[4].x,camera[4].y,camera[4].z),sum=v(0,0,0);
 for(int sample=0;sample<4;sample++){if(sample>=samples)break;float ox=samples==1?.5f:((float)(sample&1)+.5f)*.5f,oy=samples==1?.5f:((float)(sample>>1)+.5f)*.5f;
 float sx=(2*((float)x+ox)-(float)width)/(float)height,sy=1-2*((float)y+oy)/(float)height;
 float3 ray=norm(add(f,add(mul(r,sx*.52f),mul(u,sy*.52f))));sum=add(sum,trace_color(brush,sandState,surface,coefficients,light,monoLight,camera,o,ray,depth,height,bounces,samples));}
 return pack_color(mul(sum,1/(float)samples));
}
__global__ void showcase_render(const float4 *brush,const float4 *sandState,const float4 *surface,const float4 *coefficients,const float4 *light,const float *monoLight,const float4 *camera,unsigned *image,int width,int height,float depth,int bounces,int samples){int x=blockIdx.x*blockDim.x+threadIdx.x,y=blockIdx.y*blockDim.y+threadIdx.y;if(x>=width||y>=height)return;image[y*width+x]=render_pixel(brush,sandState,surface,coefficients,light,monoLight,camera,x,y,width,height,depth,bounces,samples);}
