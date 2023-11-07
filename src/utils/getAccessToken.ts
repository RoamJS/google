import getOauth from "roamjs-components/util/getOauth";
import differenceInSeconds from "date-fns/differenceInSeconds";
import localStorageGet from "roamjs-components/util/localStorageGet";
import localStorageSet from "roamjs-components/util/localStorageSet";
import apiPost from "roamjs-components/util/apiPost";

export const GOOGLE_CLIENT_ID =
  "950860433572-rvt5aborg8raln483ogada67n201quvh.apps.googleusercontent.com";

const getAccessToken = (label?: string) => {
  const oauth = getOauth("google", label);
  if (oauth !== "{}") {
    const { access_token, expires_in, refresh_token, node } = JSON.parse(oauth);
    const { time, uid: oauthUid } = node || {};
    const tokenAge = differenceInSeconds(
      new Date(),
      time ? new Date(time) : new Date(0)
    );
    return tokenAge > expires_in
      ? apiPost({
          domain: "https://api.samepage.network",
          path: "extensions/google/auth",
          headers: {
            "x-google-client-id": GOOGLE_CLIENT_ID,
          },
          data: {
            refresh_token,
            grant_type: "refresh_token",
          },
          anonymous: true,
        }).then((r) => {
          const storageData = localStorageGet("oauth-google");
          const data = JSON.stringify({ refresh_token, ...r });
          localStorageSet(
            "oauth-google",
            JSON.stringify(
              JSON.parse(storageData).map((at: { uid: string; text: string }) =>
                at.uid === oauthUid
                  ? {
                      uid: at.uid,
                      data,
                      time: new Date().valueOf(),
                      text: at.text,
                    }
                  : at
              )
            )
          );
          return r.access_token;
        })
      : Promise.resolve(access_token);
  } else {
    return Promise.resolve("");
  }
};

export default getAccessToken;
