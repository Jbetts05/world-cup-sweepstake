import { app } from "@azure/functions";
import { jsonResponse, parseJsonBody } from "../lib/http";
import {
  isClientTelemetryEventName,
  sanitizeTelemetryProperties,
  trackEvent,
} from "../lib/telemetry";

app.http("clientTelemetry", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "telemetry",
  handler: async (request) => {
    const body = await parseJsonBody(request);
    const eventName = typeof body.eventName === "string" ? body.eventName : "";

    if (!isClientTelemetryEventName(eventName)) {
      return jsonResponse({ message: "Unsupported telemetry event." }, 400);
    }

    trackEvent(`client_${eventName}`, sanitizeTelemetryProperties(body.properties));

    return jsonResponse({ ok: true }, 202);
  },
});
