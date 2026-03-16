import { mkdir } from "node:fs/promises";

import sharp from "sharp";

const src = "public/icons/icon-source.png";

const icons = [
	[32, "public/favicon-32x32.png"],
	[96, "public/icons/icon-96.png"],
	[120, "public/icons/icon-120.png"],
	[180, "public/icons/apple-touch-icon.png"],
	[192, "public/icons/icon-192.png"],
	[512, "public/icons/icon-512.png"],
];

await mkdir("public/icons", { recursive: true });

await Promise.all(
	icons.map(([size, output]) => sharp(src).resize(size, size).png().toFile(output)),
);

console.log(`Generated ${icons.length} icon variants`);
