import {
  Button,
  Classes,
  Dialog,
  InputGroup,
  Intent,
  Label,
  Spinner,
  SpinnerSize,
} from "@blueprintjs/core";
import React, { useCallback, useMemo, useState } from "react";
import getSubTree from "roamjs-components/util/getSubTree";
import MenuItemSelect from "roamjs-components/components/MenuItemSelect";
import { DateInput } from "@blueprintjs/datetime";
import format from "date-fns/format";
import parse from "date-fns/parse";
import formatRFC3339 from "date-fns/formatRFC3339";
import getAccessToken from "../utils/getAccessToken";
import axios from "axios";
import type { RoamBasicNode } from "roamjs-components/types/native";
import createBlock from "roamjs-components/writes/createBlock";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getParentUidByBlockUid from "roamjs-components/queries/getParentUidByBlockUid";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import updateBlock from "roamjs-components/writes/updateBlock";
import addYears from "date-fns/addYears";

type Props = {
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  blockUid: string;
  edit?: string;
  calendar?: {
    account: string;
    calendar: string;
  };
  getCalendarIds?: () => {
    calendar: string;
    account: string;
  }[];
};

const DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

const CreateEventDialog = ({
  onClose,
  edit,
  calendar,
  summary,
  location,
  description,
  start,
  end,
  blockUid,
  getCalendarIds,
}: { onClose: () => void } & Props) => {
  const [summaryState, setSummaryState] = useState(summary);
  const [locationState, setLocationState] = useState(location);
  const [descriptionState, setDescriptionState] = useState(description);
  const [startState, setStartState] = useState(start);
  const [endState, setEndState] = useState(end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onFocus = useCallback(() => setError(""), [setError]);
  const calendarIds = useMemo(
    () => (calendar ? [calendar] : getCalendarIds()),
    []
  );
  const [calendarId, setCalendarId] = useState(
    calendarIds[0].calendar || "primary"
  );
  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      canEscapeKeyClose
      canOutsideClickClose
      title={`${edit ? "Update" : "Create"} Google Calendar Event`}
    >
      <div className={Classes.DIALOG_BODY}>
        <Label>
          Summary
          <InputGroup
            value={summaryState}
            onChange={(e) => setSummaryState(e.target.value)}
            placeholder={"Event summary"}
            onFocus={onFocus}
          />
        </Label>
        <Label>
          Description
          <InputGroup
            value={descriptionState}
            onChange={(e) => setDescriptionState(e.target.value)}
            placeholder={"Event description"}
            onFocus={onFocus}
          />
        </Label>
        <Label>
          Location
          <InputGroup
            value={locationState}
            onChange={(e) => setLocationState(e.target.value)}
            placeholder={"Event location"}
            onFocus={onFocus}
          />
        </Label>
        <Label>
          Start
          <DateInput
            formatDate={(d) => format(d, DATE_FORMAT)}
            parseDate={(s) => parse(s, DATE_FORMAT, new Date())}
            value={startState}
            onChange={(d) => setStartState(d)}
            inputProps={{
              onFocus,
            }}
            timePrecision={"minute"}
            maxDate={addYears(new Date(), 5)}
          />
        </Label>
        <Label>
          End
          <DateInput
            formatDate={(d) => format(d, DATE_FORMAT)}
            parseDate={(s) => parse(s, DATE_FORMAT, new Date())}
            value={endState}
            onChange={(d) => setEndState(d)}
            inputProps={{
              onFocus,
            }}
            timePrecision={"minute"}
            maxDate={addYears(new Date(), 5)}
          />
        </Label>
        {!calendar && (
          <Label>
            Calendar:
            <MenuItemSelect
              activeItem={calendarId}
              onItemSelect={(i) => setCalendarId(i)}
              items={calendarIds.map((c) => c.calendar)}
            />
          </Label>
        )}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <span style={{ color: "darkred" }}>{error}</span>
          {loading && <Spinner size={SpinnerSize.SMALL} />}
          <Button
            text={edit ? "Update" : "Create"}
            intent={Intent.PRIMARY}
            onClick={() => {
              setLoading(true);
              setTimeout(
                () =>
                  getAccessToken(
                    calendarIds.find((c) => c.calendar === calendarId)?.account
                  ).then((token) => {
                    if (token) {
                      axios[edit ? "put" : "post"](
                        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                          calendarId
                        )}/events${edit ? `/${edit}` : ""}`,
                        {
                          summary: summaryState,
                          description: descriptionState,
                          location: locationState,
                          start: { dateTime: formatRFC3339(startState) },
                          end: { dateTime: formatRFC3339(endState) },
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                      )
                        .then((r) => {
                          if (!edit) {
                            createBlock({
                              parentUid: blockUid,
                              node: { text: `Link:: ${r.data.htmlLink}` },
                            });
                          } else {
                            const blockText = getTextByBlockUid(blockUid);
                            const nodeChildrenUpdate = blockText.includes(
                              summary
                            )
                              ? getBasicTreeByParentUid(blockUid)
                              : getBasicTreeByParentUid(
                                  getParentUidByBlockUid(blockUid)
                                );
                            const updateNode = (n: RoamBasicNode) => {
                              const newText = n.text
                                .replace(summary, r.data.summary)
                                .replace(description, r.data.description)
                                .replace(location, r.data.location);
                              if (newText !== n.text) {
                                updateBlock({ text: newText, uid: n.uid });
                              }
                              n.children.forEach(updateNode);
                            };
                            updateNode({
                              text: blockText,
                              children: nodeChildrenUpdate,
                              uid: blockUid,
                            });
                          }
                          onClose();
                        })
                        .catch((e) => {
                          setError(e.response?.data?.error?.message);
                          setLoading(false);
                        });
                    } else {
                      setError("Not logged in with Google");
                      setLoading(false);
                    }
                  }),
                1
              );
            }}
          />
        </div>
      </div>
    </Dialog>
  );
};

export default CreateEventDialog;
