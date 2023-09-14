import GoogleDriveButton from "../components/GoogleDriveButton";
import createButtonObserver from "roamjs-components/dom/createButtonObserver";
import getAccessToken from "../utils/getAccessToken";
import { createComponentRender } from "roamjs-components/components/ComponentContainer";
import updateBlock from "roamjs-components/writes/updateBlock";
import getUids from "roamjs-components/dom/getUids";
import { OnloadArgs } from "roamjs-components/types";
import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import createBlock from "roamjs-components/writes/createBlock";
import getDropUidOffset from "roamjs-components/dom/getDropUidOffset";
import apiGet from "roamjs-components/util/apiGet";
import apiPost from "roamjs-components/util/apiPost";
import apiPut from "roamjs-components/util/apiPut";
import mimeTypes from "../utils/mimeTypes";

const mimeLookup = (path: string) => {
  if (!path || typeof path !== "string") {
    return false;
  }

  const extension = path.split(".").slice(-1)[0];

  if (!extension) {
    return false;
  }

  return mimeTypes[extension] || false;
};

const CHUNK_MAX = 256 * 1024;

const uploadFileChunk = (
  start: number,
  domain: string,
  path: string,
  Authorization: string,
  contentLength: number,
  uid: string,
  fileToUpload: File,
  retryCount: number = 0
): Promise<{ id: string }> => {
  updateBlock({
    uid,
    text: `Loading ${Math.round((100 * start) / contentLength)}%`,
  });
  if (retryCount > 5) return Promise.reject("Too many retries");
  console.log("Start -------- count: ", retryCount);
  retryCount++;
  const endMin = Math.min(start + CHUNK_MAX, contentLength);
  const end = endMin === contentLength ? start + CHUNK_MAX : endMin;
  const reader = new FileReader();
  reader.readAsArrayBuffer(fileToUpload.slice(start, end));
  return new Promise((resolve, reject) => {
    reader.onloadend = () => {
      console.log(
        `Uploading chunk starting at byte ${start} and ending at byte ${end}`
      );
      const buf = new Uint8Array(reader.result as ArrayBuffer);
      const contentLength = end - start;
      const contentRange = `bytes ${start}-${end - 1}/${contentLength}`;
      console.log("apiPut", {
        headers: { contentLength, contentRange },
      });
      apiPut<{
        status: 308 | 200;
        headers: { range: string };
        id: string;
        mimeType: string;
      }>({
        domain,
        path: `${path}&access_token=${Authorization}`,
        data: buf,
        headers: {
          contentLength: contentLength.toString(),
          contentRange,
        },
        anonymous: true,
      })
        .then((r) => {
          console.log("Received response", r);
          console.log("Received Range header:", r.headers?.range);
          if (r.status === 308) {
            const nextStartByte =
              Number(r.headers?.range.replace(/^bytes=0-/, "")) + 1;

            // Debug log to print nextStartByte
            console.log("start", start);
            console.log("end", end);
            console.log("Next start byte:", nextStartByte);

            // Verify if nextStartByte is actually greater than start
            if (nextStartByte <= start) {
              console.warn(
                "Next start byte is less than or equal to current start. Exiting to avoid infinite loop."
              );
              // return reject("Infinite loop detected");
            }

            resolve(
              uploadFileChunk(
                nextStartByte,
                domain,
                path,
                Authorization,
                contentLength,
                uid,
                fileToUpload,
                retryCount
              )
            );
          } else if (r.status === 200) {
            resolve({ id: r.id });
          } else {
            reject(r);
          }
        })
        .catch((e) => {
          console.log("Error", e);
          reject(e);
        });
    };
  });
};

const getOrCreateFolderId = async (
  Authorization: string,
  folder: string
): Promise<string> => {
  const response = await apiGet<{ files: { name: string; id: string }[] }>({
    domain: `https://www.googleapis.com`,
    path: `drive/v3/files?q=${encodeURIComponent(
      "mimeType='application/vnd.google-apps.folder'"
    )}`,
    authorization: `Bearer ${Authorization}`,
  });

  const id = response.files.find((f) => f.name === folder)?.id;
  if (id) return id;

  const newFolder = await apiPost<{ id: string }>({
    domain: `https://www.googleapis.com`,
    path: `drive/v3/files`,
    data: {
      name: folder,
      mimeType: "application/vnd.google-apps.folder",
    },
    authorization: `Bearer ${Authorization}`,
  });

  return newFolder.id;
};

const getUploadLocation = async (
  Authorization: string,
  folderId: string,
  fileToUpload: File,
  contentType: string,
  contentLength: number
): Promise<{ domain: string; path: string }> => {
  const response = await apiPost<{ headers: { location: string } }>({
    domain: `https://www.googleapis.com`,
    path: `upload/drive/v3/files?uploadType=resumable&access_token=${Authorization}`,
    data: { name: fileToUpload.name, parents: [folderId] },
    headers: {
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": `${contentLength}`,
      "Content-Type": "application/json",
      "Content-Length": "0",
    },
    anonymous: true,
  });

  const { location } = response.headers;
  const locationParts = location.split("/");
  const domain = locationParts.slice(0, -1).join("/");
  const path = locationParts.slice(-1)[0];

  return { domain, path };
};

const handleMissingAuthorization = () => {
  const err = new Error(
    "Failed to get Google Access token. Make sure you log in!"
  );
  err.name = "Authentication Error";
  return Promise.reject(err);
};

const handleError = (e: any, uid: string) => {
  if (e.response?.data?.error?.code === 403) {
    updateBlock({
      uid,
      text: "Failed to upload file to google drive because of authentication. Make sure to log in!",
    });
  } else if (e.name === "Authentication Error") {
    updateBlock({
      uid,
      text: e.message,
    });
  } else {
    updateBlock({
      uid,
      text: "Failed to upload file to google drive. Email support@roamjs.com with the error below:",
    });
    createBlock({
      parentUid: uid,
      node: {
        text: e ? JSON.stringify(e) : "Unknown Error",
      },
    });
  }
};

const uploadToDrive = async ({
  files,
  getLoadingUid,
  e,
  extensionAPI,
}: {
  files: FileList;
  getLoadingUid: () => Promise<string>;
  e: Event;
  extensionAPI: OnloadArgs["extensionAPI"];
}) => {
  const fileToUpload = files[0];

  if (fileToUpload) {
    const contentType =
      mimeLookup(fileToUpload.name) || "application/octet-stream";
    const contentLength = fileToUpload.size;
    const folder =
      (extensionAPI.settings.get("upload-folder") as string) || "RoamJS";
    const uid = await getLoadingUid();

    try {
      const Authorization = await getAccessToken();

      if (Authorization) {
        const folderId = await getOrCreateFolderId(Authorization, folder);
        const { domain, path } = await getUploadLocation(
          Authorization,
          folderId,
          fileToUpload,
          contentType,
          contentLength
        );

        await uploadFileChunk(
          0,
          domain,
          path,
          Authorization,
          contentLength,
          uid,
          fileToUpload
        ).then(({ id }) => {
          updateBlock({
            uid,
            text: `{{google drive:${id}}}`,
          });
        });
      } else {
        await handleMissingAuthorization();
      }
    } catch (e) {
      handleError(e, uid);
    } finally {
      Array.from(document.getElementsByClassName("dnd-drop-bar"))
        .map((c) => c as HTMLDivElement)
        .forEach((c) => (c.style.display = "none"));
    }

    e.stopPropagation();
    e.preventDefault();
  }
};

const textareaRef: { current: HTMLTextAreaElement } = {
  current: null,
};

let observers = new Set<MutationObserver>();
let documentClickListeners = new Set<(e: MouseEvent) => void>();

const loadGoogleDrive = (args: OnloadArgs) => {
  return (enabled: boolean) => {
    if (enabled) {
      observers.add(
        createHTMLObserver({
          tag: "DIV",
          className: "dnd-drop-area",
          callback: (d: HTMLDivElement) => {
            d.addEventListener("drop", (e) => {
              uploadToDrive({
                extensionAPI: args.extensionAPI,
                files: e.dataTransfer.files,
                getLoadingUid: () => {
                  const { parentUid, offset } = getDropUidOffset(d);
                  return createBlock({
                    parentUid,
                    order: offset,
                    node: { text: "Loading..." },
                  });
                },
                e,
              });
            });
          },
        })
      );
      observers.add(
        createHTMLObserver({
          tag: "TEXTAREA",
          className: "rm-block-input",
          callback: (t: HTMLTextAreaElement) => {
            textareaRef.current = t;
            t.addEventListener("paste", (e) => {
              uploadToDrive({
                extensionAPI: args.extensionAPI,
                files: e.clipboardData.files,
                getLoadingUid: () => {
                  const { blockUid } = getUids(t);
                  return updateBlock({
                    text: "Loading...",
                    uid: blockUid,
                  });
                },
                e,
              });
            });
          },
        })
      );

      const clickListener = (e: MouseEvent) => {
        const target = e.target as HTMLInputElement;
        if (
          target.tagName === "INPUT" &&
          target.parentElement === document.body &&
          target.type === "file"
        ) {
          target.addEventListener(
            "change",
            (e) => {
              uploadToDrive({
                extensionAPI: args.extensionAPI,
                files: (e.target as HTMLInputElement).files,
                getLoadingUid: () => {
                  const { blockUid } = getUids(textareaRef.current);
                  return updateBlock({
                    text: "Loading...",
                    uid: blockUid,
                  });
                },
                e,
              });
            },
            { capture: true }
          );
        }
      };
      document.addEventListener("click", clickListener);
      documentClickListeners.add(clickListener);

      observers.add(
        createButtonObserver({
          shortcut: "gdrive",
          attribute: "google-drive",
          render: createComponentRender(GoogleDriveButton),
        })
      );
    } else {
      observers.forEach((o) => o.disconnect());
      documentClickListeners.forEach((l) =>
        document.removeEventListener("click", l)
      );
    }
  };
};

export default loadGoogleDrive;
