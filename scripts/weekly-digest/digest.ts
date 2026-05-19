import type {
  LeaderboardEntry,
  Match,
  Participant,
  PublicTournamentState,
  Standing,
  Team,
} from "../../packages/shared/src/index.ts";

export interface DigestOptions {
  runDate: Date;
  timezone: string;
  daysBack: number;
  daysAhead: number;
  topRankingsCount: number;
}

export interface DigestSnapshotEntry {
  participantId: string;
  participantName: string;
  teamId: string;
  teamName: string;
  fifaCode: string;
  group: string;
  stage: string;
  status: string;
  overallPosition: number;
  groupPosition?: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
}

export interface DigestSnapshot {
  schemaVersion: 1;
  runDate: string;
  generatedAt: string;
  phase: "group" | "knockout";
  entries: DigestSnapshotEntry[];
}

export interface WeeklyDigest {
  markdown: string;
  plaintext: string;
  snapshot: DigestSnapshot;
  outputDate: string;
}

const stageLabels: Record<string, string> = {
  group: "Group stage",
  "round-of-32": "Round of 32",
  "round-of-16": "Round of 16",
  "quarter-final": "Quarter-finals",
  "semi-final": "Semi-finals",
  "third-place": "Third-place match",
  final: "Final",
  champion: "Champion",
  eliminated: "Eliminated",
};

const qualificationLabels: Record<string, string> = {
  pending: "Pending",
  qualified: "Qualified",
  "best-third-watch": "Best third-place watch",
  eliminated: "Eliminated",
};

export function buildWeeklyDigest(
  state: PublicTournamentState,
  previousSnapshot: DigestSnapshot | undefined,
  options: DigestOptions,
): WeeklyDigest {
  const outputDate = formatDateInTimeZone(options.runDate, options.timezone);
  const phase = isGroupStageComplete(state) ? "knockout" : "group";
  const snapshot = buildDigestSnapshot(state, options, phase);
  const previousEntries = new Map(previousSnapshot?.entries.map((entry) => [entry.participantId, entry]));
  const completedMatches = matchesInWindow(state.matches, options.runDate, -options.daysBack, 0)
    .filter((match) => match.status === "full-time" && match.score);
  const upcomingMatches = matchesInWindow(state.matches, options.runDate, 0, options.daysAhead)
    .filter((match) => match.status !== "full-time");
  const title = `Weekly Sweepstake Digest - ${outputDate}`;
  const lines = [
    `# ${title}`,
    "",
    `Generated from cached tournament state on ${formatDateTime(options.runDate, options.timezone)}.`,
    "",
    ...buildHeadlineSection(state, phase, snapshot, previousEntries, previousSnapshot),
    ...buildRankingSection(state, snapshot, previousEntries, phase, options),
    ...buildResultsSection(state, completedMatches),
    ...buildSidePrizeSection(state),
    ...buildUpcomingSection(state, upcomingMatches, options),
    ...buildNotesSection(state, previousSnapshot),
  ];
  const markdown = `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;

  return {
    markdown,
    plaintext: markdownToPlaintext(markdown),
    snapshot,
    outputDate,
  };
}

export function buildDigestSnapshot(
  state: PublicTournamentState,
  options: DigestOptions,
  phase: "group" | "knockout" = isGroupStageComplete(state) ? "knockout" : "group",
): DigestSnapshot {
  const standingByTeamId = new Map(state.standings.map((standing) => [standing.teamId, standing]));
  const groupPositions = buildGroupPositionMap(state);

  return {
    schemaVersion: 1,
    runDate: formatDateInTimeZone(options.runDate, options.timezone),
    generatedAt: new Date().toISOString(),
    phase,
    entries: state.leaderboard.map((entry, index) => ({
      participantId: entry.participant.id,
      participantName: entry.participant.fullName,
      teamId: entry.team.id,
      teamName: entry.team.name,
      fifaCode: entry.team.fifaCode,
      group: entry.team.group,
      stage: entry.stage,
      status: entry.status,
      overallPosition: index + 1,
      ...(groupPositions.get(entry.team.id) ? { groupPosition: groupPositions.get(entry.team.id) } : {}),
      points: standingByTeamId.get(entry.team.id)?.points ?? entry.points,
      goalDifference: standingByTeamId.get(entry.team.id)?.goalDifference ?? entry.goalDifference,
      goalsFor: standingByTeamId.get(entry.team.id)?.goalsFor ?? entry.goalsFor,
    })),
  };
}

export function markdownToPlaintext(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^\|[-:| ]+\|\s*$/gm, "")
    .replace(/^\|/gm, "")
    .replace(/\|$/gm, "")
    .replace(/\s+\|\s+/g, " | ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .concat("\n");
}

function buildHeadlineSection(
  state: PublicTournamentState,
  phase: "group" | "knockout",
  snapshot: DigestSnapshot,
  previousEntries: Map<string, DigestSnapshotEntry>,
  previousSnapshot: DigestSnapshot | undefined,
): string[] {
  if (!state.draw) {
    return [
      "## Headline",
      "",
      "The draw has not been run yet, so this digest is a setup snapshot rather than a results update.",
      "",
    ];
  }

  if (phase === "group") {
    const groupsWithAssignedTeams = new Set(snapshot.entries.map((entry) => entry.group));

    return [
      "## Headline",
      "",
      `The sweepstake is still in the group stage, with assigned teams active across ${groupsWithAssignedTeams.size} group(s). The digest is group-first until group-stage qualification is complete.`,
      "",
    ];
  }

  const leader = snapshot.entries[0];
  const biggestMover = findBiggestMover(snapshot.entries, previousEntries);
  const moverCopy = biggestMover
    ? ` Biggest movement: ${biggestMover.participantName} (${biggestMover.fifaCode}) climbed ${biggestMover.movement} place(s).`
    : previousSnapshot
      ? " No leaderboard movement since the last merged digest snapshot."
      : " This is the baseline leaderboard snapshot.";

  return [
    "## Headline",
    "",
    leader
      ? `${leader.participantName} leads with ${leader.teamName} (${leader.fifaCode}) at ${stageLabels[leader.stage] ?? leader.stage}.${moverCopy}`
      : "The draw is locked, but there are no leaderboard entries yet.",
    "",
  ];
}

function buildRankingSection(
  state: PublicTournamentState,
  snapshot: DigestSnapshot,
  previousEntries: Map<string, DigestSnapshotEntry>,
  phase: "group" | "knockout",
  options: DigestOptions,
): string[] {
  if (!state.draw) {
    return [
      "## Rankings",
      "",
      "No rankings yet. Add entrants and run the draw before the tournament starts.",
      "",
    ];
  }

  if (phase === "group") {
    return buildGroupRankingSection(state, snapshot, previousEntries);
  }

  return [
    "## Overall leaderboard",
    "",
    "| Rank | Entrant | Country | Stage | Pts | GD | Movement |",
    "|---:|---|---|---|---:|---:|---|",
    ...snapshot.entries.slice(0, options.topRankingsCount).map((entry) => {
      const previous = previousEntries.get(entry.participantId);

      return `| ${entry.overallPosition} | ${entry.participantName} | ${entry.teamName} (${entry.fifaCode}) | ${stageLabels[entry.stage] ?? entry.stage} | ${entry.points} | ${formatSignedNumber(entry.goalDifference)} | ${formatMovement(previous?.overallPosition, entry.overallPosition)} |`;
    }),
    "",
  ];
}

function buildGroupRankingSection(
  state: PublicTournamentState,
  snapshot: DigestSnapshot,
  previousEntries: Map<string, DigestSnapshotEntry>,
): string[] {
  const participantByTeamId = buildParticipantByTeamId(state);
  const lines = [
    "## Group-stage picture",
    "",
    "Group-stage digests are grouped by table. The overall leaderboard starts after group-stage qualification is complete.",
    "",
  ];

  for (const group of getGroups(state)) {
    const standings = state.standings
      .filter((standing) => standing.group === group)
      .toSorted((a, b) => a.rank - b.rank);

    lines.push(`### Group ${group}`, "");
    lines.push("| Pos | Country | Entrant | Pts | GD | Status | Movement |");
    lines.push("|---:|---|---|---:|---:|---|---|");

    for (const standing of standings) {
      const team = getTeam(state, standing.teamId);
      const participant = participantByTeamId.get(standing.teamId);
      const entry = participant ? snapshot.entries.find((item) => item.participantId === participant.id) : undefined;
      const previous = entry ? previousEntries.get(entry.participantId) : undefined;

      lines.push(`| ${standing.rank} | ${team ? `${team.name} (${team.fifaCode})` : standing.teamId} | ${participant?.fullName ?? "Unassigned"} | ${standing.points} | ${formatSignedNumber(standing.goalDifference)} | ${qualificationLabels[standing.qualificationState] ?? standing.qualificationState} | ${entry ? formatMovement(previous?.groupPosition, entry.groupPosition) : "-"} |`);
    }

    lines.push("");
  }

  return lines;
}

function buildResultsSection(state: PublicTournamentState, matches: Match[]): string[] {
  const lines = ["## This week's results", ""];

  if (matches.length === 0) {
    lines.push("No completed matches were found in this reporting window.", "");
    return lines;
  }

  for (const match of matches.toSorted((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))) {
    lines.push(`- ${describeResult(state, match)}`);
  }

  lines.push("");

  return lines;
}

function buildSidePrizeSection(state: PublicTournamentState): string[] {
  const heroes = state.sidePrizes.groupStageHeroes.slice(0, 3);
  const woodenSpoon = state.sidePrizes.woodenSpoonWatch.slice(0, 3);
  const lines = ["## Side-prize watch", ""];

  if (heroes.length === 0 && woodenSpoon.length === 0 && !state.sidePrizes.biggestResult && !state.sidePrizes.firstWin) {
    lines.push("Side-prize races will appear once enough results are available.", "");
    return lines;
  }

  if (heroes.length > 0) {
    lines.push(`- Group Stage Heroes: ${heroes.map(formatLeaderboardName).join("; ")}.`);
  }

  if (woodenSpoon.length > 0) {
    lines.push(`- Wooden Spoon watch: ${woodenSpoon.map(formatLeaderboardName).join("; ")}.`);
  }

  if (state.sidePrizes.firstWin) {
    lines.push(`- First win watch: ${describeResult(state, state.sidePrizes.firstWin)}`);
  }

  if (state.sidePrizes.biggestResult) {
    lines.push(`- Biggest result: ${describeResult(state, state.sidePrizes.biggestResult)}`);
  }

  lines.push("");

  return lines;
}

function buildUpcomingSection(state: PublicTournamentState, matches: Match[], options: DigestOptions): string[] {
  const lines = ["## What's next", ""];

  if (matches.length === 0) {
    lines.push(`No upcoming fixtures were found in the next ${options.daysAhead} day(s).`, "");
    return lines;
  }

  for (const match of matches.toSorted((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))) {
    const home = getTeam(state, match.homeTeamId);
    const away = getTeam(state, match.awayTeamId);

    lines.push(`- ${formatDateTime(new Date(match.kickoff), options.timezone)}: ${describeTeamWithParticipant(state, home)} vs ${describeTeamWithParticipant(state, away)}${match.venue ? ` at ${match.venue}` : ""}.`);
  }

  lines.push("");

  return lines;
}

function buildNotesSection(state: PublicTournamentState, previousSnapshot: DigestSnapshot | undefined): string[] {
  const lines = ["## Notes", ""];

  if (!previousSnapshot) {
    lines.push("- This run establishes the baseline snapshot for future movement comparisons.");
  } else {
    lines.push(`- Movement is compared with the latest merged digest snapshot from ${previousSnapshot.runDate}.`);
  }

  if (!state.draw) {
    lines.push("- The draw is not locked yet, so participant/team ranking copy is intentionally limited.");
  }

  lines.push("");

  return lines;
}

function describeResult(state: PublicTournamentState, match: Match): string {
  const home = getTeam(state, match.homeTeamId);
  const away = getTeam(state, match.awayTeamId);
  const homeLabel = describeTeamWithParticipant(state, home);
  const awayLabel = describeTeamWithParticipant(state, away);
  const score = match.score ? `${match.score.home}-${match.score.away}` : "score unavailable";

  if (!match.score || match.score.home === match.score.away || !match.winnerTeamId) {
    return `${homeLabel} drew with ${awayLabel} ${score}.`;
  }

  const homeWon = match.winnerTeamId === match.homeTeamId;
  const winner = homeWon ? homeLabel : awayLabel;
  const loser = homeWon ? awayLabel : homeLabel;

  return `${winner} beat ${loser} ${score}.`;
}

function describeTeamWithParticipant(state: PublicTournamentState, team: Team | undefined): string {
  if (!team) {
    return "Unknown team";
  }

  const participant = buildParticipantByTeamId(state).get(team.id);

  return participant ? `${participant.fullName} (${team.name})` : `${team.name} (unassigned)`;
}

function formatLeaderboardName(entry: LeaderboardEntry): string {
  return `${entry.participant.fullName} (${entry.team.fifaCode})`;
}

function matchesInWindow(matches: Match[], runDate: Date, daysFrom: number, daysTo: number): Match[] {
  const start = runDate.getTime() + daysFrom * 24 * 60 * 60 * 1000;
  const end = runDate.getTime() + daysTo * 24 * 60 * 60 * 1000;

  return matches.filter((match) => {
    const kickoff = Date.parse(match.kickoff);

    return kickoff >= start && kickoff < end;
  });
}

function isGroupStageComplete(state: PublicTournamentState): boolean {
  const groupMatches = state.matches.filter((match) => match.stage === "group");

  return groupMatches.length > 0 && groupMatches.every((match) => match.status === "full-time");
}

function buildParticipantByTeamId(state: PublicTournamentState): Map<string, Participant> {
  const participantById = new Map(state.participants.map((participant) => [participant.id, participant]));
  const participantByTeamId = new Map<string, Participant>();

  for (const assignment of state.assignments) {
    const participant = participantById.get(assignment.participantId);

    if (participant) {
      participantByTeamId.set(assignment.teamId, participant);
    }
  }

  return participantByTeamId;
}

function buildGroupPositionMap(state: PublicTournamentState): Map<string, number> {
  return new Map(state.standings.map((standing) => [standing.teamId, standing.rank]));
}

function getGroups(state: PublicTournamentState): string[] {
  return [...new Set(state.standings.map((standing) => standing.group))].toSorted((a, b) => a.localeCompare(b));
}

function getTeam(state: PublicTournamentState, teamId: string | undefined): Team | undefined {
  return state.teams.find((team) => team.id === teamId);
}

function findBiggestMover(
  entries: DigestSnapshotEntry[],
  previousEntries: Map<string, DigestSnapshotEntry>,
): (DigestSnapshotEntry & { movement: number }) | undefined {
  return entries
    .map((entry) => {
      const previous = previousEntries.get(entry.participantId);
      const movement = previous ? previous.overallPosition - entry.overallPosition : 0;

      return { ...entry, movement };
    })
    .filter((entry) => entry.movement > 0)
    .toSorted((a, b) => b.movement - a.movement)[0];
}

function formatMovement(previousPosition: number | undefined, currentPosition: number | undefined): string {
  if (!previousPosition || !currentPosition) {
    return "Baseline";
  }

  const movement = previousPosition - currentPosition;

  if (movement > 0) {
    return `Up ${movement}`;
  }

  if (movement < 0) {
    return `Down ${Math.abs(movement)}`;
  }

  return "No change";
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatDateInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
