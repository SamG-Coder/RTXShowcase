# RTX Showcase

An original ocean and polished-metal reflection showcase, authored in CUDA.

[Live demo](https://samg-coder.github.io/RTXShowcase/)

Six metal spheres reflect an animated ocean, sky and each other. Orbit with a
mouse or touch, scroll to move closer, adjust the sun and waves, and select
one through ten reflection bounces.

## Native On / Off

- **Off:** WebCuda compiles CUDA shading to WGSL and executes it through WebGPU.
  Sphere intersections are analytic.
- **On:** ChromiumRTXCuda runs custom CUDA OptiX ray programs on RTX hardware.
  Sphere intersections use a GPU-generated mesh of 24,576 triangles, with smooth
  normals. A browser permission prompt is required. Unsupported devices and
  denied permission retain the WebGPU path.
- Ocean intersection, shading, camera, lighting and bounce integration share
  `src/common.cu`. The ocean uses seven directional wave bands, not an FFT.
- Both paths have real secondary reflections. Off does not disable reflections;
  the switch changes the execution backend. Native sphere tessellation introduces
  small geometric differences, so this is not a bit-identical comparison.
- Pixels remain on the GPU for presentation. Explicit inspection/recording tools
  can read frames for validation and video export.

No ClearWater scene or shader code was copied. The project vendors the explicitly
requested WebCuda library and uses ChromiumRTXCuda's OptiX interface.

## Run

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:5198 in a WebGPU browser. Enable Native in ChromiumRTXCuda.
Native currently requires Windows and a compatible NVIDIA RTX GPU/driver.

## Related projects

- [WebCuda](https://github.com/SamG-Coder/cuda-webshader): CUDA-to-WebGPU compiler and native interop library.
- [ChromiumRTXCuda](https://github.com/SamG-Coder/ChromiumRTXCuda): native CUDA, OptiX and DLSS browser support.
- [ClearWater6.1](https://github.com/SamG-Coder/ClearWater6.1): the ocean-to-space game.
- [ClearWater6.1 demo](https://samg-coder.github.io/ClearWater6.1/).

## Validation

Local smoke tests rendered both backends without reported GPU errors at 960 × 600,
six bounces and four samples/pixel. Individual observed frame times were about
90 ms (WebGPU) and 10 ms (OptiX) on the test machine. These are single observations,
not controlled benchmark results or mobile performance claims.

## Licensing

Original showcase code is MIT licensed. WebCuda is MIT licensed; its native
transport includes BSD-3-Clause ChromiumRTXCuda code. Retained licenses are under
`vendor/`. No NVIDIA SDK headers or driver binaries are redistributed here.
