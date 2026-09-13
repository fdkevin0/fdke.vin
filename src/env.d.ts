declare module "@pagefind/default-ui" {
	class PagefindUI {
		constructor(arg: unknown);
	}
}

declare module "*.wasm" {
	const wasmModule: WebAssembly.Module;
	export default wasmModule;
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
		siteCountry: string | null;
		siteDefaultLang: "zh" | "en" | "ja";
		/**
		 * The verified Access claims behind `user`, kept so a page can show the
		 * session without verifying the token a second time. Null when the caller
		 * authenticated with an API token or the local dev bypass.
		 */
		accessClaims: import("./lib/cloudflare-access").CloudflareAccessClaims | null;
	}
}
