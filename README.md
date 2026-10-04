# RTX Showcase

A polished-metal reflection showcase using the full ClearWater6.1 spectral water pipeline, authored in CUDA.

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
- Both paths run the ClearWater6.1 two-band 128 × 128 FFT, smooth cubic surface
  reconstruction, wave-driven shallow sand, RGB refracted sunlight caustics,
  detailed seabed, depth absorption and cached planetary weather lighting.
- Native uses CUDA for all water simulation and OptiX for sphere intersections.
  Off uses the same water equations compiled to WebGPU.
- Reflection rays use the same detailed water optics as the directly visible ocean.
- Both paths have real secondary reflections. Off does not disable reflections;
  the switch changes the execution backend. Native sphere tessellation introduces
  small geometric differences, so this is not a bit-identical comparison.
- Pixels remain on the GPU for presentation. Explicit inspection/recording tools
  can read frames for validation and video export.

The water source is intentionally imported from ClearWater6.1 at the user's
request. `src/clearwater-water.cu` retains the full upstream source, with its
SHA-256 recorded in `src/CLEARWATER.json`. `src/water-optics.cu` adapts the PC
water optical path for iterative reflections. Ship, combat, terrain generation
and game menus are not part of this reflection showcase. WebCuda is vendored.

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

Local browser smoke tests render the full FFT water on both WebGPU and native
CUDA / OptiX at 960 × 600, six bounces and four samples/pixel, without reported
GPU errors. `scripts/verify.mjs --native` also checks 1440p, 4K, depth changes
and switching back to WebGPU. These are functional tests, not controlled
benchmarks or physical-phone performance measurements.

OptiX helper functions are compiled without inlining to keep compilation within
the browser host request timeout. No water effects are removed for Native On.

## Licensing

Showcase code and ClearWater6.1 are MIT licensed. WebCuda is MIT licensed; its native
transport includes BSD-3-Clause ChromiumRTXCuda code. Retained licenses are under
`vendor/`. No NVIDIA SDK headers or driver binaries are redistributed here.
