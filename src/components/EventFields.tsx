import { InputGroup, Label } from "@blueprintjs/core";
import { DateInput } from "@blueprintjs/datetime";
import addYears from "date-fns/addYears";
import format from "date-fns/format";
import parse from "date-fns/parse";
import React, { useState } from "react";
import MenuItemSelect from "roamjs-components/components/MenuItemSelect";

export type CalendarChoice = { calendar: string; account: string };

export type EventDetails = {
  summary: string;
  description: string;
  location: string;
  start: Date | null;
  end: Date | null;
};

const DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

const parseEventDate = (value: string): Date =>
  parse(value, DATE_FORMAT, new Date());

export const formatEventDate = (date: Date): string =>
  format(date, DATE_FORMAT);

const EventFields = ({
  details,
  onChange,
  onFocus,
  disabled,
  summaryRef,
  popupContainer,
  calendar,
}: {
  details: EventDetails;
  onChange: (change: Partial<EventDetails>) => void;
  onFocus?: () => void;
  disabled?: boolean;
  summaryRef?: React.RefObject<HTMLInputElement>;
  popupContainer?: HTMLElement;
  calendar?: {
    selected: string;
    choices: CalendarChoice[];
    select: (id: string) => void;
  };
}): React.ReactElement => {
  const [dismissedDate, setDismissedDate] = useState<"start" | "end">();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const popoverProps = popupContainer
    ? { portalContainer: popupContainer }
    : undefined;
  return (
    <>
      <Label>
        Summary
        <InputGroup
          inputRef={summaryRef}
          value={details.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          placeholder="Event summary"
          onFocus={onFocus}
        />
      </Label>
      <Label>
        Description
        <InputGroup
          value={details.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Event description"
          onFocus={onFocus}
        />
      </Label>
      <Label>
        Location
        <InputGroup
          value={details.location}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="Event location"
          onFocus={onFocus}
        />
      </Label>
      {(["start", "end"] as const).map((name) => (
        <Label key={name}>
          {name === "start" ? "Start" : "End"}
          <DateInput
            formatDate={formatEventDate}
            parseDate={parseEventDate}
            disabled={disabled}
            value={details[name]}
            onChange={(date) => onChange({ [name]: date })}
            onError={
              popupContainer ? () => onChange({ [name]: null }) : undefined
            }
            inputProps={{
              name,
              "aria-label": name === "start" ? "Start" : "End",
              onFocus,
              onBlur: popupContainer
                ? () => setDismissedDate(undefined)
                : undefined,
              onClick: popupContainer
                ? () => setDismissedDate(undefined)
                : undefined,
              onKeyDown: popupContainer
                ? (event) => {
                    if (event.key === "Enter") event.preventDefault();
                    if (
                      event.key === "Escape" &&
                      event.currentTarget.closest(".bp3-popover-open")
                    ) {
                      event.preventDefault();
                      // Blueprint blurs the date input on Escape. Keep its popover
                      // closed when focus returns to the input.
                      setDismissedDate(name);
                      event.currentTarget.focus();
                    }
                  }
                : undefined,
            }}
            popoverProps={
              dismissedDate === name
                ? { ...popoverProps, isOpen: false }
                : popoverProps
            }
            timePrecision="minute"
            maxDate={addYears(new Date(), 5)}
          />
        </Label>
      ))}
      {calendar && (
        <Label>
          Calendar:
          <MenuItemSelect
            disabled={disabled}
            activeItem={calendar.selected}
            onItemSelect={(id) => {
              setCalendarOpen(false);
              calendar.select(id);
            }}
            items={
              calendar.choices.length
                ? calendar.choices.map((choice) => choice.calendar)
                : ["primary"]
            }
            popoverProps={{
              ...popoverProps,
              isOpen: calendarOpen && !disabled,
              onInteraction: setCalendarOpen,
            }}
            ButtonProps={{
              type: "button",
              "aria-label": `Calendar: ${calendar.selected}`,
              "aria-expanded": calendarOpen,
              onKeyDown: (event) => {
                if (event.key === "Escape" && calendarOpen) {
                  event.preventDefault();
                  setCalendarOpen(false);
                }
              },
            }}
          />
        </Label>
      )}
    </>
  );
};

export default EventFields;
