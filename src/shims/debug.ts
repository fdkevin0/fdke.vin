type DebugNamespace = ((...args: unknown[]) => void) & {
	enabled: boolean;
	extend: (namespace: string) => DebugNamespace;
	namespace: string;
};

function createDebugger(namespace: string): DebugNamespace {
	const debug = ((..._args: unknown[]) => {}) as DebugNamespace;
	debug.enabled = false;
	debug.namespace = namespace;
	debug.extend = (suffix: string) => createDebugger(`${namespace}:${suffix}`);
	return debug;
}

const debugFactory = ((namespace: string) => createDebugger(namespace)) as typeof createDebugger & {
	coerce: (value: unknown) => unknown;
	default: typeof createDebugger;
	disable: () => string;
	enable: (_namespaces: string) => void;
	enabled: (_namespace: string) => false;
	formatArgs: () => void;
	humanize: (value: unknown) => string;
	load: () => string | undefined;
	log: (..._args: unknown[]) => void;
	save: (_namespaces?: string) => void;
	useColors: () => false;
};

debugFactory.coerce = (value: unknown) => value;
debugFactory.default = debugFactory;
debugFactory.disable = () => "";
debugFactory.enable = (_namespaces: string) => {};
debugFactory.enabled = (_namespace: string) => false;
debugFactory.formatArgs = () => {};
debugFactory.humanize = (value: unknown) => String(value);
debugFactory.load = () => undefined;
debugFactory.log = (..._args: unknown[]) => {};
debugFactory.save = (_namespaces?: string) => {};
debugFactory.useColors = () => false;

export default debugFactory;
