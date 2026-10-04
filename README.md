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

OptiX retains separate calls for five large shading stages to keep compilation
manageable. Small math and sampling helpers can be inlined and optimized normally.
No water effects are removed for Native On.

## Licensing

Showcase code and ClearWater6.1 are MIT licensed. WebCuda is MIT licensed; its native
transport includes BSD-3-Clause ChromiumRTXCuda code. Retained licenses are under
`vendor/`. No NVIDIA SDK headers or driver binaries are redistributed here.

## Native submission batching

Water simulation and OptiX rendering share one native batch per frame. The CUDA
stream preserves dependencies between all passes; there is no intermediate
return to WebGPU between simulation and ray tracing. Chrome retains the final
fenced handoff for presentation. New ChromiumRTXCuda builds also consolidate
aliases of the same shared fence. Diagnostic counters expose native submissions,
shared resource count and actual exported wait-fence count.

A local 50-frame timing sample after 10 warm-up frames at 960 × 600, four
samples/pixel and six bounces changed from 17.5 ms median / 26.6 ms p95 to
14.6 ms median / 16.1 ms p95 after batching and Chrome fence consolidation.
This is wall-clock frame work (including submission and GPU completion), not
isolated GPU timestamps, and one before/after run does not establish a general
hardware speedup. `node scripts/bench-sync.mjs <label>` reproduces the fixed-camera
measurement with the locally built ChromiumRTXCuda browser.


## Native rendering follow-up

Normal frames wait for the final WebGPU canvas copy. That copy depends on the
shared image's CUDA completion fence, which is signaled after the entire native
batch. This avoids an additional native `idle()` IPC request and context-wide
synchronization on every frame. Resize/disposal retain their lifecycle waits;
water-only profiling explicitly waits on CUDA because it does not produce image.

On a local RTX 5080, an alternating reference/optimized comparison at 960 x 600,
four samples per pixel and six bounces measured 15.8 -> 10.7 ms median and
32.0 -> 15.7 ms p95. Each variant had 75 measured frames across three camera
positions, with five warm-up frames per position. The reference uses the
`6e3efb8` frame loop and blanket no-inlining policy. These are wall-clock timings
including submission, presentation copy and GPU completion, not isolated GPU
timestamps. Background load affects results; this does not establish native
being faster than WebGPU.

The pixel comparison uses identical frozen simulation initialization. Compiler
inlining changes floating-point evaluation: mean absolute RGB differences were
0.025-0.036 on the 0-255 scale, with occasional larger individual differences.
This is not a bit-identical rendering claim. Resolution, samples, bounces,
geometry and water effects are unchanged.

Run `node scripts/compare-native.mjs` for the alternating comparison and pixel
checks. `node scripts/bench-sync.mjs <label> --webgpu` measures the fallback.
Add `--phase=water` or `--phase=render` to isolate a phase (still including host
and presentation overhead), or `--pixels` to save the final packed image.
Profiling hooks are diagnostic only; normal frames always run both phases.
