import { Button, Dialog, Spinner } from "@blueprintjs/core";
import React, { useEffect, useMemo, useRef, useState } from "react";
import getAccessToken from "../utils/getAccessToken";
import setInputSetting from "roamjs-components/util/setInputSetting";
import getTextByBlockUid from "roamjs-components/queries/getTextByBlockUid";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getSettingIntFromTree from "roamjs-components/util/getSettingIntFromTree";
import { Resizable } from "react-resizable";
import apiGet from "roamjs-components/util/apiGet";

type Props = {
  blockUid: string;
};
const useSrc = ({ id, mimeType }: { id: string; mimeType: string }) => {
  const [src, setSrc] = useState("");
  useEffect(() => {
    getAccessToken().then((token) =>
      apiGet<ArrayBuffer>({
        domain: `https://www.googleapis.com`,
        authorization: `Bearer ${token}`,
        path: `drive/v3/files/${id}?alt=media`,
        buffer: true,
      }).then((r) => {
        const u8 = new Uint8Array(r);
        let b64encoded = "";
        u8.forEach((u) => (b64encoded += String.fromCharCode(u)));
        setSrc(`data:${mimeType};base64,${btoa(b64encoded)}`);
      })
    );
  }, [setSrc, mimeType, id]);
  return src;
};

const PreviewAudio = ({ id, mimeType }: { id: string; mimeType: string }) => {
  const src = useSrc({ id, mimeType });
  return src ? (
    <audio controls style={{ width: "100%", height: "100%" }}>
      <source src={src} type={mimeType} />
    </audio>
  ) : (
    <Spinner />
  );
};

const PreviewPdf = ({ id, mimeType }: { id: string; mimeType: string }) => {
  const src = useSrc({ id, mimeType });
  return src ? (
    <iframe src={src} style={{ width: "100%", height: "100%" }} />
  ) : (
    <Spinner />
  );
};

const PreviewVideo = ({ id, mimeType }: { id: string; mimeType: string }) => {
  const src = useSrc({ id, mimeType });
  return src ? (
    <video src={src} style={{ width: "100%", height: "100%" }} controls />
  ) : (
    <Spinner />
  );
};

const PreviewImage = ({
  id,
  mimeType,
  parentWidth,
  parentHeight,
}: {
  id: string;
  mimeType: string;
  parentWidth: number;
  parentHeight: number;
}) => {
  const src = useSrc({ id, mimeType });
  const imageRef = useRef<HTMLImageElement>(null);
  const [height, setHeight] = useState<string | number>("100%");
  const [width, setWidth] = useState<string | number>("100%");
  const [imageStats, setImageStats] = useState({ width: 1, height: 1 });
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  useEffect(() => {
    if (src) {
      const dummyImage = new Image();
      dummyImage.src = src;
      dummyImage.style.visibility = "hidden";
      dummyImage.onload = () => {
        document.body.appendChild(dummyImage);
        const { clientWidth, clientHeight } = dummyImage;
        dummyImage.remove();
        setImageStats({ width: clientWidth, height: clientHeight });
      };
    }
  }, [src, setImageStats]);
  useEffect(() => {
    if (imageStats.width / imageStats.height < parentWidth / parentHeight) {
      setHeight(parentHeight);
      setWidth((parentHeight * imageStats.width) / imageStats.height);
    } else if (
      imageStats.width / imageStats.height >
      parentWidth / parentHeight
    ) {
      setHeight((parentWidth * imageStats.height) / imageStats.width);
      setWidth(parentWidth);
    } else {
      setHeight(parentHeight);
      setWidth(parentWidth);
    }
  }, [setHeight, setWidth, parentHeight, parentWidth, imageStats]);
  return src ? (
    <>
      <img
        src={src}
        alt={"Failed to load Image"}
        style={{ width, height }}
        ref={imageRef}
        onClick={() => {
          setImageDialogOpen(true);
        }}
      />
      <Dialog
        isOpen={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        className="rm-modal-dialog rm-modal-dialog--image"
      >
        <img src={src} className="rm-modal-img" />
      </Dialog>
    </>
  ) : (
    <Spinner />
  );
};

const ID_REGEX = /{{google drive:\s*(.*?)\s*}}/;

const GoogleDriveButton = ({ blockUid }: Props) => {
  const id = useMemo(
    () => ID_REGEX.exec(getTextByBlockUid(blockUid))?.[1],
    [blockUid]
  );
  const [name, setName] = useState("Unknown File");
  const [link, setLink] = useState("https://drive.google.com");
  const [mimeType, setMimeType] = useState("loading");
  const tree = useMemo(() => getBasicTreeByParentUid(blockUid), [blockUid]);
  const [width, setWidth] = useState(
    getSettingIntFromTree({ tree, key: "width", defaultValue: 500 })
  );
  const [height, setHeight] = useState(
    getSettingIntFromTree({ tree, key: "height", defaultValue: 400 })
  );
  useEffect(() => {
    getAccessToken().then((token) => {
      apiGet({
        domain: `https://www.googleapis.com`,
        path: `drive/v3/files/${id}?fields=webViewLink,name,mimeType`,
        authorization: `Bearer ${token}`,
      })
        .then((r) => {
          setName(r.name || "Unknown File");
          setLink(r.webViewLink);
          setMimeType(r.mimeType);
        })
        .catch((e) => {
          setName("Unknown File");
          setMimeType(`error: ${e.response?.data?.message || e.message}`);
        });
    });
  }, [setName, setMimeType, setLink]);
  return (
    <>
      <Resizable
        width={width}
        height={height}
        onResize={(_, { size }) => {
          setWidth(size.width);
          setHeight(size.height);
        }}
        onResizeStop={(_, { size }) => {
          setInputSetting({ blockUid, value: `${size.width}`, key: "width" });
          setInputSetting({ blockUid, value: `${size.height}`, key: "height" });
        }}
      >
        <div style={{ width, height }}>
          {mimeType.startsWith("loading") ? (
            <Spinner />
          ) : mimeType.startsWith("image") ? (
            <PreviewImage
              id={id}
              mimeType={mimeType}
              parentWidth={width}
              parentHeight={height}
            />
          ) : mimeType.includes("pdf") ? (
            <PreviewPdf id={id} mimeType={mimeType} />
          ) : mimeType.includes("audio") ? (
            <PreviewAudio id={id} mimeType={mimeType} />
          ) : mimeType.includes("video") ? (
            <PreviewVideo id={id} mimeType={mimeType} />
          ) : (
            <div>
              Don't know how to load the following file type: {mimeType}
            </div>
          )}
        </div>
      </Resizable>
      <Button
        onClick={() => window.open(link, "_blank")}
        style={{ marginTop: 16 }}
        className={"roamjs-open-in-drive"}
      >
        <img
          src={
            "https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-64dp/logo_drive_2020q4_color_2x_web_64dp.png"
          }
          style={{ height: 18 }}
        />
        <span style={{ marginLeft: 8 }}>Open {name} in Drive</span>
      </Button>
    </>
  );
};

export default GoogleDriveButton;
