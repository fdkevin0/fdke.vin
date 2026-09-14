import { escapeHtml } from "@/utils/html";

/** Render text-only cells in a keyboard-accessible, horizontally scrollable table. */
export function renderDataTable(
	title: string,
	headers: string[],
	rows: (string | number | null | undefined)[][],
): string {
	if (rows.length === 0) return "";
	const cell = (value: string | number | null | undefined) =>
		escapeHtml(value == null || value === "" ? "—" : String(value));
	return `<section class="min-w-0 mb-5 last:mb-0">
		<h3 class="mb-2 font-medium">${escapeHtml(title)}</h3>
		<div class="max-w-full overflow-x-auto border border-[var(--tool-line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" role="region" aria-label="${escapeHtml(title)}" tabindex="0">
			<table class="w-full border-collapse whitespace-nowrap text-sm tabular-nums">
				<caption class="sr-only">${escapeHtml(title)}</caption>
				<thead><tr>${headers.map((header) => `<th class="px-3 py-2.5 text-left font-medium text-[var(--tool-muted)]" scope="col">${cell(header)}</th>`).join("")}</tr></thead>
				<tbody>${rows.map((row) => `<tr>${row.map((value) => `<td class="border-t border-[var(--tool-line)] px-3 py-2.5 text-left">${cell(value)}</td>`).join("")}</tr>`).join("")}</tbody>
			</table>
		</div>
	</section>`;
}
