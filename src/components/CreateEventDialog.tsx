import { Button, Checkbox } from "@blueprintjs/core";
import formatRFC3339 from "date-fns/formatRFC3339";
import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import getOauth from "roamjs-components/util/getOauth";
import getAccessToken from "../utils/getAccessToken";
import { saveCalendarEvent } from "../services/saveCalendarEvent";
import type {
  CalendarEventDraft,
  SaveOutcome,
} from "../services/saveCalendarEvent";
import EventFields, { formatEventDate } from "./EventFields";
import type { CalendarChoice, EventDetails } from "./EventFields";
import FormDialog from "./FormDialog";
import { useSaveOperation } from "./useSaveOperation";

type EventRequest = {
  details: EventDetails;
  parentUid: string;
  calendars: CalendarChoice[];
};

type Draft = EventRequest & { calendarId: string };
type Launcher = { show: (request: EventRequest) => void };

const getCalendarCredentials = async (
  label?: string,
  expectedUid?: string,
): Promise<{ token: string; accountUid: string } | undefined> => {
  const { node } = JSON.parse(getOauth("google", label));
  const accountUid = node?.uid;
  if (
    typeof accountUid !== "string" ||
    !accountUid ||
    (expectedUid && expectedUid !== accountUid)
  )
    return;
  const token = await getAccessToken(label);
  if (token) return { token, accountUid };
};

const CreateEventDialog = forwardRef<Launcher>((_, ref) => {
  const [draft, setDraft] = useState<Draft>();
  const [open, setOpen] = useState(false);
  const [validation, setValidation] = useState("");
  const [checkedCalendar, setCheckedCalendar] = useState(false);
  const summary = useRef<HTMLInputElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const restoreReopenFocus = useRef(false);
  const operation = useSaveOperation<CalendarEventDraft>();
  const { state } = operation;

  useImperativeHandle(ref, () => ({
    show: (request) => {
      if (!draft || state.kind === "success") {
        operation.reset();
        setValidation("");
        setDraft({
          ...request,
          calendarId: request.calendars[0]?.calendar || "primary",
        });
      }
      setOpen(true);
    },
  }));

  useLayoutEffect(() => {
    if (!open && restoreReopenFocus.current) {
      restoreReopenFocus.current = false;
      if (document.activeElement === document.body) reopen.current?.focus();
    }
  }, [open]);

  const discard = (): void => {
    setOpen(false);
    setDraft(undefined);
    setCheckedCalendar(false);
    setValidation("");
    operation.reset();
  };

  const close = (): void => {
    setCheckedCalendar(false);
    if (state.kind === "ready") discard();
    else {
      restoreReopenFocus.current = true;
      setOpen(false);
    }
  };

  const finish = (result: SaveOutcome | undefined): void => {
    if (result?.kind === "success") setOpen(false);
  };

  if (!draft) return null;

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    if (state.kind === "partial" || state.kind === "unknown") {
      setCheckedCalendar(false);
      void operation
        .resume(
          state.kind === "partial" ? "Adding link…" : "Checking Calendar…",
        )
        .then(finish);
      return;
    }

    const fields = new FormData(event.currentTarget);
    const { start, end } = draft.details;
    if (
      !start ||
      !end ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      formatEventDate(start) !== fields.get("start") ||
      formatEventDate(end) !== fields.get("end") ||
      end <= start
    ) {
      setValidation("Enter a valid start and an end after the start.");
      return;
    }
    const { calendarId, calendars, parentUid, details } = draft;
    setValidation("");
    void operation
      .start(
        {
          calendarId,
          parentUid,
          account: calendars.find((choice) => choice.calendar === calendarId)
            ?.account,
          event: {
            summary: details.summary,
            description: details.description,
            location: details.location,
            start: { dateTime: formatRFC3339(start) },
            end: { dateTime: formatRFC3339(end) },
          },
        },
        (snapshot, signal) =>
          saveCalendarEvent({
            draft: snapshot,
            signal,
            getCredentials: getCalendarCredentials,
          }),
      )
      .then(finish);
  };

  const labels = {
    ready: "Create",
    saving: state.kind === "saving" ? state.label : "",
    failure: "Try again",
    unknown: "Check Calendar",
    partial: "Add Roam link",
    success: "Create",
  };
  const status =
    state.kind === "saving"
      ? state.label
      : "message" in state
        ? state.message
        : "";
  const canEdit = state.kind === "ready" || state.kind === "failure";
  const canDiscardAfterCheck =
    state.kind === "unknown" && state.allowCheckedDiscard;

  return (
    <>
      {open && (
        <FormDialog
          title="Create Google Calendar Event"
          onClose={close}
          onSubmit={submit}
          initialFocus={summary}
          pending={state.kind === "saving"}
          canSubmit={
            canEdit ||
            state.kind === "partial" ||
            (state.kind === "unknown" && !!state.recover)
          }
          submitLabel={labels[state.kind]}
          closeLabel={state.kind === "ready" ? "Cancel" : "Close"}
          status={validation || status}
          secondaryAction={
            state.kind === "partial" ? (
              <Button
                type="button"
                minimal
                text="Finish without Roam link"
                onClick={discard}
              />
            ) : (
              (state.kind === "failure" || canDiscardAfterCheck) && (
                <Button
                  type="button"
                  minimal
                  text="Discard draft"
                  disabled={canDiscardAfterCheck && !checkedCalendar}
                  onClick={discard}
                />
              )
            )
          }
        >
          {(popupContainer) => (
            <>
              <fieldset disabled={!canEdit}>
                <EventFields
                  details={draft.details}
                  disabled={!canEdit}
                  onChange={(change) => {
                    setValidation("");
                    setDraft(
                      (current) =>
                        current && {
                          ...current,
                          details: { ...current.details, ...change },
                        },
                    );
                  }}
                  summaryRef={summary}
                  popupContainer={popupContainer}
                  calendar={{
                    selected: draft.calendarId,
                    choices: draft.calendars,
                    select: (calendarId) =>
                      setDraft(
                        (current) => current && { ...current, calendarId },
                      ),
                  }}
                />
              </fieldset>
              {canDiscardAfterCheck && (
                <Checkbox
                  checked={checkedCalendar}
                  label="I checked the original calendar and handled any matching event"
                  onChange={(event) =>
                    setCheckedCalendar(event.currentTarget.checked)
                  }
                />
              )}
              {state.kind === "partial" && (
                <a href={state.eventUrl} target="_blank" rel="noreferrer">
                  Open event in Google Calendar
                </a>
              )}
            </>
          )}
        </FormDialog>
      )}
      {state.kind !== "ready" && (
        <div className="google-calendar-save-status" hidden={open}>
          <span role="status">{status}</span>
          {state.kind === "success" ? (
            <Button
              minimal
              icon="cross"
              aria-label="Dismiss Calendar status"
              onClick={discard}
            />
          ) : (
            <Button
              elementRef={reopen}
              text="Reopen event draft"
              onClick={() => setOpen(true)}
            />
          )}
        </div>
      )}
    </>
  );
});

export const mountCreateEventDialog = (): Launcher & { unload: () => void } => {
  const root = document.createElement("div");
  const ref = React.createRef<Launcher>();
  document.body.appendChild(root);
  ReactDOM.render(<CreateEventDialog ref={ref} />, root);
  return {
    show: (request) => ref.current?.show(request),
    unload: () => {
      ReactDOM.unmountComponentAtNode(root);
      root.remove();
    },
  };
};
