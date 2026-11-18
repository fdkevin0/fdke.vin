import { assert, describe, expect, it } from "vitest";
import {
	buildCustomModelSpec,
	evaluateGpuPerformance,
	evaluateUserSubmission,
	formatGpuShortName,
	formatInterconnectName,
	formatModelShortName,
	GPU_CATALOG,
	getEffectivePeakTflops,
	getHardwareTflopsByCapability,
	getKvCacheBytesPerToken,
	gpuSupportsHardwarePrecision,
	INITIAL_COMMUNITY_SUBMISSIONS,
	inferModelSpecFromRepoId,
	isSafeHttpUrl,
	isValidUserSubmission,
	MODEL_CATALOG,
	parseHuggingFaceConfig,
	parseHuggingFaceModelRef,
	resolveActualBenchmarkForGpu,
	resolveSubmissionModelSpec,
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
		expect(parseHuggingFaceModelRef("https://huggingface.co/Qwen/Qwen3-8B.git")).toBe(
			"Qwen/Qwen3-8B",
		);
		expect(parseHuggingFaceModelRef("huggingface.co/Qwen/Qwen3-8B")).toBe("Qwen/Qwen3-8B");
		expect(parseHuggingFaceModelRef("www.huggingface.co/Qwen/Qwen3-8B")).toBe("Qwen/Qwen3-8B");
		expect(parseHuggingFaceModelRef("hf.co/Qwen/Qwen3-8B")).toBe("Qwen/Qwen3-8B");
	});

	it("rejects invalid URLs, single-segment inputs, and path-traversal segments", () => {
		expect(parseHuggingFaceModelRef("")).toBeNull();
		expect(parseHuggingFaceModelRef("llama-70b")).toBeNull();
		expect(parseHuggingFaceModelRef("https://example.com/Qwen/Qwen3-8B")).toBeNull();
		expect(parseHuggingFaceModelRef("huggingface.co/Qwen")).toBeNull();
		expect(parseHuggingFaceModelRef("huggingface.co")).toBeNull();
		expect(parseHuggingFaceModelRef("../models")).toBeNull();
		expect(parseHuggingFaceModelRef("Qwen/..")).toBeNull();
		expect(parseHuggingFaceModelRef(".bad/repo")).toBeNull();
		expect(parseHuggingFaceModelRef("Qwen/a..b")).toBeNull();
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

describe("evaluateGpuPerformance", () => {
	it("marks 1x RTX 4090 running Llama-3.3-70B FP16 as OOM", () => {
		const rtx4090 = GPU_CATALOG.find((g) => g.id === "nvidia-rtx-4090-24gb");
		const llama70b = MODEL_CATALOG.find((m) => m.id === "llama-3.3-70b");
		assert(rtx4090);
		assert(llama70b);

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
	});

	it("computes realistic memory-bound decode TPS for 1x H100 80GB on Llama-3.3-70B FP8", () => {
		const h100 = GPU_CATALOG.find((g) => g.id === "nvidia-h100-sxm-80gb");
		const llama70b = MODEL_CATALOG.find((m) => m.id === "llama-3.3-70b");
		assert(h100);
		assert(llama70b);

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
		expect(result.decodeSingleTps).toBeGreaterThan(42);
		expect(result.decodeSingleTps).toBeLessThan(50);
	});

	it("uses active parameters for MoE decode and MLA compressed KV cache", () => {
		const deepseekR1 = MODEL_CATALOG.find((m) => m.id === "deepseek-r1-671b");
		assert(deepseekR1);

		const kvBytes = getKvCacheBytesPerToken(deepseekR1, "fp8");
		expect(kvBytes).toBe(61 * 576);
	});

	it("uses native INT4/FP4 peak compute on Blackwell without clamping to FP8", () => {
		const b200 = GPU_CATALOG.find((g) => g.id === "nvidia-b200-sxm-192gb");
		const h100 = GPU_CATALOG.find((g) => g.id === "nvidia-h100-sxm-80gb");
		assert(b200);
		assert(h100);

		expect(getEffectivePeakTflops(b200, "int4")).toBe(9000);
		expect(getEffectivePeakTflops(h100, "int4")).toBe(989);
	});
});

describe("evaluateUserSubmission", () => {
	it("classifies high MBU benchmark and handles null prefill TPS cleanly", () => {
		const h100 = GPU_CATALOG.find((g) => g.id === "nvidia-h100-sxm-80gb");
		const llama70b = MODEL_CATALOG.find((m) => m.id === "llama-3.3-70b");
		assert(h100);
		assert(llama70b);

		const theo = evaluateGpuPerformance(h100, llama70b, {
			gpuCount: 1,
			weightPrecision: "fp8",
			kvPrecision: "fp8",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		const fullReport = evaluateUserSubmission(theo, 10850, 38.4);
		expect(fullReport.tier).toBe("extreme");
		expect(fullReport.mbuPct).toBeGreaterThan(75);
		expect(fullReport.mfuPct).toBeGreaterThan(70);

		const decodeOnlyReport = evaluateUserSubmission(theo, null, 38.4);
		expect(decodeOnlyReport.mfuPct).toBeNull();
		expect(decodeOnlyReport.mbuPct).toBeGreaterThan(75);
	});
});

describe("inferModelSpecFromRepoId", () => {
	it("infers MoE active/total params, distilled dense repos, family aliases, and safetensors fallback", () => {
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

		const distilledGguf = inferModelSpecFromRepoId("bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF");
		expect(distilledGguf?.architecture).toBe("dense");
		expect(distilledGguf?.totalParamsB).toBe(32);
		expect(distilledGguf?.activeParamsB).toBe(32);

		const fullDeepSeek = inferModelSpecFromRepoId("deepseek-ai/DeepSeek-R1");
		expect(fullDeepSeek?.architecture).toBe("moe");
		expect(fullDeepSeek?.totalParamsB).toBe(671);

		const gatedFallback = inferModelSpecFromRepoId(
			"CohereLabs/c4ai-command-a-03-2025",
			111_000_000_000,
		);
		expect(gatedFallback?.architecture).toBe("dense");
		expect(gatedFallback?.totalParamsB).toBe(111);
	});
});

describe("hardware precision filters & actual benchmark resolution", () => {
	it("filters GPUs by FP32, FP16, BF16, FP8, and INT4 support", () => {
		const v100 = GPU_CATALOG.find((g) => g.id === "nvidia-v100-sxm2-32gb");
		const h100 = GPU_CATALOG.find((g) => g.id === "nvidia-h100-sxm-80gb");
		const b200 = GPU_CATALOG.find((g) => g.id === "nvidia-b200-sxm-192gb");
		assert(v100);
		assert(h100);
		assert(b200);

		expect(gpuSupportsHardwarePrecision(v100, "fp32")).toBe(true);
		expect(gpuSupportsHardwarePrecision(v100, "fp16")).toBe(true);
		expect(gpuSupportsHardwarePrecision(v100, "bf16")).toBe(false);
		expect(gpuSupportsHardwarePrecision(v100, "fp8")).toBe(false);

		expect(gpuSupportsHardwarePrecision(h100, "bf16")).toBe(true);
		expect(gpuSupportsHardwarePrecision(h100, "fp8")).toBe(true);
		expect(getHardwareTflopsByCapability(b200, "fp32")).toBe(75);
		expect(getHardwareTflopsByCapability(b200, "fp8")).toBe(4500);
	});

	it("requires matching precision and workload for direct benchmark matches and projects otherwise", () => {
		const h100 = GPU_CATALOG.find((g) => g.id === "nvidia-h100-sxm-80gb");
		const rtx4090 = GPU_CATALOG.find((g) => g.id === "nvidia-rtx-4090-24gb");
		const llama70b = MODEL_CATALOG.find((m) => m.id === "llama-3.3-70b");
		const qwen8b = MODEL_CATALOG.find((m) => m.id === "qwen3-8b");
		assert(h100);
		assert(rtx4090);
		assert(llama70b);
		assert(qwen8b);

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

		const theo4090Fp16 = evaluateGpuPerformance(rtx4090, qwen8b, {
			gpuCount: 1,
			weightPrecision: "fp16",
			kvPrecision: "fp16",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		const crossPrecision = resolveActualBenchmarkForGpu(
			rtx4090,
			theo4090Fp16,
			INITIAL_COMMUNITY_SUBMISSIONS,
		);
		expect(crossPrecision.isDirectMatch).toBe(false);
		expect(crossPrecision.mbuPct).toBeLessThan(100);
	});
});

describe("custom model builder, display formatters, and safety validators", () => {
	it("formats short names and interconnect labels cleanly", () => {
		const b300 = GPU_CATALOG.find((g) => g.id === "nvidia-b300-sxm-288gb");
		const m3Ultra = GPU_CATALOG.find((g) => g.id === "apple-m3-ultra-512gb");
		const tpuV6e = GPU_CATALOG.find((g) => g.id === "google-tpu-v6e-32gb");
		const strixHalo = GPU_CATALOG.find((g) => g.id === "amd-ryzen-ai-max-395-128gb");
		assert(b300);
		assert(m3Ultra);
		assert(tpuV6e);
		assert(strixHalo);

		expect(formatGpuShortName(b300)).toBe("HGX B300 SXM");
		expect(formatGpuShortName(m3Ultra)).toBe("M3 Ultra (80-core GPU)");
		expect(formatGpuShortName(tpuV6e)).toBe("Cloud TPU v6e (Trillium)");
		expect(formatGpuShortName(strixHalo)).toBe("Ryzen AI Max+ 395 (Strix Halo)");

		expect(formatInterconnectName(tpuV6e.interconnect)).toBe("ICI");
		expect(formatInterconnectName("infinity_fabric")).toBe("Infinity Fabric");

		const qwen32b = MODEL_CATALOG.find((m) => m.id === "qwen3-32b");
		const deepseek = MODEL_CATALOG.find((m) => m.id === "deepseek-r1-671b");
		const kimi = MODEL_CATALOG.find((m) => m.id === "kimi-k2-1t-a32b");
		assert(qwen32b);
		assert(deepseek);
		assert(kimi);

		expect(formatModelShortName(qwen32b)).toBe("Qwen3-32B");
		expect(formatModelShortName(deepseek)).toBe("DeepSeek-V3.1 / R1-0528");
		expect(formatModelShortName(kimi)).toBe("Kimi-K2-Instruct");
	});

	it("builds clean dense/MoE custom specs and validates URLs and stored submissions", () => {
		const b300 = GPU_CATALOG.find((g) => g.id === "nvidia-b300-sxm-288gb");
		assert(b300);

		const customDense = buildCustomModelSpec({
			totalParamsB: 70,
			activeParamsB: 70,
		});
		expect(customDense.id).toBe("custom:70b");
		expect(customDense.name).toBe("Custom 70B");
		expect(customDense.architecture).toBe("dense");
		expect(customDense.numLayers).toBe(80);
		expect(customDense.mlaKvElementsPerLayer).toBeNull();
		expect(customDense.hfRepoId).toBe("");

		const customMoe = buildCustomModelSpec({
			totalParamsB: 400,
			activeParamsB: 22.2,
		});
		expect(customMoe.id).toBe("custom:400b-a22.2b");
		expect(customMoe.name).toBe("Custom 400B-A22.2B");
		expect(customMoe.architecture).toBe("moe");

		const custom8b = buildCustomModelSpec({
			totalParamsB: 8,
			activeParamsB: 8,
		});
		const restoredMoe = resolveSubmissionModelSpec(
			{
				modelId: "custom:400b-a22.2b",
				modelName: "Custom 400B-A22.2B",
				totalParamsB: 400,
				activeParamsB: 22.2,
				weightPrecision: "int4",
			},
			custom8b,
		);
		assert(restoredMoe);
		expect(restoredMoe.architecture).toBe("moe");
		expect(restoredMoe.totalParamsB).toBe(400);
		expect(restoredMoe.activeParamsB).toBe(22.2);

		const restoredHf = resolveSubmissionModelSpec(
			{
				modelId: "hf:coherelabs/c4ai-command-a-03-2025",
				modelName: "c4ai-command-a-03-2025",
				totalParamsB: 111,
				activeParamsB: 111,
				weightPrecision: "fp8",
			},
			custom8b,
		);
		assert(restoredHf);
		expect(restoredHf.totalParamsB).toBe(111);
		expect(restoredHf.activeParamsB).toBe(111);

		const custom8bTheo = evaluateGpuPerformance(b300, custom8b, {
			gpuCount: 4,
			weightPrecision: "int4",
			kvPrecision: "fp8",
			inputTokens: 2048,
			outputTokens: 512,
			batchSize: 1,
		});
		const crossSizeBench = resolveActualBenchmarkForGpu(b300, custom8bTheo, [
			{
				id: "user-moe-400",
				gpuId: b300.id,
				gpuCount: 4,
				modelId: customMoe.id,
				modelName: customMoe.name,
				totalParamsB: 400,
				activeParamsB: 22.2,
				weightPrecision: "int4",
				kvPrecision: "fp8",
				engine: "vLLM",
				inputTokens: 2048,
				outputTokens: 512,
				batchSize: 1,
				actualPrefillTps: null,
				actualDecodeSingleTps: 1200,
				notes: "",
			},
		]);
		expect(crossSizeBench.isDirectMatch).toBe(false);
		expect(crossSizeBench.mbuPct).toBeLessThan(100);

		expect(isSafeHttpUrl("https://huggingface.co/Qwen/Qwen3-8B")).toBe(true);
		expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);

		expect(isValidUserSubmission({ id: "bad", gpuId: "nvidia-h100-sxm-80gb" })).toBe(false);
		expect(
			isValidUserSubmission({
				id: "user-1",
				gpuId: "nvidia-h100-sxm-80gb",
				gpuCount: 1,
				modelId: "qwen3-32b",
				modelName: "Qwen3-32B",
				totalParamsB: 400,
				activeParamsB: 22.2,
				weightPrecision: "int4",
				kvPrecision: "fp8",
				engine: "vLLM",
				inputTokens: 2048,
				outputTokens: 512,
				batchSize: 1,
				actualPrefillTps: null,
				actualDecodeSingleTps: 140,
				notes: "FP8 KV",
				sourceUrl: "https://example.com/bench",
			}),
		).toBe(true);
		expect(
			isValidUserSubmission({
				id: "user-bad-params",
				gpuId: "nvidia-h100-sxm-80gb",
				gpuCount: 1,
				modelId: "custom:400b",
				modelName: "Custom 400B",
				totalParamsB: -5,
				activeParamsB: 22.2,
				weightPrecision: "int4",
				kvPrecision: "fp8",
				engine: "vLLM",
				inputTokens: 2048,
				outputTokens: 512,
				batchSize: 1,
				actualPrefillTps: null,
				actualDecodeSingleTps: 140,
				notes: "",
			}),
		).toBe(false);
		expect(
			isValidUserSubmission({
				id: "user-2",
				gpuId: "nvidia-h100-sxm-80gb",
				gpuCount: 1,
				modelId: "qwen3-32b",
				modelName: "Qwen3-32B",
				weightPrecision: "int4",
				kvPrecision: "fp8",
				engine: "vLLM",
				inputTokens: 2048,
				outputTokens: 512,
				batchSize: 1,
				actualPrefillTps: null,
				actualDecodeSingleTps: 140,
				notes: "",
				sourceUrl: "javascript:alert(1)",
			}),
		).toBe(false);
	});
});
