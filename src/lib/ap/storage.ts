import type { ApEnv } from "@/lib/ap/runtime";
import type { ApNoteRow, Note } from "@/lib/ap/types";

const NOTE_COLUMNS = "id, title, content, summary, published_at, updated_at, created_at, source";

let ensureSchemaPromise: Promise<void> | null = null;

/**
 * Create the `ap_notes` table if it does not exist. Idempotent and cached per
 * isolate, mirroring the feed subsystem's `ensureFeedSchema`. The canonical
 * schema lives in `scripts/d1/activitypub.sql`.
 */
async function ensureNoteSchema(env: ApEnv): Promise<void> {
	if (!ensureSchemaPromise) {
		ensureSchemaPromise = (async () => {
			await env.DATABASE.prepare(
				`CREATE TABLE IF NOT EXISTS ap_notes (
					id TEXT PRIMARY KEY,
					title TEXT,
					content TEXT NOT NULL,
					summary TEXT,
					published_at TEXT NOT NULL,
					updated_at TEXT NOT NULL,
					created_at TEXT NOT NULL,
					source TEXT NOT NULL DEFAULT 'migration'
				)`,
			).run();
			await env.DATABASE.prepare(
				"CREATE INDEX IF NOT EXISTS idx_ap_notes_published_at ON ap_notes(published_at)",
			).run();
		})();
	}
	return ensureSchemaPromise;
}

function mapNoteRow(row: ApNoteRow): Note {
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		summary: row.summary,
		publishDate: new Date(row.published_at),
		updatedDate: new Date(row.updated_at),
		source: row.source,
	};
}

/** Insert a Note, or replace it if the id already exists (idempotent migration). */
export async function upsertNote(env: ApEnv, row: ApNoteRow): Promise<void> {
	await ensureNoteSchema(env);
	await env.DATABASE.prepare(
		`INSERT INTO ap_notes (${NOTE_COLUMNS})
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
		 ON CONFLICT(id) DO UPDATE SET
		   title = excluded.title,
		   content = excluded.content,
		   summary = excluded.summary,
		   published_at = excluded.published_at,
		   updated_at = excluded.updated_at,
		   source = excluded.source`,
	)
		.bind(
			row.id,
			row.title,
			row.content,
			row.summary,
			row.published_at,
			row.updated_at,
			row.created_at,
			row.source,
		)
		.run();
}

/** Fetch a single Note by its ULID, or null if none exists. */
export async function getNoteById(env: ApEnv, id: string): Promise<Note | null> {
	await ensureNoteSchema(env);
	const row = await env.DATABASE.prepare(`SELECT ${NOTE_COLUMNS} FROM ap_notes WHERE id = ?1`)
		.bind(id)
		.first<ApNoteRow>();
	return row ? mapNoteRow(row) : null;
}

/** List Notes newest-first (by published date). */
export async function listNotes(env: ApEnv): Promise<Note[]> {
	await ensureNoteSchema(env);
	const result = await env.DATABASE.prepare(
		`SELECT ${NOTE_COLUMNS} FROM ap_notes ORDER BY published_at DESC, id DESC`,
	).all<ApNoteRow>();
	return (result.results ?? []).map(mapNoteRow);
}

/** Total number of Notes, for pagination metadata. */
export async function countNotes(env: ApEnv): Promise<number> {
	await ensureNoteSchema(env);
	const row = await env.DATABASE.prepare("SELECT COUNT(*) AS total FROM ap_notes").first<{
		total: number;
	}>();
	return row?.total ?? 0;
}

/**
 * One page of Notes, newest-first. Mirrors the static `paginate()` shape the
 * listing page used before the D1 switch: a `Page`-like record (without the
 * `Page` type dependency) so on-demand rendering can compute prev/next URLs.
 */
export async function listNotesPage(
	env: ApEnv,
	opts: { limit: number; offset: number },
): Promise<Note[]> {
	await ensureNoteSchema(env);
	const result = await env.DATABASE.prepare(
		`SELECT ${NOTE_COLUMNS} FROM ap_notes
		 ORDER BY published_at DESC, id DESC
		 LIMIT ?1 OFFSET ?2`,
	)
		.bind(opts.limit, opts.offset)
		.all<ApNoteRow>();
	return (result.results ?? []).map(mapNoteRow);
}
