interface HastNode {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
}

/** Wraps each Markdown table in a horizontal scroll container, so wide tables scroll on
 *  narrow screens while the table itself keeps normal table layout and full width. */
export function rehypeTableScroll() {
	const wrap = (node: HastNode) => {
		if (!node.children) return;
		node.children = node.children.map((child) => {
			if (child.type === "element" && child.tagName === "table") {
				return {
					type: "element",
					tagName: "div",
					properties: { className: ["table-scroll"] },
					children: [child],
				};
			}
			wrap(child);
			return child;
		});
	};
	return (tree: HastNode) => wrap(tree);
}
