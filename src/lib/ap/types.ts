/** How a Note entered the store — see CONTEXT.md "Federation". */
export type NoteSource = "migration" | "telegram" | "dashboard";

/** A Note as the application uses it (dates as `Date`, source markdown as `content`). */
export interface Note {
	/** ULID — the canonical Note id and `/notes/{id}/` URL segment. */
	id: string;
	/** Optional display title. */
	title: string | null;
	/** Markdown source rendered SSR and serialized into the AS2 Note object. */
	content: string;
	/** Optional short summary (maps to AS2 `summary`). */
	summary: string | null;
	publishDate: Date;
	updatedDate: Date;
	source: NoteSource;
}

/** The `ap_notes` D1 row shape (all timestamps ISO 8601 strings). */
export interface ApNoteRow {
	id: string;
	title: string | null;
	content: string;
	summary: string | null;
	published_at: string;
	updated_at: string;
	created_at: string;
	source: NoteSource;
}
