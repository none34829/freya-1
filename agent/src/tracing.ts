import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getConfig } from './config.js';

let sdk: NodeSDK | null = null;
const tracer = trace.getTracer('freya-agent');

function parseHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) {
    return undefined;
  }

  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((header) => {
      const [key, ...rest] = header.split('=');
      if (!key || rest.length === 0) {
        return null;
      }
      return [key.trim(), rest.join('=').trim()];
    })
    .filter((entry): entry is [string, string] => Array.isArray(entry) && entry[0].length > 0 && entry[1].length > 0);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export async function initTracing(): Promise<void> {
  const config = getConfig();
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? config.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return;
  }

  if (sdk) {
    return;
  }

  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS ?? config.OTEL_EXPORTER_OTLP_HEADERS);

  const exporter = new OTLPTraceExporter({
    url: endpoint,
    headers
  });

  sdk = new NodeSDK({
    traceExporter: exporter,
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ?? config.OTEL_SERVICE_NAME ?? 'freya-agent'
    })
  });

  await sdk.start();
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return;
  }

  await sdk.shutdown().catch(() => undefined);
  sdk = null;
}

export function getTracer() {
  return tracer;
}
