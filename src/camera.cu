// Showcase camera framing; the water and atmospheric kernels are ClearWater6.1.
__global__ void showcase_camera(float4 *camera,float yaw,float pitch,float distance,float depth,float sunAngle){
 float3 target=vec(0,1,0),o=plus(target,scale(vec(sinf(yaw)*cosf(pitch),sinf(pitch),cosf(yaw)*cosf(pitch)),distance));
 float3 f=unit(minus(target,o)),r=unit(crossv(f,vec(0,1,0))),u=crossv(r,f);
 camera[0]=make_float4(o.x,o.y,o.z,0);camera[2]=make_float4(f.x,f.y,f.z,depth/.86f);camera[3]=make_float4(r.x,r.y,r.z,expf(-depth*.055f));camera[4]=make_float4(u.x,u.y,u.z,0);
 camera[5]=make_float4(1,0,0,0);camera[6]=make_float4(0,0,1,0);camera[7]=make_float4(0,-1,0,0);camera[8]=make_float4(o.y,0,earth_radius(),0);
}
__global__ void showcase_sun(float4 *camera,float sunAngle){
 float3 sun=unit(vec(-.42f,sunAngle,.66f)),world=to_world(camera,sun);
 camera[9]=make_float4(sun.x,sun.y,sun.z,camera[9].w);camera[12]=make_float4(world.x,world.y,world.z,camera[12].w);
 float3 projected=unit(plus(vec(0,0,1),scale(minus(world,vec(0,0,world.z)),2500/(earth_radius()*fmaxf(.12f,sun.y)))));
 camera[11].y=expf(-(cloud_density(camera,projected,0)*2.6f+cloud_density(camera,projected,1)*2));
}
