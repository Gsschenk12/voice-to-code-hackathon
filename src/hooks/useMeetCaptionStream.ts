"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createMeetCaptionMergeState,
  mergeCaptionSnapshot,
  type CaptionRow,
  type MeetCaptionMergeState,
} from "@/lib/meet-captions";

const SOURCE = "vtc-meet-capture";
const HELLO_TIMEOUT_MS = 1000;

export type CaptureStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "error"
  | "stopped";

type ExtensionStatus = {
  meetTabFound?: boolean;
  appTabFound?: boolean;
  capturing?: boolean;
  captionsOn?: boolean;
  lastError?: string | null;
};

type UseMeetCaptionStreamOptions = {
  onTranscript?: (text: string, final: boolean) => void;
};

function postToExtension(type: string, extra: Record<string, unknown> = {}) {
  window.postMessage({ source: SOURCE, type, ...extra }, window.location.origin);
}

function statusErrorMessage(status: ExtensionStatus | null): string | null {
  if (!status) {
    return "Load the unpacked extension from extension/";
  }
  if (status.lastError) return status.lastError;
  if (!status.meetTabFound) {
    return "Open meet.google.com in this Chrome profile";
  }
  if (!status.captionsOn) {
    return "Turn on captions (CC) in Google Meet";
  }
  return null;
}

export function useMeetCaptionStream({
  onTranscript,
}: UseMeetCaptionStreamOptions = {}) {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  const mergeRef = useRef<MeetCaptionMergeState>(createMeetCaptionMergeState());
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const listeningRef = useRef(false);
  const helloTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotHelloRef = useRef(false);

  const applyRows = useCallback((rows: CaptionRow[]) => {
    const { transcript: next } = mergeCaptionSnapshot(mergeRef.current, rows);
    setTranscript(next);
    onTranscriptRef.current?.(next, false);
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    if (helloTimerRef.current) {
      clearTimeout(helloTimerRef.current);
      helloTimerRef.current = null;
    }
    postToExtension("stop");
    setStatus((s) => (s === "idle" ? s : "stopped"));
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    gotHelloRef.current = false;
    listeningRef.current = true;
    mergeRef.current = createMeetCaptionMergeState();
    setTranscript("");

    postToExtension("hello");
    postToExtension("start");

    if (helloTimerRef.current) clearTimeout(helloTimerRef.current);
    helloTimerRef.current = setTimeout(() => {
      if (!gotHelloRef.current && listeningRef.current) {
        setError("Load the unpacked extension from extension/");
        setStatus("error");
        listeningRef.current = false;
      }
    }, HELLO_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SOURCE) return;

      if (
        data.type === "hello" ||
        data.type === "ack" ||
        data.type === "status"
      ) {
        gotHelloRef.current = true;
        if (helloTimerRef.current) {
          clearTimeout(helloTimerRef.current);
          helloTimerRef.current = null;
        }

        const ext = data as ExtensionStatus;
        if (!listeningRef.current) return;

        const hint = statusErrorMessage(ext);
        if (ext.capturing && ext.captionsOn && ext.meetTabFound) {
          setError(null);
          setStatus("listening");
        } else if (ext.capturing && ext.meetTabFound && !ext.captionsOn) {
          setError(hint);
          setStatus("listening"); // keep listening so snapshots can arrive when CC turns on
        } else if (!ext.meetTabFound || hint?.includes("extension")) {
          setError(hint);
          setStatus("error");
        } else if (ext.capturing) {
          setError(hint);
          setStatus("connecting");
        }
      }

      if (data.type === "snapshot" && listeningRef.current) {
        gotHelloRef.current = true;
        const rows = Array.isArray(data.rows) ? (data.rows as CaptionRow[]) : [];
        applyRows(rows);
        if (data.captionsOn) {
          setError(null);
          setStatus("listening");
        } else if (listeningRef.current) {
          setError("Turn on captions (CC) in Google Meet");
          setStatus("listening");
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (helloTimerRef.current) clearTimeout(helloTimerRef.current);
      listeningRef.current = false;
      postToExtension("stop");
    };
  }, [applyRows]);

  return {
    status,
    error,
    transcript,
    setTranscript,
    start,
    stop,
  };
}
