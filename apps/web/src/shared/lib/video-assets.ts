// Resolves public OSS video URLs while allowing deploy-time Vite overrides.
const DEFAULT_TUTORIAL_QUICK_START_VIDEO_URL =
  "https://guolola.oss-cn-hangzhou.aliyuncs.com/video/%E9%A1%B9%E7%9B%AE%E6%BC%94%E7%A4%BA.mp4";
const DEFAULT_WORKFLOW_CHAIN_VIDEO_URL =
  "https://guolola.oss-cn-hangzhou.aliyuncs.com/video/trusted-chain-demo.mp4";
const DEFAULT_MARKETING_PROMO_VIDEO_URL =
  "https://guolola.oss-cn-hangzhou.aliyuncs.com/video/trusted-chain-evidence-film.mp4";

function envVideoUrl(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

export const TUTORIAL_QUICK_START_VIDEO_URL = envVideoUrl(
  import.meta.env.VITE_TUTORIAL_QUICK_START_VIDEO_URL,
  DEFAULT_TUTORIAL_QUICK_START_VIDEO_URL,
);

export const MARKETING_PROMO_VIDEO_URL = envVideoUrl(
  import.meta.env.VITE_MARKETING_PROMO_VIDEO_URL,
  DEFAULT_MARKETING_PROMO_VIDEO_URL,
);

export const WORKFLOW_CHAIN_VIDEO_URL = envVideoUrl(
  import.meta.env.VITE_WORKFLOW_CHAIN_VIDEO_URL,
  DEFAULT_WORKFLOW_CHAIN_VIDEO_URL,
);
