import React, { useCallback, useMemo, useState } from "react";
import apiPost from "roamjs-components/util/apiPost";
import localStorageGet from "roamjs-components/util/localStorageGet";
import localStorageSet from "roamjs-components/util/localStorageSet";
import GoogleLogo from "./GoogleLogo";

type OauthAccount = {
  uid: string;
  text: string;
  data: string;
  time: number;
};

const OAUTH_KEY = "oauth-google";
const ROAMJS_ORIGIN = "https://roamjs.com";
const REDIRECT_URI = `${ROAMJS_ORIGIN}/oauth?auth=true`;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const DESKTOP_POLL_INTERVAL_MS = 1500;
const GOOGLE_CLIENT_ID =
  "950860433572-rvt5aborg8raln483ogada67n201quvh.apps.googleusercontent.com";

const getAccounts = (): OauthAccount[] => {
  try {
    return JSON.parse(localStorageGet(OAUTH_KEY) || "[]");
  } catch {
    return [];
  }
};

const setAccounts = (accounts: OauthAccount[]) =>
  localStorageSet(OAUTH_KEY, JSON.stringify(accounts));

const createNonce = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createSessionId = () =>
  `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const encodeState = (value: unknown) => {
  const json = JSON.stringify(value);
  return window
    .btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const createState = (session?: string) => {
  const nonce = createNonce();
  try {
    const payload: { nonce: string; origin: string; session?: string } = {
      nonce,
      origin: window.location.origin,
    };
    if (session) {
      payload.session = session;
    }
    return encodeState(payload);
  } catch {
    return nonce;
  }
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const createUid = () =>
  window.roamAlphaAPI?.util?.generateUID?.() ||
  Math.random().toString(36).slice(2, 11);

const GoogleOauthPanel = ({ scopes }: { scopes: string }) => {
  const [accounts, setLocalAccounts] = useState<OauthAccount[]>(() =>
    getAccounts(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const nextLabel = useMemo(
    () => `Google Account ${accounts.length + 1}`,
    [accounts.length],
  );

  const removeAccount = useCallback((uid: string) => {
    setLocalAccounts((previous) => {
      const next = previous.filter((a) => a.uid !== uid);
      setAccounts(next);
      return next;
    });
  }, []);

  const login = useCallback(() => {
    const isDesktop = !!window.roamAlphaAPI?.platform?.isDesktop;
    const session = isDesktop ? createSessionId() : undefined;
    const state = createState(session);
    setError("");
    setLoading(true);

    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      `prompt=consent&access_type=offline&client_id=${GOOGLE_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code&scope=${scopes}&state=${encodeURIComponent(state)}`;

    const width = 600;
    const height = 525;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popup = window.open(
      url,
      "roamjs_google_login",
      `left=${left},top=${top},width=${width},height=${height},status=1`,
    );

    if (!popup) {
      if (!isDesktop) {
        setLoading(false);
        setError("Popup blocked. Please allow popups and try again.");
        return;
      }
    }
    popup?.focus?.();

    const exchangeCode = (payload: Record<string, string>) =>
      apiPost({
        anonymous: true,
        domain: ROAMJS_ORIGIN,
        path: "google-auth",
        data: {
          ...payload,
          grant_type: "authorization_code",
        },
      }).then((tokenData) => {
        const label =
          typeof tokenData?.label === "string" && tokenData.label
            ? tokenData.label
            : nextLabel;
        const account: OauthAccount = {
          uid: createUid(),
          text: label,
          data: JSON.stringify(tokenData),
          time: Date.now(),
        };
        setLocalAccounts((previous) => {
          const next = [...previous, account];
          setAccounts(next);
          return next;
        });
      });

    if (isDesktop && session) {
      void (async () => {
        try {
          const deadline = Date.now() + OAUTH_TIMEOUT_MS;
          while (Date.now() < deadline) {
            const pollUrl = `${ROAMJS_ORIGIN}/oauth/session?session=${encodeURIComponent(
              session,
            )}`;
            const response = await fetch(pollUrl, { cache: "no-store" });
            if (response.ok) {
              const pollData = (await response.json()) as {
                status?: string;
                code?: string;
                state?: string;
                error?: string;
              };
              if (pollData.status === "completed") {
                if (pollData.state !== state) {
                  throw new Error("OAuth state mismatch. Please try again.");
                }
                if (pollData.error) {
                  throw new Error(pollData.error);
                }
                if (!pollData.code) {
                  throw new Error(
                    "Did not receive an authorization code from Google.",
                  );
                }
                await exchangeCode({
                  code: pollData.code,
                  state: pollData.state,
                });
                return;
              }
            }
            await wait(DESKTOP_POLL_INTERVAL_MS);
          }
          throw new Error(
            "Google login timed out or was closed before completing. Please try again.",
          );
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to exchange OAuth code. Please try again in a moment.",
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    let timeoutId = 0;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== ROAMJS_ORIGIN) {
        return;
      }
      cleanup();
      const raw = event.data;
      let payload: Record<string, string> = {};
      if (typeof raw === "string") {
        try {
          payload = JSON.parse(raw || "{}") as Record<string, string>;
        } catch {
          setLoading(false);
          setError("Invalid OAuth response from callback page.");
          return;
        }
      } else if (raw && typeof raw === "object") {
        payload = raw as Record<string, string>;
      }

      if (payload.state !== state) {
        setLoading(false);
        setError("OAuth state mismatch. Please try again.");
        return;
      }
      if (payload.error) {
        setLoading(false);
        setError(payload.error);
        return;
      }
      if (!payload.code) {
        setLoading(false);
        setError("Did not receive an authorization code from Google.");
        return;
      }

      exchangeCode(payload)
        .catch((e) => {
          setError(
            e?.message ||
              "Failed to exchange OAuth code. Please try again in a moment.",
          );
        })
        .finally(() => {
          setLoading(false);
        });
    };

    window.addEventListener("message", onMessage);
    timeoutId = window.setTimeout(() => {
      cleanup();
      setLoading(false);
      setError(
        "Google login timed out or was closed before completing. Please try again.",
      );
    }, OAUTH_TIMEOUT_MS);
  }, [nextLabel, scopes]);

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 300 }}>
      <button
        className="bp3-button bp3-minimal"
        onClick={login}
        disabled={loading}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 15, height: 15, display: "inline-flex" }}>
            <GoogleLogo />
          </span>
          {loading
            ? "Connecting..."
            : accounts.length
              ? "Add Another Google Account"
              : "Login With Google"}
        </span>
      </button>
      {!!accounts.length && (
        <>
          <h5 className="margin-0">Accounts</h5>
          <ul className="margin-0">
            {accounts.map((a) => (
              <li
                key={a.uid}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <span style={{ minWidth: 192 }}>{a.text}</span>
                <button
                  className="bp3-button bp3-small"
                  onClick={() => removeAccount(a.uid)}
                >
                  Log Out
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!!error && (
        <div style={{ color: "red", whiteSpace: "pre-line" }}>{error}</div>
      )}
    </div>
  );
};

export default GoogleOauthPanel;

