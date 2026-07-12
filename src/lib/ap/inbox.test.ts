import { describe, expect, it } from "vitest";
import { classifyInboxActivity } from "@/lib/ap/inbox";

const FOLLOWER = "https://remote.example/users/alice";
const ACTOR = "https://fdke.vin/actor";

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

	it("ignores an Undo of a non-Follow", () => {
		const action = classifyInboxActivity({
			type: "Undo",
			actor: FOLLOWER,
			object: { type: "Like", object: "https://fdke.vin/notes/1/" },
		});
		expect(action.kind).toBe("ignore");
	});

	it("ignores unsupported activity types", () => {
		expect(classifyInboxActivity({ type: "Like", actor: FOLLOWER }).kind).toBe("ignore");
	});

	it("ignores an activity with no actor", () => {
		expect(classifyInboxActivity({ type: "Follow", object: ACTOR }).kind).toBe("ignore");
	});
});
