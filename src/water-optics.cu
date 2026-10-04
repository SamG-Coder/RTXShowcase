// Adapted from ClearWater6.1 shade_pixel_pc. Reflection is accumulated by the
// iterative showcase path tracer, so secondary rays see the full FFT ocean too.
struct WaterOptics { float3 base; float reflection; };
__device__ WaterOptics water_optics(const float4 *sandState,const float4 *light,const float *monoLight,const float4 *camera,float3 p,float3 ray,float3 n,float t,float depth,float pixelFootprint){
 int smooth=1,dispersion=1,lightSize=512;
 float3 localSun=vec(camera[9].x,camera[9].y,camera[9].z),col=vec(0,0,0),reflected=vec(0,0,0);
 float4 forward=camera[2],right=camera[3];float causticDetail=1/(1+t*t*.0008f),viewCosine=dotv(n,ray);
 float grazing=1-clamp01(fmaxf(.02f,-viewCosine));float fresnel=.02037f+.97963f*grazing*grazing*grazing*grazing*grazing;
 float3 transmitted=refract_cosine(ray,n,.7502f,viewCosine);float vertical=fminf(-.1f,transmitted.y);float travel=(-depth-p.y)/vertical;
 float bx=p.x+transmitted.x*travel,bz=p.z+transmitted.z*travel;BedRegionCache bedRegions=bed_cache(bx,bz);
 for(int j=0;j<2;j++){travel=(cached_bottom(bx,bz,depth,bedRegions)-p.y)/vertical;bx=p.x+transmitted.x*travel;bz=p.z+transmitted.z*travel;}
 float anchorX=bx,anchorZ=bz;float4 drift=make_float4(0,0,0,0);
 if(depth<3){float shallow=clamp01((3-depth)/2);shallow=shallow*shallow*(3-2*shallow);drift=sample_pc(sandState,bx/16,bz/16,0,1);drift.x*=shallow;drift.y*=shallow/16;drift.z*=shallow/16;}
 if(smooth!=0)for(int j=0;j<2;j++){travel=(bottom_pc(bx,bz,depth,pixelFootprint,drift,anchorX,anchorZ,bedRegions)-p.y)/vertical;bx=p.x+transmitted.x*travel;bz=p.z+transmitted.z*travel;}
 travel=fmaxf(0,travel);float3 bed=vec(0,0,0);
 if(smooth!=0){float4 sand=sand_moving(bx,bz,pixelFootprint,drift,anchorX,anchorZ),stone=stone_relief(bx,bz,pixelFootprint,localSun);float3 bedSun=scale(refractv(scale(localSun,-1),n,.7502f),-1);bed=seabed_pc(bx,bz,pixelFootprint,sand,stone,bedSun,transmitted);}
 else bed=seabed(bx,bz,pixelFootprint);
 float3 ca=caustic(light,monoLight,bx,bz,dispersion,lightSize);
 // Light travels down through the water before returning along the view ray.
 float opticalDistance=travel+(camera[21].w!=0?depth/.86f:forward.w);
 float shadow=camera[13].w!=0?camera[11].y:1;ca=scale(blend(vec(1,1,1),ca,causticDetail*right.w*shadow),.32f+.68f*shadow);
 float attenR=expf(-opticalDistance*.19f),attenG=expf(-opticalDistance*.09f),attenB=expf(-opticalDistance*.055f);
 float3 through=vec(bed.x*(.12f+.95f*ca.x)*attenR+.008f*(1-attenR),bed.y*(.12f+.95f*ca.y)*attenG+.042f*(1-attenG),bed.z*(.12f+.95f*ca.z)*attenB+.075f*(1-attenB));
 col=blend(scale(through,.015f+.985f*eased(-.08f,.3f,localSun.y)),reflected,fresnel);
 float3 halfv=unit(minus(localSun,ray));
 float specPower=mixf(320,8000,1/(1+pixelFootprint*pixelFootprint*800));
 float spec=positive_power(fmaxf(0,dotv(n,halfv)),specPower)*3.5f*(specPower/8000);
 col=plus(col,scale(vec(1,.89f,.68f),spec*(camera[13].w!=0?camera[11].y*eased(-.02f,.08f,localSun.y):1)));
 float haze=1-expf(-t*.00025f);col=blend(col,scale(vec(.38f,.55f,.68f),.015f+.985f*eased(-.08f,.3f,localSun.y)),haze);
 WaterOptics out;out.base=col;out.reflection=fresnel*(1-haze);return out;
}
