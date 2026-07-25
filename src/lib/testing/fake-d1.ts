/**
 * A D1 stand-in for node-based vitest runs, which have no Workers runtime.
 *
 * It records the statements actually executed rather than storing rows, because
 * what the exchange tests assert is *how many* statements a code path issues and
 * with what bindings — see `docs/adr/0004` (the poll watermark) and
 * `docs/adr/0005` (paging without a `count(*)`).
 *
 * Rows come from `results`, which every `.all()` returns and every `.first()`
 * takes the head of, regardless of the SQL. That is enough for tests that pin
 * statements; a test needing real query semantics wants a real database.
 */
export interface FakeStatement {
	sql: string;
	params: unknown[];
}

export interface FakeDatabase {
	/** Pass to code under test in place of a `D1Database`. */
	db: D1Database;
	/** Every statement run, in order, with the bindings it carried. */
	executed: FakeStatement[];
	/** The subset of {@link executed} that writes. */
	writes(): FakeStatement[];
}

export function fakeD1(results: Record<string, unknown>[] = []): FakeDatabase {
	const executed: FakeStatement[] = [];

	const database = {
		prepare(sql: string) {
			let params: unknown[] = [];
			const record = () => executed.push({ sql, params });
			const statement = {
				bind(...bound: unknown[]) {
					params = bound;
					return statement;
				},
				run: async () => {
					record();
					return { meta: { changes: 1 } };
				},
				first: async () => {
					record();
					return results[0] ?? null;
				},
				all: async () => {
					record();
					return { results };
				},
				// `batch` is handed prepared statements, so it needs a way back in to
				// record them; D1's own statement type has no such hook.
				_record: record,
			};
			return statement;
		},
		batch: async (statements: { _record(): void }[]) => {
			for (const statement of statements) statement._record();
			return statements.map(() => ({ meta: { changes: 1 } }));
		},
	};

	return {
		db: database as unknown as D1Database,
		executed,
		writes: () => executed.filter(({ sql }) => /INSERT|UPDATE|DELETE/i.test(sql)),
	};
}

/** The same fake, wrapped as an `Env` for code that takes bindings rather than a database. */
export function fakeD1Env(results: Record<string, unknown>[] = []) {
	const fake = fakeD1(results);
	return { ...fake, env: { DATABASE: fake.db } as unknown as Env };
}
