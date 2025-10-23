"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, Track } from "livekit-client";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import type { AuthenticatedUser } from "@/lib/types";

interface VoiceChatProps {
  user: AuthenticatedUser;
  sessionId: string;
  promptInstructions?: string;
  disabled?: boolean;
}

type VoiceState = "idle" | "connecting" | "connected" | "recording" | "processing";

export function VoiceChat({ user, sessionId, promptInstructions, disabled }: VoiceChatProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(false);
  const [isPttActive, setIsPttActive] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Initialize LiveKit room connection
  const connectToRoom = useCallback(async () => {
    if (voiceState === "connecting" || voiceState === "connected") {
      return;
    }

    setVoiceState("connecting");

    try {
      // Get LiveKit token from our API
      const tokenResponse = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          identity: `user-${user.id}`,
          promptInstructions
        })
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get LiveKit token");
      }

      const { token, url } = await tokenResponse.json();

      // The LiveKit Agent will be automatically dispatched when we join the room
      // due to the RoomConfiguration we set in the token

      // Connect to LiveKit room
      const room = new Room();
      roomRef.current = room;

      // Set up event listeners
      room.on(RoomEvent.Connected, () => {
        setVoiceState("connected");
        toast.success("Voice chat connected");
      });

      room.on(RoomEvent.Disconnected, () => {
        setVoiceState("idle");
        toast.info("Voice chat disconnected");
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio && participant.identity.startsWith("agent-")) {
          // This is audio from the agent
          const audioElement = track.attach();
          audioElement.play();
          if (audioElementRef.current) {
            audioElementRef.current.remove();
          }
          audioElementRef.current = audioElement;
          document.body.appendChild(audioElement);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
      });

      // Connect to the room
      await room.connect(url, token);

    } catch (error) {
      console.error("Failed to connect to voice chat:", error);
      toast.error("Failed to connect to voice chat");
      setVoiceState("idle");
    }
  }, [sessionId, user.id, voiceState, promptInstructions]);

  // Disconnect from room
  const disconnectFromRoom = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }
    setVoiceState("idle");
  }, []);

  // Enable microphone for voice chat
  const enableMicrophone = useCallback(async () => {
    if (!roomRef.current) return;

    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
      toast.success("Microphone enabled - you can now speak to the agent");
    } catch (error) {
      console.error("Failed to enable microphone:", error);
      toast.error("Failed to enable microphone");
    }
  }, []);

  // Disable microphone
  const disableMicrophone = useCallback(async () => {
    if (!roomRef.current) return;

    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      setIsMuted(true);
      toast.info("Microphone disabled");
    } catch (error) {
      console.error("Failed to disable microphone:", error);
      toast.error("Failed to disable microphone");
    }
  }, []);

  // PTT keyboard controls (Space to talk)
  useEffect(() => {
    if (!pttEnabled || voiceState !== "connected") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsPttActive(true);
        roomRef.current?.localParticipant
          .setMicrophoneEnabled(true)
          .then(() => setIsMuted(false))
          .catch((err) => console.error("PTT enable mic failed", err));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsPttActive(false);
        roomRef.current?.localParticipant
          .setMicrophoneEnabled(false)
          .then(() => setIsMuted(true))
          .catch((err) => console.error("PTT disable mic failed", err));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [pttEnabled, voiceState]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.setMicrophoneEnabled(isMuted);
        setIsMuted(!isMuted);
      } catch (error) {
        console.error("Failed to toggle mute:", error);
      }
    }
  }, [isMuted]);

  // Toggle deafen
  const toggleDeafen = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.muted = !isDeafened;
      setIsDeafened(!isDeafened);
    }
  }, [isDeafened]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromRoom();
    };
  }, [disconnectFromRoom]);

  const isConnected = voiceState === "connected";
  const isConnecting = voiceState === "connecting";

  return (
    <div className="flex items-center gap-2 p-2 border-t border-slate-800">
      <div className="flex items-center gap-2">
        {!isConnected && !isConnecting && (
          <button
            onClick={connectToRoom}
            disabled={disabled}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Volume2 className="w-4 h-4" />
            Connect Voice
          </button>
        )}

        {isConnecting && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            Connecting...
          </div>
        )}

        {isConnected && (
          <>
            <button
              onClick={() => {
                setPttEnabled((prev) => {
                  const next = !prev;
                  if (next) {
                    // Turning PTT on: force mic off until pressed
                    roomRef.current?.localParticipant
                      .setMicrophoneEnabled(false)
                      .then(() => setIsMuted(true))
                      .catch(() => {});
                  }
                  return next;
                });
              }}
              className={`p-2 rounded-lg ${
                pttEnabled ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
              title={pttEnabled ? "PTT enabled (hold Space or button to talk)" : "Enable Push-to-Talk"}
            >
              {pttEnabled ? "PTT On" : "PTT Off"}
            </button>

            <button
              disabled={!pttEnabled}
              onMouseDown={async () => {
                if (!pttEnabled) return;
                try {
                  await roomRef.current?.localParticipant.setMicrophoneEnabled(true);
                  setIsMuted(false);
                  setIsPttActive(true);
                } catch (e) {
                  console.error(e);
                }
              }}
              onMouseUp={async () => {
                if (!pttEnabled) return;
                try {
                  await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
                  setIsMuted(true);
                  setIsPttActive(false);
                } catch (e) {
                  console.error(e);
                }
              }}
              onMouseLeave={async () => {
                if (!pttEnabled || !isPttActive) return;
                try {
                  await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
                  setIsMuted(true);
                  setIsPttActive(false);
                } catch (e) {
                  console.error(e);
                }
              }}
              className={`px-3 py-2 text-sm font-medium rounded-lg ${
                !pttEnabled
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : isPttActive
                  ? "bg-green-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
              title="Hold to talk (also works with Space key)"
            >
              Hold to Talk
            </button>

            <button
              onClick={toggleMute}
              disabled={pttEnabled}
              className={`p-2 rounded-lg ${
                pttEnabled
                  ? "bg-slate-900 text-slate-600 cursor-not-allowed"
                  : isMuted
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={toggleDeafen}
              className={`p-2 rounded-lg ${
                isDeafened 
                  ? "bg-red-600 text-white hover:bg-red-700" 
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
              title={isDeafened ? "Undeafen" : "Deafen"}
            >
              {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              onClick={isMuted ? enableMicrophone : disableMicrophone}
              disabled={pttEnabled}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                pttEnabled
                  ? "bg-slate-900 text-slate-600 cursor-not-allowed"
                  : isMuted
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {isMuted ? "Enable Microphone" : "Disable Microphone"}
            </button>

            <button
              onClick={disconnectFromRoom}
              className="px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700"
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      <div className="flex-1" />

      <div className="text-xs text-slate-500">
        {voiceState === "idle" && "Voice chat disconnected"}
        {voiceState === "connecting" && "Connecting to voice chat..."}
        {voiceState === "connected" && "Voice chat ready"}
        {voiceState === "recording" && "Recording..."}
        {voiceState === "processing" && "Processing voice..."}
      </div>
    </div>
  );
}
