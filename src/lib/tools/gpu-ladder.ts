export type GpuVendor = "NVIDIA" | "AMD" | "Apple" | "Huawei" | "Intel" | "Google";

export type InterconnectType =
	"nvlink" | "ici" | "infinity_fabric" | "unified" | "hccs" | "xe_link" | "roce" | "pcie";

export type Precision = "fp16" | "fp8" | "int8" | "int4";

export type HardwarePrecision = "fp32" | "fp16" | "bf16" | "fp8" | "int8" | "int4";

export type LadderSortMetric =
	"decodeSingleTps" | "actualDecodeTps" | "prefillTps" | "memBandwidthGbs" | "computeTflops";

export interface GpuSpec {
	id: string;
	name: string;
	vendor: GpuVendor;
	architecture: string;
	releaseYear: number;
	vramGb: number;
	memBandwidthGbs: number;
	fp32Tflops: number;
	fp16Tflops: number;
	bf16Tflops: number | null;
	fp8Tflops: number | null;
	int8Tflops: number;
	int4Tflops: number | null;
	interconnect: InterconnectType;
	interconnectBandwidthGbs: number;
	tdpWatts: number;
	/** Primary source attribution for hardware specs. */
	sourceName: string;
	/** Direct URL to architecture whitepaper, datasheet, or curated database record. */
	sourceUrl: string;
	/** Notes explaining dense vs sparse or accumulator calibration. */
	calibrationNote: string;
}

export interface DataSourceReference {
	name: string;
	url: string;
	license: string;
	description: string;
}

export interface LlmModelSpec {
	id: string;
	name: string;
	hfRepoId: string;
	architecture: "dense" | "moe";
	totalParamsB: number;
	activeParamsB: number;
	numLayers: number;
	hiddenSize: number;
	numKeyValueHeads: number;
	headDim: number;
	/** Compressed KV elements per token per layer (e.g. 576 for DeepSeek/Kimi MLA). Null for standard MHA/GQA. */
	mlaKvElementsPerLayer?: number | null | undefined;
	defaultPrecision?: Precision | undefined;
}

export interface WorkloadConfig {
	gpuCount: number;
	weightPrecision: Precision;
	kvPrecision: Precision;
	inputTokens: number;
	outputTokens: number;
	batchSize: number;
}

export interface TheoreticalEvaluation {
	gpu: GpuSpec;
	gpuCount: number;
	model: LlmModelSpec;
	workload: WorkloadConfig;
	weightsVramGb: number;
	kvCacheVramGb: number;
	overheadVramGb: number;
	totalVramGb: number;
	availableVramGb: number;
	vramUtilizationPct: number;
	vramStatus: "comfortable" | "tight" | "oom";
	effectiveTflopsPerGpu: number;
	multiGpuComputeEfficiency: number;
	multiGpuBandwidthEfficiency: number;
	prefillFlopsPerToken: number;
	prefillTps: number;
	ttftMs: number;
	decodeBytesPerStep: number;
	decodeSingleTps: number;
	tpotMs: number;
	endToEndLatencySec: number;
	ridgePointOpsPerByte: number;
	decodeArithmeticIntensity: number;
	bottleneck: "memory_bandwidth" | "compute" | "oom";
}

export type InfraOptimizationTier =
	"speculative_boost" | "extreme" | "production" | "suboptimal" | "bottlenecked";

export interface RealWorldSubmission {
	id: string;
	gpuId: string;
	gpuCount: number;
	modelId: string;
	modelName: string;
	totalParamsB?: number | undefined;
	activeParamsB?: number | undefined;
	weightPrecision: Precision;
	kvPrecision: Precision;
	engine: string;
	inputTokens: number;
	outputTokens: number;
	batchSize: number;
	actualPrefillTps: number | null;
	actualDecodeSingleTps: number;
	notes: string;
	sourceUrl?: string | undefined;
}

export interface InfraEfficiencyReport {
	mbuPct: number;
	mfuPct: number | null;
	decodeCeilingPct: number;
	tier: InfraOptimizationTier;
	tierLabel: string;
}

export const PRECISION_BYTES: Record<Precision, number> = {
	fp16: 2.0,
	fp8: 1.0,
	int8: 1.05,
	int4: 0.56,
};

export const DATA_SOURCES_REGISTRY: DataSourceReference[] = [
	{
		name: "Epoch AI Machine Learning Hardware Dataset (ml_hardware.csv)",
		url: "https://epoch.ai/data/machine-learning-hardware",
		license: "CC-BY 4.0",
		description:
			"Primary dataset for AI accelerators, separating vector FP32/FP16 from Tensor-FP16/BF16, INT8, INT4, HBM bandwidth, intranode interconnect bandwidth, and official datasheet links.",
	},
	{
		name: "dbgpu / TechPowerUp GPU Specs Database",
		url: "https://github.com/painebenjamin/dbgpu",
		license: "MIT / Public Specs",
		description:
			"Consumer and workstation GPU memory bus widths, GDDR6X/GDDR7 memory bandwidth, die sizes, and TDP specifications.",
	},
	{
		name: "NVIDIA / AMD / Intel / Apple Official Architecture Whitepapers",
		url: "https://resources.nvidia.com/en-us-blackwell-architecture",
		license: "Vendor Datasheets",
		description:
			"Ground-truth calibration layer stripping 2:4 structured sparsity (50% dense ratio) and normalizing FP16 with FP32 accumulate.",
	},
	{
		name: "SemiAnalysis InferenceMAX & vLLM Performance Dashboard",
		url: "https://inferencex.semianalysis.com/",
		license: "Open Benchmark",
		description:
			"Continuous datacenter inference benchmarks across B200, H200, H100, MI325X, and MI300X running vLLM, SGLang, and TensorRT-LLM.",
	},
	{
		name: "ggml-org/llama.cpp Official Hardware Benchmark Discussions (#4167 / #10879)",
		url: "https://github.com/ggml-org/llama.cpp/discussions/4167",
		license: "MIT",
		description:
			"Standardized llama-bench pp512 (Prefill) and tg128 (Decode) measurements across Apple Silicon M1–M4 and consumer GeForce/Radeon GPUs.",
	},
];

export const GPU_CATALOG: GpuSpec[] = [
	{
		id: "nvidia-b300-sxm-288gb",
		name: "NVIDIA HGX B300 SXM 288GB",
		vendor: "NVIDIA",
		architecture: "Blackwell Ultra",
		releaseYear: 2025,
		vramGb: 288,
		memBandwidthGbs: 8000,
		fp32Tflops: 75,
		fp16Tflops: 2250,
		bf16Tflops: 2250,
		fp8Tflops: 4500,
		int8Tflops: 4500,
		int4Tflops: 13500,
		interconnect: "nvlink",
		interconnectBandwidthGbs: 1800,
		tdpWatts: 1200,
		sourceName: "NVIDIA Blackwell Ultra Datasheet + Epoch AI",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "Dense Tensor Core TFLOPS (excludes 2:4 sparsity); 12-Hi HBM3e 288GB",
	},
	{
		id: "nvidia-b200-sxm-192gb",
		name: "NVIDIA HGX B200 SXM 192GB",
		vendor: "NVIDIA",
		architecture: "Blackwell",
		releaseYear: 2024,
		vramGb: 192,
		memBandwidthGbs: 8000,
		fp32Tflops: 75,
		fp16Tflops: 2250,
		bf16Tflops: 2250,
		fp8Tflops: 4500,
		int8Tflops: 4500,
		int4Tflops: 9000,
		interconnect: "nvlink",
		interconnectBandwidthGbs: 1800,
		tdpWatts: 1000,
		sourceName: "NVIDIA Blackwell Architecture Technical Brief",
		sourceUrl: "https://resources.nvidia.com/en-us-blackwell-architecture",
		calibrationNote: "Dense Tensor Core TFLOPS (excludes 2:4 sparsity); NVFP4 at 9000 TFLOPS dense",
	},
	{
		id: "nvidia-h200-sxm-141gb",
		name: "NVIDIA HGX H200 SXM 141GB",
		vendor: "NVIDIA",
		architecture: "Hopper",
		releaseYear: 2024,
		vramGb: 141,
		memBandwidthGbs: 4800,
		fp32Tflops: 67,
		fp16Tflops: 989,
		bf16Tflops: 989,
		fp8Tflops: 1979,
		int8Tflops: 1979,
		int4Tflops: null,
		interconnect: "nvlink",
		interconnectBandwidthGbs: 900,
		tdpWatts: 700,
		sourceName: "NVIDIA H200 Tensor Core GPU Datasheet",
		sourceUrl: "https://www.nvidia.com/en-us/data-center/h200/",
		calibrationNote: "Dense Tensor Core TFLOPS (1979 FP16 sparse halved to 989 dense)",
	},
	{
		id: "nvidia-h100-sxm-80gb",
		name: "NVIDIA HGX H100 SXM5 80GB",
		vendor: "NVIDIA",
		architecture: "Hopper",
		releaseYear: 2022,
		vramGb: 80,
		memBandwidthGbs: 3350,
		fp32Tflops: 67,
		fp16Tflops: 989,
		bf16Tflops: 989,
		fp8Tflops: 1979,
		int8Tflops: 1979,
		int4Tflops: null,
		interconnect: "nvlink",
		interconnectBandwidthGbs: 900,
		tdpWatts: 700,
		sourceName: "NVIDIA H100 Datasheet + Epoch AI",
		sourceUrl: "https://resources.nvidia.com/en-us-tensor-core",
		calibrationNote: "Dense Tensor Core TFLOPS (excludes 2:4 sparsity); HBM3 3.35 TB/s",
	},
	{
		id: "nvidia-h100-pcie-80gb",
		name: "NVIDIA H100 PCIe 80GB",
		vendor: "NVIDIA",
		architecture: "Hopper",
		releaseYear: 2022,
		vramGb: 80,
		memBandwidthGbs: 2000,
		fp32Tflops: 51,
		fp16Tflops: 756,
		bf16Tflops: 756,
		fp8Tflops: 1513,
		int8Tflops: 1513,
		int4Tflops: null,
		interconnect: "pcie",
		interconnectBandwidthGbs: 128,
		tdpWatts: 350,
		sourceName: "NVIDIA H100 PCIe Product Brief + Epoch AI",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "Dense Tensor Core TFLOPS; PCIe Gen5 x16 (128 GB/s bidirectional)",
	},
	{
		id: "nvidia-h20-96gb",
		name: "NVIDIA HGX H20 SXM 96GB",
		vendor: "NVIDIA",
		architecture: "Hopper",
		releaseYear: 2024,
		vramGb: 96,
		memBandwidthGbs: 4000,
		fp32Tflops: 44,
		fp16Tflops: 148,
		bf16Tflops: 148,
		fp8Tflops: 296,
		int8Tflops: 296,
		int4Tflops: null,
		interconnect: "nvlink",
		interconnectBandwidthGbs: 900,
		tdpWatts: 500,
		sourceName: "Epoch AI ML Hardware Dataset + SemiAnalysis",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "High-bandwidth HBM3 (4.0 TB/s) with export-capped Tensor Core compute",
	},
	{
		id: "nvidia-rtx-pro-6000-blackwell-96gb",
		name: "NVIDIA RTX PRO 6000 Blackwell 96GB",
		vendor: "NVIDIA",
		architecture: "Blackwell",
		releaseYear: 2025,
		vramGb: 96,
		memBandwidthGbs: 1792,
		fp32Tflops: 126,
		fp16Tflops: 504,
		bf16Tflops: 504,
		fp8Tflops: 1008,
		int8Tflops: 1008,
		int4Tflops: 2016,
		interconnect: "pcie",
		interconnectBandwidthGbs: 128,
		tdpWatts: 600,
		sourceName: "NVIDIA RTX PRO 6000 Blackwell Datasheet",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/",
		calibrationNote: "96GB GDDR7 ECC workstation card; Dense Tensor Core TFLOPS",
	},
	{
		id: "nvidia-l40s-48gb",
		name: "NVIDIA L40S 48GB",
		vendor: "NVIDIA",
		architecture: "Ada Lovelace",
		releaseYear: 2023,
		vramGb: 48,
		memBandwidthGbs: 864,
		fp32Tflops: 91.6,
		fp16Tflops: 362,
		bf16Tflops: 362,
		fp8Tflops: 733,
		int8Tflops: 733,
		int4Tflops: 1466,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 350,
		sourceName: "NVIDIA L40S Datasheet + Epoch AI",
		sourceUrl: "https://www.nvidia.com/en-us/data-center/l40s/",
		calibrationNote: "Dense Tensor Core TFLOPS (733 FP16 sparse halved to 362 dense)",
	},
	{
		id: "nvidia-a100-sxm-80gb",
		name: "NVIDIA A100 SXM4 80GB",
		vendor: "NVIDIA",
		architecture: "Ampere",
		releaseYear: 2020,
		vramGb: 80,
		memBandwidthGbs: 2039,
		fp32Tflops: 19.5,
		fp16Tflops: 312,
		bf16Tflops: 312,
		fp8Tflops: null,
		int8Tflops: 624,
		int4Tflops: 1248,
		interconnect: "nvlink",
		interconnectBandwidthGbs: 600,
		tdpWatts: 400,
		sourceName: "NVIDIA A100 Tensor Core GPU Datasheet",
		sourceUrl:
			"https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-nvidia-us-2188504-web.pdf",
		calibrationNote: "Dense Tensor Core TFLOPS; Ampere lacks native FP8 Tensor Cores",
	},
	{
		id: "nvidia-a100-pcie-80gb",
		name: "NVIDIA A100 PCIe 80GB",
		vendor: "NVIDIA",
		architecture: "Ampere",
		releaseYear: 2020,
		vramGb: 80,
		memBandwidthGbs: 1935,
		fp32Tflops: 19.5,
		fp16Tflops: 312,
		bf16Tflops: 312,
		fp8Tflops: null,
		int8Tflops: 624,
		int4Tflops: 1248,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 300,
		sourceName: "NVIDIA A100 PCIe Datasheet + Epoch AI",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "Dense Tensor Core TFLOPS; PCIe Gen4 x16 interconnect",
	},
	{
		id: "nvidia-v100-sxm2-32gb",
		name: "NVIDIA Tesla V100 SXM2 32GB",
		vendor: "NVIDIA",
		architecture: "Volta",
		releaseYear: 2018,
		vramGb: 32,
		memBandwidthGbs: 900,
		fp32Tflops: 15.7,
		fp16Tflops: 125,
		bf16Tflops: null,
		fp8Tflops: null,
		int8Tflops: 62,
		int4Tflops: null,
		interconnect: "nvlink",
		interconnectBandwidthGbs: 300,
		tdpWatts: 300,
		sourceName: "NVIDIA V100 Architecture Whitepaper",
		sourceUrl:
			"https://images.nvidia.com/content/volta-architecture/pdf/volta-architecture-whitepaper.pdf",
		calibrationNote: "1st-Gen Tensor Cores (FP16 only; no native BF16, FP8, or INT4 Tensor Core)",
	},
	{
		id: "nvidia-t4-16gb",
		name: "NVIDIA Tesla T4 16GB",
		vendor: "NVIDIA",
		architecture: "Turing",
		releaseYear: 2018,
		vramGb: 16,
		memBandwidthGbs: 320,
		fp32Tflops: 8.1,
		fp16Tflops: 65,
		bf16Tflops: null,
		fp8Tflops: null,
		int8Tflops: 130,
		int4Tflops: 260,
		interconnect: "pcie",
		interconnectBandwidthGbs: 32,
		tdpWatts: 70,
		sourceName: "NVIDIA T4 Tensor Core Datasheet",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "Turing 2nd-Gen Tensor Cores (FP16 / INT8 / INT4; no BF16 or FP8)",
	},
	{
		id: "nvidia-rtx-5090-32gb",
		name: "NVIDIA GeForce RTX 5090 32GB",
		vendor: "NVIDIA",
		architecture: "Blackwell",
		releaseYear: 2025,
		vramGb: 32,
		memBandwidthGbs: 1792,
		fp32Tflops: 104.8,
		fp16Tflops: 419,
		bf16Tflops: 419,
		fp8Tflops: 838,
		int8Tflops: 838,
		int4Tflops: 1676,
		interconnect: "pcie",
		interconnectBandwidthGbs: 128,
		tdpWatts: 575,
		sourceName: "NVIDIA GeForce RTX 5090 Whitepaper + TechPowerUp",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/geforce-rtx-5090.c4216",
		calibrationNote: "Dense Tensor Core TFLOPS (FP16 accumulate); 512-bit GDDR7 at 28 Gbps",
	},
	{
		id: "nvidia-rtx-5080-16gb",
		name: "NVIDIA GeForce RTX 5080 16GB",
		vendor: "NVIDIA",
		architecture: "Blackwell",
		releaseYear: 2025,
		vramGb: 16,
		memBandwidthGbs: 960,
		fp32Tflops: 56.3,
		fp16Tflops: 225,
		bf16Tflops: 225,
		fp8Tflops: 450,
		int8Tflops: 450,
		int4Tflops: 900,
		interconnect: "pcie",
		interconnectBandwidthGbs: 128,
		tdpWatts: 360,
		sourceName: "NVIDIA Blackwell Consumer Whitepaper + TechPowerUp",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/geforce-rtx-5080.c4217",
		calibrationNote: "Dense Tensor Core TFLOPS; 256-bit GDDR7 at 30 Gbps (960 GB/s)",
	},
	{
		id: "nvidia-rtx-4090-24gb",
		name: "NVIDIA GeForce RTX 4090 24GB",
		vendor: "NVIDIA",
		architecture: "Ada Lovelace",
		releaseYear: 2022,
		vramGb: 24,
		memBandwidthGbs: 1008,
		fp32Tflops: 82.6,
		fp16Tflops: 330,
		bf16Tflops: 330,
		fp8Tflops: 660,
		int8Tflops: 660,
		int4Tflops: 1320,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 450,
		sourceName: "NVIDIA Ada GPU Architecture Whitepaper + TechPowerUp",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/geforce-rtx-4090.c3889",
		calibrationNote: "Dense Tensor Core TFLOPS (330 TFLOPS FP16 accumulate; 165.2 w/ FP32 acc)",
	},
	{
		id: "nvidia-rtx-4080-super-16gb",
		name: "NVIDIA GeForce RTX 4080 SUPER 16GB",
		vendor: "NVIDIA",
		architecture: "Ada Lovelace",
		releaseYear: 2024,
		vramGb: 16,
		memBandwidthGbs: 736,
		fp32Tflops: 52.2,
		fp16Tflops: 209,
		bf16Tflops: 209,
		fp8Tflops: 418,
		int8Tflops: 418,
		int4Tflops: 836,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 320,
		sourceName: "TechPowerUp GPU Database (dbgpu)",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/geforce-rtx-4080-super.c4182",
		calibrationNote: "Dense 4th-Gen Tensor Core TFLOPS; 256-bit GDDR6X (736 GB/s)",
	},
	{
		id: "nvidia-rtx-3090-24gb",
		name: "NVIDIA GeForce RTX 3090 24GB",
		vendor: "NVIDIA",
		architecture: "Ampere",
		releaseYear: 2020,
		vramGb: 24,
		memBandwidthGbs: 936,
		fp32Tflops: 35.6,
		fp16Tflops: 142,
		bf16Tflops: 142,
		fp8Tflops: null,
		int8Tflops: 284,
		int4Tflops: 568,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 350,
		sourceName: "NVIDIA Ampere GA102 Whitepaper + TechPowerUp",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/geforce-rtx-3090.c3622",
		calibrationNote: "Dense 3rd-Gen Tensor Core TFLOPS (142 FP16 acc; 71 w/ FP32 acc); no FP8",
	},
	{
		id: "nvidia-rtx-3060-12gb",
		name: "NVIDIA GeForce RTX 3060 12GB",
		vendor: "NVIDIA",
		architecture: "Ampere",
		releaseYear: 2021,
		vramGb: 12,
		memBandwidthGbs: 360,
		fp32Tflops: 12.7,
		fp16Tflops: 51,
		bf16Tflops: 51,
		fp8Tflops: null,
		int8Tflops: 102,
		int4Tflops: 204,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 170,
		sourceName: "TechPowerUp GPU Database (dbgpu)",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/geforce-rtx-3060-12-gb.c3682",
		calibrationNote: "Entry 12GB local LLM baseline; 192-bit GDDR6 (360 GB/s)",
	},
	{
		id: "amd-mi355x-288gb",
		name: "AMD Instinct MI355X 288GB",
		vendor: "AMD",
		architecture: "CDNA 4",
		releaseYear: 2025,
		vramGb: 288,
		memBandwidthGbs: 8000,
		fp32Tflops: 157,
		fp16Tflops: 2500,
		bf16Tflops: 2500,
		fp8Tflops: 5000,
		int8Tflops: 5000,
		int4Tflops: 10000,
		interconnect: "infinity_fabric",
		interconnectBandwidthGbs: 1075,
		tdpWatts: 1400,
		sourceName: "AMD Instinct MI350 Series Datasheet + Epoch AI",
		sourceUrl: "https://www.amd.com/en/products/accelerators/instinct.html",
		calibrationNote: "CDNA 4 Dense Matrix Core TFLOPS; native FP4/FP6/FP8 + 8 TB/s HBM3e",
	},
	{
		id: "amd-mi325x-256gb",
		name: "AMD Instinct MI325X 256GB",
		vendor: "AMD",
		architecture: "CDNA 3",
		releaseYear: 2024,
		vramGb: 256,
		memBandwidthGbs: 6000,
		fp32Tflops: 163,
		fp16Tflops: 1307,
		bf16Tflops: 1307,
		fp8Tflops: 2614,
		int8Tflops: 2614,
		int4Tflops: null,
		interconnect: "infinity_fabric",
		interconnectBandwidthGbs: 896,
		tdpWatts: 1000,
		sourceName: "AMD Instinct MI325X Datasheet + Epoch AI",
		sourceUrl: "https://www.amd.com/en/products/accelerators/instinct/mi300/mi325x.html",
		calibrationNote: "Dense Matrix Core TFLOPS (2614 sparse FP16 halved to 1307 dense)",
	},
	{
		id: "amd-mi300x-192gb",
		name: "AMD Instinct MI300X 192GB",
		vendor: "AMD",
		architecture: "CDNA 3",
		releaseYear: 2023,
		vramGb: 192,
		memBandwidthGbs: 5300,
		fp32Tflops: 163,
		fp16Tflops: 1307,
		bf16Tflops: 1307,
		fp8Tflops: 2614,
		int8Tflops: 2614,
		int4Tflops: null,
		interconnect: "infinity_fabric",
		interconnectBandwidthGbs: 896,
		tdpWatts: 750,
		sourceName: "AMD CDNA 3 Whitepaper + SemiAnalysis InferenceMAX",
		sourceUrl:
			"https://www.amd.com/content/dam/amd/en/documents/instinct-tech-docs/white-papers/amd-cdna-3-white-paper.pdf",
		calibrationNote: "Dense Matrix Core TFLOPS; 8-stack HBM3 192GB at 5.3 TB/s",
	},
	{
		id: "amd-mi250x-128gb",
		name: "AMD Instinct MI250X 128GB",
		vendor: "AMD",
		architecture: "CDNA 2",
		releaseYear: 2021,
		vramGb: 128,
		memBandwidthGbs: 3277,
		fp32Tflops: 95.7,
		fp16Tflops: 383,
		bf16Tflops: 383,
		fp8Tflops: null,
		int8Tflops: 383,
		int4Tflops: null,
		interconnect: "infinity_fabric",
		interconnectBandwidthGbs: 800,
		tdpWatts: 560,
		sourceName: "AMD Instinct MI250X Datasheet + Epoch AI",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "Dual-GCD OAM module (2x 64GB HBM2e); no native FP8 Matrix Cores",
	},
	{
		id: "amd-rx-7900-xtx-24gb",
		name: "AMD Radeon RX 7900 XTX 24GB",
		vendor: "AMD",
		architecture: "RDNA 3",
		releaseYear: 2022,
		vramGb: 24,
		memBandwidthGbs: 960,
		fp32Tflops: 61.4,
		fp16Tflops: 123,
		bf16Tflops: 123,
		fp8Tflops: null,
		int8Tflops: 246,
		int4Tflops: null,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 355,
		sourceName: "TechPowerUp GPU Database + ROCm Benchmarks",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/radeon-rx-7900-xtx.c3941",
		calibrationNote: "WMMA RDNA 3 AI Accelerators; 384-bit GDDR6 (960 GB/s)",
	},
	{
		id: "amd-ryzen-ai-max-395-128gb",
		name: "AMD Ryzen AI Max+ 395 (Strix Halo 128GB)",
		vendor: "AMD",
		architecture: "RDNA 3.5 Unified",
		releaseYear: 2025,
		vramGb: 128,
		memBandwidthGbs: 256,
		fp32Tflops: 29.8,
		fp16Tflops: 59.6,
		bf16Tflops: 59.6,
		fp8Tflops: null,
		int8Tflops: 119,
		int4Tflops: 119,
		interconnect: "unified",
		interconnectBandwidthGbs: 256,
		tdpWatts: 120,
		sourceName: "AMD Ryzen AI Max Series Specs + llama.cpp #10879",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/10879",
		calibrationNote: "256-bit LPDDR5X-8000 unified memory (up to 96–112GB allocatable to GPU)",
	},
	{
		id: "apple-m3-ultra-512gb",
		name: "Apple M3 Ultra 512GB (80-core GPU)",
		vendor: "Apple",
		architecture: "Apple Silicon M3",
		releaseYear: 2025,
		vramGb: 512,
		memBandwidthGbs: 819,
		fp32Tflops: 54.2,
		fp16Tflops: 108,
		bf16Tflops: 108,
		fp8Tflops: null,
		int8Tflops: 216,
		int4Tflops: 216,
		interconnect: "unified",
		interconnectBandwidthGbs: 2500,
		tdpWatts: 160,
		sourceName: "Apple M3 Ultra Spec Sheet + llama.cpp #4167",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/4167",
		calibrationNote: "819.2 GB/s Unified Memory; runs 671B 4-bit MoE in a single desktop node",
	},
	{
		id: "apple-m4-max-128gb",
		name: "Apple M4 Max 128GB (40-core GPU)",
		vendor: "Apple",
		architecture: "Apple Silicon M4",
		releaseYear: 2024,
		vramGb: 128,
		memBandwidthGbs: 546,
		fp32Tflops: 32.6,
		fp16Tflops: 65,
		bf16Tflops: 65,
		fp8Tflops: null,
		int8Tflops: 130,
		int4Tflops: 130,
		interconnect: "unified",
		interconnectBandwidthGbs: 1000,
		tdpWatts: 120,
		sourceName: "Apple M4 Max Technical Specs + llama.cpp #4167",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/4167",
		calibrationNote: "546 GB/s LPDDR5X-8533 Unified Memory",
	},
	{
		id: "apple-m2-ultra-192gb",
		name: "Apple M2 Ultra 192GB (76-core GPU)",
		vendor: "Apple",
		architecture: "Apple Silicon M2",
		releaseYear: 2023,
		vramGb: 192,
		memBandwidthGbs: 800,
		fp32Tflops: 27.2,
		fp16Tflops: 54.4,
		bf16Tflops: 54.4,
		fp8Tflops: null,
		int8Tflops: 108.8,
		int4Tflops: 108.8,
		interconnect: "unified",
		interconnectBandwidthGbs: 2500,
		tdpWatts: 150,
		sourceName: "Apple M2 Ultra Spec Sheet + llama.cpp #4167",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/4167",
		calibrationNote: "800 GB/s Unified Memory across UltraFusion interconnect",
	},
	{
		id: "apple-m4-pro-64gb",
		name: "Apple M4 Pro 64GB (20-core GPU)",
		vendor: "Apple",
		architecture: "Apple Silicon M4",
		releaseYear: 2024,
		vramGb: 64,
		memBandwidthGbs: 273,
		fp32Tflops: 16.3,
		fp16Tflops: 32.6,
		bf16Tflops: 32.6,
		fp8Tflops: null,
		int8Tflops: 65.2,
		int4Tflops: 65.2,
		interconnect: "unified",
		interconnectBandwidthGbs: 500,
		tdpWatts: 70,
		sourceName: "Apple M4 Pro Spec Sheet + llama.cpp #4167",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/4167",
		calibrationNote: "273 GB/s Unified Memory; popular compact Mac mini / MacBook Pro config",
	},
	{
		id: "huawei-ascend-910c-128gb",
		name: "Huawei Ascend 910C 128GB",
		vendor: "Huawei",
		architecture: "DaVinci Dual-Die",
		releaseYear: 2025,
		vramGb: 128,
		memBandwidthGbs: 3200,
		fp32Tflops: 150,
		fp16Tflops: 640,
		bf16Tflops: 640,
		fp8Tflops: null,
		int8Tflops: 1280,
		int4Tflops: null,
		interconnect: "hccs",
		interconnectBandwidthGbs: 784,
		tdpWatts: 650,
		sourceName: "Epoch AI ML Hardware Dataset",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "Dual-die DaVinci Cube architecture; 128GB HBM2e at 3.2 TB/s",
	},
	{
		id: "huawei-ascend-910b-64gb",
		name: "Huawei Ascend 910B 64GB",
		vendor: "Huawei",
		architecture: "DaVinci",
		releaseYear: 2023,
		vramGb: 64,
		memBandwidthGbs: 1800,
		fp32Tflops: 80,
		fp16Tflops: 320,
		bf16Tflops: 320,
		fp8Tflops: null,
		int8Tflops: 640,
		int4Tflops: null,
		interconnect: "hccs",
		interconnectBandwidthGbs: 392,
		tdpWatts: 350,
		sourceName: "Epoch AI ML Hardware Dataset",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote: "DaVinci Cube FP16/BF16 320 TFLOPS, INT8 640 TOPS; HCCS mesh",
	},
	{
		id: "intel-gaudi-3-128gb",
		name: "Intel Gaudi 3 OAM 128GB",
		vendor: "Intel",
		architecture: "Gaudi 3",
		releaseYear: 2024,
		vramGb: 128,
		memBandwidthGbs: 3700,
		fp32Tflops: 67,
		fp16Tflops: 1835,
		bf16Tflops: 1835,
		fp8Tflops: 1835,
		int8Tflops: 1835,
		int4Tflops: null,
		interconnect: "roce",
		interconnectBandwidthGbs: 600,
		tdpWatts: 900,
		sourceName: "Intel Gaudi 3 AI Accelerator Whitepaper",
		sourceUrl:
			"https://www.intel.com/content/dam/www/central-libraries/us/en/documents/2024-04/gaudi-3-ai-accelerator-white-paper.pdf",
		calibrationNote: "8 MMEs + 64 TPCs; 1835 TFLOPS dense BF16/FP8 with 24x 200GbE RoCEv2 on-die",
	},
	{
		id: "intel-max-1550-128gb",
		name: "Intel Data Center GPU Max 1550 128GB",
		vendor: "Intel",
		architecture: "Xe-HPC (Ponte Vecchio)",
		releaseYear: 2023,
		vramGb: 128,
		memBandwidthGbs: 3277,
		fp32Tflops: 52,
		fp16Tflops: 839,
		bf16Tflops: 839,
		fp8Tflops: null,
		int8Tflops: 1679,
		int4Tflops: null,
		interconnect: "xe_link",
		interconnectBandwidthGbs: 640,
		tdpWatts: 600,
		sourceName: "Intel Data Center GPU Max Series Specification + Epoch AI",
		sourceUrl: "https://epoch.ai/data/machine-learning-hardware",
		calibrationNote:
			"128 Xe-HPC cores with XMX engines; 839 TFLOPS BF16/FP16 and 3.28 TB/s HBM2e across 2 tiles",
	},
	{
		id: "intel-gaudi-2-96gb",
		name: "Intel Gaudi 2 OAM 96GB",
		vendor: "Intel",
		architecture: "Gaudi 2",
		releaseYear: 2022,
		vramGb: 96,
		memBandwidthGbs: 2450,
		fp32Tflops: 45,
		fp16Tflops: 432,
		bf16Tflops: 432,
		fp8Tflops: 865,
		int8Tflops: 865,
		int4Tflops: null,
		interconnect: "roce",
		interconnectBandwidthGbs: 300,
		tdpWatts: 600,
		sourceName: "Intel Gaudi 2 Whitepaper + Databricks Benchmarks",
		sourceUrl:
			"https://www.databricks.com/blog/llm-training-and-inference-intel-gaudi2-ai-accelerators",
		calibrationNote:
			"2 MMEs + 24 TPCs; 432 TFLOPS dense BF16/FP16 and 865 TFLOPS FP8 with 96GB HBM2e (2.45 TB/s)",
	},
	{
		id: "intel-arc-pro-b60-24gb",
		name: "Intel Arc Pro B60 24GB",
		vendor: "Intel",
		architecture: "Xe2 Battlemage Workstation",
		releaseYear: 2025,
		vramGb: 24,
		memBandwidthGbs: 456,
		fp32Tflops: 12.3,
		fp16Tflops: 98.5,
		bf16Tflops: 98.5,
		fp8Tflops: null,
		int8Tflops: 197,
		int4Tflops: 394,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 200,
		sourceName: "Intel Arc Pro B60 Official Specifications",
		sourceUrl:
			"https://www.intel.com/content/www/us/en/products/sku/243916/intel-arc-pro-b60-graphics/specifications.html",
		calibrationNote:
			"160 Xe2 XMX AI Engines (197 INT8 TOPS / 98.5 FP16 TFLOPS); 24GB GDDR6 workstation card for local LLMs",
	},
	{
		id: "intel-arc-a770-16gb",
		name: "Intel Arc A770 Limited Edition 16GB",
		vendor: "Intel",
		architecture: "Xe-HPG Alchemist",
		releaseYear: 2022,
		vramGb: 16,
		memBandwidthGbs: 560,
		fp32Tflops: 19.7,
		fp16Tflops: 157,
		bf16Tflops: 157,
		fp8Tflops: null,
		int8Tflops: 314,
		int4Tflops: 628,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 225,
		sourceName: "Intel Arc A770 16GB Spec Sheet + TechPowerUp",
		sourceUrl: "https://www.techpowerup.com/gpu-specs/arc-a770-16-gb.c3914",
		calibrationNote:
			"512 XMX AI Engines across 32 Xe-cores; standout 560 GB/s memory bandwidth on a 256-bit GDDR6 bus",
	},
	{
		id: "intel-arc-b580-12gb",
		name: "Intel Arc B580 12GB",
		vendor: "Intel",
		architecture: "Xe2 Battlemage",
		releaseYear: 2024,
		vramGb: 12,
		memBandwidthGbs: 456,
		fp32Tflops: 13.7,
		fp16Tflops: 117,
		bf16Tflops: 117,
		fp8Tflops: null,
		int8Tflops: 233,
		int4Tflops: 466,
		interconnect: "pcie",
		interconnectBandwidthGbs: 64,
		tdpWatts: 190,
		sourceName: "Intel Arc B580 Official Specifications + TechPowerUp",
		sourceUrl:
			"https://www.intel.com/content/www/us/en/products/sku/241598/intel-arc-b580-graphics/specifications.html",
		calibrationNote:
			"160 Xe2 XMX AI Engines @ 2.67 GHz (233 INT8 TOPS); 456 GB/s memory bandwidth at 192-bit GDDR6",
	},
	{
		id: "google-tpu-v6e-32gb",
		name: "Google Cloud TPU v6e (Trillium) 32GB",
		vendor: "Google",
		architecture: "Trillium (TPU v6e)",
		releaseYear: 2024,
		vramGb: 32,
		memBandwidthGbs: 1600,
		fp32Tflops: 45,
		fp16Tflops: 918,
		bf16Tflops: 918,
		fp8Tflops: null,
		int8Tflops: 1836,
		int4Tflops: null,
		interconnect: "ici",
		interconnectBandwidthGbs: 800,
		tdpWatts: 300,
		sourceName: "Google Cloud TPU v6e Documentation + Epoch AI",
		sourceUrl: "https://cloud.google.com/tpu/docs/v6e",
		calibrationNote: "918 BF16 TFLOPS / 1836 INT8 TOPS MXU; 1600 GB/s HBM per chip",
	},
];

export const MODEL_CATALOG: LlmModelSpec[] = [
	{
		id: "qwen3-32b",
		name: "Qwen3-32B (Dense)",
		hfRepoId: "Qwen/Qwen3-32B",
		architecture: "dense",
		totalParamsB: 32.8,
		activeParamsB: 32.8,
		numLayers: 64,
		hiddenSize: 5120,
		numKeyValueHeads: 8,
		headDim: 128,
	},
	{
		id: "qwen3-30b-a3b",
		name: "Qwen3-30B-A3B (MoE)",
		hfRepoId: "Qwen/Qwen3-30B-A3B-Instruct-2507",
		architecture: "moe",
		totalParamsB: 30.5,
		activeParamsB: 3.3,
		numLayers: 48,
		hiddenSize: 2048,
		numKeyValueHeads: 4,
		headDim: 128,
	},
	{
		id: "qwen3-8b",
		name: "Qwen3-8B (Dense)",
		hfRepoId: "Qwen/Qwen3-8B",
		architecture: "dense",
		totalParamsB: 8.2,
		activeParamsB: 8.2,
		numLayers: 36,
		hiddenSize: 4096,
		numKeyValueHeads: 8,
		headDim: 128,
	},
	{
		id: "gpt-oss-20b",
		name: "OpenAI gpt-oss-20b (MoE)",
		hfRepoId: "openai/gpt-oss-20b",
		architecture: "moe",
		totalParamsB: 20.9,
		activeParamsB: 3.6,
		numLayers: 24,
		hiddenSize: 2880,
		numKeyValueHeads: 8,
		headDim: 96,
		defaultPrecision: "int4",
	},
	{
		id: "gpt-oss-120b",
		name: "OpenAI gpt-oss-120b (MoE)",
		hfRepoId: "openai/gpt-oss-120b",
		architecture: "moe",
		totalParamsB: 117.0,
		activeParamsB: 5.1,
		numLayers: 36,
		hiddenSize: 4096,
		numKeyValueHeads: 8,
		headDim: 128,
		defaultPrecision: "int4",
	},
	{
		id: "gemma-3-27b",
		name: "Gemma-3-27B-IT (Dense)",
		hfRepoId: "google/gemma-3-27b-it",
		architecture: "dense",
		totalParamsB: 27.4,
		activeParamsB: 27.4,
		numLayers: 62,
		hiddenSize: 5376,
		numKeyValueHeads: 16,
		headDim: 128,
	},
	{
		id: "llama-3.3-70b",
		name: "Llama-3.3-70B-Instruct (Dense)",
		hfRepoId: "meta-llama/Llama-3.3-70B-Instruct",
		architecture: "dense",
		totalParamsB: 70.55,
		activeParamsB: 70.55,
		numLayers: 80,
		hiddenSize: 8192,
		numKeyValueHeads: 8,
		headDim: 128,
	},
	{
		id: "llama-4-scout-109b-a17b",
		name: "Llama-4-Scout-17B-16E (109B MoE)",
		hfRepoId: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
		architecture: "moe",
		totalParamsB: 109.0,
		activeParamsB: 17.0,
		numLayers: 48,
		hiddenSize: 5120,
		numKeyValueHeads: 8,
		headDim: 128,
	},
	{
		id: "llama-4-maverick-400b-a17b",
		name: "Llama-4-Maverick-17B-128E (400B MoE)",
		hfRepoId: "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
		architecture: "moe",
		totalParamsB: 400.0,
		activeParamsB: 17.0,
		numLayers: 48,
		hiddenSize: 5120,
		numKeyValueHeads: 8,
		headDim: 128,
	},
	{
		id: "glm-4.5-air-106b-a12b",
		name: "GLM-4.5-Air (106B-A12B MoE)",
		hfRepoId: "zai-org/GLM-4.5-Air",
		architecture: "moe",
		totalParamsB: 106.0,
		activeParamsB: 12.0,
		numLayers: 46,
		hiddenSize: 4096,
		numKeyValueHeads: 8,
		headDim: 128,
	},
	{
		id: "qwen3-235b-a22b",
		name: "Qwen3-235B-A22B (MoE)",
		hfRepoId: "Qwen/Qwen3-235B-A22B",
		architecture: "moe",
		totalParamsB: 235.1,
		activeParamsB: 22.2,
		numLayers: 94,
		hiddenSize: 4096,
		numKeyValueHeads: 4,
		headDim: 128,
	},
	{
		id: "glm-4.5-355b-a32b",
		name: "GLM-4.5 (355B-A32B MoE)",
		hfRepoId: "zai-org/GLM-4.5",
		architecture: "moe",
		totalParamsB: 355.0,
		activeParamsB: 32.0,
		numLayers: 92,
		hiddenSize: 5120,
		numKeyValueHeads: 8,
		headDim: 128,
	},
	{
		id: "deepseek-r1-671b",
		name: "DeepSeek-V3.1 / R1-0528 (671B-A37B MLA)",
		hfRepoId: "deepseek-ai/DeepSeek-V3.1",
		architecture: "moe",
		totalParamsB: 671.0,
		activeParamsB: 37.0,
		numLayers: 61,
		hiddenSize: 7168,
		numKeyValueHeads: 128,
		headDim: 128,
		mlaKvElementsPerLayer: 576,
		defaultPrecision: "fp8",
	},
	{
		id: "kimi-k2-1t-a32b",
		name: "Kimi-K2-Instruct (1T-A32B MLA)",
		hfRepoId: "moonshotai/Kimi-K2-Instruct-0905",
		architecture: "moe",
		totalParamsB: 1000.0,
		activeParamsB: 32.0,
		numLayers: 61,
		hiddenSize: 7168,
		numKeyValueHeads: 64,
		headDim: 128,
		mlaKvElementsPerLayer: 576,
		defaultPrecision: "fp8",
	},
];

export const INITIAL_COMMUNITY_SUBMISSIONS: RealWorldSubmission[] = [
	{
		id: "sub-b200-llama70b-fp8",
		gpuId: "nvidia-b200-sxm-192gb",
		gpuCount: 1,
		modelId: "llama-3.3-70b",
		modelName: "Llama-3.3-70B-Instruct (Dense)",
		weightPrecision: "fp8",
		kvPrecision: "fp8",
		engine: "TensorRT-LLM 0.18 (Blackwell FP8 + Custom GEMM)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 24600,
		actualDecodeSingleTps: 93.5,
		notes: "8 TB/s HBM3e hits 83% MBU on single-stream FP8 decode (InferenceMAX reference)",
		sourceUrl: "https://inferencex.semianalysis.com/",
	},
	{
		id: "sub-h200-llama70b-fp8",
		gpuId: "nvidia-h200-sxm-141gb",
		gpuCount: 1,
		modelId: "llama-3.3-70b",
		modelName: "Llama-3.3-70B-Instruct (Dense)",
		weightPrecision: "fp8",
		kvPrecision: "fp8",
		engine: "SGLang 0.4.4 (FP8 + FlashAttention-3)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 11200,
		actualDecodeSingleTps: 55.8,
		notes: "4.8 TB/s HBM3e fits full 70B + 64K KV on 1x GPU",
		sourceUrl: "https://inferencex.semianalysis.com/",
	},
	{
		id: "sub-h100-llama70b-fp8",
		gpuId: "nvidia-h100-sxm-80gb",
		gpuCount: 1,
		modelId: "llama-3.3-70b",
		modelName: "Llama-3.3-70B-Instruct (Dense)",
		weightPrecision: "fp8",
		kvPrecision: "fp8",
		engine: "TensorRT-LLM 0.17 (FP8 + FlashAttention-3)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 10850,
		actualDecodeSingleTps: 38.4,
		notes: "FP8 W8A8 with FP8 KV cache, custom CUDA graphs enabled",
		sourceUrl: "https://docs.vllm.ai/en/stable/benchmarking/dashboard/",
	},
	{
		id: "sub-h100-gpt-oss-120b",
		gpuId: "nvidia-h100-sxm-80gb",
		gpuCount: 1,
		modelId: "gpt-oss-120b",
		modelName: "OpenAI gpt-oss-120b (MoE)",
		weightPrecision: "int4",
		kvPrecision: "fp8",
		engine: "vLLM 0.8.1 (MXFP4 Marlin MoE + FlashInfer)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 29500,
		actualDecodeSingleTps: 420.0,
		notes: "5.1B active parameters in MXFP4 fits on 1x 80GB H100 with blazing decode speed",
		sourceUrl: "https://huggingface.co/openai/gpt-oss-120b",
	},
	{
		id: "sub-h20-deepseek-r1-fp8",
		gpuId: "nvidia-h20-96gb",
		gpuCount: 8,
		modelId: "deepseek-r1-671b",
		modelName: "DeepSeek-V3.1 / R1-0528 (671B-A37B MLA)",
		weightPrecision: "fp8",
		kvPrecision: "fp8",
		engine: "SGLang 0.4.4 (FlashMLA + DeepEP)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 18200,
		actualDecodeSingleTps: 49.2,
		notes: "Single-node 8x H20 with NVLink + FlashMLA kernel",
	},
	{
		id: "sub-a100-llama70b-int4",
		gpuId: "nvidia-a100-sxm-80gb",
		gpuCount: 1,
		modelId: "llama-3.3-70b",
		modelName: "Llama-3.3-70B-Instruct (Dense)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "vLLM 0.8.0 (AWQ Marlin W4A16)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 3420,
		actualDecodeSingleTps: 39.8,
		notes: "Marlin W4A16 kernel achieves ~78% MBU on Ampere HBM2e",
	},
	{
		id: "sub-5090-qwen3-32b-int4",
		gpuId: "nvidia-rtx-5090-32gb",
		gpuCount: 1,
		modelId: "qwen3-32b",
		modelName: "Qwen3-32B (Dense)",
		weightPrecision: "int4",
		kvPrecision: "fp8",
		engine: "vLLM 0.8.1 (AWQ Marlin + FP8 KV)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 9850,
		actualDecodeSingleTps: 74.6,
		notes: "GDDR7 1792 GB/s runs Qwen3-32B 4-bit comfortably on a single consumer GPU",
	},
	{
		id: "sub-4090-qwen3-8b-int4",
		gpuId: "nvidia-rtx-4090-24gb",
		gpuCount: 1,
		modelId: "qwen3-8b",
		modelName: "Qwen3-8B (Dense)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "vLLM 0.8.0 (AWQ Marlin Kernel)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 15800,
		actualDecodeSingleTps: 164.0,
		notes: "Marlin INT4 kernel hits >80% effective memory bandwidth on Ada AD102",
	},
	{
		id: "sub-4090-qwen3-30b-a3b-int4",
		gpuId: "nvidia-rtx-4090-24gb",
		gpuCount: 1,
		modelId: "qwen3-30b-a3b",
		modelName: "Qwen3-30B-A3B (MoE)",
		weightPrecision: "int4",
		kvPrecision: "fp8",
		engine: "llama.cpp b5420 (Q4_K_M + FlashAttention)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 18400,
		actualDecodeSingleTps: 245.0,
		notes: "30.5B total weights fit in 24GB VRAM at Q4 while only reading 3.3B active per token",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/10879",
	},
	{
		id: "sub-4090x4-llama70b-int4",
		gpuId: "nvidia-rtx-4090-24gb",
		gpuCount: 4,
		modelId: "llama-3.3-70b",
		modelName: "Llama-3.3-70B-Instruct (Dense)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "vLLM (TP=4 over PCIe 4.0 x16 without P2P)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 5200,
		actualDecodeSingleTps: 41.0,
		notes: "PCIe all-reduce latency limits TP=4 scaling; P2P driver patch can improve +28%",
	},
	{
		id: "sub-3090-qwen3-8b-int4",
		gpuId: "nvidia-rtx-3090-24gb",
		gpuCount: 1,
		modelId: "qwen3-8b",
		modelName: "Qwen3-8B (Dense)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "ExLlamaV2 0.2.6 (EXL2 4.5bpw)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 6600,
		actualDecodeSingleTps: 141.5,
		notes: "Highly tuned EXL2 kernel on GA102 GDDR6X (936 GB/s)",
	},
	{
		id: "sub-mi300x-llama70b-fp8",
		gpuId: "amd-mi300x-192gb",
		gpuCount: 1,
		modelId: "llama-3.3-70b",
		modelName: "Llama-3.3-70B-Instruct (Dense)",
		weightPrecision: "fp8",
		kvPrecision: "fp8",
		engine: "vLLM 0.8.0 + ROCm 6.3 (AITER FlashAttention)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 12100,
		actualDecodeSingleTps: 53.2,
		notes: "5.3 TB/s HBM3 with AMD AITER kernel tuning (InferenceMAX verified)",
		sourceUrl: "https://inferencex.semianalysis.com/",
	},
	{
		id: "sub-m3ultra-deepseek-int4",
		gpuId: "apple-m3-ultra-512gb",
		gpuCount: 1,
		modelId: "deepseek-r1-671b",
		modelName: "DeepSeek-V3.1 / R1-0528 (671B-A37B MLA)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "mlx-lm 0.22 (4-bit AWQ Metal)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 420,
		actualDecodeSingleTps: 29.5,
		notes: "512GB unified memory runs full 671B MoE on a single desktop at 160W",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/4167",
	},
	{
		id: "sub-m4max-qwen3-30b-a3b-int4",
		gpuId: "apple-m4-max-128gb",
		gpuCount: 1,
		modelId: "qwen3-30b-a3b",
		modelName: "Qwen3-30B-A3B (MoE)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "mlx-lm 0.22 (4-bit DWQ)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 1950,
		actualDecodeSingleTps: 158.0,
		notes: "546 GB/s unified memory streams 3.3B active parameters effortlessly",
		sourceUrl: "https://github.com/ggml-org/llama.cpp/discussions/4167",
	},
	{
		id: "sub-910b-qwen3-235b-int8",
		gpuId: "huawei-ascend-910b-64gb",
		gpuCount: 4,
		modelId: "qwen3-235b-a22b",
		modelName: "Qwen3-235B-A22B (MoE)",
		weightPrecision: "int8",
		kvPrecision: "fp16",
		engine: "MindIE 1.0.RC3 (ATB HCCS TP=4)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 6800,
		actualDecodeSingleTps: 78.5,
		notes: "HCCS interconnect with Ascend Transformer Boost (ATB) fused MoE operators",
	},
	{
		id: "sub-gaudi3-llama70b-fp8",
		gpuId: "intel-gaudi-3-128gb",
		gpuCount: 1,
		modelId: "llama-3.3-70b",
		modelName: "Llama-3.3-70B-Instruct (Dense)",
		weightPrecision: "fp8",
		kvPrecision: "fp8",
		engine: "vLLM 0.8.0 Gaudi (Habana HPU FusedSDPA + FP8)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 9400,
		actualDecodeSingleTps: 41.5,
		notes: "3.7 TB/s HBM2e + 8 MMEs on single OAM card running FP8 W8A8",
		sourceUrl:
			"https://www.intel.com/content/dam/www/central-libraries/us/en/documents/2024-04/gaudi-3-ai-accelerator-white-paper.pdf",
	},
	{
		id: "sub-arc-pro-b60-qwen3-30b-a3b-int4",
		gpuId: "intel-arc-pro-b60-24gb",
		gpuCount: 1,
		modelId: "qwen3-30b-a3b",
		modelName: "Qwen3-30B-A3B (MoE)",
		weightPrecision: "int4",
		kvPrecision: "fp8",
		engine: "llama.cpp SYCL / Vulkan (Q4_K_M + Xe2 XMX)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 2150,
		actualDecodeSingleTps: 66.0,
		notes: "24GB GDDR6 fits full 30B-A3B Q4_K_M + 32K context on a single 200W Battlemage Pro card",
	},
	{
		id: "sub-arc-a770-qwen3-8b-int4",
		gpuId: "intel-arc-a770-16gb",
		gpuCount: 1,
		modelId: "qwen3-8b",
		modelName: "Qwen3-8B (Dense)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "llama.cpp SYCL (oneAPI IPEX-LLM Q4_K_M)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 1850,
		actualDecodeSingleTps: 68.5,
		notes:
			"560 GB/s 256-bit GDDR6 bus delivers high MBU for 16GB budget card with SYCL XMX kernels",
	},
	{
		id: "sub-arc-b580-qwen3-8b-int4",
		gpuId: "intel-arc-b580-12gb",
		gpuCount: 1,
		modelId: "qwen3-8b",
		modelName: "Qwen3-8B (Dense)",
		weightPrecision: "int4",
		kvPrecision: "fp16",
		engine: "llama.cpp SYCL (Xe2 XMX Q4_K_M)",
		inputTokens: 2048,
		outputTokens: 512,
		batchSize: 1,
		actualPrefillTps: 1920,
		actualDecodeSingleTps: 58.2,
		notes: "192-bit GDDR6 (456 GB/s) on Xe2 Battlemage consumer GPU",
	},
];

/**
 * Extracts a normalized HuggingFace `<org>/<repo>` identifier from a URL or repo string.
 * Returns null if the input is not a valid two-segment HuggingFace repository path.
 */
export function parseHuggingFaceModelRef(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const normalizedInput = /^(?:www\.)?(?:huggingface|hf)\.co(?:\/|$)/iu.test(trimmed)
		? `https://${trimmed}`
		: trimmed;

	let pathPart = normalizedInput;
	try {
		if (normalizedInput.startsWith("http://") || normalizedInput.startsWith("https://")) {
			const url = new URL(normalizedInput);
			const host = url.hostname.toLowerCase();
			if (
				host !== "huggingface.co" &&
				host !== "www.huggingface.co" &&
				host !== "hf.co" &&
				host !== "www.hf.co"
			) {
				return null;
			}
			pathPart = url.pathname.replace(/^\/+/u, "");
		}
	} catch {
		return null;
	}

	const segments = pathPart.split("/").filter(Boolean);
	if (segments.length < 2) return null;

	const [org, repo] = segments;
	const validSegment = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u;
	if (
		!org ||
		!repo ||
		!validSegment.test(org) ||
		!validSegment.test(repo) ||
		org.includes("..") ||
		repo.includes("..")
	) {
		return null;
	}
	const cleanRepo = repo.replace(/\.git$/iu, "");
	if (!cleanRepo) return null;
	return `${org}/${cleanRepo}`;
}

function asPositiveNumber(value: unknown): number | null {
	const num = typeof value === "number" ? value : Number(value);
	return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Converts a HuggingFace `config.json` payload (and optional Safetensors total parameter count)
 * into a structured `LlmModelSpec` for Roofline calculation.
 */
export function parseHuggingFaceConfig(
	repoId: string,
	rawConfig: Record<string, unknown>,
	safetensorsTotalParams?: number | null,
): LlmModelSpec {
	const textConfig =
		rawConfig.text_config && typeof rawConfig.text_config === "object"
			? (rawConfig.text_config as Record<string, unknown>)
			: rawConfig;

	const hiddenSize = asPositiveNumber(textConfig.hidden_size ?? textConfig.n_embd) ?? 4096;
	const numLayers =
		asPositiveNumber(textConfig.num_hidden_layers ?? textConfig.n_layer ?? textConfig.num_layers) ??
		32;
	const numAttentionHeads =
		asPositiveNumber(textConfig.num_attention_heads ?? textConfig.n_head) ?? 32;
	const numKeyValueHeads =
		asPositiveNumber(
			textConfig.num_key_value_heads ?? textConfig.num_kv_heads ?? textConfig.multi_query_group_num,
		) ?? numAttentionHeads;
	const headDim =
		asPositiveNumber(textConfig.head_dim) ?? Math.round(hiddenSize / numAttentionHeads);
	const intermediateSize =
		asPositiveNumber(textConfig.intermediate_size ?? textConfig.ffn_hidden_size) ?? hiddenSize * 4;
	const vocabSize = asPositiveNumber(textConfig.vocab_size) ?? 128256;

	// Detect MoE architecture fields across DeepSeek, Qwen3-MoE, Llama-4, GLM-4.5, Mixtral, gpt-oss
	const numExperts =
		asPositiveNumber(
			textConfig.n_routed_experts ?? textConfig.num_local_experts ?? textConfig.num_experts,
		) ?? 1;
	const activeExperts =
		asPositiveNumber(
			textConfig.num_experts_per_tok ?? textConfig.num_selected_experts ?? textConfig.top_k,
		) ?? 1;
	const moeIntermediateSize =
		asPositiveNumber(textConfig.moe_intermediate_size) ?? intermediateSize;
	const sharedExperts =
		asPositiveNumber(textConfig.n_shared_experts ?? textConfig.num_shared_experts) ?? 0;
	const firstKDenseReplace = asPositiveNumber(textConfig.first_k_dense_replace) ?? 0;

	const isMoe = numExperts > 1;
	const moeLayers = isMoe ? Math.max(0, numLayers - firstKDenseReplace) : 0;
	const denseLayers = numLayers - moeLayers;

	// Attention parameters per layer: Q + K + V + O projections
	const attnParamsPerLayer =
		hiddenSize * (numAttentionHeads * headDim) +
		2 * hiddenSize * (numKeyValueHeads * headDim) +
		numAttentionHeads * headDim * hiddenSize;

	// MLP (SwiGLU 3 matrices: gate, up, down)
	const denseMlpParams = 3 * hiddenSize * intermediateSize;
	const singleExpertMlpParams = 3 * hiddenSize * moeIntermediateSize;

	const embeddingParams = 2 * vocabSize * hiddenSize;

	const estimatedTotalParams =
		embeddingParams +
		numLayers * attnParamsPerLayer +
		denseLayers * denseMlpParams +
		moeLayers * (numExperts + sharedExperts) * singleExpertMlpParams;

	const estimatedActiveParams =
		embeddingParams +
		numLayers * attnParamsPerLayer +
		denseLayers * denseMlpParams +
		moeLayers * (activeExperts + sharedExperts) * singleExpertMlpParams;

	const totalParamsB =
		safetensorsTotalParams && safetensorsTotalParams > 1e6
			? Number((safetensorsTotalParams / 1e9).toFixed(2))
			: Number((estimatedTotalParams / 1e9).toFixed(2));

	const activeRatio =
		estimatedTotalParams > 0 ? Math.min(1, estimatedActiveParams / estimatedTotalParams) : 1;
	const activeParamsB = isMoe ? Number((totalParamsB * activeRatio).toFixed(2)) : totalParamsB;

	// Detect DeepSeek / Kimi Multi-head Latent Attention (MLA) compressed KV cache
	const kvLoraRank = asPositiveNumber(textConfig.kv_lora_rank);
	const qkRopeHeadDim = asPositiveNumber(textConfig.qk_rope_head_dim) ?? 64;
	const mlaKvElementsPerLayer = kvLoraRank ? kvLoraRank + qkRopeHeadDim : null;

	// Detect pre-quantized precision in config.json
	let defaultPrecision: Precision | undefined;
	if (rawConfig.quantization_config && typeof rawConfig.quantization_config === "object") {
		const qConfig = rawConfig.quantization_config as Record<string, unknown>;
		const bits = asPositiveNumber(qConfig.bits ?? qConfig.w_bit);
		const method =
			typeof qConfig.quant_method === "string" ? qConfig.quant_method.toLowerCase() : "";
		if (
			bits === 4 ||
			method.includes("awq") ||
			method.includes("gptq") ||
			method.includes("mxfp4")
		) {
			defaultPrecision = "int4";
		} else if (bits === 8 || method.includes("fp8")) {
			defaultPrecision = method.includes("fp8") ? "fp8" : "int8";
		}
	}

	const repoName = repoId.split("/")[1] || repoId;
	return {
		id: `hf:${repoId.toLowerCase()}`,
		name: repoName,
		hfRepoId: repoId,
		architecture: isMoe ? "moe" : "dense",
		totalParamsB: Math.max(0.1, totalParamsB),
		activeParamsB: Math.max(0.1, activeParamsB),
		numLayers,
		hiddenSize,
		numKeyValueHeads,
		headDim,
		mlaKvElementsPerLayer,
		defaultPrecision,
	};
}

/**
 * Builds a custom `LlmModelSpec` with layer counts and hidden dimensions scaled to active/total parameters.
 */
export function buildCustomModelSpec(options: {
	id?: string | undefined;
	name?: string | undefined;
	hfRepoId?: string | undefined;
	totalParamsB: number;
	activeParamsB: number;
	defaultPrecision?: Precision | undefined;
}): LlmModelSpec {
	const totalB = Math.max(0.1, Number(options.totalParamsB.toFixed(2)));
	const activeB = Math.min(totalB, Math.max(0.1, Number(options.activeParamsB.toFixed(2))));
	const isMoe = activeB < totalB * 0.95;
	const numLayers =
		totalB >= 300 ? 96 : totalB >= 65 ? 80 : totalB >= 25 ? 64 : totalB >= 12 ? 48 : 32;
	const hiddenSize = activeB >= 65 ? 8192 : activeB >= 25 ? 5120 : 4096;
	const validRepo = options.hfRepoId ? (parseHuggingFaceModelRef(options.hfRepoId) ?? "") : "";
	const defaultId = isMoe ? `custom:${totalB}b-a${activeB}b` : `custom:${totalB}b`;
	const defaultName = isMoe ? `Custom ${totalB}B-A${activeB}B` : `Custom ${totalB}B`;
	return {
		id: options.id ?? defaultId,
		name: options.name?.trim() || defaultName,
		hfRepoId: validRepo,
		architecture: isMoe ? "moe" : "dense",
		totalParamsB: totalB,
		activeParamsB: activeB,
		numLayers,
		hiddenSize,
		numKeyValueHeads: 8,
		headDim: 128,
		mlaKvElementsPerLayer: null,
		defaultPrecision: options.defaultPrecision,
	};
}

/**
 * Infers an `LlmModelSpec` from a HuggingFace `<org>/<repo>` identifier (and optional Safetensors
 * total parameter count) when `config.json` is unavailable or gated.
 */
export function inferModelSpecFromRepoId(
	repoId: string,
	safetensorsTotalParams?: number | null,
): LlmModelSpec | null {
	const normalized = parseHuggingFaceModelRef(repoId) ?? repoId.trim();
	if (!normalized) return null;

	const lower = normalized.toLowerCase();
	const exactMatch = MODEL_CATALOG.find((m) => m.hfRepoId.toLowerCase() === lower);
	if (exactMatch) return { ...exactMatch };

	const detectQuant = (text: string): Precision | undefined => {
		if (/(?:awq|gptq|int4|w4a16|q4_k|4bit|mxfp4|nvfp4)/iu.test(text)) return "int4";
		if (/(?:fp8|w8a8)/iu.test(text)) return "fp8";
		if (/(?:int8|q8_0|8bit)/iu.test(text)) return "int8";
		return undefined;
	};

	const detectedPrecision = detectQuant(lower);
	const repoName = normalized.split("/")[1] || normalized;

	// Pattern 1: <Total>B-A<Active>B MoE (e.g. Qwen3-235B-A22B, Qwen3-30B-A3B)
	const moeActiveMatch = repoName.match(/(\d+(?:\.\d+)?)b[-_ ]a(\d+(?:\.\d+)?)b/iu);
	if (moeActiveMatch) {
		const totalParamsB = Number(moeActiveMatch[1]);
		const activeParamsB = Number(moeActiveMatch[2]);
		return {
			id: `hf:${lower}`,
			name: repoName,
			hfRepoId: normalized,
			architecture: "moe",
			totalParamsB,
			activeParamsB,
			numLayers: totalParamsB > 100 ? 94 : 48,
			hiddenSize: totalParamsB > 100 ? 4096 : 2048,
			numKeyValueHeads: 4,
			headDim: 128,
			defaultPrecision: detectedPrecision,
		};
	}

	// Pattern 2: Llama-4 style <Active>B-<Experts>E (e.g. Llama-4-Scout-17B-16E, Maverick-17B-128E)
	const llama4Match = repoName.match(/(\d+(?:\.\d+)?)b[-_ ](\d+)e/iu);
	if (llama4Match) {
		const activeParamsB = Number(llama4Match[1]);
		const experts = Number(llama4Match[2]);
		const totalParamsB = experts >= 64 ? 400 : 109;
		return {
			id: `hf:${lower}`,
			name: repoName,
			hfRepoId: normalized,
			architecture: "moe",
			totalParamsB,
			activeParamsB,
			numLayers: 48,
			hiddenSize: 5120,
			numKeyValueHeads: 8,
			headDim: 128,
			defaultPrecision: detectedPrecision,
		};
	}

	// Pattern 3: <N>x<M>B MoE (e.g. Mixtral-8x22B, 8x7B)
	const mixtralMatch = repoName.match(/(\d+)x(\d+(?:\.\d+)?)b/iu);
	if (mixtralMatch) {
		const numExperts = Number(mixtralMatch[1]);
		const expertB = Number(mixtralMatch[2]);
		const totalParamsB = Number((numExperts * expertB * 0.82).toFixed(1));
		const activeParamsB = Number((2 * expertB * 0.92).toFixed(1));
		return {
			id: `hf:${lower}`,
			name: repoName,
			hfRepoId: normalized,
			architecture: "moe",
			totalParamsB,
			activeParamsB,
			numLayers: expertB >= 20 ? 56 : 32,
			hiddenSize: expertB >= 20 ? 6144 : 4096,
			numKeyValueHeads: 8,
			headDim: 128,
			defaultPrecision: detectedPrecision,
		};
	}

	// Pattern 4: Standard Dense <N>B (e.g. Llama-3.3-70B-Instruct-AWQ, DeepSeek-R1-Distill-Qwen-32B-GGUF)
	const denseMatch = repoName.match(/(?:^|[-_ ])(\d+(?:\.\d+)?)b(?:$|[-_ .])/iu);
	if (denseMatch) {
		const paramsB = Number(denseMatch[1]);
		const numLayers =
			paramsB >= 300 ? 126 : paramsB >= 65 ? 80 : paramsB >= 25 ? 64 : paramsB >= 12 ? 48 : 32;
		const hiddenSize = paramsB >= 300 ? 16384 : paramsB >= 65 ? 8192 : paramsB >= 25 ? 5120 : 4096;
		return {
			id: `hf:${lower}`,
			name: repoName,
			hfRepoId: normalized,
			architecture: "dense",
			totalParamsB: paramsB,
			activeParamsB: paramsB,
			numLayers,
			hiddenSize,
			numKeyValueHeads: 8,
			headDim: 128,
			defaultPrecision: detectedPrecision,
		};
	}

	// Family aliases only when explicit parameter counts were not named and not a distilled checkpoint
	if (!lower.includes("distill")) {
		if (lower.includes("deepseek-r1") || lower.includes("deepseek-v3")) {
			const ds = MODEL_CATALOG.find((m) => m.id === "deepseek-r1-671b");
			if (ds) {
				return {
					...ds,
					id: `hf:${lower}`,
					name: repoName,
					hfRepoId: normalized,
					defaultPrecision: detectedPrecision ?? ds.defaultPrecision,
				};
			}
		}
		if (lower.includes("kimi-k2")) {
			const kimi = MODEL_CATALOG.find((m) => m.id === "kimi-k2-1t-a32b");
			if (kimi) {
				return {
					...kimi,
					id: `hf:${lower}`,
					name: repoName,
					hfRepoId: normalized,
					defaultPrecision: detectedPrecision ?? kimi.defaultPrecision,
				};
			}
		}
	}

	if (safetensorsTotalParams && safetensorsTotalParams > 1e6) {
		const paramsB = Math.max(0.1, Number((safetensorsTotalParams / 1e9).toFixed(2)));
		return buildCustomModelSpec({
			id: `hf:${lower}`,
			name: repoName,
			hfRepoId: normalized,
			totalParamsB: paramsB,
			activeParamsB: paramsB,
			defaultPrecision: detectedPrecision,
		});
	}

	return null;
}

/**
 * Resolves peak effective TFLOPS per GPU for a given weight precision.
 * Uses native lower-precision matrix/tensor core rates when available on the accelerator
 * (e.g. Blackwell NVFP4 / CDNA 4 FP4), falling back to FP16 when absent.
 */
export function getEffectivePeakTflops(gpu: GpuSpec, precision: Precision): number {
	switch (precision) {
		case "fp16":
			return gpu.fp16Tflops;
		case "fp8":
			return gpu.fp8Tflops ?? gpu.fp16Tflops;
		case "int8":
			return gpu.int8Tflops;
		case "int4":
			return gpu.int4Tflops ?? gpu.fp16Tflops;
	}
}

/**
 * Multi-GPU Tensor Parallelism scaling efficiency for compute (Prefill) and memory bandwidth (Decode).
 */
export function getMultiGpuScaling(
	interconnect: InterconnectType,
	gpuCount: number,
): { computeEfficiency: number; bandwidthEfficiency: number; allReduceLatencyUs: number } {
	if (gpuCount <= 1) {
		return { computeEfficiency: 1.0, bandwidthEfficiency: 1.0, allReduceLatencyUs: 0 };
	}
	const hops = Math.log2(Math.max(1, gpuCount));
	switch (interconnect) {
		case "unified":
			return { computeEfficiency: 0.98, bandwidthEfficiency: 0.98, allReduceLatencyUs: 2 };
		case "nvlink":
		case "ici":
		case "infinity_fabric":
			return {
				computeEfficiency: Number((0.93 ** hops).toFixed(4)),
				bandwidthEfficiency: Number((0.91 ** hops).toFixed(4)),
				allReduceLatencyUs: 8 * hops,
			};
		case "hccs":
		case "xe_link":
		case "roce":
			return {
				computeEfficiency: Number((0.89 ** hops).toFixed(4)),
				bandwidthEfficiency: Number((0.86 ** hops).toFixed(4)),
				allReduceLatencyUs: 15 * hops,
			};
		case "pcie":
			return {
				computeEfficiency: Number((0.82 ** hops).toFixed(4)),
				bandwidthEfficiency: Number((0.78 ** hops).toFixed(4)),
				allReduceLatencyUs: 38 * hops,
			};
	}
}

/**
 * Computes KV cache bytes per token across all layers.
 */
export function getKvCacheBytesPerToken(model: LlmModelSpec, kvPrecision: Precision): number {
	const kvBytesPerElement = PRECISION_BYTES[kvPrecision];
	if (model.mlaKvElementsPerLayer && model.mlaKvElementsPerLayer > 0) {
		return model.numLayers * model.mlaKvElementsPerLayer * kvBytesPerElement;
	}
	return 2 * model.numLayers * model.numKeyValueHeads * model.headDim * kvBytesPerElement;
}

/**
 * Evaluates theoretical Roofline performance of `gpuCount` GPUs running `model` under `workload`.
 */
export function evaluateGpuPerformance(
	gpu: GpuSpec,
	model: LlmModelSpec,
	workload: WorkloadConfig,
): TheoreticalEvaluation {
	const gpuCount = Math.max(1, Math.floor(workload.gpuCount));
	const inputTokens = Math.max(1, Math.floor(workload.inputTokens));
	const outputTokens = Math.max(1, Math.floor(workload.outputTokens));
	const batchSize = Math.max(1, Math.floor(workload.batchSize));
	const totalSeqLen = inputTokens + outputTokens;

	const weightBytesPerParam = PRECISION_BYTES[workload.weightPrecision];
	const weightsVramGb = (model.totalParamsB * 1e9 * weightBytesPerParam) / 1e9;

	const kvBytesPerToken = getKvCacheBytesPerToken(model, workload.kvPrecision);
	const kvCacheVramGb = (batchSize * totalSeqLen * kvBytesPerToken) / 1e9;

	// CUDA / ROCm / runtime activation & NCCL workspace overhead
	const overheadVramGb = 1.2 * gpuCount + weightsVramGb * 0.06;
	const totalVramGb = weightsVramGb + kvCacheVramGb + overheadVramGb;
	const availableVramGb = gpu.vramGb * gpuCount;
	const vramUtilizationPct = (totalVramGb / availableVramGb) * 100;

	const vramStatus: "comfortable" | "tight" | "oom" =
		vramUtilizationPct > 100 ? "oom" : vramUtilizationPct > 85 ? "tight" : "comfortable";

	const effectiveTflopsPerGpu = getEffectivePeakTflops(gpu, workload.weightPrecision);
	const scaling = getMultiGpuScaling(gpu.interconnect, gpuCount);

	// Prefill FLOPs per token: 2 * P_active + attention quadratic term (4 * L * d * S_in)
	const prefillFlopsPerToken =
		2 * model.activeParamsB * 1e9 + 4 * model.numLayers * model.hiddenSize * inputTokens;

	const totalComputeFlopsPerSec =
		gpuCount * effectiveTflopsPerGpu * 1e12 * scaling.computeEfficiency;
	const prefillTps = totalComputeFlopsPerSec / prefillFlopsPerToken;
	const commOverheadMs = (model.numLayers * scaling.allReduceLatencyUs) / 1000;
	const ttftMs = ((batchSize * inputTokens) / prefillTps) * 1000 + commOverheadMs;

	// Decode step reads active weights + KV cache for average context length (S_in + S_out / 2)
	const avgDecodeSeqLen = inputTokens + outputTokens / 2;
	const activeWeightBytes = model.activeParamsB * 1e9 * weightBytesPerParam;
	const decodeKvBytes = batchSize * avgDecodeSeqLen * kvBytesPerToken;
	const decodeBytesPerStep = activeWeightBytes + decodeKvBytes;

	const totalMemBandwidthBytesPerSec =
		gpuCount * gpu.memBandwidthGbs * 1e9 * scaling.bandwidthEfficiency;

	const memStepTimeSec =
		decodeBytesPerStep / totalMemBandwidthBytesPerSec +
		(model.numLayers * scaling.allReduceLatencyUs) / 1e6;

	const decodeFlopsPerStep =
		batchSize *
		(2 * model.activeParamsB * 1e9 + 4 * model.numLayers * model.hiddenSize * avgDecodeSeqLen);
	const computeStepTimeSec = decodeFlopsPerStep / totalComputeFlopsPerSec;

	const stepTimeSec = Math.max(memStepTimeSec, computeStepTimeSec);
	const tpotMs = stepTimeSec * 1000;
	const decodeSingleTps = 1 / stepTimeSec;
	const endToEndLatencySec = ttftMs / 1000 + outputTokens * stepTimeSec;

	const ridgePointOpsPerByte = (effectiveTflopsPerGpu * 1e12) / (gpu.memBandwidthGbs * 1e9);
	const decodeArithmeticIntensity = decodeFlopsPerStep / decodeBytesPerStep;

	const bottleneck: "memory_bandwidth" | "compute" | "oom" =
		vramStatus === "oom"
			? "oom"
			: computeStepTimeSec > memStepTimeSec
				? "compute"
				: "memory_bandwidth";

	return {
		gpu,
		gpuCount,
		model,
		workload: {
			...workload,
			gpuCount,
			inputTokens,
			outputTokens,
			batchSize,
		},
		weightsVramGb: Number(weightsVramGb.toFixed(2)),
		kvCacheVramGb: Number(kvCacheVramGb.toFixed(2)),
		overheadVramGb: Number(overheadVramGb.toFixed(2)),
		totalVramGb: Number(totalVramGb.toFixed(2)),
		availableVramGb,
		vramUtilizationPct: Number(vramUtilizationPct.toFixed(1)),
		vramStatus,
		effectiveTflopsPerGpu,
		multiGpuComputeEfficiency: scaling.computeEfficiency,
		multiGpuBandwidthEfficiency: scaling.bandwidthEfficiency,
		prefillFlopsPerToken,
		prefillTps: Number(prefillTps.toFixed(1)),
		ttftMs: Number(ttftMs.toFixed(1)),
		decodeBytesPerStep,
		decodeSingleTps: Number(decodeSingleTps.toFixed(1)),
		tpotMs: Number(tpotMs.toFixed(2)),
		endToEndLatencySec: Number(endToEndLatencySec.toFixed(2)),
		ridgePointOpsPerByte: Number(ridgePointOpsPerByte.toFixed(1)),
		decodeArithmeticIntensity: Number(decodeArithmeticIntensity.toFixed(2)),
		bottleneck,
	};
}

/**
 * Evaluates user-submitted real-world benchmark numbers against physical hardware Roofline limits
 * (MBU: Memory Bandwidth Utilization; MFU: Model FLOPs Utilization) to judge whether the AI Infra
 * is pushed to its hardware limit.
 */
export function evaluateUserSubmission(
	theoretical: TheoreticalEvaluation,
	actualPrefillTps: number | null,
	actualDecodeSingleTps: number,
): InfraEfficiencyReport {
	const rawHardwareBandwidthBytesPerSec =
		theoretical.gpuCount * theoretical.gpu.memBandwidthGbs * 1e9;
	const rawHardwareFlopsPerSec = theoretical.gpuCount * theoretical.effectiveTflopsPerGpu * 1e12;

	const actualBandwidthBytesPerSec = actualDecodeSingleTps * theoretical.decodeBytesPerStep;
	const mbuPct = Number(
		((actualBandwidthBytesPerSec / rawHardwareBandwidthBytesPerSec) * 100).toFixed(1),
	);

	const mfuPct =
		actualPrefillTps != null && actualPrefillTps > 0
			? Number(
					(
						((actualPrefillTps * theoretical.prefillFlopsPerToken) / rawHardwareFlopsPerSec) *
						100
					).toFixed(1),
				)
			: null;

	const decodeCeilingPct = Number(
		((actualDecodeSingleTps / Math.max(0.1, theoretical.decodeSingleTps)) * 100).toFixed(1),
	);

	if (mbuPct > 100 || decodeCeilingPct > 105) {
		return {
			mbuPct,
			mfuPct,
			decodeCeilingPct,
			tier: "speculative_boost",
			tierLabel: "Speculative boost (>100% ceiling)",
		};
	}

	if (decodeCeilingPct >= 75) {
		return {
			mbuPct,
			mfuPct,
			decodeCeilingPct,
			tier: "extreme",
			tierLabel: "Near hardware ceiling",
		};
	}

	if (decodeCeilingPct >= 55) {
		return {
			mbuPct,
			mfuPct,
			decodeCeilingPct,
			tier: "production",
			tierLabel: "Production-tuned",
		};
	}

	if (decodeCeilingPct >= 35) {
		return {
			mbuPct,
			mfuPct,
			decodeCeilingPct,
			tier: "suboptimal",
			tierLabel: "Headroom available",
		};
	}

	return {
		mbuPct,
		mfuPct,
		decodeCeilingPct,
		tier: "bottlenecked",
		tierLabel: "Host or interconnect bound",
	};
}

/**
 * Checks whether a GPU natively supports the requested hardware compute precision.
 */
export function gpuSupportsHardwarePrecision(
	gpu: GpuSpec,
	capability: HardwarePrecision | "all",
): boolean {
	switch (capability) {
		case "all":
			return true;
		case "fp32":
			return gpu.fp32Tflops > 0;
		case "fp16":
			return gpu.fp16Tflops > 0;
		case "bf16":
			return gpu.bf16Tflops != null && gpu.bf16Tflops > 0;
		case "fp8":
			return gpu.fp8Tflops != null && gpu.fp8Tflops > 0;
		case "int8":
			return gpu.int8Tflops > 0;
		case "int4":
			return gpu.int4Tflops != null && gpu.int4Tflops > 0;
	}
}

/**
 * Returns peak hardware TFLOPS per GPU for the selected capability filter (defaults to FP16 when "all").
 */
export function getHardwareTflopsByCapability(
	gpu: GpuSpec,
	capability: HardwarePrecision | "all",
): number {
	switch (capability) {
		case "fp32":
			return gpu.fp32Tflops;
		case "fp16":
		case "all":
			return gpu.fp16Tflops;
		case "bf16":
			return gpu.bf16Tflops ?? 0;
		case "fp8":
			return gpu.fp8Tflops ?? 0;
		case "int8":
			return gpu.int8Tflops;
		case "int4":
			return gpu.int4Tflops ?? 0;
	}
}

export interface ResolvedActualBenchmark {
	actualDecodeTps: number | null;
	mbuPct: number | null;
	isDirectMatch: boolean;
}

/**
 * Reconstructs the `LlmModelSpec` corresponding to a saved or built-in benchmark submission.
 */
export function resolveSubmissionModelSpec(
	submission: Pick<
		RealWorldSubmission,
		"modelId" | "modelName" | "totalParamsB" | "activeParamsB" | "weightPrecision"
	>,
	activeModel?: LlmModelSpec,
): LlmModelSpec | null {
	const catalogMatch = MODEL_CATALOG.find((m) => m.id === submission.modelId);
	if (catalogMatch) return catalogMatch;

	if (activeModel && activeModel.id === submission.modelId) {
		return activeModel;
	}

	if (submission.totalParamsB != null && submission.activeParamsB != null) {
		return buildCustomModelSpec({
			id: submission.modelId,
			name: submission.modelName,
			totalParamsB: submission.totalParamsB,
			activeParamsB: submission.activeParamsB,
			defaultPrecision: submission.weightPrecision,
		});
	}

	const repoHint = submission.modelId.startsWith("hf:")
		? submission.modelId.slice(3)
		: submission.modelName;
	return inferModelSpecFromRepoId(repoHint);
}

/**
 * Resolves the best real-world benchmark for a GPU under the given theoretical evaluation.
 * If an exact submission exists for `(gpu.id, model.id, gpuCount, weightPrecision, batchSize, inputTokens, outputTokens)`,
 * uses that direct measurement; otherwise, projects empirical TPS using the GPU's measured MBU ratio.
 */
export function resolveActualBenchmarkForGpu(
	gpu: GpuSpec,
	theoretical: TheoreticalEvaluation,
	submissions: RealWorldSubmission[],
): ResolvedActualBenchmark {
	const gpuSubs = submissions.filter((s) => s.gpuId === gpu.id);
	if (gpuSubs.length === 0 || theoretical.vramStatus === "oom") {
		return {
			actualDecodeTps: null,
			mbuPct: null,
			isDirectMatch: false,
		};
	}

	const exactMatch = gpuSubs.find(
		(s) =>
			s.modelId === theoretical.model.id &&
			s.gpuCount === theoretical.gpuCount &&
			s.weightPrecision === theoretical.workload.weightPrecision &&
			s.batchSize === theoretical.workload.batchSize &&
			s.inputTokens === theoretical.workload.inputTokens &&
			s.outputTokens === theoretical.workload.outputTokens,
	);
	if (exactMatch) {
		const rep = evaluateUserSubmission(
			theoretical,
			exactMatch.actualPrefillTps,
			exactMatch.actualDecodeSingleTps,
		);
		return {
			actualDecodeTps: exactMatch.actualDecodeSingleTps,
			mbuPct: rep.mbuPct,
			isDirectMatch: true,
		};
	}

	// Compute empirical ceiling attainment from the best submission on this GPU
	const refSub = gpuSubs[0];
	if (!refSub) {
		return {
			actualDecodeTps: null,
			mbuPct: null,
			isDirectMatch: false,
		};
	}
	const refModel = resolveSubmissionModelSpec(refSub, theoretical.model) ?? theoretical.model;
	const refTheo = evaluateGpuPerformance(gpu, refModel, {
		gpuCount: refSub.gpuCount,
		weightPrecision: refSub.weightPrecision,
		kvPrecision: refSub.kvPrecision,
		inputTokens: refSub.inputTokens,
		outputTokens: refSub.outputTokens,
		batchSize: refSub.batchSize,
	});
	const refReport = evaluateUserSubmission(
		refTheo,
		refSub.actualPrefillTps,
		refSub.actualDecodeSingleTps,
	);
	const decodeRatio = Math.min(0.92, Math.max(0.45, refReport.decodeCeilingPct / 100));
	const projectedDecode = Number((theoretical.decodeSingleTps * decodeRatio).toFixed(1));
	const projectedRep = evaluateUserSubmission(theoretical, null, projectedDecode);

	return {
		actualDecodeTps: projectedDecode,
		mbuPct: projectedRep.mbuPct,
		isDirectMatch: false,
	};
}

/**
 * Formats an interconnect identifier for hardware specification display.
 */
export function formatInterconnectName(interconnect: InterconnectType): string {
	switch (interconnect) {
		case "nvlink":
			return "NVLink";
		case "ici":
			return "ICI";
		case "infinity_fabric":
			return "Infinity Fabric";
		case "unified":
			return "Unified";
		case "hccs":
			return "HCCS";
		case "xe_link":
			return "Xe Link";
		case "roce":
			return "RoCEv2";
		case "pcie":
			return "PCIe";
	}
}

/**
 * Checks that a URL uses an allowed http(s) scheme before placing it in an anchor `href`.
 */
export function isSafeHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

/**
 * Validates that an untrusted parsed JSON value conforms to `RealWorldSubmission`.
 */
export function isValidUserSubmission(value: unknown): value is RealWorldSubmission {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	const isNonEmptyStr = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
	const isPositiveNum = (x: unknown): x is number =>
		typeof x === "number" && Number.isFinite(x) && x > 0;
	const isValidPrecision = (x: unknown): x is Precision =>
		x === "fp16" || x === "fp8" || x === "int8" || x === "int4";

	return (
		isNonEmptyStr(v.id) &&
		isNonEmptyStr(v.gpuId) &&
		isNonEmptyStr(v.modelId) &&
		isNonEmptyStr(v.modelName) &&
		(v.totalParamsB === undefined || isPositiveNum(v.totalParamsB)) &&
		(v.activeParamsB === undefined || isPositiveNum(v.activeParamsB)) &&
		isNonEmptyStr(v.engine) &&
		isValidPrecision(v.weightPrecision) &&
		isValidPrecision(v.kvPrecision) &&
		isPositiveNum(v.gpuCount) &&
		isPositiveNum(v.inputTokens) &&
		isPositiveNum(v.outputTokens) &&
		isPositiveNum(v.batchSize) &&
		isPositiveNum(v.actualDecodeSingleTps) &&
		(v.actualPrefillTps === null || isPositiveNum(v.actualPrefillTps)) &&
		typeof v.notes === "string" &&
		(v.sourceUrl === undefined || (typeof v.sourceUrl === "string" && isSafeHttpUrl(v.sourceUrl)))
	);
}

/**
 * Strips leading vendor prefix and memory capacity tokens from a GPU name for compact ledger display.
 */
export function formatGpuShortName(gpu: GpuSpec): string {
	const withoutVendor = gpu.name.replace(new RegExp(`^${gpu.vendor}\\s+`, "iu"), "");
	return withoutVendor
		.replace(/\s*\b\d+\s*GB\b/giu, "")
		.replace(/\(\s+/gu, "(")
		.replace(/\s+\)/gu, ")")
		.replace(/\s{2,}/gu, " ")
		.trim();
}

/**
 * Strips trailing parenthetical architecture tags from a model name for compact selectors and tables.
 */
export function formatModelShortName(model: Pick<LlmModelSpec, "name">): string {
	return model.name.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}
