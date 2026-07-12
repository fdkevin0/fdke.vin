import type { Element, Root, Text } from "hast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { AdmonitionType } from "@/types";

export const admonitionTypes = new Map<AdmonitionType, { defaultLabel: string }>([
	["tip", { defaultLabel: "Tip" }],
	["note", { defaultLabel: "Note" }],
	["important", { defaultLabel: "Important" }],
	["caution", { defaultLabel: "Caution" }],
	["warning", { defaultLabel: "Warning" }],
]);

/** Adapt remark-admonition's generic output to this site's accessible HTML contract. */
export const rehypeAdmonitions: Plugin<[], Root> = () => (tree) => {
	visit(tree, "element", (node) => {
		const type = node.properties["dataAdmonitionName"];
		const label = node.properties["dataAdmonitionLabel"];
		if (node.tagName !== "aside" || typeof type !== "string" || typeof label !== "string") return;

		delete node.properties["dataAdmonitionName"];
		delete node.properties["dataAdmonitionLabel"];
		node.properties["dataAdmonitionType"] = type;
		node.properties.ariaLabel = label;

		const title: Element = {
			type: "element",
			tagName: "p",
			properties: { className: ["admonition-title"], ariaHidden: "true" },
			children: [{ type: "text", value: label } satisfies Text],
		};
		const content: Element = {
			type: "element",
			tagName: "div",
			properties: { className: ["admonition-content"] },
			children: node.children,
		};
		node.children = [title, content];
	});
};
