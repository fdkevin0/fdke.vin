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

interface D1Result<T = Record<string, unknown>> {
	results?: T[];
	success: boolean;
	meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
	run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
	prepare(query: string): D1PreparedStatement;
	batch<T = D1Result>(statements: D1PreparedStatement[]): Promise<T[]>;
	exec(query: string): Promise<unknown>;
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
		apiToken: {
			id: string;
			scopes: string[];
			ownerEmail: string;
		} | null;
		cfContext: ExecutionContext;
	}
}
