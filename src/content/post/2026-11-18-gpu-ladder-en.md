---
title: "GPU Ladder: An LLM Inference Leaderboard for GPUs"
description: "A small tool for estimating LLM inference ceilings and comparing GPUs across vendors."
publishDate: 2026-11-18T20:20:00+08:00
lang: "en"
draft: false
tags: ["ai", "gpu", "llm", "tools"]
---

Hugging Face already shows whether a model can run on a given GPU, which is handy, though still not intuitive enough—especially when you want to see how wide the real gap is from one card to another. So I built a small tool that pulls together GPU specs across vendors to simulate benchmark scores and compare inference throughput side by side. Once you run the numbers, NVIDIA's datacenter cards are honestly terrifying.

I also gathered real-world community benchmarks to put right next to the theoretical ceilings. Comparing actual throughput against a card's physical limit makes it much easier to see how well a GPU or inference engine's infra is tuned.

Vibe-coded it into [`/tools/gpu-ladder/`](/tools/gpu-ladder/).

Mainly useful for a few things:

- **Compare GPUs before buying or renting**: Check whether a model fits in VRAM and how much speed varies across vendors, GPU counts, and quantization precisions.
- **Spot optimization headroom from measured runs**: Compare built-in community benchmarks or log your own `tok/s` locally to see how close your setup is to the hardware limit.
- **Get MoE and MLA math right**: VRAM scales with total weights while decode bandwidth scales with active parameters, with MLA KV cache compression accounted for on models like DeepSeek and Kimi.
- **Plug in any Hugging Face model**: Paste a repo name to pull `config.json` automatically when a model isn't in the presets, or type in custom parameter counts directly.
