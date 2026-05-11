export const clientTelemetryEvents = [
  "page_view",
  "organiser_opened",
  "sync_clicked",
  "draw_clicked",
  "bracket_viewed",
] as const;

export type ClientTelemetryEventName = (typeof clientTelemetryEvents)[number];
const clientTelemetryEventSet = new Set<string>(clientTelemetryEvents);

export function isClientTelemetryEventName(value: string): value is ClientTelemetryEventName {
  return clientTelemetryEventSet.has(value);
}

export function trackEvent(
  name: string,
  properties: Record<string, string> = {},
  measurements?: Record<string, number>,
): void {
  console.info("telemetry_event", JSON.stringify({
    name,
    properties,
    measurements: measurements ?? {},
  }));
}

export function sanitizeTelemetryProperties(input: unknown): Record<string, string> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  const properties: Record<string, string> = {};

  for (const [key, value] of Object.entries(input).slice(0, 12)) {
    if (!/^[a-zA-Z0-9_.-]{1,48}$/.test(key)) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      properties[key] = String(value).slice(0, 120);
    }
  }

  return properties;
}
