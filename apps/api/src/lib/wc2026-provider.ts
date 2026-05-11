import type { Match, MatchStatus, Standing, Team, TournamentStage } from "@world-cup/shared";

interface Wc2026Snapshot {
  generatedAt: string;
  teams: Team[];
  matches: Match[];
  standings: Standing[];
}

interface Wc2026MatchesSnapshot {
  generatedAt: string;
  matches: Match[];
}

interface Wc2026StandingsSnapshot {
  generatedAt: string;
  standings: Standing[];
}

interface Wc2026TeamRecord {
  id?: number | string;
  name?: string;
  code?: string;
  flag_url?: string | null;
  group_name?: string | null;
  group?: string | { name?: string; group_name?: string };
}

interface Wc2026MatchRecord {
  id?: number | string;
  match_number?: number | string;
  round?: string;
  group?: string | null;
  group_name?: string | null;
  home_team?: string | Wc2026TeamRecord | null;
  away_team?: string | Wc2026TeamRecord | null;
  home_team_code?: string;
  away_team_code?: string;
  home_team_flag?: string | null;
  away_team_flag?: string | null;
  stadium?: string | { name?: string; city?: string; country?: string } | null;
  venue?: string;
  kickoff_utc?: string;
  kickoff?: string;
  status?: string;
  phase?: string;
  home_score?: number | null;
  away_score?: number | null;
  home_pen?: number | null;
  away_pen?: number | null;
}

interface Wc2026StandingRecord {
  team?: string | Wc2026TeamRecord;
  team_code?: string;
  code?: string;
  played?: number;
  w?: number;
  won?: number;
  d?: number;
  drawn?: number;
  l?: number;
  lost?: number;
  gf?: number;
  goals_for?: number;
  ga?: number;
  goals_against?: number;
  gd?: number;
  goal_difference?: number;
  points?: number;
}

interface Wc2026GroupRecord {
  id?: number | string;
  name?: string;
  group_name?: string;
  teams?: Wc2026TeamRecord[];
  standings?: Wc2026StandingRecord[];
}

const defaultBaseUrl = "https://api.wc2026api.com";
const worldCupGroups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export async function fetchWc2026Snapshot(): Promise<Wc2026Snapshot> {
  const [teamsPayload, groupPayloads, matchesPayload] = await Promise.all([
    fetchProviderJson("/teams"),
    fetchWc2026GroupPayloads(),
    fetchProviderJson("/matches"),
  ]);
  const teams = normalizeTeams(extractArray<Wc2026TeamRecord>(teamsPayload));
  const groups = normalizeGroupPayloads(groupPayloads);
  const matches = normalizeMatches(extractArray<Wc2026MatchRecord>(matchesPayload), teams);
  const standings = normalizeStandings(groups, teams);
  const stagedTeams = applyTeamStages(teams, standings, matches);

  return {
    generatedAt: new Date().toISOString(),
    teams: stagedTeams,
    matches,
    standings,
  };
}

export async function fetchWc2026Matches(teams: Team[]): Promise<Wc2026MatchesSnapshot> {
  const matchesPayload = await fetchProviderJson("/matches");

  return {
    generatedAt: new Date().toISOString(),
    matches: normalizeMatches(extractArray<Wc2026MatchRecord>(matchesPayload), teams),
  };
}

export async function fetchWc2026GroupStandings(
  teams: Team[],
): Promise<Wc2026StandingsSnapshot> {
  const groupPayloads = await fetchWc2026GroupPayloads();

  return {
    generatedAt: new Date().toISOString(),
    standings: normalizeStandings(normalizeGroupPayloads(groupPayloads), teams),
  };
}

export function applyProviderTeamStages(
  teams: Team[],
  standings: Standing[],
  matches: Match[],
): Team[] {
  return applyTeamStages(teams, standings, matches);
}

async function fetchWc2026GroupPayloads(): Promise<unknown[]> {
  return Promise.all(worldCupGroups.map((group) => fetchProviderJson(`/groups/${group}`)));
}

async function fetchProviderJson(path: string): Promise<unknown> {
  const apiKey = process.env.WC2026_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("WC2026_API_KEY is not configured.");
  }

  const baseUrl = process.env.WC2026_API_BASE_URL?.trim() || defaultBaseUrl;
  const response = await fetch(new URL(path, ensureTrailingSlash(baseUrl)), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`WC2026 API ${path} failed with ${response.status}.`);
  }

  return response.json();
}

function normalizeTeams(records: Wc2026TeamRecord[]): Team[] {
  return records
    .map((record) => {
      const code = requiredString(record.code, "team code").toUpperCase();
      const group = normalizeGroupName(record.group_name ?? getGroupName(record.group));

      return {
        id: code.toLowerCase(),
        wc2026Id: String(record.id ?? code),
        fifaCode: code,
        name: requiredString(record.name, `team ${code} name`),
        ...(record.flag_url ? { flagUrl: record.flag_url } : {}),
        group,
        qualificationStatus: "pending" as const,
        stage: "group" as const,
      };
    })
    .toSorted((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

function normalizeMatches(records: Wc2026MatchRecord[], teams: Team[]): Match[] {
  const teamByCode = new Map(teams.map((team) => [team.fifaCode, team]));

  return records.flatMap((record, index) => {
    const homeCode = normalizeTeamCode(record.home_team_code ?? getTeamCode(record.home_team));
    const awayCode = normalizeTeamCode(record.away_team_code ?? getTeamCode(record.away_team));

    if (!homeCode || !awayCode) {
      return [];
    }

    const homeTeam = teamByCode.get(homeCode);
    const awayTeam = teamByCode.get(awayCode);

    if (!homeTeam || !awayTeam) {
      throw new Error(`WC2026 match ${record.id ?? index + 1} references unknown teams.`);
    }

    const score = normalizeScore(record);
    const winnerTeamId = score
      ? getWinnerTeamId(
        homeTeam.id,
        awayTeam.id,
        record.home_pen ?? score.home,
        record.away_pen ?? score.away,
      )
      : undefined;

    return [{
      id: String(record.id ?? record.match_number ?? `provider-${index + 1}`),
      stage: normalizeRound(record.round),
      ...(record.group_name ?? record.group
        ? { group: normalizeGroupName(record.group_name ?? record.group) }
        : {}),
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      kickoff: requiredString(record.kickoff_utc ?? record.kickoff, "match kickoff"),
      venue: normalizeVenue(record.stadium ?? record.venue),
      status: normalizeStatus(record.status, record.phase),
      ...(score ? { score } : {}),
      ...(winnerTeamId ? { winnerTeamId } : {}),
    }];
  });
}

function normalizeStandings(groups: Wc2026GroupRecord[], teams: Team[]): Standing[] {
  const standings = groups.flatMap((group) => {
    const groupName = normalizeGroupName(group.name ?? group.group_name ?? group.id);
    const records = group.standings ?? [];

    if (records.length > 0) {
      return records.map((record, index) => normalizeStanding(record, groupName, index + 1));
    }

    return (group.teams ?? [])
      .map((teamRecord, index) => {
        const code = normalizeTeamCode(teamRecord.code);

        return createEmptyStanding(groupName, code.toLowerCase(), index + 1);
      });
  });

  if (standings.length > 0) {
    return standings;
  }

  return teams.map((team, index) => createEmptyStanding(team.group, team.id, index + 1));
}

function normalizeStanding(record: Wc2026StandingRecord, group: string, rank: number): Standing {
  const code = normalizeTeamCode(record.team_code ?? record.code ?? getTeamCode(record.team));
  const won = record.won ?? record.w ?? 0;
  const drawn = record.drawn ?? record.d ?? 0;
  const lost = record.lost ?? record.l ?? 0;
  const goalsFor = record.goals_for ?? record.gf ?? 0;
  const goalsAgainst = record.goals_against ?? record.ga ?? 0;
  const played = record.played ?? won + drawn + lost;

  return {
    group,
    teamId: code.toLowerCase(),
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference: record.goal_difference ?? record.gd ?? goalsFor - goalsAgainst,
    points: record.points ?? won * 3 + drawn,
    rank,
    qualificationState: played > 0
      ? rank <= 2 ? "qualified" : rank === 3 ? "best-third-watch" : "eliminated"
      : "pending",
  };
}

function applyTeamStages(teams: Team[], standings: Standing[], matches: Match[]): Team[] {
  const standingByTeamId = new Map(standings.map((standing) => [standing.teamId, standing]));
  const latestStageByTeamId = new Map<string, TournamentStage>();

  for (const match of matches) {
    if (match.stage === "group") {
      continue;
    }

    latestStageByTeamId.set(match.homeTeamId, match.stage);
    latestStageByTeamId.set(match.awayTeamId, match.stage);
  }

  return teams.map((team) => {
    const standing = standingByTeamId.get(team.id);
    const qualificationStatus = standing?.qualificationState ?? team.qualificationStatus;
    const stage = latestStageByTeamId.get(team.id) ?? qualificationToStage(qualificationStatus);

    return {
      ...team,
      qualificationStatus,
      stage,
    };
  });
}

function qualificationToStage(qualificationState: Team["qualificationStatus"]): TournamentStage {
  if (qualificationState === "qualified") {
    return "round-of-32";
  }

  if (qualificationState === "eliminated") {
    return "eliminated";
  }

  return "group";
}

function createEmptyStanding(group: string, teamId: string, rank: number): Standing {
  return {
    group,
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    rank,
    qualificationState: "pending",
  };
}

function normalizeScore(record: Wc2026MatchRecord): Match["score"] | undefined {
  if (typeof record.home_score !== "number" || typeof record.away_score !== "number") {
    return undefined;
  }

  return {
    home: record.home_score,
    away: record.away_score,
  };
}

function normalizeStatus(status?: string, phase?: string): MatchStatus {
  const normalized = status?.toLowerCase();

  if (normalized === "completed" || normalized === "full-time") {
    return "full-time";
  }

  if (normalized === "live" || (phase && !["PRE", "FT", "FT_PEN"].includes(phase))) {
    return "live";
  }

  return "scheduled";
}

function normalizeRound(round?: string): TournamentStage {
  const normalized = round?.toLowerCase();

  switch (normalized) {
    case "r32":
    case "round-of-32":
      return "round-of-32";
    case "r16":
    case "round-of-16":
      return "round-of-16";
    case "qf":
    case "quarter-final":
    case "quarter-finals":
      return "quarter-final";
    case "sf":
    case "semi-final":
    case "semi-finals":
      return "semi-final";
    case "3rd":
    case "third-place":
      return "third-place";
    case "final":
      return "final";
    default:
      return "group";
  }
}

function normalizeGroupName(value: unknown): string {
  const group = requiredString(value, "group").replace(/^group\s+/i, "").toUpperCase();

  return group.length === 1 ? group : group.slice(-1);
}

function normalizeTeamCode(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().toUpperCase() : "";
}

function normalizeVenue(value: Wc2026MatchRecord["stadium"] | Wc2026MatchRecord["venue"]): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "object" && value) {
    return [value.name, value.city, value.country].filter(Boolean).join(", ");
  }

  return "Venue TBD";
}

function getGroupName(value: Wc2026TeamRecord["group"]): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return value?.name ?? value?.group_name;
}

function getTeamCode(value: Wc2026MatchRecord["home_team"] | Wc2026StandingRecord["team"]): string | undefined {
  if (typeof value === "string") {
    return value.length === 3 ? value : undefined;
  }

  return value?.code;
}

function getWinnerTeamId(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): string | undefined {
  if (homeScore === awayScore) {
    return undefined;
  }

  return homeScore > awayScore ? homeTeamId : awayTeamId;
}

function extractArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    const value = record.data ?? record.items ?? record.results;

    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  throw new Error("WC2026 API returned an unexpected response shape.");
}

function normalizeGroupPayloads(payloads: unknown[]): Wc2026GroupRecord[] {
  return payloads.map((payload, index) => {
    const group = extractGroupRecord(payload);
    const fallbackName = worldCupGroups[index] ?? String(index + 1);

    return {
      ...group,
      name: group.name ?? group.group_name ?? fallbackName,
    };
  });
}

function extractGroupRecord(payload: unknown): Wc2026GroupRecord {
  if (Array.isArray(payload)) {
    const [first] = payload;

    if (isRecord(first)) {
      return first as Wc2026GroupRecord;
    }
  }

  if (isRecord(payload)) {
    const candidates = [payload.data, payload.group, payload.result, payload];

    for (const candidate of candidates) {
      if (isRecord(candidate)) {
        return candidate as Wc2026GroupRecord;
      }
    }
  }

  throw new Error("WC2026 API returned an unexpected group response shape.");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`WC2026 API response is missing ${label}.`);
  }

  const text = String(value).trim();

  if (!text) {
    throw new Error(`WC2026 API response is missing ${label}.`);
  }

  return text;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
