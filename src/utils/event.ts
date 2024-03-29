import differenceInMinutes from "date-fns/differenceInMinutes";
import format from "date-fns/format";
import type { InputTextNode } from "roamjs-components/types/native";

const DEFAULT_DATE_FORMAT = "hh:mm a";

export type CalenderEvent = {
  id: string;
  transparency: "transparent" | "opaque";
  summary: string;
  description?: string;
  htmlLink: string;
  hangoutLink: string;
  location: string;
  attendees?: {
    displayName?: string;
    email: string;
    self: boolean;
    responseStatus: "declined" | "accepted";
  }[];
  start: { dateTime: string };
  end: { dateTime: string };
  visibility?: "private" | "public";
  calendar: string;
};

const resolveDate = (d: { dateTime?: string; format?: string }) => {
  if (!d?.dateTime) {
    return "All Day";
  }
  const date = new Date(d.dateTime);
  return format(date, d?.format || DEFAULT_DATE_FORMAT);
};

const resolveAttendees = (e: CalenderEvent, s: string) => {
  return (e.attendees || [])
    .map((attn) =>
      (s || "NAME").replace(/NAME/g, attn["displayName"] || attn["email"])
    )
    .join(", ");
};

const resolveSummary = (e: CalenderEvent) =>
  e.visibility === "private" ? "busy" : e.summary || "No Summary";

export const blockFormatEvent = (
  e: CalenderEvent,
  format: InputTextNode
): InputTextNode => {
  const summary = resolveSummary(e);

  const teamsLinkExtract =
    e.description?.match(
      /https:\/\/teams\.live\.com\/meet\/[\w\/?=+-]+/
    )?.[0] || "";
  const teamsLink = teamsLinkExtract ? `[Teams](${teamsLinkExtract})` : "";
  const meetLink = e.hangoutLink ? `[Meet](${e.hangoutLink})` : "";
  const zoomLink =
    e.location && e.location.indexOf("zoom.us") > -1
      ? `[Zoom](${e.location})`
      : "";
  return {
    text: format.text
      // begin @deprecated
      .replace("/Summary", summary)
      .replace("/Link", e.htmlLink || "")
      .replace("/Hangout", e.hangoutLink || "")
      .replace("/Location", e.location || "")
      .replace("/Start Time", resolveDate(e.start))
      .replace("/End Time", resolveDate(e.end))
      // end @deprecated
      .replace(/{summary}/g, summary)
      .replace(/{link}/g, e.htmlLink || "")
      .replace(/{hangout}/g, e.hangoutLink || "")
      .replace(/{confLink}/g, meetLink + zoomLink + teamsLink || "")
      .replace(/{location}/g, e.location || "")
      .replace(/{attendees:?(.*?)}/g, (_, format) =>
        resolveAttendees(e, format)
      )
      .replace(/{start:?(.*?)}/g, (_, format) =>
        resolveDate({ ...e.start, format })
      )
      .replace(/{end:?(.*?)}/g, (_, format) =>
        resolveDate({ ...e.end, format })
      )
      .replace(/{calendar}/g, e.calendar)
      .replace(
        /{duration}/g,
        (e.start?.dateTime && e.end?.dateTime
          ? differenceInMinutes(
              new Date(e.end.dateTime),
              new Date(e.start.dateTime)
            )
          : 24 * 60
        ).toString()
      )
      .replace(/{todo}/g, "{{[[TODO]]}}")
      .replace(/{description}/g, e.description || ""),
    children: (format.children || []).map((c) => blockFormatEvent(e, c)),
  };
};
