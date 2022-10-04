import React from "react";
import GoogleLogo from "./assets/Google.svg";
import runExtension from "roamjs-components/util/runExtension";
import OauthPanel from "roamjs-components/components/OauthPanel";
import apiPost from "roamjs-components/util/apiPost";
import CalendarConfig from "./components/CalendarConfig";
import loadGoogleCalendar, { DEFAULT_FORMAT } from "./services/calendar";
import loadGoogleDrive from "./services/drive";

const scopes = [
  "calendar.readonly",
  "calendar.events",
  "userinfo.email",
  "drive.file",
]
  .map((s) => `https://www.googleapis.com/auth/${s}`)
  .join("%20");

export default runExtension({
  run: (args) => {
    const toggleGoogleCalendar = loadGoogleCalendar(args);
    const toggleGoogleDrive = loadGoogleDrive(args);
    args.extensionAPI.settings.panel.create({
      tabTitle: "Google",
      settings: [
        {
          id: "oauth",
          name: "Log In",
          description: "Log into Google to connect to your account to Roam!",
          action: {
            type: "reactComponent",
            component: () =>
              React.createElement(OauthPanel, {
                service: "google",
                getPopoutUrl: () =>
                  Promise.resolve(
                    `https://accounts.google.com/o/oauth2/v2/auth?prompt=consent&access_type=offline&client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=https://roamjs.com/oauth?auth=true&response_type=code&scope=${scopes}`
                  ),
                getAuthData: (data: string) =>
                  apiPost({
                    anonymous: true,
                    path: "google-auth",
                    data: {
                      ...JSON.parse(data),
                      grant_type: "authorization_code",
                    },
                  }),
                ServiceIcon: GoogleLogo,
              }),
          },
        },
        {
          id: "calendars",
          name: "Linked Calendars",
          description:
            'The calendar ids to import events from. To find your calendar id, go to your calendar settings and scroll down to "Integrate Calendar".',
          action: {
            type: "reactComponent",
            component: () => React.createElement(CalendarConfig, args),
          },
        },
        {
          action: { type: "input", placeholder: DEFAULT_FORMAT },
          id: "event-format",
          description:
            "The format each calender event should output in when imported into Roam.",
          name: "Calendar Event Format",
        },
        {
          action: { type: "input", placeholder: "meeting" },
          id: "event-filter",
          name: "Calendar Event Filter",
          description:
            "A regex to filter your imported calendar events by summary or description.",
        },
        {
          action: {
            type: "switch",
          },
          id: "skip-free",
          name: "Skip Free Events",
          description:
            "Whether or not to filter out events marked as 'free' during Google Calendar import.",
        },
        {
          id: "drive-enabled",
          name: "Intercept Uploads to Drive",
          description:
            "Whether or not to intercept file uploads and send them to your google drive instead of Roam.",
          action: {
            type: "switch",
            onChange: (e) => toggleGoogleDrive(e.target.checked),
          },
        },
        {
          id: "upload-folder",
          name: "Upload Folder",
          action: {
            type: "input",
            placeholder: "RoamJS",
          },
          description:
            "The default Google Drive folder location to send uploads to",
        },
      ],
    });

    toggleGoogleCalendar(true);
    toggleGoogleDrive(!!args.extensionAPI.settings.get("drive-enabled"));
    return {
      unload: () => {
        toggleGoogleCalendar(false);
        toggleGoogleDrive(false);
      },
    };
  },
});
