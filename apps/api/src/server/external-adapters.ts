// Creates external integration adapters used by API routes and run pipelines.
import {
  createRealLlmTransport,
  type LlmTransport,
} from "../llm.js";
import {
  createInMemoryLlmScheduler,
  createLlmSchedulerLimitsFromEnv,
  type LlmScheduler,
} from "../adapters/llm/llm-scheduler.js";
import {
  createRenderClient,
  type AnyPlantUmlArtifact,
  type RenderClient,
} from "../adapters/render/render-client.js";
import {
  createPngRenderClient,
  type PngRenderClient,
} from "../adapters/render/png-render-client.js";
import {
  createMailAdapterFromEnv,
  type MailAdapter,
} from "../mail/mail-adapter.js";
import { DEFAULT_RENDER_SERVICE_BASE_URL } from "./defaults.js";

export type ApiExternalAdapterOverrides = {
  llmTransport?: LlmTransport;
  llmScheduler?: LlmScheduler;
  renderClient?: RenderClient;
  pngRenderClient?: PngRenderClient;
  renderServiceBaseUrl?: string;
  mailAdapter?: MailAdapter;
};

export type ApiExternalAdapters = {
  llmTransport: LlmTransport;
  llmScheduler: LlmScheduler;
  renderServiceBaseUrl: string;
  renderClient: RenderClient;
  pngRenderClient: PngRenderClient;
  mailAdapter: MailAdapter;
};

export function createApiExternalAdapters(
  overrides: ApiExternalAdapterOverrides = {},
): ApiExternalAdapters {
  const llmTransport =
    overrides.llmTransport ??
    createRealLlmTransport();
  const llmScheduler =
    overrides.llmScheduler ??
    createInMemoryLlmScheduler(createLlmSchedulerLimitsFromEnv());
  const renderServiceBaseUrl =
    overrides.renderServiceBaseUrl ?? DEFAULT_RENDER_SERVICE_BASE_URL;
  const renderClient: RenderClient =
    overrides.renderClient ??
    ((artifact: AnyPlantUmlArtifact) =>
      createRenderClient(renderServiceBaseUrl, artifact));
  const pngRenderClient: PngRenderClient =
    overrides.pngRenderClient ??
    ((artifact: AnyPlantUmlArtifact) =>
      createPngRenderClient(renderServiceBaseUrl, artifact));
  const mailAdapter = overrides.mailAdapter ?? createMailAdapterFromEnv();

  return {
    llmTransport,
    llmScheduler,
    renderServiceBaseUrl,
    renderClient,
    pngRenderClient,
    mailAdapter,
  };
}
