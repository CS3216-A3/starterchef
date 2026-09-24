"use client";

import type { MutableRefObject } from "react";
import type {
  VoiceAssistantMetrics,
  VoiceAssistantState,
} from "@/lib/ai/voice";
import {
  normalizeVoiceAction,
  voiceActionSchema,
} from "@/lib/ai/schemas/assistant";
import type { AssistantReply } from "@/lib/ai/schemas/assistant";

type SetState = React.Dispatch<React.SetStateAction<VoiceAssistantState>>;

/** Current GA WebRTC flow. Instructions are bound to the server-created
 * client secret; no browser-authored system message is sent. */
export async function connectOpenAIRealtime(
  config: Record<string, unknown>,
  setState: SetState,
  setTranscript: (text: string | undefined) => void,
  metricsRef: MutableRefObject<VoiceAssistantMetrics>,
  onAction?: (action: NonNullable<AssistantReply["action"]>) => void,
  signal?: AbortSignal,
  onClosed?: () => void,
  markConnected?: () => Promise<void>,
): Promise<() => void> {
  const credential = config.credential;
  if (typeof credential !== "string")
    throw new Error("Invalid realtime credential");
  const peer = new RTCPeerConnection();
  const events = peer.createDataChannel("oai-events");
  const audio = document.createElement("audio");
  audio.autoplay = true;
  let stream: MediaStream | null = null;
  let closed = false;
  let transcript = "";
  const cleanup = () => {
    if (closed) return;
    closed = true;
    stream?.getTracks().forEach((track) => track.stop());
    events.close();
    peer.close();
    audio.pause();
    audio.srcObject = null;
    transcript = "";
    setTranscript(undefined);
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (signal?.aborted) throw new Error("Voice stopped");
    // SDP negotiation must be silent: fallback is only allowed before the
    // connection starts carrying user audio or model output.
    stream.getTracks().forEach((track) => {
      track.enabled = false;
      peer.addTrack(track, stream!);
    });
    peer.ontrack = (event) => {
      audio.srcObject = event.streams[0];
    };
    events.onmessage = (event) => {
      let data: {
        type?: string;
        delta?: string;
        transcript?: string;
        response?: {
          output?: {
            type?: string;
            name?: string;
            arguments?: string;
            call_id?: string;
          }[];
        };
      };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "error") {
        setState({
          status: "error",
          message: "Live voice encountered an error",
        });
        cleanup();
        onClosed?.();
      }
      if (data.type === "input_audio_buffer.speech_started")
        setState({ status: "listening" });
      if (data.type === "input_audio_buffer.speech_stopped")
        setState({ status: "processing" });
      if (
        data.type === "conversation.item.input_audio_transcription.completed" &&
        data.transcript
      )
        setTranscript(data.transcript);
      if (
        data.type === "response.output_audio_transcript.delta" &&
        data.delta
      ) {
        metricsRef.current.firstResponseAt ??= performance.now();
        transcript += data.delta;
        setTranscript(transcript);
        setState({ status: "speaking", transcript });
      }
      if (data.type === "response.done") {
        transcript = "";
        setState({ status: "listening" });
        for (const item of data.response?.output ?? []) {
          if (
            item.type !== "function_call" ||
            item.name !== "propose_cooking_action" ||
            !item.call_id
          )
            continue;
          let args: unknown;
          try {
            args = JSON.parse(item.arguments ?? "");
          } catch {
            args = null;
          }
          const action = voiceActionSchema.safeParse(args);
          if (action.success) onAction?.(normalizeVoiceAction(action.data));
          if (events.readyState === "open") {
            events.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: item.call_id,
                  output: JSON.stringify({
                    status: action.success
                      ? "shown_for_user_confirmation"
                      : "invalid_proposal",
                  }),
                },
              }),
            );
            events.send(JSON.stringify({ type: "response.create" }));
          }
        }
      }
    };
    events.onclose = () => {
      if (!closed) {
        cleanup();
        onClosed?.();
      }
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
      signal,
    });
    if (!answer.ok) throw new Error("OpenAI voice connection failed");
    await peer.setRemoteDescription({
      type: "answer",
      sdp: await answer.text(),
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("OpenAI voice connection timed out")),
        10_000,
      );
      signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timeout);
          reject(new Error("Voice stopped"));
        },
        { once: true },
      );
      events.onopen = () => {
        window.clearTimeout(timeout);
        if (signal?.aborted) {
          reject(new Error("Voice stopped"));
          return;
        }
        void (markConnected?.() ?? Promise.resolve())
          .then(() => {
            if (signal?.aborted) throw new Error("Voice stopped");
            stream?.getTracks().forEach((track) => {
              track.enabled = true;
            });
            metricsRef.current.connectedAt = performance.now();
            setState({ status: "listening" });
            resolve();
          })
          .catch(reject);
      };
      events.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("OpenAI voice connection failed"));
      };
    });
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
