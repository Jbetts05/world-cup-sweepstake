import type {
  Assignment,
  Draw,
  LeaderboardEntry,
  Match,
  Participant,
  PublicTournamentState,
  Standing,
  Team,
  TournamentStage,
} from "../types";
import { compareLeaderboard, getStageRank, getStandingForTeam, getTeamStatus } from "./progression";

export interface TournamentStateInput {
  generatedAt: string;
  currentStage?: TournamentStage;
  draw?: Draw;
  participants: Participant[];
  teams: Team[];
  assignments: Assignment[];
  matches: Match[];
  standings: Standing[];
  source?: PublicTournamentState["metadata"]["source"];
  totalTeamSlots?: number;
}

export function buildPublicTournamentState(input: TournamentStateInput): PublicTournamentState {
  const leaderboard = buildLeaderboard(input);
  const biggestResult = findBiggestResult(input.matches);
  const firstWin = input.matches.find((match) => match.status === "full-time" && match.winnerTeamId);

  return {
    generatedAt: input.generatedAt,
    currentStage: input.currentStage ?? inferCurrentStage(input.matches),
    ...(input.draw ? { draw: input.draw } : {}),
    participants: input.participants,
    teams: input.teams,
    assignments: input.assignments,
    matches: input.matches,
    standings: input.standings,
    leaderboard,
    sidePrizes: {
      groupStageHeroes: leaderboard.filter((entry) => entry.stage === "group").slice(0, 3),
      woodenSpoonWatch: leaderboard.filter((entry) => entry.status === "eliminated").slice(-3).reverse(),
      ...(biggestResult ? { biggestResult } : {}),
      ...(firstWin ? { firstWin } : {}),
    },
    metadata: {
      source: input.source ?? "fixture",
      provider: "WC2026 API",
      syncCadence: "hourly",
      totalTeamSlots: input.totalTeamSlots ?? 48,
      assignedTeamCount: input.assignments.length,
    },
  };
}

function buildLeaderboard(input: TournamentStateInput): LeaderboardEntry[] {
  const participantById = new Map(input.participants.map((participant) => [participant.id, participant]));
  const teamById = new Map(input.teams.map((team) => [team.id, team]));

  return input.assignments
    .map((assignment) => {
      const participant = participantById.get(assignment.participantId);
      const team = teamById.get(assignment.teamId);

      if (!participant || !team) {
        throw new Error(`Invalid assignment ${assignment.participantId}:${assignment.teamId}`);
      }

      const standing = getStandingForTeam(input.standings, team.id);

      return {
        participant,
        team,
        stage: team.stage,
        stageRank: getStageRank(team.stage),
        points: standing?.points ?? 0,
        goalDifference: standing?.goalDifference ?? 0,
        goalsFor: standing?.goalsFor ?? 0,
        status: getTeamStatus(team),
      };
    })
    .sort(compareLeaderboard);
}

function inferCurrentStage(matches: Match[]): TournamentStage {
  const liveMatch = matches.find((match) => match.status === "live");

  return liveMatch?.stage ?? "group";
}

function findBiggestResult(matches: Match[]): Match | undefined {
  return matches
    .filter((match) => match.score)
    .toSorted((a, b) => {
      const aMargin = Math.abs((a.score?.home ?? 0) - (a.score?.away ?? 0));
      const bMargin = Math.abs((b.score?.home ?? 0) - (b.score?.away ?? 0));

      return bMargin - aMargin;
    })[0];
}
