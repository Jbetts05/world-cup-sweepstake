import { app, type InvocationContext, type Timer } from "@azure/functions";
import { syncGroupStandingsFromFixture, syncMatchesFromFixture } from "../lib/store";

app.timer("scheduledTournamentSync", {
  schedule: "0 */20 * * * *",
  handler: scheduledTournamentSync,
});

export async function scheduledTournamentSync(
  _timer: Timer,
  context: InvocationContext,
): Promise<void> {
  const now = new Date();
  const parts = getLondonTimeParts(now);

  if (!shouldRunMatchSync(parts) && !shouldRunGroupSync(parts)) {
    context.log("Skipping WC2026 sync outside the tournament sync window.");

    return;
  }

  if (shouldRunMatchSync(parts)) {
    context.log("Syncing WC2026 matches.");
    await syncMatchesFromFixture();
  }

  if (shouldRunGroupSync(parts)) {
    context.log("Syncing WC2026 group standings.");
    await syncGroupStandingsFromFixture();
  }
}

export interface LondonTimeParts {
  hour: number;
  minute: number;
}

export function shouldRunMatchSync(parts: LondonTimeParts): boolean {
  return parts.hour >= 17 || parts.hour < 5;
}

export function shouldRunGroupSync(parts: LondonTimeParts): boolean {
  return parts.minute === 0 && [17, 21, 1, 5].includes(parts.hour);
}

function getLondonTimeParts(date: Date): LondonTimeParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
  };
}
