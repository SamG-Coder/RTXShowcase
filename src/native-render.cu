// Native presentation wrapper. All ray construction, intersections and shading
// come from the same render_pixel implementation compiled to WGSL.
__global__ void showcase_render(const float4 *brush,const float4 *sandState,const float4 *surface,const float4 *coefficients,const float4 *light,const float *monoLight,const float4 *camera,cudaSurfaceObject_t image,int width,int height,float depth,int bounces,int samples){
 int x=blockIdx.x*blockDim.x+threadIdx.x,y=blockIdx.y*blockDim.y+threadIdx.y;
 if(x>=width||y>=height)return;
 unsigned pixel=render_pixel(brush,sandState,surface,coefficients,light,monoLight,camera,x,y,width,height,depth,bounces,samples);
 surf2Dwrite(pixel,image,x*4,y);
}
