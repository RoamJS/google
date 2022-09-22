import axios from "axios";
import GoogleDriveButton from "../components/GoogleDriveButton";
import createButtonObserver from "roamjs-components/dom/createButtonObserver";
import mime from "mime-types";
import getAccessToken from "../utils/getAccessToken";
import { createComponentRender } from "roamjs-components/components/ComponentContainer";
import updateBlock from "roamjs-components/writes/updateBlock";
import getUids from "roamjs-components/dom/getUids";
import { OnloadArgs } from "roamjs-components/types";
import createHTMLObserver from "roamjs-components/dom/createHTMLObserver";
import createBlock from "roamjs-components/writes/createBlock";
import getDropUidOffset from "roamjs-components/dom/getDropUidOffset";

const CHUNK_MAX = 256 * 1024;

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
      mime.lookup(fileToUpload.name) || "application/octet-stream";
    const contentLength = fileToUpload.size;
    const folder = extensionAPI.settings.get("upload-folder") || "RoamJS";
    const uid = await getLoadingUid();
    getAccessToken()
      .then(([uid, Authorization]) => {
        if (Authorization)
          return axios
            .get(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
                "mimeType='application/vnd.google-apps.folder'"
              )}`,
              { headers: { Authorization: `Bearer ${Authorization}` } }
            )
            .then((r) => {
              const id = r.data.files.find(
                (f: { name: string; id: string }) => f.name === folder
              )?.id;
              if (id) {
                return id;
              }
              return axios
                .post(
                  `https://www.googleapis.com/drive/v3/files`,
                  {
                    name: folder,
                    mimeType: "application/vnd.google-apps.folder",
                  },
                  { headers: { Authorization: `Bearer ${Authorization}` } }
                )
                .then((r) => r.data.id);
            })
            .then((folderId) =>
              axios
                .post(
                  `${process.env.API_URL}/google-drive`,
                  {
                    operation: "INIT",
                    data: {
                      contentType,
                      contentLength,
                      name: fileToUpload.name,
                      folderId,
                    },
                  },
                  { headers: { Authorization } }
                )
                .then((r) => {
                  const { location } = r.data;
                  const upload = (start: number): Promise<{ id: string }> => {
                    updateBlock({
                      uid,
                      text: `Loading ${Math.round(
                        (100 * start) / contentLength
                      )}%`,
                    });
                    const end = Math.min(start + CHUNK_MAX, contentLength);
                    const reader = new FileReader();
                    reader.readAsArrayBuffer(fileToUpload.slice(start, end));
                    return new Promise((resolve, reject) => {
                      reader.onloadend = () => {
                        axios
                          .post(
                            `${process.env.API_URL}/google-drive`,
                            {
                              operation: "UPLOAD",
                              data: {
                                chunk: Array.from(
                                  new Uint8Array(reader.result as ArrayBuffer)
                                ),
                                uri: location,
                                contentLength: end - start,
                                contentRange: `bytes ${start}-${
                                  end - 1
                                }/${contentLength}`,
                              },
                            },
                            { headers: { Authorization } }
                          )
                          .then((r) =>
                            r.data.done
                              ? resolve({
                                  id: r.data.id,
                                })
                              : resolve(upload(r.data.start))
                          )
                          .catch(reject);
                      };
                    });
                  };
                  return upload(0);
                })
                .then(({ id }) => {
                  updateBlock({
                    uid,
                    text: `{{google drive:${id}}}`,
                  });
                })
            );
        else {
          const err = new Error(
            "Failed to get Google Access token. Make sure you log in at [[roam/js/google]]!"
          );
          err.name = "Authentication Error";
          return Promise.reject(err);
        }
      })
      .catch((e) => {
        if (e.response?.data?.error?.code === 403) {
          updateBlock({
            uid,
            text: "Failed to upload file to google drive because of authentication. Make sure to log in through the [[roam/js/google]] page!",
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
              text: e.response?.data
                ? JSON.stringify(e.response.data)
                : e.message || "Unknown Error",
            },
          });
        }
      })
      .finally(() => {
        Array.from(document.getElementsByClassName("dnd-drop-bar"))
          .map((c) => c as HTMLDivElement)
          .forEach((c) => (c.style.display = "none"));
      });
    e.stopPropagation();
    e.preventDefault();
  }
};

const textareaRef: { current: HTMLTextAreaElement } = {
  current: null,
};

const loadGoogleDrive = (args: OnloadArgs) => {
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
  });

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
  });

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

  createButtonObserver({
    shortcut: "gdrive",
    attribute: "google-drive",
    render: createComponentRender(GoogleDriveButton),
  });

  return {
    domListeners: [
      { el: document, type: "click" as const, listener: clickListener },
    ],
  };
};

export default loadGoogleDrive;
