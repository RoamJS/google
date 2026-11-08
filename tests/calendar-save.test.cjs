const assert = require("node:assert/strict");
const { test } = require("node:test");
const { saveCalendarEvent } = require("../src/services/saveCalendarEvent.ts");

const eventUrl = "https://www.google.com/calendar/event?eid=fixture";
const draft = {
  calendarId: "fixture@example.invalid",
  account: "Fixture",
  parentUid: "parent",
  event: {
    summary: "Calendar pilot",
    description: "Fixture",
    location: "",
    start: { dateTime: "2026-11-08T10:00:00-06:00" },
    end: { dateTime: "2026-11-08T10:30:00-06:00" },
  },
};

const setup = (t, { handleRequest, handleLink, getCredentials } = {}) => {
  let posted;
  const requests = [];
  const linkWrites = [];
  const blocks = new Map([["parent", { ":block/uid": "parent" }]]);
  const saveBlock = ({ block }) => {
    blocks.set(block.uid, {
      ":block/uid": block.uid,
      ":block/string": block.string,
    });
  };
  t.mock.method(globalThis, "fetch", async (url, request) => {
    const method = request.method || "GET";
    requests.push({ method, url });
    assert.equal(request.headers.Authorization, "Bearer test-token");
    if (method === "POST") posted = JSON.parse(request.body);
    if (handleRequest) return handleRequest(method, posted, url);
    return Response.json({ id: posted.id, htmlLink: eventUrl });
  });
  const previousWindow = globalThis.window;
  globalThis.window = {
    roamAlphaAPI: {
      pull: (_, [, uid]) => blocks.get(uid),
      util: { generateUID: () => "link-uid" },
      data: {
        block: {
          create: async (params) => {
            linkWrites.push(params);
            if (handleLink) return handleLink(params, saveBlock);
            saveBlock(params);
          },
        },
      },
    },
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const signal = new AbortController().signal;
  return {
    start: () =>
      saveCalendarEvent({
        draft,
        signal,
        getCredentials:
          getCredentials ??
          (async (account, expectedUid) => {
            assert.equal(account, "Fixture");
            if (expectedUid) assert.equal(expectedUid, "original-auth");
            return { token: "test-token", accountUid: "original-auth" };
          }),
      }),
    signal,
    requests,
    linkWrites,
    posted: () => posted,
  };
};

test("creates one Calendar event and inserts the link under the original Roam parent", async (t) => {
  const { start, requests, linkWrites, posted } = setup(t);
  assert.equal((await start()).kind, "success");
  assert.match(posted().id, /^[a-f0-9]{32}$/);
  assert.deepEqual(
    { ...posted(), id: undefined },
    { ...draft.event, id: undefined },
  );
  assert.deepEqual(
    requests.map(({ method }) => method),
    ["POST"],
  );
  assert.match(requests[0].url, /fixture%40example.invalid\/events$/);
  assert.deepEqual(linkWrites, [
    {
      location: { "parent-uid": "parent", order: 0 },
      block: { uid: "link-uid", string: `Link:: ${eventUrl}` },
    },
  ]);
});

test("marks a preflight auth error and a Calendar rejection safe to retry", async (t) => {
  let loggedIn = false;
  const { start, requests, linkWrites } = setup(t, {
    getCredentials: async () => {
      if (!loggedIn) throw new Error("Refresh failed");
      return { token: "test-token", accountUid: "original-auth" };
    },
    handleRequest: () => Response.json({}, { status: 403 }),
  });
  assert.equal((await start()).retrySafe, true);
  assert.equal(requests.length, 0);
  loggedIn = true;
  const rejected = await start();
  assert.equal(rejected.kind, "failure");
  assert.equal(rejected.retrySafe, true);
  assert.equal(requests.length, 1);
  assert.equal(linkWrites.length, 0);
});

test("checks an ambiguous creation by its original ID and never posts again", async (t) => {
  let visibleInCalendar = false;
  const { start, signal, requests, linkWrites } = setup(t, {
    handleRequest: (method, event, url) => {
      if (method === "POST") throw new TypeError("Network disconnected");
      assert.ok(url.endsWith(`/events/${event.id}`));
      return visibleInCalendar
        ? Response.json({ id: event.id, htmlLink: eventUrl })
        : Response.json({}, { status: 404 });
    },
  });
  const unknown = await start();
  assert.equal(unknown.kind, "unknown");
  const missing = await unknown.recover(signal);
  assert.equal(missing.kind, "unknown");
  assert.equal(linkWrites.length, 0);
  visibleInCalendar = true;
  assert.equal((await missing.recover(signal)).kind, "success");
  assert.deepEqual(
    requests.map(({ method }) => method),
    ["POST", "GET", "GET"],
  );
  assert.equal(linkWrites.length, 1);
});

test("retries the Roam step with the same link UID when it fails before writing", async (t) => {
  let failLink = true;
  const { start, signal, requests, linkWrites } = setup(t, {
    handleLink: (params, saveBlock) => {
      if (failLink) throw new Error("Roam write failed");
      saveBlock(params);
    },
  });
  const partial = await start();
  assert.equal(partial.kind, "partial");
  assert.equal(partial.eventUrl, eventUrl);
  failLink = false;
  assert.equal((await partial.recover(signal)).kind, "success");
  assert.equal(requests.length, 1);
  assert.equal(linkWrites.length, 2);
  assert.deepEqual(linkWrites[0], linkWrites[1]);
});

test("finds an already-inserted Roam link when the first write response was lost", async (t) => {
  const { start, signal, requests, linkWrites } = setup(t, {
    handleLink: (params, saveBlock) => {
      saveBlock(params);
      throw new Error("Roam write response lost");
    },
  });
  const partial = await start();
  assert.equal(partial.kind, "partial");
  assert.equal((await partial.recover(signal)).kind, "success");
  assert.equal(requests.length, 1);
  assert.equal(linkWrites.length, 1);
});

test("does not look up an ambiguous event with a replacement Google login", async (t) => {
  let accountUid = "original-auth";
  const { start, signal, requests } = setup(t, {
    handleRequest: () => {
      throw new TypeError("Network disconnected");
    },
    getCredentials: async (_, expectedUid) => {
      if (expectedUid) assert.equal(expectedUid, "original-auth");
      return { token: "test-token", accountUid };
    },
  });
  const unknown = await start();
  assert.equal(unknown.kind, "unknown");
  accountUid = "replacement-auth";
  const unavailable = await unknown.recover(signal);
  assert.equal(unavailable.kind, "unknown");
  assert.equal(unavailable.allowCheckedDiscard, true);
  assert.match(unavailable.message, /original Google login is unavailable/);
  assert.deepEqual(
    requests.map(({ method }) => method),
    ["POST"],
  );
});

test("allows checked discard when the exact event is cancelled", async (t) => {
  const { start, signal, requests, linkWrites } = setup(t, {
    handleRequest: (method, event) =>
      method === "POST"
        ? Response.json({}, { status: 503 })
        : Response.json({
            id: event.id,
            status: "cancelled",
            htmlLink: eventUrl,
          }),
  });
  const unknown = await start();
  assert.equal(unknown.kind, "unknown");
  const cancelled = await unknown.recover(signal);
  assert.equal(cancelled.kind, "unknown");
  assert.equal(cancelled.allowCheckedDiscard, true);
  assert.match(cancelled.message, /shows this event as cancelled/);
  assert.deepEqual(
    requests.map(({ method }) => method),
    ["POST", "GET"],
  );
  assert.equal(linkWrites.length, 0);
});
