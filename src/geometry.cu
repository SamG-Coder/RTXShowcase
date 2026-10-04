// Six spheres, 64 longitude and 32 latitude segments each. Float4 vertex stride.
__global__ void geometry(float4 *vertices){
 int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=73728)return;
 int ball=i/12288,local=i%12288,tri=local/3,corner=local%3,cell=tri/2,part=tri%2;
 int longitude=cell%64,latitude=cell/64;
 int ux=part==0?(corner==1?1:0):(corner==0?1:(corner==1?1:0));
 int uy=part==0?(corner==2?1:0):(corner==0?0:1);
 float a=6.283185307f*(float)(longitude+ux)/64,b=3.141592654f*(float)(latitude+uy)/32;
 float4 s=sphere(ball);vertices[i]=make_float4(s.x+s.w*sinf(b)*cosf(a),s.y+s.w*cosf(b),s.z+s.w*sinf(b)*sinf(a),0);
}
