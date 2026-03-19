declare module "@pagefind/default-ui" {
	declare class PagefindUI {
		constructor(arg: unknown);
	}
}

declare module "*.wasm" {
	const wasmModule: WebAssembly.Module;
	export default wasmModule;
}
