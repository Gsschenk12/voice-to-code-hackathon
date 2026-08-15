"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WisprStatus = "idle" | "connecting" | "listening" | "error" | "stopped";

type UseWisprStreamOptions = {
  onTranscript?: (text: string, final: boolean) => void;
};

function floatTo16BitPCM(floatData: Float32Array): Int16Array {
  const intData = new Int16Array(floatData.length);
  for (let i = 0; i < floatData.length; i++) {
    const s = Math.max(-1, Math.min(1, floatData[i]));
    intData[i] = s < 0 ? Math.floor(s * 32768) : Math.floor(s * 32767);
  }
  return intData;
}

function calculateVolume(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

async function resampleAudio(
  inputData: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
): Promise<Float32Array> {
  if (inputSampleRate === outputSampleRate) return inputData;
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(inputData.length * (outputSampleRate / inputSampleRate)),
    outputSampleRate,
  );
  const audioBuffer = offlineCtx.createBuffer(1, inputData.length, inputSampleRate);
  audioBuffer.copyToChannel(Float32Array.from(inputData), 0);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

export function useWisprStream({ onTranscript }: UseWisprStreamOptions = {}) {
  const [status, setStatus] = useState<WisprStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const packetPositionRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stop = useCallback(async () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(
          JSON.stringify({
            type: "commit",
            total_packets: packetPositionRef.current,
          }),
        );
      } catch {
        // ignore
      }
      ws.close();
    }
    wsRef.current = null;

    workletRef.current?.disconnect();
    workletRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    setStatus((s) => (s === "idle" ? s : "stopped"));
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    packetPositionRef.current = 0;

    try {
      const tokenRes = await fetch("/api/wispr/token", { method: "POST" });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenJson.error || "Failed to get Wispr token");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule("/audio-processor-worklet.js");

      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, "audioProcessorWorklet");
      workletRef.current = worklet;

      const BUFFER_SIZE = 2400;
      const TARGET_SAMPLE_RATE = 16000;
      const packetDuration = BUFFER_SIZE / audioContext.sampleRate;

      worklet.port.postMessage({
        type: "setSampleRate",
        sampleRate: audioContext.sampleRate,
        bufferSize: BUFFER_SIZE,
      });

      const ws = new WebSocket(tokenJson.wsUrl as string);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("WebSocket connection failed"));
      });

      ws.send(
        JSON.stringify({
          type: "auth",
          access_token: tokenJson.accessToken,
          language: ["en"],
          context: {
            app: { name: "Voice to Code", type: "ai" },
            dictionary_context: [
              "grok",
              "pull request",
              "PR",
              "GitHub",
              "Cursor",
              "issue",
            ],
            textbox_contents: {
              before_text: "",
              selected_text: "",
              after_text: "",
            },
          },
        }),
      );

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string);
          if (message.status === "auth") {
            setStatus("listening");
          } else if (message.status === "text" && message.body?.text) {
            const text = message.body.text as string;
            const isFinal = Boolean(message.final);
            setTranscript((prev) => {
              // Wispr sends cumulative / interim text; keep the latest full window.
              const next = text.length >= prev.length ? text : `${prev} ${text}`.trim();
              onTranscriptRef.current?.(next, isFinal);
              return next;
            });
          } else if (message.error) {
            setError(String(message.error));
            setStatus("error");
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setStatus((s) => (s === "error" ? s : "stopped"));
      };

      worklet.port.onmessage = async (event) => {
        if (event.data.type !== "audioData") return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const resampled = await resampleAudio(
          event.data.data as Float32Array,
          audioContext.sampleRate,
          TARGET_SAMPLE_RATE,
        );
        const intData = floatTo16BitPCM(resampled);
        const volume = calculateVolume(resampled);
        const bytes = new Uint8Array(intData.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64Audio = btoa(binary);

        wsRef.current.send(
          JSON.stringify({
            type: "append",
            position: packetPositionRef.current,
            audio_packets: {
              packets: [base64Audio],
              volumes: [volume],
              packet_duration: packetDuration,
              audio_encoding: "wav",
              byte_encoding: "base64",
            },
          }),
        );
        packetPositionRef.current += 1;
      };

      source.connect(worklet);
      // Do not connect to destination to avoid feedback.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start stream";
      setError(message);
      setStatus("error");
      await stop();
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    status,
    error,
    transcript,
    setTranscript,
    start,
    stop,
  };
}
