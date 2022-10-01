import { Button, InputGroup } from "@blueprintjs/core";
import React, { useMemo, useState } from "react";
import type { OnloadArgs } from "roamjs-components/types/native";
import MenuItemSelect from "roamjs-components/components/MenuItemSelect";
import getOauthAccounts from "roamjs-components/util/getOauthAccounts";

const CalendarConfig = (props: OnloadArgs): React.ReactElement => {
  const { extensionAPI } = props;
  const accounts = useMemo(() => getOauthAccounts("google"), []);
  const [calendar, setCalendar] = useState("");
  const [account, setAccount] = useState(accounts[0]);
  const [calendars, setCalendars] = useState(
    () =>
      (extensionAPI.settings.get("calendars") as {
        account: string;
        calendar: string;
      }[]) || []
  );
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 300 }}>
      <div style={{ display: "flex" }}>
        <InputGroup
          value={calendar}
          onChange={(e) => setCalendar(e.target.value)}
          style={{ minWidth: "unset" }}
        />
        {accounts.length > 1 && (
          <div style={{ margin: "0 4px" }}>
            <MenuItemSelect
              items={accounts}
              activeItem={account}
              onItemSelect={(l) => setAccount(l)}
            />
          </div>
        )}
        <Button
          icon={"plus"}
          minimal
          disabled={!calendar}
          onClick={() => {
            const value = [...calendars, { calendar, account }];
            setCalendars(value);
            setCalendar("");
            extensionAPI.settings.set("calendars", value);
          }}
        />
      </div>
      {calendars.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {p.calendar}
            {p.account ? ` (${p.account})` : ""}
          </span>
          <Button
            icon={"trash"}
            minimal
            onClick={() => {
              const value = calendars.filter((_, j) => i !== j);
              setCalendars(value);
              extensionAPI.settings.set("calendars", value);
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default CalendarConfig;
