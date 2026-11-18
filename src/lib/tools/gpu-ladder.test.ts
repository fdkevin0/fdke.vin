import { describe, expect, it } from "vitest";
import {
	DATA_SOURCES_REGISTRY,
	evaluateGpuPerformance,
	evaluateUserSubmission,
	formatGpuShortName,
	formatModelShortName,
	GPU_CATALOG,
	getHardwareTflopsByCapability,
	getKvCacheBytesPerToken,
	gpuSupportsHardwarePrecision,
	INITIAL_COMMUNITY_SUBMISSIONS,
	inferModelSpecFromRepoId,
	MODEL_CATALOG,
	parseHuggingFaceConfig,
	parseHuggingFaceModelRef,
	resolveActualBenchmarkForGpu,
} from "@/lib/tools/gpu-ladder";

describe("parseHuggingFaceModelRef", () => {
	it("extracts org/repo from full HuggingFace URLs and raw repo strings", () => {
		expect(parseHuggingFaceModelRef("https://huggingface.co/Qwen/Qwen3-235B-A22B")).toBe(
			"Qwen/Qwen3-235B-A22B",
		);
		expect(
			parseHuggingFaceModelRef(
				"https://huggingface.co/deepseek-ai/DeepSeek-V3.1/blob/main/config.json",
			),
		).toBe("deepseek-ai/DeepSeek-V3.1");
		expect(parseHuggingFaceModelRef("meta-llama/Llama-4-Scout-17B-16E-Instruct")).toBe(
			"meta-llama/Llama-4-Scout-17B-16E-Instruct",
		);
	});

	it("returns null for invalid URLs or single-segment inputs", () => {
		expect(parseHuggingFaceModelRef("")).toBeNull();
		expect(parseHuggingFaceModelRef("llama-70b")).toBeNull();
		expect(parseHuggingFaceModelRef("https://example.com/Qwen/Qwen3-8B")).toBeNull();
	});
});

describe("parseHuggingFaceConfig", () => {
	it("parses standard dense transformer config.json", () => {
		const spec = parseHuggingFaceConfig("Qwen/Qwen3-8B", {
			hidden_size: 4096,
			num_hidden_layers: 36,
			num_attention_heads: 32,
			num_key_value_heads: 8,
			intermediate_size: 12288,
			vocab_size: 151936,
		});
		expect(spec.architecture).toBe("dense");
		expect(spec.totalParamsB).toBeGreaterThan(7.5);
		expect(spec.activeParamsB).toBe(spec.totalParamsB);
		expect(spec.numLayers).toBe(36);
		expect(spec.numKeyValueHeads).toBe(8);
		expect(spec.headDim).toBe(128);
	});

	it("parses MoE and DeepSeek MLA config.json with compressed KV cache", () => {
		const spec = parseHuggingFaceConfig(
			"deepseek-ai/DeepSeek-V3.1",
			{
				hidden_size: 7168,
				num_hidden_layers: 61,
				num_attention_heads: 128,
				num_key_value_heads: 128,
				intermediate_size: 18432,
				moe_intermediate_size: 2048,
				n_routed_experts: 256,
				num_experts_per_tok: 8,
				n_shared_experts: 1,
				first_k_dense_replace: 3,
				kv_lora_rank: 512,
				qk_rope_head_dim: 64,
				vocab_size: 129280,
				quantization_config: { quant_method: "fp8" },
			},
			671_000_000_000,
		);
		expect(spec.architecture).toBe("moe");
		expect(spec.totalParamsB).toBe(671);
		expect(spec.activeParamsB).toBeLessThan(45);
		expect(spec.activeParamsB).toBeGreaterThan(30);
		expect(spec.mlaKvElementsPerLayer).toBe(576);
		expect(spec.defaultPrecision).toBe("fp8");
	});
});

function requireGpu(id: string) {
	const gpu = GPU_CATALOG.find((g) => g.id === id);
	if (!gpu) throw new Error(`Missing GPU ${id}`);
	return gpu;
}

function requireModel(id: string) {
	const model = MODEL_CATALOG.find((m) => m.id === id);
	if (!model) throw new Error(`Missing model ${id}`);
	return model;
}

describe("traceable hardware catalog & data sources registry", () => {
	it("includes verified source attribution and calibration notes for every GPU", () => {
		expect(DATA_SOURCES_REGISTRY.length).toBeGreaterThanOrEqual(4);
		expect(GPU_CATALOG.length).toBeGreaterThanOrEqual(24);

		for (const gpu of GPU_CATALOG) {
			expect(gpu.sourceName.length).toBeGreaterThan(3);
			expect(gpu.sourceUrl.startsWith("https://")).toBe(true);
			expect(gpu.calibrationNote.length).toBeGreaterThan(5);
			expect(gpu.releaseYear).toBeGreaterThanOrEqual(2018);
		}
	});
});

describe("evaluateGpuPerformance", () => {
	const h100 = requireGpu("nvidia-h100-sxm-80gb");
	const rtx4090 = requireGpu("nvidia-rtx-4090-24gb");
	const llama70b = requireModel("llama-3.3-70b");
	const deepseekR1 = requireModel("deepseek-r1-671b");

	it("marks 1x RTX 4090 running Llama-3.3-70B FP16 as OOM", () => {
		const result = evaluateGpuPerformance(rtx4090, llama70b, {
			gpuCount: 1,
			weightPrecision: "fp16",
			kvPrecision: "fp16",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		expect(result.vramStatus).toBe("oom");
		expect(result.bottleneck).toBe("oom");
		expect(result.compositeScore).toBe(0);
	});

	it("computes realistic memory-bound decode TPS for 1x H100 80GB on Llama-3.3-70B FP8", () => {
		const result = evaluateGpuPerformance(h100, llama70b, {
			gpuCount: 1,
			weightPrecision: "fp8",
			kvPrecision: "fp8",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		expect(result.vramStatus).not.toBe("oom");
		expect(result.bottleneck).toBe("memory_bandwidth");
		// 3350 GB/s reading ~71 GB of FP8 weights + KV cache -> ~46-47 tok/s theoretical max
		expect(result.decodeSingleTps).toBeGreaterThan(42);
		expect(result.decodeSingleTps).toBeLessThan(50);
	});

	it("uses active parameters for MoE decode and MLA compressed KV cache", () => {
		const kvBytes = getKvCacheBytesPerToken(deepseekR1, "fp8");
		// 61 layers * 576 elements * 1 byte = 35,136 bytes/token (~35 KB/tok)
		expect(kvBytes).toBe(61 * 576);
	});
});

describe("evaluateUserSubmission", () => {
	it("classifies high MBU real-world benchmark as S-Tier extreme optimization", () => {
		const h100 = requireGpu("nvidia-h100-sxm-80gb");
		const llama70b = requireModel("llama-3.3-70b");
		const theo = evaluateGpuPerformance(h100, llama70b, {
			gpuCount: 1,
			weightPrecision: "fp8",
			kvPrecision: "fp8",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		const report = evaluateUserSubmission(theo, 10850, 38.4);
		expect(report.tier).toBe("extreme");
		expect(report.mbuPct).toBeGreaterThan(75);
		expect(report.mfuPct).toBeGreaterThan(70);
	});
});

describe("inferModelSpecFromRepoId", () => {
	it("infers MoE active/total params, Llama-4 experts, and quantization from HuggingFace repo names", () => {
		const qwenMoe = inferModelSpecFromRepoId("Qwen/Qwen3-30B-A3B-FP8");
		expect(qwenMoe?.architecture).toBe("moe");
		expect(qwenMoe?.totalParamsB).toBe(30);
		expect(qwenMoe?.activeParamsB).toBe(3);
		expect(qwenMoe?.defaultPrecision).toBe("fp8");

		const llama4Scout = inferModelSpecFromRepoId("meta-llama/Llama-4-Scout-17B-16E-FP8");
		expect(llama4Scout?.architecture).toBe("moe");
		expect(llama4Scout?.totalParamsB).toBe(109);
		expect(llama4Scout?.activeParamsB).toBe(17);
		expect(llama4Scout?.defaultPrecision).toBe("fp8");

		const denseAwq = inferModelSpecFromRepoId(
			"https://huggingface.co/casperhansen/llama-3.3-70b-instruct-awq",
		);
		expect(denseAwq?.architecture).toBe("dense");
		expect(denseAwq?.totalParamsB).toBe(70);
		expect(denseAwq?.defaultPrecision).toBe("int4");
	});
});

describe("hardware precision filters & actual benchmark resolution", () => {
	it("filters GPUs by FP32, FP16, BF16, FP8, and INT4 support", () => {
		const v100 = requireGpu("nvidia-v100-sxm2-32gb");
		const h100 = requireGpu("nvidia-h100-sxm-80gb");
		const b200 = requireGpu("nvidia-b200-sxm-192gb");

		expect(gpuSupportsHardwarePrecision(v100, "fp32")).toBe(true);
		expect(gpuSupportsHardwarePrecision(v100, "fp16")).toBe(true);
		expect(gpuSupportsHardwarePrecision(v100, "bf16")).toBe(false);
		expect(gpuSupportsHardwarePrecision(v100, "fp8")).toBe(false);

		expect(gpuSupportsHardwarePrecision(h100, "bf16")).toBe(true);
		expect(gpuSupportsHardwarePrecision(h100, "fp8")).toBe(true);
		expect(getHardwareTflopsByCapability(b200, "fp32")).toBe(75);
		expect(getHardwareTflopsByCapability(b200, "fp8")).toBe(4500);
	});

	it("resolves direct and MBU-projected actual benchmarks for a GPU", () => {
		const h100 = requireGpu("nvidia-h100-sxm-80gb");
		const llama70b = requireModel("llama-3.3-70b");
		const qwen8b = requireModel("qwen3-8b");

		const theo70b = evaluateGpuPerformance(h100, llama70b, {
			gpuCount: 1,
			weightPrecision: "fp8",
			kvPrecision: "fp8",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		const exact = resolveActualBenchmarkForGpu(h100, theo70b, INITIAL_COMMUNITY_SUBMISSIONS);
		expect(exact.isDirectMatch).toBe(true);
		expect(exact.actualDecodeTps).toBe(38.4);

		const theo8b = evaluateGpuPerformance(h100, qwen8b, {
			gpuCount: 1,
			weightPrecision: "fp8",
			kvPrecision: "fp8",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		const projected = resolveActualBenchmarkForGpu(h100, theo8b, INITIAL_COMMUNITY_SUBMISSIONS);
		expect(projected.isDirectMatch).toBe(false);
		expect(projected.actualDecodeTps).toBeGreaterThan(200);
	});

	it("includes full Intel GPU and AI accelerator lineup across Datacenter, Workstation, and Consumer tiers", () => {
		const intelGpus = GPU_CATALOG.filter((g) => g.vendor === "Intel");
		expect(intelGpus.map((g) => g.id)).toEqual([
			"intel-gaudi-3-128gb",
			"intel-max-1550-128gb",
			"intel-gaudi-2-96gb",
			"intel-arc-pro-b60-24gb",
			"intel-arc-a770-16gb",
			"intel-arc-b580-12gb",
		]);

		const gaudi2 = requireGpu("intel-gaudi-2-96gb");
		const max1550 = requireGpu("intel-max-1550-128gb");
		const arcProB60 = requireGpu("intel-arc-pro-b60-24gb");
		const arcA770 = requireGpu("intel-arc-a770-16gb");

		expect(gpuSupportsHardwarePrecision(gaudi2, "fp8")).toBe(true);
		expect(gpuSupportsHardwarePrecision(max1550, "bf16")).toBe(true);
		expect(gpuSupportsHardwarePrecision(max1550, "fp8")).toBe(false);
		expect(gpuSupportsHardwarePrecision(arcProB60, "int4")).toBe(true);
		expect(gpuSupportsHardwarePrecision(arcA770, "int4")).toBe(true);

		const qwenMoe = requireModel("qwen3-30b-a3b");
		const b60Eval = evaluateGpuPerformance(arcProB60, qwenMoe, {
			gpuCount: 1,
			weightPrecision: "int4",
			kvPrecision: "fp8",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		expect(b60Eval.vramStatus).not.toBe("oom");
		const b60Actual = resolveActualBenchmarkForGpu(
			arcProB60,
			b60Eval,
			INITIAL_COMMUNITY_SUBMISSIONS,
		);
		expect(b60Actual.isDirectMatch).toBe(true);
		expect(b60Actual.actualDecodeTps).toBe(66.0);
	});
});

describe("short display name formatters", () => {
	it("strips redundant vendor prefixes, VRAM tokens, and model tags cleanly", () => {
		const b300 = requireGpu("nvidia-b300-sxm-288gb");
		const m3Ultra = requireGpu("apple-m3-ultra-512gb");
		const tpuV6e = requireGpu("google-tpu-v6e-32gb");
		const strixHalo = requireGpu("amd-ryzen-ai-max-395-128gb");

		expect(formatGpuShortName(b300)).toBe("HGX B300 SXM");
		expect(formatGpuShortName(m3Ultra)).toBe("M3 Ultra (80-core GPU)");
		expect(formatGpuShortName(tpuV6e)).toBe("Cloud TPU v6e (Trillium)");
		expect(formatGpuShortName(strixHalo)).toBe("Ryzen AI Max+ 395 (Strix Halo)");

		const qwen32b = requireModel("qwen3-32b");
		const deepseek = requireModel("deepseek-r1-671b");
		const kimi = requireModel("kimi-k2-1t-a32b");

		expect(formatModelShortName(qwen32b)).toBe("Qwen3-32B");
		expect(formatModelShortName(deepseek)).toBe("DeepSeek-V3.1 / R1-0528");
		expect(formatModelShortName(kimi)).toBe("Kimi-K2-Instruct");
	});
});
