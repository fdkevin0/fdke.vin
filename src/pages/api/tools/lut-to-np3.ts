export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError, jsonNoStore } from "@/lib/api/http";
import { convertCubeToNp3, inspectCubeLut } from "@/lib/tools/lut-to-np3";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
	try {
		const formData = await request.formData();
		const action = String(formData.get("action") || "inspect");
		const file = formData.get("file");
		if (!(file instanceof File)) {
			return jsonError(400, "Missing .cube file.");
		}
		if (!file.name.toLowerCase().endsWith(".cube")) {
			return jsonError(400, "Only .cube files are supported in this tool.");
		}
		if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
			return jsonError(400, "File size must be between 1 byte and 2 MB.");
		}

		const contents = await file.text();
		if (action === "inspect") {
			return jsonNoStore(inspectCubeLut(contents));
		}

		if (action !== "convert") {
			return jsonError(400, "Unsupported action.");
		}

		const { buffer, filename, summary } = convertCubeToNp3(contents, {
			gamma: String(formData.get("gamma") || "auto") as "auto" | "srgb" | "gamma-2.2",
			grayWeight: Number(formData.get("grayWeight") || "0.8"),
			inputSpace: String(formData.get("inputSpace") || "auto") as
				| "auto"
				| "srgb"
				| "nikon-srgb",
			name: String(formData.get("name") || ""),
		});

		return new Response(buffer as unknown as BodyInit, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
				"Content-Type": "application/octet-stream",
				"X-Lut-Detected-Gamma": summary.detectedGamma ?? "unknown",
				"X-Lut-Detected-Input-Space": summary.detectedInputSpace ?? "unknown",
			},
		});
	} catch (error) {
		return jsonError(400, getErrorMessage(error, "Failed to convert LUT to NP3."));
	}
};
