import type {
  Assignment,
  Draw,
  Match,
  Participant,
  PublicTournamentState,
  Standing,
  Team,
} from "@world-cup/shared";

export interface StoredTournamentData {
  generatedAt: string;
  participants: Participant[];
  teams: Team[];
  assignments: Assignment[];
  matches: Match[];
  standings: Standing[];
  source?: PublicTournamentState["metadata"]["source"];
  draw?: Draw;
}
