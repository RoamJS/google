export type CalendarEventDraft = {
  calendarId: string;
  account?: string;
  parentUid: string;
  event: {
    summary: string;
    description: string;
    location: string;
    start: { dateTime: string };
    end: { dateTime: string };
  };
};

type Recover = (signal: AbortSignal) => Promise<SaveOutcome>;

export type SaveOutcome =
  | { kind: "success"; message: string }
  | { kind: "failure"; message: string; retrySafe: true }
  | {
      kind: "unknown";
      message: string;
      recover?: Recover;
      allowCheckedDiscard?: boolean;
    }
  | { kind: "partial"; message: string; eventUrl: string; recover: Recover };

const isRejected = (status: number): boolean =>
  [400, 401, 403, 404, 429].includes(status);

type CalendarResponse = {
  status: number;
  event?: { id?: string; status?: string; htmlLink?: string };
};

const readEventLink = (
  { event }: CalendarResponse,
  id: string,
): string | undefined => {
  if (
    event?.id === id &&
    event.status !== "cancelled" &&
    typeof event.htmlLink === "string" &&
    event.htmlLink.startsWith("https://")
  ) {
    return event.htmlLink;
  }
};

const requestCalendar = async (
  url: string,
  options: RequestInit,
  signal: AbortSignal,
): Promise<CalendarResponse> => {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 30_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    // Keep the timeout and abort listener in place until the response body arrives.
    return {
      status: response.status,
      event: response.ok ? await response.json() : undefined,
    };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
};

export const saveCalendarEvent = async ({
  draft,
  signal,
  getCredentials,
}: {
  draft: CalendarEventDraft;
  signal: AbortSignal;
  getCredentials: (
    account?: string,
    expectedUid?: string,
  ) => Promise<{ token: string; accountUid: string } | undefined>;
}): Promise<SaveOutcome> => {
  const { calendarId, account, parentUid, event } = draft;
  const failure = (message: string): SaveOutcome => ({
    kind: "failure",
    message,
    retrySafe: true,
  });
  const roam = window.roamAlphaAPI;
  const pull = (uid: string) =>
    roam.pull("[:block/uid :block/string]", [":block/uid", uid]);
  if (!parentUid || !pull(parentUid)?.[":block/uid"]) {
    return failure(
      "The original Roam page or block is unavailable. Discard this draft to start from a different page or block.",
    );
  }

  let credentials: Awaited<ReturnType<typeof getCredentials>>;
  try {
    credentials = await getCredentials(account);
  } catch {
    return failure(
      "Could not connect to Google. Check your Google login in Roam Depot and try again.",
    );
  }
  if (!credentials) {
    return failure("Log into Google in Roam Depot, then try again.");
  }
  signal.throwIfAborted();
  const { token, accountUid } = credentials;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const linkUid = roam.util.generateUID();
  const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const insertLink = async (
    eventUrl: string,
    linkSignal: AbortSignal,
  ): Promise<SaveOutcome> => {
    const text = `Link:: ${eventUrl}`;
    const success: SaveOutcome = {
      kind: "success",
      message: "Google Calendar event created and linked in Roam.",
    };
    const partial: SaveOutcome = {
      kind: "partial",
      message:
        "The event was created in Google Calendar. The Roam link still needs to be added.",
      eventUrl,
      recover: (nextSignal) => insertLink(eventUrl, nextSignal),
    };
    const linkExists = (): boolean => pull(linkUid)?.[":block/string"] === text;
    try {
      linkSignal.throwIfAborted();
      const existing = pull(linkUid);
      if (existing?.[":block/string"] === text) return success;
      if (existing?.[":block/uid"] || !pull(parentUid)?.[":block/uid"]) {
        return partial;
      }
      await roam.data.block.create({
        location: { "parent-uid": parentUid, order: 0 },
        block: { uid: linkUid, string: text },
      });
      return linkExists() ? success : partial;
    } catch {
      // Recovery checks the same block UID before any new write.
      return partial;
    }
  };

  const unknown = (
    message: string,
    allowCheckedDiscard = false,
  ): SaveOutcome => ({
    kind: "unknown",
    message,
    recover: checkCalendar,
    allowCheckedDiscard,
  });
  const checkCalendar: Recover = async (checkSignal) => {
    try {
      const check = await getCredentials(account, accountUid);
      if (check?.accountUid !== accountUid) {
        return unknown(
          "The original Google login is unavailable. Check the original calendar for this title and time. If the event exists, use its Calendar link.",
          true,
        );
      }
      const response = await requestCalendar(
        `${eventsUrl}/${eventId}`,
        { headers: { Authorization: `Bearer ${check.token}` } },
        checkSignal,
      );
      const eventUrl = readEventLink(response, eventId);
      if (eventUrl) return insertLink(eventUrl, checkSignal);
      if (
        response.event?.id === eventId &&
        response.event.status === "cancelled"
      ) {
        return unknown(
          "Google Calendar shows this event as cancelled. Check that there is no active event before discarding the draft.",
          true,
        );
      }
      if (response.status === 404) {
        return unknown(
          "Calendar hasn't returned this event. Check the original calendar for this title and time. If you find it, use its Calendar link or check again here.",
          true,
        );
      }
    } catch {
      // A failed lookup cannot confirm that the original request was rejected.
    }
    return unknown(
      "Could not confirm the event in Google Calendar. Check the original calendar for this title and time before starting a new draft.",
      true,
    );
  };

  try {
    const response = await requestCalendar(
      eventsUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...event, id: eventId }),
      },
      signal,
    );
    if (isRejected(response.status)) {
      return failure(
        "Google Calendar rejected the event. Check the details and your access to this calendar, then try again.",
      );
    }
    const eventUrl = readEventLink(response, eventId);
    if (eventUrl) return insertLink(eventUrl, signal);
  } catch {
    // The request may have reached Google before the response was lost.
  }
  return unknown(
    "Google Calendar may have created the event. Check Calendar before creating again.",
  );
};
