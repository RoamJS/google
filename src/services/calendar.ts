import createButtonObserver from "roamjs-components/dom/createButtonObserver";
import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import getParentUidByBlockUid from "roamjs-components/queries/getParentUidByBlockUid";
import createBlock from "roamjs-components/writes/createBlock";
import getUids from "roamjs-components/dom/getUids";
import getOrderByBlockUid from "roamjs-components/queries/getOrderByBlockUid";
import updateBlock from "roamjs-components/writes/updateBlock";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getPageTitleByHtmlElement from "roamjs-components/dom/getPageTitleByHtmlElement";
import getChildrenLengthByPageUid from "roamjs-components/queries/getChildrenLengthByPageUid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getBlockUidAndTextIncludingText from "roamjs-components/queries/getBlockUidAndTextIncludingText";
import createBlockObserver from "roamjs-components/dom/createBlockObserver";
import createIconButton from "roamjs-components/dom/createIconButton";
import registerSmartBlocksCommand from "roamjs-components/util/registerSmartBlocksCommand";
import getPageTitleByBlockUid from "roamjs-components/queries/getPageTitleByBlockUid";
import getPageTitleByPageUid from "roamjs-components/queries/getPageTitleByPageUid";
import type {
  InputTextNode,
  OnloadArgs,
  PullBlock,
  RoamBasicNode,
} from "roamjs-components/types/native";
import apiGet from "roamjs-components/util/apiGet";
import formatRFC3339 from "date-fns/formatRFC3339";
import startOfDay from "date-fns/startOfDay";
import endOfDay from "date-fns/endOfDay";
import addMinutes from "date-fns/addMinutes";
import getAccessToken from "../utils/getAccessToken";
import CreateEventDialog from "../components/CreateEventDialog";
import renderOverlay from "roamjs-components/util/renderOverlay";
import { blockFormatEvent, Event } from "../utils/event";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getUidsFromButton from "roamjs-components/dom/getUidsFromButton";
import parseNlpDate from "roamjs-components/date/parseNlpDate";
import migrateLegacySettings from "roamjs-components/util/migrateLegacySettings";
import getSubTree from "roamjs-components/util/getSubTree";
import createPage from "roamjs-components/writes/createPage";
import extractRef from "roamjs-components/util/extractRef";

const GOOGLE_COMMAND = "Import Google Calendar";
export const DEFAULT_FORMAT = `{summary} ({start:hh:mm a} - {end:hh:mm a}){confLink}`;

const EMPTY_MESSAGE = "No Events Scheduled for Today!";
const UNAUTHORIZED_MESSAGE = `Error: Must log in to Google through the [[roam/js/google]] page`;
const CONFIG = "roam/js/google-calendar";
const textareaRef: { current: HTMLTextAreaElement } = {
  current: null,
};

const GCAL_EVENT_URL = "https://www.google.com/calendar/event?eid=";
const GCAL_EVENT_REGEX = new RegExp(
  `${GCAL_EVENT_URL.replace(/\//g, "\\/")
    .replace(/\./g, "\\.")
    .replace(/\?/g, "\\?")}([\\w\\d]*)`
);
const eventUids = {
  current: new Set<string>(),
};
const refreshEventUids = () => {
  eventUids.current = new Set(
    getBlockUidAndTextIncludingText(GCAL_EVENT_URL).map(({ uid }) => uid)
  );
};
refreshEventUids();

const pushBlocks = (
  bullets: InputTextNode[],
  blockUid: string,
  parentUid: string
) => {
  const blockIndex = getOrderByBlockUid(blockUid);
  for (let index = 0; index < bullets.length; index++) {
    const node = bullets[index];
    if (index === 0) {
      updateBlock({
        uid: blockUid,
        ...node,
      });
      (node.children || []).forEach((n, o) =>
        createBlock({
          node: n,
          parentUid: blockUid,
          order: o,
        })
      );
    } else {
      createBlock({
        node,
        parentUid,
        order: blockIndex + index,
      });
    }
  }
};

const loadBlockUid = (pageUid: string) => {
  if (textareaRef.current) {
    const uid = getUids(textareaRef.current).blockUid;
    const parentUid = getParentUidByBlockUid(uid);

    const text = getTextByBlockUid(uid);
    if (text.length) {
      return createBlock({
        node: { text: "Loading..." },
        parentUid,
        order: getOrderByBlockUid(uid) + 1,
      });
    }
    return updateBlock({
      uid,
      text: "Loading...",
    });
  }
  return createBlock({
    node: { text: "Loading..." },
    parentUid: pageUid,
    order: getChildrenLengthByPageUid(pageUid),
  });
};

const loadGoogleCalendar = (args: OnloadArgs) => {
  migrateLegacySettings({
    extensionId: "google-calendar",
    extensionAPI: args.extensionAPI,
    specialKeys: {
      import: (n) => {
        const calendarTree = getSubTree({
          tree: n.children,
          key: "calendars",
        }).children;
        const skipFree = !!getSubTree({ tree: n.children, key: "skip free" })
          .uid;
        const formatTree = getSubTree({
          tree: n.children,
          key: "format",
        }).children;
        const filterTree = getSubTree({
          tree: n.children,
          key: "filter",
        }).children;
        const addTodo = !!getSubTree({ tree: n.children, key: "add todo" }).uid;
        const formatNode = formatTree.length
          ? formatTree[0]
          : ({ text: DEFAULT_FORMAT, children: [] } as RoamBasicNode);
        if (addTodo) {
          formatNode.text = `{{[[TODO]]}} ${formatNode.text}`;
        }
        if (formatNode.children.length) {
          Promise.resolve(
            getPageUidByPageTitle("roam/js/google-calendar/format") ||
              createPage({ title: "roam/js/google-calendar/format" })
          ).then((parentUid) =>
            window.roamAlphaAPI.moveBlock({
              location: { order: 0, "parent-uid": parentUid },
              block: { uid: formatNode.uid },
            })
          );
        }
        return [
          {
            key: "calendars",
            value: calendarTree.map((calendarId) => ({
              calendar: calendarId?.text,
              account: calendarId?.children[0]?.text,
            })),
          },
          {
            key: "event-format",
            value: formatNode.children.length
              ? formatNode.text
              : formatNode.uid,
          },
          {
            key: "event-filter",
            value: filterTree[0]?.text,
          },
          {
            key: "skip-free",
            value: skipFree,
          },
        ];
      },
    },
  });

  const fetchGoogleCalendar = async (
    pageTitle = getPageTitleByHtmlElement(document.activeElement).textContent
  ): Promise<InputTextNode[]> => {
    const dateFromPage = window.roamAlphaAPI.util.pageTitleToDate(pageTitle);

    const configTree = getBasicTreeByParentUid(getPageUidByPageTitle(CONFIG));
    const importTree = configTree.find((t) => /import/i.test(t.text));

    const calendarIds = getCalendarIds();
    if (!calendarIds.length) {
      return [
        {
          text: `Error: Could not find a calendar to import on the [[${CONFIG}]] page. Be sure to add one!`,
        },
      ];
    }
    const skipFree = !!args.extensionAPI.settings.get("skip-free");
    const formatArg =
      (args.extensionAPI.settings.get("event-format") as string) ||
      DEFAULT_FORMAT;
    const format = /^(?:\(\()?([\w\d-]{9})(?:\)\))?$/.test(formatArg)
      ? {
          children: getBasicTreeByParentUid(extractRef(formatArg)),
          text: getTextByBlockUid(extractRef(formatArg)),
        }
      : {
          text: formatArg,
          children: [],
        };
    const filter =
      (args.extensionAPI.settings.get("event-filter") as string) || "";
    const dateToUse = isNaN(dateFromPage.valueOf()) ? new Date() : dateFromPage;
    const timeMin = startOfDay(dateToUse);
    const timeMax = endOfDay(timeMin);
    const timeMinParam = encodeURIComponent(formatRFC3339(timeMin));
    const timeMaxParam = encodeURIComponent(formatRFC3339(timeMax));

    return Promise.all(
      calendarIds.map(({ calendar, account }) =>
        getAccessToken(account)
          .then((Authorization) =>
            Authorization
              ? apiGet<{
                  items: Event[];
                }>({
                  authorization: `Bearer ${Authorization}`,
                  domain: "https://www.googleapis.com",
                  path: `calendar/v3/calendars/${encodeURIComponent(
                    calendar
                  )}/events?timeMin=${timeMinParam}&timeMax=${timeMaxParam}&orderBy=startTime&singleEvents=true`,
                }).then((r) => ({
                  items: r.items,
                  calendar,
                  error: "",
                }))
              : Promise.resolve({
                  items: [] as Event[],
                  calendar,
                  error: `${UNAUTHORIZED_MESSAGE}${
                    account ? ` for account ${account}` : ""
                  }`,
                })
          )
          .catch((e) => ({
            items: [] as Event[],
            calendar,
            error: `Error for calendar ${calendar}: ${
              e.response?.data?.error?.message ===
              "Request failed with status code 404"
                ? `Could not find calendar or it's not public. For more information on how to make it public, [visit this page](https://roamjs.com/extensions/google-calendar)`
                : (e.response?.data?.error?.message as string) ||
                  (e.reponse?.data?.error as string) ||
                  (typeof e.response?.data === "object"
                    ? JSON.stringify(e.response.data)
                    : e.response?.data)
            }`,
          }))
      )
    )
      .then((rs) => ({
        events: rs
          .flatMap((r) => r.items.map((i) => ({ ...i, calendar: r.calendar })))
          .filter(
            filter
              ? (r) =>
                  (r.summary && new RegExp(filter).test(r.summary)) ||
                  (r.descripton && new RegExp(filter).test(r.descripton))
              : () => true
          )
          .sort((a, b) => {
            if (a.start?.dateTime === b.start?.dateTime) {
              return (a.summary || "").localeCompare(b.summary || "");
            } else if (!a.start?.dateTime) {
              return -1;
            } else if (!b.start?.dateTime) {
              return 1;
            } else {
              return (
                new Date(a.start.dateTime).valueOf() -
                new Date(b.start.dateTime).valueOf()
              );
            }
          }),
        errors: rs.map(({ error }) => error).filter((e) => !!e),
      }))
      .then(async ({ events = [], errors }) => {
        if (events.length === 0 && errors.length === 0) {
          return [{ text: EMPTY_MESSAGE }];
        }
        return [
          ...events
            .filter((e) => !skipFree || e.transparency !== "transparent")
            .filter(
              (e) =>
                !(e.attendees || []).some(
                  (a) => a.self && a.responseStatus === "declined"
                )
            )
            .map((e) => blockFormatEvent(e, format)),
          ...errors.map((e) => ({ text: e })),
        ];
      });
  };

  const importGoogleCalendar = async (blockUid?: string) => {
    /** Roam has no way to activate command palette on mobile yet -.-
    const parent = getRenderRoot("google-calendar-deprecation");
    render({
      parent,
      message:
        `The import google calendar button will be removed in a future version. Please start using the Import Google Calendar command from the command palette instead. To use the Roam command palette, hit ${isApple ? 'CMD' : 'CTRL'}+P.`,
      callback: () => {*/
    updateBlock({ text: "Loading...", uid: blockUid });
    const parentUid = getParentUidByBlockUid(blockUid);
    fetchGoogleCalendar(getPageTitleByPageUid(parentUid))
      .then((blocks) => pushBlocks(blocks, blockUid, parentUid))
      .then(() => setTimeout(refreshEventUids, 1));
    /*  },
      type: "Google Calendar Button",
    });*/
  };
  const getCalendarIds = () => {
    return (
      (args.extensionAPI.settings.get("calendars") as {
        calendar: string;
        account: string;
      }[]) || []
    );
  };

  createButtonObserver({
    attribute: GOOGLE_COMMAND.replace(/\s/g, "-"),
    shortcut: GOOGLE_COMMAND,
    render: (b) =>
      (b.onclick = (e) => {
        importGoogleCalendar(getUidsFromButton(b).blockUid);
        e.preventDefault();
        e.stopPropagation();
      }),
  });

  const importGoogleCalendarCommand = async () => {
    const focusedUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
    const parentUid =
      (focusedUid &&
        (
          window.roamAlphaAPI.data.fast.q(
            `[:find (pull ?p [:block/uid]) :where [?b :block/uid "${focusedUid}"] [?b :block/page ?p]]`
          ) as [PullBlock][]
        )[0]?.[0]?.[":block/uid"]) ||
      (await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid());
    return loadBlockUid(parentUid)
      .then((blockUid) =>
        fetchGoogleCalendar(getPageTitleByPageUid(parentUid)).then((blocks) => {
          pushBlocks(blocks, blockUid, getParentUidByBlockUid(blockUid));
        })
      )
      .then(() => setTimeout(refreshEventUids, 1));
  };

  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Import Google Calendar",
    callback: importGoogleCalendarCommand,
  });

  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Add Google Calendar Event",
    callback: () => {
      const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const children = blockUid && getBasicTreeByParentUid(blockUid);
      const props = {
        summary: getTextByBlockUid(blockUid),
        ...Object.fromEntries(
          children.map((t) => {
            const [key, value] = t.text.split("::").map((s) => s.trim());
            const attr = key.toLowerCase();
            return [
              attr,
              ["start", "end"].includes(attr) ? parseNlpDate(value) : value,
            ];
          })
        ),
      };
      renderOverlay({
        Overlay: CreateEventDialog,
        props: {
          blockUid,
          summary: "No Summary",
          description: "",
          location: "",
          start: new Date(),
          end: addMinutes(new Date(), 30),
          ...props,
        },
      });
    },
  });

  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Edit Google Calendar Event",
    callback: () => {
      const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const calendarIds = getCalendarIds();
      Promise.all(
        calendarIds.map((c) =>
          getAccessToken(c.account).then((token) => {
            const text = getTextByBlockUid(blockUid);
            const eventId = GCAL_EVENT_REGEX.exec(text)?.[1];
            const edit = atob(eventId).split(" ")[0];
            return apiGet({
              domain: `https://www.googleapis.com`,
              path: `calendar/v3/calendars/${encodeURIComponent(
                c.calendar
              )}/events/${edit}`,
              authorization: `Bearer ${token}`,
            })
              .then((r) => ({ data: r.data, calendar: c }))
              .catch(() => undefined);
          })
        )
      ).then((all) => {
        const r = all.find((r) => r);
        return renderOverlay({
          Overlay: CreateEventDialog,
          props: {
            edit: r.data.id,
            calendar: r.calendar,
            blockUid,
            summary: r.data.summary,
            description: r.data.description,
            location: r.data.location,
            start: new Date(r.data.start.dateTime),
            end: new Date(r.data.end.dateTime),
          },
        });
      });
    },
  });

  createHTMLObserver({
    tag: "TEXTAREA",
    className: "rm-block-input",
    callback: (t: HTMLTextAreaElement) => (textareaRef.current = t),
  });

  createBlockObserver((b: HTMLDivElement) => {
    const { blockUid } = getUids(b);
    if (eventUids.current.has(blockUid)) {
      const container = b.closest(".rm-block-main");
      const icon = createIconButton("edit");
      icon.style.position = "absolute";
      icon.style.top = "0";
      icon.style.right = "0";
      icon.addEventListener("click", () => {
        const calendarIds = getCalendarIds();
        Promise.all(
          calendarIds.map((c) =>
            getAccessToken(c.account).then((token) => {
              const text = getTextByBlockUid(blockUid);
              const eventId = GCAL_EVENT_REGEX.exec(text)?.[1];
              const edit = atob(eventId).split(" ")[0];
              return apiGet({
                domain: `https://www.googleapis.com`,
                path: `calendar/v3/calendars/${encodeURIComponent(
                  c.calendar
                )}/events/${edit}`,
                authorization: `Bearer ${token}`,
              })
                .then((r) => ({ data: r.data, calendar: c }))
                .catch(() => undefined);
            })
          )
        ).then((all) => {
          const r = all.find((r) => r);
          return renderOverlay({
            Overlay: CreateEventDialog,
            props: {
              edit: r.data.id,
              calendar: r.calendar,
              blockUid,
              summary: r.data.summary,
              description: r.data.description,
              location: r.data.location,
              start: new Date(r.data.start.dateTime),
              end: new Date(r.data.end.dateTime),
              getCalendarIds,
            },
          });
        });
      });
      container.append(icon);
    }
  });

  registerSmartBlocksCommand({
    text: "GOOGLECALENDAR",
    help: "Import your events for today from your Google Calendar integration.",
    handler: (context: { targetUid: string }) => () =>
      fetchGoogleCalendar(
        getPageTitleByBlockUid(context.targetUid) ||
          getPageTitleByPageUid(context.targetUid)
      ).then((bullets) => {
        setTimeout(refreshEventUids, 1000);
        if (bullets.length) {
          return bullets;
        } else {
          return EMPTY_MESSAGE;
        }
      }),
  });
  return {
    commands: [
      "Import Google Calendar",
      "Add Google Calendar Event",
      "Edit Google Calendar Event",
    ],
    unload: () => {
      window.roamjs.extension?.smartblocks?.unregisterCommand("GOOGLECALENDAR");
    },
  };
};

export default loadGoogleCalendar;
