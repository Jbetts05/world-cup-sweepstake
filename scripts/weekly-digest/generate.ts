import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PublicTournamentState } from "../../packages/shared/src/index.ts";
import {
  buildWeeklyDigest,
  type DigestOptions,
  type DigestSnapshot,
} from "./digest.ts";

const defaultStateUrl = "https://jolly-desert-0b02b8a03.7.azurestaticapps.net/api/state";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run") || process.env.DIGEST_DRY_RUN === "1";
  const outputDir = process.env.DIGEST_OUTPUT_DIR ?? "weekly-summaries";
  const stateUrl = process.env.DIGEST_STATE_URL ?? defaultStateUrl;
  const options: DigestOptions = {
    runDate: process.env.RUN_DATE ? new Date(process.env.RUN_DATE) : new Date(),
    timezone: process.env.DIGEST_TIMEZONE ?? "Europe/London",
    daysBack: Number(process.env.DIGEST_DAYS_BACK ?? 7),
    daysAhead: Number(process.env.DIGEST_DAYS_AHEAD ?? 7),
    topRankingsCount: Number(process.env.DIGEST_TOP_RANKINGS ?? 48),
  };

  if (Number.isNaN(options.runDate.getTime())) {
    throw new Error(`Invalid RUN_DATE "${process.env.RUN_DATE}". Use an ISO timestamp or yyyy-mm-dd value.`);
  }

  const state = await fetchTournamentState(stateUrl);
  const previousSnapshot = await findLatestPreviousSnapshot(outputDir);
  const digest = buildWeeklyDigest(state, previousSnapshot, options);
  await writeGitHubOutput("digest_date", digest.outputDate);

  if (dryRun) {
    console.log(digest.markdown);
    return;
  }

  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "state"), { recursive: true });
  await writeFile(join(outputDir, `${digest.outputDate}.md`), digest.markdown, "utf8");
  await writeFile(join(outputDir, `${digest.outputDate}.txt`), digest.plaintext, "utf8");
  await writeFile(
    join(outputDir, "state", `${digest.outputDate}.json`),
    `${JSON.stringify(digest.snapshot, null, 2)}\n`,
    "utf8",
  );

  console.log(`Generated weekly digest for ${digest.outputDate}.`);
}

async function fetchTournamentState(url: string): Promise<PublicTournamentState> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`State endpoint returned ${response.status}.`);
      }

      return (await response.json()) as PublicTournamentState;
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Unable to fetch tournament state: ${lastError.message}`
      : "Unable to fetch tournament state.",
  );
}

async function findLatestPreviousSnapshot(outputDir: string): Promise<DigestSnapshot | undefined> {
  const stateDir = join(outputDir, "state");

  try {
    const files = (await readdir(stateDir))
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .toSorted((a, b) => b.localeCompare(a));

    for (const file of files) {
      const snapshot = JSON.parse(await readFile(join(stateDir, file), "utf8")) as DigestSnapshot;

      if (snapshot.schemaVersion === 1) {
        return snapshot;
      }
    }
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return undefined;
    }

    throw error;
  }

  return undefined;
}

function isMissingDirectoryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function writeGitHubOutput(name: string, value: string): Promise<void> {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
