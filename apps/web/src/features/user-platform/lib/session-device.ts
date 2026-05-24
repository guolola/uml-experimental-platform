// Formats stored session user-agent strings for account session displays.
import Bowser from "bowser";

export function formatSessionDevice(userAgent: string | null | undefined) {
  const rawUserAgent = userAgent?.trim();
  if (!rawUserAgent) return "未知设备";

  const parser = Bowser.getParser(rawUserAgent);
  const browserName = parser.getBrowserName().replace(/^Microsoft Edge$/u, "Edge");
  const osName = parser.getOSName();

  if (osName && browserName) return `${osName} • ${browserName}`;
  if (browserName) return browserName;
  if (osName) return osName;
  return "未知设备";
}

export function formatSessionRegion(input: {
  locationLabel?: string | null;
  region?: string | null;
}) {
  return input.locationLabel?.trim() || input.region?.trim() || "未知地区";
}
