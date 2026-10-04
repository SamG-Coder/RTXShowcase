# Single-frame rendering benchmark

Run `npm run benchmark:frame` with the showcase server running on port 5198 and the profiling-enabled ChromiumRTXCuda helper installed. Use `-- --width=2560` for the control resolution. Browser location and server URL can be supplied with `--browser=` and `--url=`.

The benchmark routes diagnostic instrumentation into the real built app. It disables the animation loop, freezes scene time at 10 seconds, uses four samples and six bounces, warms each backend for 12 frames, and measures three isolated single frames for each phase. Shader compilation, allocation, warm-up and timing-query readback are excluded. It asserts actual framebuffer dimensions.

The original native API enforced a 65,536-block launch budget. This has now been replaced by device-reported grid dimensions. The current benchmark uses one full-image dispatch at 4K, with the same 8x8 block dimensions and pixel math. The table below is the earlier strip-based baseline; the current raw 4K JSON contains the subsequent single-dispatch run.

| Width | Backend | Phase | GPU interval ms | Complete wall ms | Submit response ms |
|---|---|---|---:|---:|---:|
| 2560 | WebGPU | all | 9.896 | 12.2 | 0 |
| 2560 | WebGPU | render | 9.765 | 11.6 | 0 |
| 2560 | WebGPU | water | 0.197 | 4.3 | 0 |
| 2560 | Native CUDA | all | 12.65 | 14 | 1.8 |
| 2560 | Native CUDA | render | 12.518 | 13.8 | 1 |
| 2560 | Native CUDA | water | unavailable | 2.1 | 0.8 |
| 3840 | WebGPU | all | 21.365 | 23.4 | 0 |
| 3840 | WebGPU | render | 21.037 | 22.8 | 0 |
| 3840 | WebGPU | water | 0.197 | 4 | 0 |
| 3840 | Native CUDA | all | 25.938 | 27.4 | 1.5 |
| 3840 | Native CUDA | render | 25.936 | 27.1 | 1.2 |
| 3840 | Native CUDA | water | unavailable | 2 | 0.9 |

Numbers are medians of three individual frames, not FPS or sustained throughput. CUDA intervals are sums of per-job events and may include GPU scheduling or host launch gaps; WebGPU timestamps cover the compute pass. Completed wall time includes explicit idle synchronization and browser transport; it does not measure display scanout. Presentation enqueue measures CPU submission only, not compositor GPU cost.

The resolution-dependent difference remains inside the rendering interval. Water simulation is a small fraction of the frame. This rules out fixed dispatch overhead as the sole explanation, but does not identify instruction throughput, register pressure, spills, or occupancy as a proven cause. That requires kernel-level profiling. The true 4K WebGPU render exceeds 16.7 ms in this configuration, so this run does not reproduce a 60 FPS full-resolution baseline.

Raw results: `captures/single-frame-3840.json` and `captures/single-frame-2560.json` (local capture artifacts).

Native water-only batches use CUDA-owned buffers without shared render targets. The helper currently returns no timing events for that path; its GPU time is unavailable, not zero. The full-frame native capture still includes the water jobs.

## NVIDIA guidance and local kernel inspection

The inspector in `scripts/inspect-native-kernel.py` compiles the same generated source with the browser NVRTC options, loads it through the CUDA driver JIT, and queries function resources and theoretical occupancy. It does not launch rendering kernels.

Baseline: compute_120 / binary sm_120, 140 registers per thread, 32 bytes local storage per thread, zero spill loads/stores reported by ptxas, 25% theoretical occupancy at 64 or 128 threads per block. At 256 threads, theoretical occupancy drops to 16.7%. This is static occupancy, not measured GPU utilization.

| Variant | Block | Median 4K render interval (ms) |
|---|---|---:|
| default | 8 x 8 | 25.454 |
| default | 16 x 4 | 25.269 |
| default | 32 x 2 | 26.841 |
| default | 16 x 8 | 24.804 |
| inline-water | 8 x 8 | 46.211 |
| inline-water | 16 x 4 | 48.092 |
| inline-water | 32 x 2 | 54.430 |
| inline-water | 16 x 8 | 43.720 |

These are short sequential experiments, three frames per case. They are diagnostic, not a sustained speedup claim. Inlining water reduced registers to 125 and increased theoretical occupancy to 33.3%, but sharply regressed runtime. Production shader inlining and block layout were not changed.

NVRTC optimization is implicit without -G; our flags do not disable it. Generated PTX contains precise div.rn.f32 / sqrt.rn.f32 operations. CUDA math and WGSL accuracy contracts differ, so matching source does not establish matching instruction cost. No global fast-math change was applied. GPU counters are still needed to establish the dominant runtime stall or instruction bottleneck.

Primary references:
- https://docs.nvidia.com/cuda/nvrtc/index.html
- https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html
- https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/cpp-language-extensions.html
- https://docs.nvidia.com/nsight-compute/ComputeTriage/
- https://gpuweb.github.io/gpuweb/wgsl/#floating-point-accuracy

## Optimized native rerun

Full 3840 x 2160, four samples, six bounces, native only. Fast math, dopt, extra device vectorization, fast-compile disabled, JIT level 4, no debug, no forced noinline annotations. Three isolated render-only frames per layout; simulation prepared during warm-up.

| Block | Median render GPU interval ms | Median completed wall ms |
|---|---:|---:|
| 8 x 8 | 11.580 | 12.800 |
| 16 x 4 | 11.861 | 13.300 |
| 32 x 2 | 12.608 | 13.700 |
| 16 x 8 | 12.276 | 13.400 |

Raw results: `captures/single-frame-3840-optimized-native.json`. These timings do not establish visual parity after fast math, sustained FPS, or which individual compiler change caused the gain.
