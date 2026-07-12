export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { getErrorMessage, jsonError, jsonNoStore } from "@/lib/api/http";
import { convertCubeToNp3, inspectCubeLut } from "@/lib/tools/lut-to-np3";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * The scalar option fields carried alongside the uploaded `.cube` file.
 * Blank/absent fields fall back to defaults; an unknown enum value is a 400
 * rather than an unsafe cast into the converter.
 */
const lutOptionsSchema = z.object({
	action: z.enum(["inspect", "convert"]).default("inspect"),
	gamma: z.enum(["auto", "srgb", "gamma-2.2"]).default("auto"),
	grayWeight: z.coerce.number().default(0.8),
	inputSpace: z.enum(["auto", "srgb", "nikon-srgb"]).default("auto"),
	name: z.string().default(""),
});

/** Read a form field as an optional string (blank/File/absent → undefined, so defaults apply). */
function formString(value: FormDataEntryValue | null): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

export const POST: APIRoute = async ({ request }) => {
	try {
		const formData = await request.formData();
		const options = lutOptionsSchema.safeParse({
			action: formString(formData.get("action")),
			gamma: formString(formData.get("gamma")),
			grayWeight: formString(formData.get("grayWeight")),
			inputSpace: formString(formData.get("inputSpace")),
			name: formString(formData.get("name")),
		});
		if (!options.success) {
			return jsonError(400, options.error.issues[0]?.message ?? "Invalid form fields.");
		}
		const { action, gamma, grayWeight, inputSpace, name } = options.data;

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

		const { buffer, filename, summary } = convertCubeToNp3(contents, {
			gamma,
			grayWeight,
			inputSpace,
			name,
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
