export const prerender = false;

import type { APIRoute } from "astro";
import { getErrorMessage, jsonError } from "@/lib/api/http";
import { convertCubeToNp3 } from "@/lib/tools/lut-to-np3";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
	try {
		const formData = await request.formData();
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
		const rawWeight = formData.get("grayWeight");
		const grayWeight = typeof rawWeight === "string" ? Number(rawWeight) : 0.8;
		if (!Number.isFinite(grayWeight)) return jsonError(400, "Invalid gray-axis weighting.");
		const rawName = formData.get("name");
		const { buffer, filename } = convertCubeToNp3(contents, {
			grayWeight,
			name: typeof rawName === "string" ? rawName : "",
		});

		return new Response(buffer as unknown as BodyInit, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
				"Content-Type": "application/octet-stream",
			},
		});
	} catch (error) {
		return jsonError(400, getErrorMessage(error, "Failed to convert LUT to NP3."));
	}
};
