const FALLBACK_PATH = "/dashboard/";

/**
 * Resolves the post-login target against this origin and refuses anything that
 * lands elsewhere.
 *
 * String prefix checks are the wrong tool here: `//evil.com` is the obvious
 * case, but `/\evil.com` also starts with a single `/` and browsers normalise
 * the backslash into a second slash, turning it into a protocol-relative jump.
 * Letting the URL parser decide the origin closes the whole family at once.
 */
export function getSafeRedirectTarget(value: string | null, base: URL): string {
	if (!value) {
		return FALLBACK_PATH;
	}

	let target: URL;
	try {
		target = new URL(value, base);
	} catch {
		return FALLBACK_PATH;
	}

	if (target.origin !== base.origin) {
		return FALLBACK_PATH;
	}

	// Bouncing back to /auth would just re-enter the handler that sent us here.
	if (target.pathname.replace(/\/+$/, "") === "/auth") {
		return FALLBACK_PATH;
	}

	return `${target.pathname}${target.search}`;
}
