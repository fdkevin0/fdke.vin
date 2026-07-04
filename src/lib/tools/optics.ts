function isPositiveFinite(value: number) {
	return Number.isFinite(value) && value > 0;
}

export interface HyperfocalResult {
	distanceMm: number;
	nearLimitMm: number;
}

/** H = f² / (N × c) + f. Returns null when any input is not a positive finite number. */
export function hyperfocalDistance(
	focalLengthMm: number,
	aperture: number,
	cocMm: number,
): HyperfocalResult | null {
	if (!isPositiveFinite(focalLengthMm) || !isPositiveFinite(aperture) || !isPositiveFinite(cocMm)) {
		return null;
	}
	const distanceMm = (focalLengthMm * focalLengthMm) / (aperture * cocMm) + focalLengthMm;
	return { distanceMm, nearLimitMm: distanceMm / 2 };
}

/** Converts a focal length between sensors via crop factors. Returns null on non-positive input. */
export function equivalentFocalLength(
	focalLengthMm: number,
	sourceCropFactor: number,
	targetCropFactor: number,
): number | null {
	if (
		!isPositiveFinite(focalLengthMm) ||
		!isPositiveFinite(sourceCropFactor) ||
		!isPositiveFinite(targetCropFactor)
	) {
		return null;
	}
	return focalLengthMm * (targetCropFactor / sourceCropFactor);
}

export function formatDistance(distanceMm: number) {
	if (distanceMm >= 1000) {
		return `${(distanceMm / 1000).toFixed(2)} m`;
	}
	return `${Math.round(distanceMm)} mm`;
}

export function formatFocalLength(focalLengthMm: number) {
	if (Number.isInteger(focalLengthMm)) {
		return `${focalLengthMm.toFixed(0)} mm`;
	}
	return `${focalLengthMm.toFixed(1)} mm`;
}
