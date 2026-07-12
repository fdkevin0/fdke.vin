import { describe, expect, it } from "vitest";
import { classifyInboxActivity } from "@/lib/ap/inbox";

const FOLLOWER = "https://remote.example/users/alice";
const ACTOR = "https://fdke.vin/actor";
const NOTE_URL = "https://fdke.vin/notes/01HTEST/";
const NOTE_ID = "01HTEST";
const REMOTE_NOTE = "https://remote.example/users/alice/statuses/9";

describe("classifyInboxActivity", () => {
	it("classifies a Follow, capturing actor, follow id, and target", () => {
		const action = classifyInboxActivity({
			id: "https://remote.example/follows/1",
			type: "Follow",
			actor: FOLLOWER,
			object: ACTOR,
		});
		expect(action).toEqual({
			kind: "follow",
			actorId: FOLLOWER,
			followId: "https://remote.example/follows/1",
			target: ACTOR,
		});
	});

	it("reads the actor from an embedded object with an id", () => {
		const action = classifyInboxActivity({
			type: "Follow",
			actor: { id: FOLLOWER },
			object: { id: ACTOR },
		});
		expect(action).toMatchObject({ kind: "follow", actorId: FOLLOWER, target: ACTOR });
	});

	it("classifies an Undo of an embedded Follow as undo-follow", () => {
		const action = classifyInboxActivity({
			type: "Undo",
			actor: FOLLOWER,
			object: { type: "Follow", actor: FOLLOWER, object: ACTOR },
		});
		expect(action).toEqual({ kind: "undo-follow", actorId: FOLLOWER });
	});

	it("classifies an Undo referencing a Follow by URL as undo-follow", () => {
		const action = classifyInboxActivity({
			type: "Undo",
			actor: FOLLOWER,
			object: "https://remote.example/follows/1",
		});
		expect(action).toEqual({ kind: "undo-follow", actorId: FOLLOWER });
	});

	it("classifies a Like of a local Note", () => {
		const action = classifyInboxActivity({
			id: "https://remote.example/likes/1",
			type: "Like",
			actor: FOLLOWER,
			object: NOTE_URL,
		});
		expect(action).toEqual({
			kind: "like",
			actorId: FOLLOWER,
			activityId: "https://remote.example/likes/1",
			noteId: NOTE_ID,
			objectId: NOTE_URL,
		});
	});

	it("classifies an Announce (boost) of a local Note", () => {
		const action = classifyInboxActivity({
			id: "https://remote.example/announces/1",
			type: "Announce",
			actor: FOLLOWER,
			object: NOTE_URL,
		});
		expect(action).toMatchObject({ kind: "announce", noteId: NOTE_ID, objectId: NOTE_URL });
	});

	it("ignores a Like of a non-local object", () => {
		const action = classifyInboxActivity({
			type: "Like",
			actor: FOLLOWER,
			object: "https://other.example/notes/1/",
		});
		expect(action.kind).toBe("ignore");
	});

	it("classifies a reply Create(Note) in-reply-to a local Note", () => {
		const action = classifyInboxActivity({
			id: "https://remote.example/activities/1",
			type: "Create",
			actor: FOLLOWER,
			object: {
				id: REMOTE_NOTE,
				type: "Note",
				inReplyTo: NOTE_URL,
				content: "<p>nice</p>",
				url: REMOTE_NOTE,
				published: "2026-07-01T00:00:00Z",
			},
		});
		expect(action).toEqual({
			kind: "reply",
			actorId: FOLLOWER,
			activityId: "https://remote.example/activities/1",
			noteId: NOTE_ID,
			objectId: REMOTE_NOTE,
			inReplyTo: NOTE_URL,
			content: "<p>nice</p>",
			url: REMOTE_NOTE,
			published: "2026-07-01T00:00:00Z",
		});
	});

	it("ignores a Create whose Note replies to a non-local Note", () => {
		const action = classifyInboxActivity({
			type: "Create",
			actor: FOLLOWER,
			object: { type: "Note", inReplyTo: "https://other.example/notes/1/", content: "hi" },
		});
		expect(action.kind).toBe("ignore");
	});

	it("ignores a Create of a Note that is not a reply", () => {
		const action = classifyInboxActivity({
			type: "Create",
			actor: FOLLOWER,
			object: { type: "Note", content: "hi" },
		});
		expect(action.kind).toBe("ignore");
	});

	it("classifies an Undo of a Like as undo-interaction with id and object fallback", () => {
		const action = classifyInboxActivity({
			type: "Undo",
			actor: FOLLOWER,
			object: { id: "https://remote.example/likes/1", type: "Like", object: NOTE_URL },
		});
		expect(action).toEqual({
			kind: "undo-interaction",
			actorId: FOLLOWER,
			activityId: "https://remote.example/likes/1",
			interactionKind: "like",
			objectId: NOTE_URL,
		});
	});

	it("classifies an Undo of an id-less Announce via its object", () => {
		const action = classifyInboxActivity({
			type: "Undo",
			actor: FOLLOWER,
			object: { type: "Announce", object: NOTE_URL },
		});
		expect(action).toEqual({
			kind: "undo-interaction",
			actorId: FOLLOWER,
			activityId: "",
			interactionKind: "announce",
			objectId: NOTE_URL,
		});
	});

	it("classifies a Delete of a reply object", () => {
		const action = classifyInboxActivity({
			type: "Delete",
			actor: FOLLOWER,
			object: { id: REMOTE_NOTE, type: "Tombstone" },
		});
		expect(action).toEqual({ kind: "delete-object", actorId: FOLLOWER, objectId: REMOTE_NOTE });
	});

	it("classifies a Delete referencing the object by URL", () => {
		const action = classifyInboxActivity({
			type: "Delete",
			actor: FOLLOWER,
			object: REMOTE_NOTE,
		});
		expect(action).toEqual({ kind: "delete-object", actorId: FOLLOWER, objectId: REMOTE_NOTE });
	});

	it("ignores unsupported activity types", () => {
		expect(classifyInboxActivity({ type: "Flag", actor: FOLLOWER }).kind).toBe("ignore");
	});

	it("ignores an activity with no actor", () => {
		expect(classifyInboxActivity({ type: "Follow", object: ACTOR }).kind).toBe("ignore");
	});
});
