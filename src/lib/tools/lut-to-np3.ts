type SupportedInputSpace = "srgb" | "nikon-srgb";
type SupportedGamma = "srgb" | "gamma-2.2";

export type InspectSelection = {
	inputSpace: SupportedInputSpace | "auto";
	gamma: SupportedGamma | "auto";
};

export type CubeLut = {
	title: string | null;
	size: number;
	domainMin: [number, number, number];
	domainMax: [number, number, number];
	table: Array<[number, number, number]>;
	metadata: string[];
};

export type InspectResult = {
	title: string | null;
	size: number;
	detectedInputSpace: SupportedInputSpace | null;
	detectedGamma: SupportedGamma | null;
	requiresManualInputSpace: boolean;
	requiresManualGamma: boolean;
	warnings: string[];
};

type ColorBlenderValues = {
	hue: number;
	chroma: number;
	brightness: number;
};

type ColorGradingValues = {
	hue: number;
	chroma: number;
	brightness: number;
};

type ConvertedProfile = {
	name: string;
	saturation: number;
	toneCurveRaw: number[];
	toneCurvePoints: Array<[number, number]>;
	colorBlender: Record<string, ColorBlenderValues>;
	colorGrading: Record<string, ColorGradingValues>;
	colorGradingBlending: number;
	colorGradingBalance: number;
};

export type ConversionOptions = InspectSelection & {
	name?: string;
	grayWeight?: number;
};

const OFFSET_NAME = 0x18;
const OFFSET_SHARPENING = 0x52;
const OFFSET_CLARITY = 0x5c;
const OFFSET_MID_RANGE_SHARPENING = 0xf2;
const OFFSET_SATURATION = 0x142;
const OFFSET_COLOR_GRADING_HIGHLIGHTS = 0x170;
const OFFSET_COLOR_GRADING_MIDTONE = 0x174;
const OFFSET_COLOR_GRADING_SHADOWS = 0x178;
const OFFSET_COLOR_GRADING_BLENDING = 0x180;
const OFFSET_COLOR_GRADING_BALANCE = 0x182;
const OFFSET_TONE_CURVE_POINTS = 0x194;
const OFFSET_TONE_CURVE_RAW = 0x1cc;

const BANDS = [
	["red", 0, 0x14c],
	["orange", 30, 0x14f],
	["yellow", 60, 0x152],
	["green", 120, 0x155],
	["cyan", 180, 0x158],
	["blue", 240, 0x15b],
	["purple", 270, 0x15e],
	["magenta", 300, 0x161],
] as const;

const GRADING_RANGES = [
	["shadows", 0.18, OFFSET_COLOR_GRADING_SHADOWS],
	["midTone", 0.5, OFFSET_COLOR_GRADING_MIDTONE],
	["highlights", 0.82, OFFSET_COLOR_GRADING_HIGHLIGHTS],
] as const;

const SUPPORTED_INPUT_SPACE_LABELS: Record<SupportedInputSpace, string> = {
	srgb: "sRGB",
	"nikon-srgb": "Nikon sRGB",
};

const SUPPORTED_GAMMA_LABELS: Record<SupportedGamma, string> = {
	srgb: "sRGB TRC",
	"gamma-2.2": "Gamma 2.2",
};

const TONECURVE_TEMPLATE_BASE64 =
	"TkNQAAAAAQAAAAAEMDMxMAAAAgAAAAAUdG9uZWN1cnZlLW5vb3AAAAAAAAAAAAMAAAAAAgAgAAAEAAAAAAIAAAAABQAAAAAC/wEAAAYAAAAAAogEAAAHAAAAAAKCBAAACAAAAAAC/wQAAAkAAAAAAv8EAAAKAAAAAAL/BAAACwAAAAAC/wQAAAwAAAAAAv8AAAANAAAAAAL/AAAADgAAAAAC/wQAAA8AAAAAAv8BAAAQAAAAAAL/AQAAEQAAAAAC/wEAABIAAAAAAv8BAAATAAAAAAL/AQAAFAAAAAACgAEAABUAAAAAAv8KAAAWAAAAAAKEBAAAFwAAAAAC/wQAABgAAAAAAv8EAAAZAAAAAAIBAQAAGgAAAAACAQEAABsAAAAAAgEBAAAcAAAAAAIBAQAAHQAAAAACAQEAAB4AAAAAAoABAAAfAAAAAByAgICAgICAgICAgICAgICAgICAgICAgIABAQEAAAAgAAAAABSAAICAgACAgIAAgIABAQEAsgGAAQAAAAIAAAJCSTAA/wD/AQADAACAgP//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIABAAGAAgACgAMAA4AEAASABQAFgAYABoAHAAeACAAIgAkACYAKAAqACwALgAwADIANAA2ADgAOgA8AD4AQABCAEQARgBIAEoATABOAFAAUgBUAFYAWABaAFwAXgBgAGIAZABmAGgAagBsAG4AcAByAHQAdgB4AHoAfAB+AIAAggCEAIYAiACKAIwAjgCQAJIAlACWAJgAmgCcAJ4AoACiAKQApgCoAKoArACuALAAsgC0ALYAuAC6ALwAvgDAAMIAxADGAMgAygDMAM4A0ADSANQA1gDYANoA3ADeAOAA4gDkAOYA6ADqAOwA7gDwAPIA9AD2APgA+gD8AP4BAAEB/QP9Bf0H/Qn9C/0N/Q/9Ef0T/RX9F/0Z/Rv9Hf0f/SH9I/0l/Sf9Kf0r/S39L/0x/TP9Nf03/Tn9O/09/T/9Qf1D/UX9R/1J/Uv9Tf1P/VH9U/1V/Vf9Wf1b/V39X/1h/WP9Zf1n/Wn9a/1t/W/9cf1z/XX9d/15/Xv9ff1//YH9g/2F/Yf9if2L/Y39j/2R/ZP9lf2X/Zn9m/2d/Z/9of2j/aX9p/2p/av9rf2v/bH9s/21/bf9uf27/b39v/3B/cP9xf3H/cn9y/3N/c/90f3T/dX91/3Z/dv93f3f/eH94/3l/ef96f3r/e397/3x/fP99f33/fn9+/39/f/8AAAAA";

export function inspectCubeLut(input: string): InspectResult {
	const lut = parseCubeLut(input);
	const detection = detectConstraints(lut);
	return {
		detectedGamma: detection.gamma,
		detectedInputSpace: detection.inputSpace,
		requiresManualGamma: detection.gamma === null,
		requiresManualInputSpace: detection.inputSpace === null,
		size: lut.size,
		title: lut.title,
		warnings: detection.warnings,
	};
}

export function convertCubeToNp3(
	input: string,
	options: ConversionOptions,
): { buffer: Uint8Array; filename: string; summary: InspectResult } {
	const lut = parseCubeLut(input);
	const detection = detectConstraints(lut);
	const inputSpace = resolveSelection("input space", detection.inputSpace, options.inputSpace);
	const gamma = resolveSelection("gamma", detection.gamma, options.gamma);
	validateSupport(lut, inputSpace, gamma, detection.warnings);

	const profile = fitProfile(
		lut,
		sanitizeName(options.name || lut.title || "ConvertedLUT"),
		clamp(options.grayWeight ?? 0.8, 0, 1),
	);
	const buffer = serializeProfile(profile);

	return {
		buffer,
		filename: `${profile.name}.NP3`,
		summary: {
			detectedGamma: detection.gamma,
			detectedInputSpace: detection.inputSpace,
			requiresManualGamma: detection.gamma === null,
			requiresManualInputSpace: detection.inputSpace === null,
			size: lut.size,
			title: lut.title,
			warnings: detection.warnings,
		},
	};
}

function parseCubeLut(input: string): CubeLut {
	let title: string | null = null;
	let size: number | null = null;
	let domainMin: [number, number, number] = [0, 0, 0];
	let domainMax: [number, number, number] = [1, 1, 1];
	const metadata: string[] = [];
	const table: Array<[number, number, number]> = [];

	for (const rawLine of input.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line) continue;
		if (line.startsWith("#")) {
			metadata.push(line);
			continue;
		}
		if (line.toUpperCase().startsWith("TITLE")) {
			const match = line.match(/TITLE\s+"(.*)"/iu);
			title = match?.[1] ?? line.slice(5).trim().replace(/^"|"$/gu, "");
			continue;
		}
		if (line.toUpperCase().startsWith("LUT_1D_SIZE")) {
			throw new Error("Only 3D .cube LUTs are supported.");
		}
		if (line.toUpperCase().startsWith("LUT_3D_SIZE")) {
			size = Number.parseInt(line.split(/\s+/u)[1] ?? "", 10);
			continue;
		}
		if (line.toUpperCase().startsWith("DOMAIN_MIN")) {
			const [, r, g, b] = line.split(/\s+/u);
			domainMin = [Number(r), Number(g), Number(b)];
			continue;
		}
		if (line.toUpperCase().startsWith("DOMAIN_MAX")) {
			const [, r, g, b] = line.split(/\s+/u);
			domainMax = [Number(r), Number(g), Number(b)];
			continue;
		}

		const parts = line.split(/\s+/u);
		if (parts.length === 3) {
			table.push([Number(parts[0]), Number(parts[1]), Number(parts[2])]);
		}
	}

	if (!size || Number.isNaN(size) || size < 2) {
		throw new Error("Missing or invalid LUT_3D_SIZE.");
	}
	const expectedSize = size ** 3;
	if (table.length !== expectedSize) {
		throw new Error(`Expected ${expectedSize} LUT rows, got ${table.length}.`);
	}

	return { domainMax, domainMin, metadata, size, table, title };
}

function detectConstraints(lut: CubeLut): {
	inputSpace: SupportedInputSpace | null;
	gamma: SupportedGamma | null;
	warnings: string[];
} {
	const warnings: string[] = [];
	const knownMetadata = lut.metadata
		.filter((line) => {
			const lowered = line.toLowerCase();
			return (
				lowered.startsWith("#inputgamma") ||
				lowered.startsWith("#outputgamma") ||
				lowered.startsWith("#imageprofile") ||
				lowered.startsWith("#colorspace") ||
				lowered.startsWith("#gamma")
			);
		})
		.join(" ")
		.toLowerCase();
	const title = (lut.title ?? "").toLowerCase();
	const combined = `${knownMetadata} ${title}`;

	let inputSpace: SupportedInputSpace | null = null;
	let gamma: SupportedGamma | null = null;

	if (combined.includes("nikon srgb")) inputSpace = "nikon-srgb";
	else if (combined.includes("srgb")) inputSpace = "srgb";
	else if (combined.includes("rec.709") || combined.includes("rec709")) {
		warnings.push("Detected Rec.709 metadata. First version only supports sRGB-like display LUTs.");
	}

	if (combined.includes("gamma 2.2") || combined.includes("gamma2.2")) gamma = "gamma-2.2";
	else if (combined.includes("srgb")) gamma = "srgb";
	else if (combined.includes("gamma 2.4") || combined.includes("gamma2.4")) {
		warnings.push(
			"Detected gamma 2.4 metadata. First version only supports sRGB-like display LUTs.",
		);
	}

	if (
		[" log", "slog", "v-log", "logc", "cineon", "aces", "pq", "hlg", "scene-referred"].some(
			(keyword) => combined.includes(keyword),
		)
	) {
		warnings.push("Detected unsupported log, HDR, ACES, or scene-referred metadata.");
	}

	return { gamma, inputSpace, warnings };
}

function resolveSelection<T extends string>(
	label: string,
	detected: T | null,
	selected: T | "auto",
): T {
	if (selected !== "auto") return selected;
	if (detected) return detected;
	throw new Error(`Unable to determine ${label}. Please specify it manually.`);
}

function validateSupport(
	lut: CubeLut,
	inputSpace: SupportedInputSpace,
	gamma: SupportedGamma,
	warnings: string[],
): void {
	if (lut.domainMin.join(",") !== "0,0,0" || lut.domainMax.join(",") !== "1,1,1") {
		throw new Error("Only unit-domain LUTs are supported: DOMAIN_MIN 0 0 0 / DOMAIN_MAX 1 1 1.");
	}
	if (warnings.length > 0) {
		throw new Error(warnings[0]);
	}
	if (!["srgb", "nikon-srgb"].includes(inputSpace)) {
		throw new Error("Unsupported input space.");
	}
	if (!["srgb", "gamma-2.2"].includes(gamma)) {
		throw new Error("Unsupported gamma.");
	}
}

function fitProfile(lut: CubeLut, name: string, grayWeight: number): ConvertedProfile {
	const toneCurveRaw = fitToneCurveRaw(lut, grayWeight);
	const toneCurvePoints = pickCurvePoints(toneCurveRaw);
	const colorBlender = Object.fromEntries(
		BANDS.map(([bandName, hueDeg]) => [bandName, fitColorBand(lut, hueDeg)]),
	) as Record<string, ColorBlenderValues>;
	const colorGrading = Object.fromEntries(
		GRADING_RANGES.map(([rangeName, probeValue]) => [rangeName, fitGradingRange(lut, probeValue)]),
	) as Record<string, ColorGradingValues>;

	return {
		colorBlender,
		colorGrading,
		colorGradingBalance: 0,
		colorGradingBlending: 50,
		name,
		saturation: fitGlobalSaturation(lut),
		toneCurvePoints,
		toneCurveRaw,
	};
}

function fitToneCurveRaw(lut: CubeLut, grayWeight: number): number[] {
	const result: number[] = [];
	let prev = 0;
	for (let i = 0; i < 257; i += 1) {
		const x = i / 256;
		const output = lutSample(lut, [x, x, x]);
		let value = luminance(output);
		if (grayWeight < 1) {
			value = grayWeight * value + (1 - grayWeight) * ((output[0] + output[1] + output[2]) / 3);
		}
		let encoded = Math.round(clamp(value, 0, 1) * 32767);
		if (encoded < prev) encoded = prev;
		result.push(encoded);
		prev = encoded;
	}
	result[result.length - 1] = 32767;
	return result;
}

function pickCurvePoints(raw: number[]): Array<[number, number]> {
	const anchors = [0, 24, 48, 80, 128, 176, 224, 255];
	const points = anchors.map(
		(x) => [x, clampInt(Math.round(((raw[x] ?? 32767) / 32767) * 255), 0, 255)] as [number, number],
	);
	points[0] = [0, 0];
	points[points.length - 1] = [255, 255];
	return points;
}

function fitColorBand(lut: CubeLut, hueDeg: number): ColorBlenderValues {
	const hueDeltas: number[] = [];
	const satDeltas: number[] = [];
	const valDeltas: number[] = [];

	for (const sat of [0.35, 0.65, 0.95]) {
		for (const val of [0.45, 0.7, 0.9]) {
			const rgb = hsvDegToRgb(hueDeg, sat, val);
			const output = lutSample(lut, rgb);
			const [hin, sin, vin] = rgbToHsvDeg(rgb);
			const [hout, sout, vout] = rgbToHsvDeg(output);
			hueDeltas.push(shortestHueDelta(hin, hout));
			satDeltas.push((sout - sin) * 100);
			valDeltas.push((vout - vin) * 100);
		}
	}

	return {
		brightness: clampInt(Math.round(average(valDeltas)), -100, 100),
		chroma: clampInt(Math.round(average(satDeltas)), -100, 100),
		hue: clampInt(Math.round(average(hueDeltas) / 1.8), -100, 100),
	};
}

function fitGradingRange(lut: CubeLut, probeValue: number): ColorGradingValues {
	const output = lutSample(lut, [probeValue, probeValue, probeValue]);
	const [hue, sat] = rgbToHsvDeg(output);
	const inLuma = luminance([probeValue, probeValue, probeValue]);
	const outLuma = luminance(output);
	return {
		brightness: clampInt(Math.round((outLuma - inLuma) * 100), -100, 100),
		chroma: sat < 0.015 ? 0 : clampInt(Math.round(sat * 100), -100, 100),
		hue: sat < 0.015 ? 0 : Math.round(hue) % 360,
	};
}

function fitGlobalSaturation(lut: CubeLut): number {
	const deltas: number[] = [];
	for (const hueDeg of [0, 30, 60, 120, 180, 240, 270, 300]) {
		for (const sat of [0.55, 0.8]) {
			const rgb = hsvDegToRgb(hueDeg, sat, 0.75);
			const [, inputSat] = rgbToHsvDeg(rgb);
			const [, outputSat] = rgbToHsvDeg(lutSample(lut, rgb));
			deltas.push((outputSat - inputSat) * 100);
		}
	}
	return clampInt(Math.round(average(deltas) * 0.6), -100, 100);
}

function serializeProfile(profile: ConvertedProfile): Uint8Array {
	const data = decodeBase64(TONECURVE_TEMPLATE_BASE64);
	writeName(data, profile.name);
	writeQuarterStep(data, OFFSET_SHARPENING, 2, -3, 9);
	writeQuarterStep(data, OFFSET_MID_RANGE_SHARPENING, 1, -5, 5);
	writeQuarterStep(data, OFFSET_CLARITY, 0.5, -5, 5);
	writeSignedByte(data, OFFSET_SATURATION, profile.saturation, -100, 100);

	for (const [bandName, , offset] of BANDS) {
		const values = profile.colorBlender[bandName] ?? { brightness: 0, chroma: 0, hue: 0 };
		writeSignedByte(data, offset, values.hue, -100, 100);
		writeSignedByte(data, offset + 1, values.chroma, -100, 100);
		writeSignedByte(data, offset + 2, values.brightness, -100, 100);
	}

	for (const [rangeName, , offset] of GRADING_RANGES) {
		writeColorGradingValues(
			data,
			offset,
			profile.colorGrading[rangeName] ?? { brightness: 0, chroma: 0, hue: 0 },
		);
	}
	writeSignedByte(data, OFFSET_COLOR_GRADING_BLENDING, profile.colorGradingBlending, 0, 100);
	writeSignedByte(data, OFFSET_COLOR_GRADING_BALANCE, profile.colorGradingBalance, -100, 100);
	writeToneCurvePoints(data, profile.toneCurvePoints);
	writeToneCurveRaw(data, profile.toneCurveRaw);
	return data;
}

function writeName(buffer: Uint8Array, name: string): void {
	const safe = sanitizeName(name);
	for (let i = 0; i < 19; i += 1) buffer[OFFSET_NAME + i] = 0;
	for (let i = 0; i < safe.length; i += 1) buffer[OFFSET_NAME + i] = safe.charCodeAt(i);
}

function writeQuarterStep(
	buffer: Uint8Array,
	offset: number,
	value: number,
	min: number,
	max: number,
): void {
	buffer[offset] = clampInt(Math.round(0x80 + clamp(value, min, max) * 4), 0, 255);
}

function writeSignedByte(
	buffer: Uint8Array,
	offset: number,
	value: number,
	min: number,
	max: number,
): void {
	buffer[offset] = clampInt(0x80 + clamp(value, min, max), 0, 255);
}

function writeColorGradingValues(
	buffer: Uint8Array,
	offset: number,
	values: ColorGradingValues,
): void {
	const hue = ((values.hue % 360) + 360) % 360;
	buffer[offset] = 0x80 + (hue >> 8);
	buffer[offset + 1] = hue & 0xff;
	writeSignedByte(buffer, offset + 2, values.chroma, -100, 100);
	writeSignedByte(buffer, offset + 3, values.brightness, -100, 100);
}

function writeToneCurvePoints(buffer: Uint8Array, points: Array<[number, number]>): void {
	buffer.fill(0, OFFSET_TONE_CURVE_POINTS, OFFSET_TONE_CURVE_POINTS + 41);
	buffer[OFFSET_TONE_CURVE_POINTS] = points.length;
	points.forEach(([x, y], index) => {
		const base = OFFSET_TONE_CURVE_POINTS + 1 + index * 2;
		buffer[base] = clampInt(x, 0, 255);
		buffer[base + 1] = clampInt(y, 0, 255);
	});
}

function writeToneCurveRaw(buffer: Uint8Array, raw: number[]): void {
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	for (let i = 0; i < 257; i += 1) {
		view.setUint16(OFFSET_TONE_CURVE_RAW + i * 2, clampInt(raw[i] ?? 32767, 0, 32767), false);
	}
}

function lutSample(lut: CubeLut, rgb: [number, number, number]): [number, number, number] {
	const [rMin, gMin, bMin] = lut.domainMin;
	const [rMax, gMax, bMax] = lut.domainMax;
	const r = normalizeDomain(rgb[0], rMin, rMax);
	const g = normalizeDomain(rgb[1], gMin, gMax);
	const b = normalizeDomain(rgb[2], bMin, bMax);

	const maxIndex = lut.size - 1;
	const x = clamp(r, 0, 1) * maxIndex;
	const y = clamp(g, 0, 1) * maxIndex;
	const z = clamp(b, 0, 1) * maxIndex;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const z0 = Math.floor(z);
	const x1 = Math.min(x0 + 1, maxIndex);
	const y1 = Math.min(y0 + 1, maxIndex);
	const z1 = Math.min(z0 + 1, maxIndex);
	const tx = x - x0;
	const ty = y - y0;
	const tz = z - z0;

	const c000 = lutAt(lut, x0, y0, z0);
	const c100 = lutAt(lut, x1, y0, z0);
	const c010 = lutAt(lut, x0, y1, z0);
	const c110 = lutAt(lut, x1, y1, z0);
	const c001 = lutAt(lut, x0, y0, z1);
	const c101 = lutAt(lut, x1, y0, z1);
	const c011 = lutAt(lut, x0, y1, z1);
	const c111 = lutAt(lut, x1, y1, z1);

	const out: number[] = [];
	for (let i = 0; i < 3; i += 1) {
		const c00 = lerp(c000[i] ?? 0, c100[i] ?? 0, tx);
		const c10 = lerp(c010[i] ?? 0, c110[i] ?? 0, tx);
		const c01 = lerp(c001[i] ?? 0, c101[i] ?? 0, tx);
		const c11 = lerp(c011[i] ?? 0, c111[i] ?? 0, tx);
		const c0 = lerp(c00, c10, ty);
		const c1 = lerp(c01, c11, ty);
		out.push(clamp(lerp(c0, c1, tz), 0, 1));
	}
	return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
}

function lutAt(lut: CubeLut, r: number, g: number, b: number): [number, number, number] {
	const index = r + lut.size * (g + lut.size * b);
	return lut.table[index] ?? [0, 0, 0];
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function hsvDegToRgb(h: number, s: number, v: number): [number, number, number] {
	const [r, g, b] = hsvToRgb((((h % 360) + 360) % 360) / 360, clamp(s, 0, 1), clamp(v, 0, 1));
	return [r, g, b];
}

function rgbToHsvDeg(rgb: [number, number, number]): [number, number, number] {
	const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
	return [h * 360, s, v];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	let h = 0;
	if (delta !== 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
		h /= 6;
		if (h < 0) h += 1;
	}
	const s = max === 0 ? 0 : delta / max;
	return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	switch (i % 6) {
		case 0:
			return [v, t, p];
		case 1:
			return [q, v, p];
		case 2:
			return [p, v, t];
		case 3:
			return [p, q, v];
		case 4:
			return [t, p, v];
		default:
			return [v, p, q];
	}
}

function shortestHueDelta(from: number, to: number): number {
	return ((to - from + 180) % 360) - 180;
}

function luminance(rgb: [number, number, number]): number {
	return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function average(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeDomain(value: number, min: number, max: number): number {
	if (max <= min) throw new Error("Invalid LUT domain.");
	return (value - min) / (max - min);
}

function sanitizeName(value: string): string {
	const sanitized = value.replace(/[^A-Za-z0-9 _-]+/gu, "").trim();
	return (sanitized || "ConvertedLUT").slice(0, 19);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

export const supportedInputSpaceLabels = SUPPORTED_INPUT_SPACE_LABELS;
export const supportedGammaLabels = SUPPORTED_GAMMA_LABELS;
