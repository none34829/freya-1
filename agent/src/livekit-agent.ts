import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { logger } from './logger.js';
import * as silero from '@livekit/agents-plugin-silero';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as NoiseCancellation from '@livekit/noise-cancellation-node';

dotenv.config();

class FreyaAssistant extends voice.Agent {
  constructor(instructions?: string) {
    super({
      instructions: instructions || `You are Freya, a helpful AI assistant.
        You eagerly assist users with their questions by providing information from your extensive knowledge.
        Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
        You are curious, friendly, and have a sense of humor.`,
    });
  }
}

console.info('🚀 LiveKit Agent module loaded');

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    console.info('🔄 Prewarming LiveKit Agent...');
    // Preload VAD model for better performance
    proc.userData.vad = await silero.VAD.load();
    logger.info('VAD model preloaded');
    console.info('✅ LiveKit Agent prewarmed and ready');
  },
  entry: async (ctx: JobContext) => {
    console.info('🎤 LiveKit Agent entry point called');
    logger.info('LiveKit Agent starting');

    const vad = ctx.proc.userData.vad! as silero.VAD;

    // Get prompt instructions from room metadata or use default
    let promptInstructions: string | undefined;
    
    console.info('🔍 Checking room and participant metadata...');
    console.info('🔍 Room metadata (ctx.room):', ctx.room.metadata);
    // Some LiveKit agent runtimes pass initial room metadata on the job payload
    // rather than hydrating ctx.room.metadata. Check both.
    const jobRoomMetadata = (ctx as { job?: { room?: { metadata?: string } } })?.job?.room?.metadata;
    console.info('🔍 Room metadata (ctx.job.room):', jobRoomMetadata);
    console.info('🔍 Remote participants count:', ctx.room.remoteParticipants.size);
    
    // First check room metadata (prefer ctx.room, then job.room)
    const roomMetaRaw = ctx.room?.metadata ?? jobRoomMetadata;
    if (roomMetaRaw) {
      try {
        const roomMeta = JSON.parse(roomMetaRaw);
        if (roomMeta?.promptInstructions) {
          promptInstructions = roomMeta.promptInstructions as string;
          console.info('✅ Found promptInstructions in room metadata:', promptInstructions);
        }
      } catch (e) {
        console.warn('❌ Failed to parse room metadata:', e);
      }
    }
    
    // Then check existing participants
    if (!promptInstructions) {
      for (const participant of ctx.room.remoteParticipants.values()) {
        console.info(`🔍 Participant: ${participant.identity}, metadata: ${participant.metadata}`);
        if (participant.metadata) {
          try {
            const metadata = JSON.parse(participant.metadata);
            console.info('🔍 Parsed participant metadata:', metadata);
            if (metadata.promptInstructions) {
              promptInstructions = metadata.promptInstructions;
              console.info('✅ Found promptInstructions in participant metadata:', promptInstructions);
              break;
            }
          } catch (e) {
            console.warn('❌ Failed to parse participant metadata:', e);
          }
        }
      }
    }
    
    console.info('🎯 Final promptInstructions:', promptInstructions);
    
    const assistant = new FreyaAssistant(promptInstructions);

    const session = new voice.AgentSession({
      vad,
      stt: "assemblyai/universal-streaming:en",
      llm: "openai/gpt-4.1-mini",
      tts: "cartesia/sonic-2:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
      turnDetection: new livekit.turnDetector.MultilingualModel(),
    });

    await session.start({
      agent: assistant,
      room: ctx.room,
      inputOptions: {
        // Use background voice cancellation for better audio quality
        noiseCancellation: NoiseCancellation.BackgroundVoiceCancellation(),
      },
    });

    await ctx.connect();

    // Generate initial greeting
    await session.say('Greet the user warmly and offer your assistance. Keep it brief and friendly.');

    ctx.room.on('trackPublished', (publication: unknown, participant: unknown) => {
      const pub = publication as { source: string };
      const part = participant as { identity: string };
      console.info(`🎵 Track published: ${pub.source} from ${part.identity}`);
      if (pub.source === 'microphone') {
        console.info('🎤 Microphone track detected!');
      }
    });

    ctx.room.on('trackSubscribed', (track: unknown, publication: unknown, participant: unknown) => {
      const pub = publication as { source: string };
      const part = participant as { identity: string };
      console.info(`🔊 Track subscribed: ${pub.source} from ${part.identity}`);
      if (pub.source === 'microphone') {
        console.info('🎤 Microphone audio received!');
      }
    });

    // Add participant event debugging
    ctx.room.on('participantConnected', (participant: { identity: string; metadata?: string }) => {
      console.info(`👤 Participant connected: ${participant.identity}`);
      console.info(`👤 Participant metadata: ${participant.metadata}`);
      
      // Log if we find prompt instructions in late-joining participant
      if (participant.metadata) {
        try {
          const metadata = JSON.parse(participant.metadata);
          if (metadata.promptInstructions) {
            console.info('🔄 Found promptInstructions in late-joining participant:', metadata.promptInstructions);
            console.info('⚠️ Agent already created with default prompt - restart session to use custom prompt');
          }
        } catch (e) {
          console.warn('❌ Failed to parse new participant metadata:', e);
        }
      }
      
      logger.info(`Participant connected: ${participant.identity}`);
    });

    ctx.room.on('participantDisconnected', (participant: { identity: string }) => {
      console.info(`👤 Participant disconnected: ${participant.identity}`);
      logger.info(`Participant disconnected: ${participant.identity}`);
    });

    logger.info('LiveKit Agent session started successfully');
  },
});

// Always run CLI when this file is executed
console.info('🔗 Starting LiveKit CLI...');
cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
