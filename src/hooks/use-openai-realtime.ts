"use client";

import type { MutableRefObject } from "react";
import type {
  VoiceAssistantMetrics,
  VoiceAssistantState,
  VoiceSessionConfig,
} from "@/lib/ai/voice";

type StateSetter = React.Dispatch<React.SetStateAction<VoiceAssistantState>>;

/**
 * Connects to OpenAI Realtime API via WebRTC.
 *
 * This is a scaffold: it sets up the peer connection, data channel, and audio
 * tracks. The data-channel event parsing and audio streaming will likely need
 * small adjustments once tested against a live key.
 */
export async function connectOpenAIRealtime(
  config: Record<string, unknown>,
  sessionConfig: VoiceSessionConfig,
  setState: StateSetter,
  setTranscript: (t: string | undefined) => void,
  metricsRef: MutableRefObject<VoiceAssistantMetrics>,
): Promise<() => void> {
  const token = config.token;
  const model = config.model as string;

  if (typeof token !== "string" || typeof model !== "string") {
    throw new Error("Invalid OpenAI realtime session config");
  }

  const pc = new RTCPeerConnection();
  const dc = pc.createDataChannel("oai-events");
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  pc.ontrack = (event) => {
    audioEl.srcObject = event.streams[0];
    setState({ status: "speaking" });
  };

  dc.onopen = () => {
    metricsRef.current.connectedAt = performance.now();
    setState({ status: "listening" });
  };

  dc.onmessage = (event) => {
    const data = JSON.parse(event.data) as {
      type: string;
      transcript?: string;
    };

    if (data.type === "error") {
      setState({ status: "error", message: JSON.stringify(data) });
      return;
    }

    if (data.type === "conversation.item.input_audio_transcription.completed") {
      if (data.transcript) setTranscript(data.transcript);
      setState({ status: "processing" });
    }

    if (data.type === "response.audio_transcript.delta" && data.transcript) {
      setTranscript(data.transcript);
    }

    if (data.type === "response.done") {
      metricsRef.current.firstResponseAt ??= performance.now();
      setState({ status: "speaking", transcript: data.transcript });
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch(
    `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI realtime SDP exchange failed: ${text}`);
  }

  const answerSdp = await response.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  // Push the current recipe context as a conversation item.
  dc.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildContextText(sessionConfig),
          },
        ],
      },
    }),
  );

  return () => {
    stream.getTracks().forEach((track) => track.stop());
    pc.close();
    audioEl.pause();
    audioEl.srcObject = null;
  };
}

function buildContextText(sessionConfig: VoiceSessionConfig): string {
  return [
    "You are StarterChef, a warm sous-chef helping a beginner cook.",
    `Recipe: ${sessionConfig.recipeTitle}. Current step: ${sessionConfig.stepTitle}.`,
    "Replies must be 1-3 short, encouraging sentences.",
  ].join(" ");
}
