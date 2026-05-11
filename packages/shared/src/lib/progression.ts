import type { LeaderboardEntry, Standing, Team, TournamentStage } from "../types";

const stageRanks: Record<TournamentStage, number> = {
  eliminated: 0,
  group: 1,
  "round-of-32": 2,
  "round-of-16": 3,
  "quarter-final": 4,
  "semi-final": 5,
  "third-place": 5,
  final: 6,
  champion: 7,
};

export function getStageRank(stage: TournamentStage): number {
  const rank = stageRanks[stage];

  if (rank === undefined) {
    throw new Error(`Unknown tournament stage ${stage}`);
  }

  return rank;
}

export function compareLeaderboard(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return (
    b.stageRank - a.stageRank ||
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.participant.fullName.localeCompare(b.participant.fullName)
  );
}

export function getStandingForTeam(standings: Standing[], teamId: string): Standing | undefined {
  return standings.find((standing) => standing.teamId === teamId);
}

export function getTeamStatus(team: Team): LeaderboardEntry["status"] {
  if (team.stage === "champion") {
    return "champion";
  }

  return team.stage === "eliminated" ? "eliminated" : "active";
}
