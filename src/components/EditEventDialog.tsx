import {
  Button,
  Classes,
  Dialog,
  Intent,
  Spinner,
  SpinnerSize,
} from "@blueprintjs/core";
import React, { useState } from "react";
import formatRFC3339 from "date-fns/formatRFC3339";
import getAccessToken from "../utils/getAccessToken";
import type { RoamBasicNode } from "roamjs-components/types/native";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getParentUidByBlockUid from "roamjs-components/queries/getParentUidByBlockUid";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import updateBlock from "roamjs-components/writes/updateBlock";
import apiPut from "roamjs-components/util/apiPut";
import type { CalenderEvent } from "../utils/event";
import EventFields from "./EventFields";
import type { CalendarChoice, EventDetails } from "./EventFields";

type Props = EventDetails & {
  calendar: CalendarChoice;
  blockUid: string;
  edit: string;
  onClose: () => void;
};

const EditEventDialog = ({
  onClose,
  edit,
  calendar,
  summary,
  location,
  description,
  start,
  end,
  blockUid,
}: Props): React.ReactElement => {
  const [details, setDetails] = useState({
    summary,
    location,
    description,
    start,
    end,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      canEscapeKeyClose
      canOutsideClickClose
      title="Update Google Calendar Event"
      enforceFocus={false}
      autoFocus={false}
    >
      <div className={Classes.DIALOG_BODY}>
        <EventFields
          details={details}
          onChange={(change) =>
            setDetails((previous) => ({ ...previous, ...change }))
          }
          onFocus={() => setError("")}
        />
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <span style={{ color: "darkred" }}>{error}</span>
          {loading && <Spinner size={SpinnerSize.SMALL} />}
          <Button
            text="Update"
            intent={Intent.PRIMARY}
            onClick={() => {
              setLoading(true);
              setTimeout(
                () =>
                  getAccessToken(calendar.account).then((token) => {
                    if (token) {
                      apiPut<CalenderEvent>({
                        data: {
                          summary: details.summary,
                          description: details.description,
                          location: details.location,
                          start: { dateTime: formatRFC3339(details.start!) },
                          end: { dateTime: formatRFC3339(details.end!) },
                        },
                        authorization: `Bearer ${token}`,
                        domain: "https://www.googleapis.com",
                        path: `calendar/v3/calendars/${encodeURIComponent(
                          calendar.calendar,
                        )}/events/${edit}`,
                      })
                        .then((r) => {
                          const blockText = getTextByBlockUid(blockUid);
                          const nodeChildrenUpdate = blockText.includes(summary)
                            ? getBasicTreeByParentUid(blockUid)
                            : getBasicTreeByParentUid(
                                getParentUidByBlockUid(blockUid),
                              );
                          const updateNode = (n: RoamBasicNode): void => {
                            const newText = n.text
                              .replace(summary, r.summary)
                              .replace(description, r.description || "")
                              .replace(location, r.location);
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
                1,
              );
            }}
          />
        </div>
      </div>
    </Dialog>
  );
};

export default EditEventDialog;
