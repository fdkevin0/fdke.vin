declare module "@pagefind/default-ui" {
	class PagefindUI {
		constructor(arg: unknown);
	}
}

declare module "*.wasm" {
	const wasmModule: WebAssembly.Module;
	export default wasmModule;
}

interface R2Bucket {
	list(options?: { prefix?: string }): Promise<{
		objects: Array<{
			key: string;
			size: number;
			customMetadata?: Record<string, unknown>;
		}>;
	}>;
	get(key: string): Promise<{ text(): Promise<string> } | null>;
}

interface CloudflareAccessPayload {
	email: string;
	name: string | undefined;
	uid: string | undefined;
	common_name: string | undefined;
}

declare namespace App {
	interface Locals {
		user: CloudflareAccessPayload | null;
		cfContext: ExecutionContext;
	}
}
