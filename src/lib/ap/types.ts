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

/**
 * A media attachment stored on a Note (a channel-post photo saved to R2).
 * Surfaced as an AS2 `Document` in the Note object and as an `<img>` on the
 * SSR page.
 */
export interface NoteAttachment {
	/** ULID identifying the attachment row. */
	id: string;
	/** Site-relative or absolute URL the media is served from. */
	url: string;
	mediaType: string;
	/** Optional alt text / display name. */
	name: string | null;
	width: number | null;
	height: number | null;
}

/**
 * A unit of {@link Delivery} work on `ap-delivery-queue`: sign one Note's
 * Create/Update activity and POST it to one follower inbox. One message is
 * enqueued per deduped inbox when a Note is authored/edited in Telegram.
 */
export interface ApDeliveryMessage {
	kind: "Create" | "Update" | "Delete";
	/** The Note whose activity to deliver. */
	noteId: string;
	/** The (shared or personal) follower inbox to POST to. */
	inboxUrl: string;
}

/**
 * A debounced check of whether a Pending album (issue AP-11) should finalize,
 * carried on `ap-delivery-queue` alongside {@link ApDeliveryMessage} and
 * distinguished by `kind`. Enqueued with a delay on every Album photo arrival;
 * on consumption the group finalizes if quiet, or the check is a no-op
 * otherwise (see CONTEXT.md "Finalization").
 */
export interface AlbumFinalizeMessage {
	kind: "AlbumFinalize";
	chatId: number;
	groupId: string;
}

/** The union of message kinds carried on `ap-delivery-queue`. */
export type ApQueueMessage = ApDeliveryMessage | AlbumFinalizeMessage;

/** The kind of a remote {@link Interaction} with one of our Notes. */
export type InteractionKind = "reply" | "like" | "announce";

/**
 * A remote reaction to a Note (see CONTEXT.md "Interaction"), ingested via the
 * inbox. A `reply` carries sanitized HTML `content`; a `like`/`announce` renders
 * only as a count. `hidden` is set when the author moderates a stored reply.
 */
export interface Interaction {
	id: string;
	kind: InteractionKind;
	actorId: string;
	actorName: string | null;
	actorHandle: string | null;
	/** Proxied avatar URL (`/api/ap/media/...`), never a hotlink. */
	actorAvatarUrl: string | null;
	objectId: string | null;
	/** Reply: sanitized HTML. `null` for like/announce. */
	content: string | null;
	url: string | null;
	publishedAt: string | null;
	createdAt: string;
	hidden: boolean;
}

/** Reply/like/announce counts for a Note, for the SSR page and dashboard. */
export interface InteractionCounts {
	replies: number;
	likes: number;
	announces: number;
}

/** The `ap_note_attachments` D1 row shape. */
export interface ApNoteAttachmentRow {
	id: string;
	note_id: string;
	/** The R2 object key the media is stored under. */
	r2_key: string;
	/** URL the media is served from (`/api/ap/media/{r2_key}`). */
	url: string;
	media_type: string;
	name: string | null;
	width: number | null;
	height: number | null;
	/** Ordering within a Note's attachments (0-based). */
	position: number;
}
