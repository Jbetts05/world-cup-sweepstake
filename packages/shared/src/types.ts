export type TournamentStage =
  | "group"
  | "round-of-32"
  | "round-of-16"
  | "quarter-final"
  | "semi-final"
  | "third-place"
  | "final"
  | "champion"
  | "eliminated";

export type MatchStatus = "scheduled" | "live" | "full-time";

export type QualificationState =
  | "pending"
  | "qualified"
  | "best-third-watch"
  | "eliminated";

export interface Participant {
  id: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  wc2026Id: string;
  fifaCode: string;
  name: string;
  flagUrl?: string;
  group: string;
  qualificationStatus: QualificationState;
  stage: TournamentStage;
}

export interface Assignment {
  participantId: string;
  teamId: string;
  drawId: string;
  seed: string;
  createdAt: string;
}

export interface MatchScore {
  home: number;
  away: number;
}

export interface Match {
  id: string;
  stage: TournamentStage;
  group?: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  venue: string;
  status: MatchStatus;
  score?: MatchScore;
  winnerTeamId?: string;
}

export interface Standing {
  group: string;
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
  qualificationState: QualificationState;
}

export interface Draw {
  id: string;
  seed: string;
  lockedAt: string;
  participantCount: number;
  teamCount: number;
}

export interface Override {
  id: string;
  entityType: "team" | "match" | "standing" | "draw";
  entityId: string;
  patch: Record<string, unknown>;
  reason: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  participant: Participant;
  team: Team;
  stage: TournamentStage;
  stageRank: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
  status: "active" | "eliminated" | "champion";
}

export interface PublicTournamentState {
  generatedAt: string;
  currentStage: TournamentStage;
  draw?: Draw;
  participants: Participant[];
  teams: Team[];
  assignments: Assignment[];
  matches: Match[];
  standings: Standing[];
  leaderboard: LeaderboardEntry[];
  sidePrizes: {
    groupStageHeroes: LeaderboardEntry[];
    woodenSpoonWatch: LeaderboardEntry[];
    biggestResult?: Match;
    firstWin?: Match;
  };
  metadata: {
    source: "fixture" | "local" | "live";
    provider: "WC2026 API";
    syncCadence: "hourly";
    totalTeamSlots: number;
    assignedTeamCount: number;
  };
}
