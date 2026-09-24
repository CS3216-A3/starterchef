"use client";

import type { MutableRefObject } from "react";
import type {
  VoiceAssistantMetrics,
  VoiceAssistantState,
} from "@/lib/ai/voice";
import {
  normalizeVoiceAction,
  voiceActionSchema,
  type AssistantReply,
} from "@/lib/ai/schemas/assistant";
import {
  VOICE_PROPOSAL_DESCRIPTION,
  VOICE_PROPOSAL_PARAMETERS,
} from "@/lib/ai/voice-proposal";

type SetState = React.Dispatch<React.SetStateAction<VoiceAssistantState>>;

function encodePcm(samples: Float32Array, inputRate: number): string {
  const ratio = inputRate / 16_000;
  const count = Math.floor(samples.length / ratio);
  const bytes = new Uint8Array(count * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < count; index += 1) {
    const sample = Math.max(
      -1,
      Math.min(1, samples[Math.floor(index * ratio)]),
    );
    view.setInt16(
      index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

/** Gemini Live uses the constrained v1beta socket. Audio and transcripts stay
 * in memory and every media resource is released by the returned cleanup. */
export async function connectGeminiLive(
  config: Record<string, unknown>,
  setState: SetState,
  setTranscript: (text: string | undefined) => void,
  metricsRef: MutableRefObject<VoiceAssistantMetrics>,
  onAction?: (action: NonNullable<AssistantReply["action"]>) => void,
  signal?: AbortSignal,
  onClosed?: () => void,
  markConnected?: () => Promise<void>,
): Promise<() => void> {
  const token = config.credential;
  const model = config.model;
  if (typeof token !== "string" || typeof model !== "string")
    throw new Error("Invalid Gemini voice credential");
  const socketUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
  let socket: WebSocket | null = null;
  let resumeHandle: string | null = null;
  let reconnects = 0;
  const deadline = Date.parse(String(config.sessionDeadlineAt));
  let microphone: MediaStream | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let silence: GainNode | null = null;
  let nextPlayback = 0;
  const playback = new Set<AudioBufferSourceNode>();
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    processor?.disconnect();
    source?.disconnect();
    silence?.disconnect();
    if (processor) processor.onaudioprocess = null;
    microphone?.getTracks().forEach((track) => track.stop());
    playback.forEach((node) => {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
      node.disconnect();
    });
    playback.clear();
    void context?.close();
    socket?.close();
    socket = null;
    resumeHandle = null;
    setTranscript(undefined);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Gemini voice connection timed out")),
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
      const openSocket = (resuming: boolean) => {
        const connection = new WebSocket(socketUrl);
        socket = connection;
        connection.onclose = () => {
          if (closed || socket !== connection) return;
          if (
            resumeHandle &&
            reconnects < 2 &&
            Number.isFinite(deadline) &&
            Date.now() < deadline
          ) {
            reconnects += 1;
            setState({ status: "connecting" });
            openSocket(true);
          } else {
            cleanup();
            onClosed?.();
            reject(new Error("Gemini voice connection closed"));
          }
        };
        connection.onopen = () => {
          if (signal?.aborted) {
            window.clearTimeout(timeout);
            reject(new Error("Voice stopped"));
            return;
          }
          connection.send(
            JSON.stringify({
              setup: {
                model: `models/${model}`,
                generationConfig: { responseModalities: ["AUDIO"] },
                sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
                contextWindowCompression: { slidingWindow: {} },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: "propose_cooking_action",
                        description: VOICE_PROPOSAL_DESCRIPTION,
                        parameters: VOICE_PROPOSAL_PARAMETERS,
                      },
                    ],
                  },
                ],
              },
            }),
          );
        };
        connection.onerror = () => {
          if (resuming) return;
          window.clearTimeout(timeout);
          cleanup();
          onClosed?.();
          reject(new Error("Gemini voice connection failed"));
        };
        connection.onmessage = (event) => {
          let data: {
            setupComplete?: unknown;
            sessionResumptionUpdate?: {
              resumable?: boolean;
              newHandle?: string;
            };
            goAway?: { timeLeft?: string };
            toolCall?: {
              functionCalls?: { id?: string; name?: string; args?: unknown }[];
            };
            serverContent?: {
              inputTranscription?: { text?: string };
              outputTranscription?: { text?: string };
              turnComplete?: boolean;
              modelTurn?: {
                parts?: { inlineData?: { data?: string; mimeType?: string } }[];
              };
            };
          };
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (
            data.sessionResumptionUpdate?.resumable &&
            data.sessionResumptionUpdate.newHandle
          )
            resumeHandle = data.sessionResumptionUpdate.newHandle;
          if (data.setupComplete) {
            window.clearTimeout(timeout);
            if (signal?.aborted) {
              reject(new Error("Voice stopped"));
              return;
            }
            void (
              resuming
                ? Promise.resolve()
                : (markConnected?.() ?? Promise.resolve())
            )
              .then(() => {
                if (signal?.aborted) throw new Error("Voice stopped");
                metricsRef.current.connectedAt = performance.now();
                setState({ status: "listening" });
                resolve();
              })
              .catch(reject);
          }
          if (data.toolCall?.functionCalls?.length) {
            const functionResponses = data.toolCall.functionCalls.map(
              (call) => {
                const action =
                  call.name === "propose_cooking_action"
                    ? voiceActionSchema.safeParse(call.args)
                    : null;
                if (action?.success)
                  onAction?.(normalizeVoiceAction(action.data));
                return {
                  id: call.id,
                  name: call.name,
                  response: {
                    result: action?.success
                      ? "shown_for_user_confirmation"
                      : "invalid_proposal",
                  },
                };
              },
            );
            connection.send(
              JSON.stringify({ toolResponse: { functionResponses } }),
            );
          }
          const content = data.serverContent;
          if (content?.inputTranscription?.text) {
            setTranscript(content.inputTranscription.text);
            setState({ status: "processing" });
          }
          if (content?.outputTranscription?.text) {
            setTranscript(content.outputTranscription.text);
            setState({
              status: "speaking",
              transcript: content.outputTranscription.text,
            });
          }
          if (content?.turnComplete) setState({ status: "listening" });
          for (const part of content?.modelTurn?.parts ?? []) {
            const encoded = part.inlineData?.data;
            if (!encoded || !context) continue;
            const binary = atob(encoded);
            const samples = new Float32Array(Math.floor(binary.length / 2));
            for (let index = 0; index < samples.length; index += 1) {
              const value =
                binary.charCodeAt(index * 2) |
                (binary.charCodeAt(index * 2 + 1) << 8);
              samples[index] = (value > 32767 ? value - 65536 : value) / 32768;
            }
            const buffer = context.createBuffer(1, samples.length, 24_000);
            buffer.copyToChannel(samples, 0);
            const node = context.createBufferSource();
            node.buffer = buffer;
            node.connect(context.destination);
            node.onended = () => {
              playback.delete(node);
              node.disconnect();
            };
            nextPlayback = Math.max(nextPlayback, context.currentTime);
            node.start(nextPlayback);
            nextPlayback += buffer.duration;
            playback.add(node);
            metricsRef.current.firstResponseAt ??= performance.now();
            setState({ status: "speaking" });
          }
        };
      };
      openSocket(false);
    });
    microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (signal?.aborted) throw new Error("Voice stopped");
    context = new AudioContext();
    source = context.createMediaStreamSource(microphone);
    processor = context.createScriptProcessor(2048, 1, 1);
    silence = context.createGain();
    silence.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      const pcm = encodePcm(
        event.inputBuffer.getChannelData(0),
        event.inputBuffer.sampleRate,
      );
      socket.send(
        JSON.stringify({
          realtimeInput: {
            audio: { data: pcm, mimeType: "audio/pcm;rate=16000" },
          },
        }),
      );
    };
    source.connect(processor);
    processor.connect(silence);
    silence.connect(context.destination);
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
