import type {
  Assignment,
  Draw,
  LeaderboardEntry,
  Match,
  Participant,
  PublicTournamentState,
  Standing,
  Team,
} from "../types";
import { buildPublicTournamentState } from "../lib/state";

const generatedAt = "2026-06-20T21:30:00.000Z";

export const mockParticipants: Participant[] = [
  { id: "p-alex", fullName: "Alex Morgan", createdAt: generatedAt, updatedAt: generatedAt },
  { id: "p-sophie", fullName: "Sophie Reed", createdAt: generatedAt, updatedAt: generatedAt },
  { id: "p-james", fullName: "James Patel", createdAt: generatedAt, updatedAt: generatedAt },
  { id: "p-laura", fullName: "Laura Chen", createdAt: generatedAt, updatedAt: generatedAt },
  { id: "p-daniel", fullName: "Daniel Brooks", createdAt: generatedAt, updatedAt: generatedAt },
  { id: "p-maya", fullName: "Maya Singh", createdAt: generatedAt, updatedAt: generatedAt },
  { id: "p-hannah", fullName: "Hannah Evans", createdAt: generatedAt, updatedAt: generatedAt },
  { id: "p-omar", fullName: "Omar Ali", createdAt: generatedAt, updatedAt: generatedAt },
];

export const mockTeams: Team[] = [
  { id: "arg", wc2026Id: "team-arg", fifaCode: "ARG", name: "Argentina", group: "A", qualificationStatus: "qualified", stage: "round-of-32" },
  { id: "jpn", wc2026Id: "team-jpn", fifaCode: "JPN", name: "Japan", group: "A", qualificationStatus: "best-third-watch", stage: "group" },
  { id: "can", wc2026Id: "team-can", fifaCode: "CAN", name: "Canada", group: "A", qualificationStatus: "pending", stage: "group" },
  { id: "gha", wc2026Id: "team-gha", fifaCode: "GHA", name: "Ghana", group: "A", qualificationStatus: "eliminated", stage: "eliminated" },
  { id: "bra", wc2026Id: "team-bra", fifaCode: "BRA", name: "Brazil", group: "B", qualificationStatus: "qualified", stage: "round-of-32" },
  { id: "mar", wc2026Id: "team-mar", fifaCode: "MAR", name: "Morocco", group: "B", qualificationStatus: "qualified", stage: "round-of-32" },
  { id: "aus", wc2026Id: "team-aus", fifaCode: "AUS", name: "Australia", group: "B", qualificationStatus: "pending", stage: "group" },
  { id: "per", wc2026Id: "team-per", fifaCode: "PER", name: "Peru", group: "B", qualificationStatus: "eliminated", stage: "eliminated" },
  { id: "eng", wc2026Id: "team-eng", fifaCode: "ENG", name: "England", group: "C", qualificationStatus: "qualified", stage: "round-of-32" },
  { id: "usa", wc2026Id: "team-usa", fifaCode: "USA", name: "United States", group: "C", qualificationStatus: "best-third-watch", stage: "group" },
  { id: "kor", wc2026Id: "team-kor", fifaCode: "KOR", name: "Korea Republic", group: "C", qualificationStatus: "pending", stage: "group" },
  { id: "sen", wc2026Id: "team-sen", fifaCode: "SEN", name: "Senegal", group: "C", qualificationStatus: "eliminated", stage: "eliminated" },
];

export const mockAssignments: Assignment[] = [
  { participantId: "p-alex", teamId: "bra", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
  { participantId: "p-sophie", teamId: "eng", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
  { participantId: "p-james", teamId: "arg", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
  { participantId: "p-laura", teamId: "mar", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
  { participantId: "p-daniel", teamId: "usa", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
  { participantId: "p-maya", teamId: "jpn", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
  { participantId: "p-hannah", teamId: "gha", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
  { participantId: "p-omar", teamId: "per", drawId: "draw-2026", seed: "WC26-LOCK-4812", createdAt: generatedAt },
];

export const mockStandings: Standing[] = [
  { group: "A", teamId: "arg", played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 6, goalsAgainst: 2, goalDifference: 4, points: 7, rank: 1, qualificationState: "qualified" },
  { group: "A", teamId: "jpn", played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 4, goalsAgainst: 4, goalDifference: 0, points: 4, rank: 2, qualificationState: "best-third-watch" },
  { group: "A", teamId: "can", played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 3, goalsAgainst: 5, goalDifference: -2, points: 3, rank: 3, qualificationState: "pending" },
  { group: "A", teamId: "gha", played: 3, won: 0, drawn: 2, lost: 1, goalsFor: 2, goalsAgainst: 4, goalDifference: -2, points: 2, rank: 4, qualificationState: "eliminated" },
  { group: "B", teamId: "bra", played: 3, won: 3, drawn: 0, lost: 0, goalsFor: 8, goalsAgainst: 1, goalDifference: 7, points: 9, rank: 1, qualificationState: "qualified" },
  { group: "B", teamId: "mar", played: 3, won: 2, drawn: 0, lost: 1, goalsFor: 5, goalsAgainst: 3, goalDifference: 2, points: 6, rank: 2, qualificationState: "qualified" },
  { group: "B", teamId: "aus", played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 2, goalsAgainst: 5, goalDifference: -3, points: 3, rank: 3, qualificationState: "pending" },
  { group: "B", teamId: "per", played: 3, won: 0, drawn: 0, lost: 3, goalsFor: 1, goalsAgainst: 7, goalDifference: -6, points: 0, rank: 4, qualificationState: "eliminated" },
  { group: "C", teamId: "eng", played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 7, rank: 1, qualificationState: "qualified" },
  { group: "C", teamId: "usa", played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 4, goalsAgainst: 3, goalDifference: 1, points: 4, rank: 2, qualificationState: "best-third-watch" },
  { group: "C", teamId: "kor", played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 3, goalsAgainst: 5, goalDifference: -2, points: 3, rank: 3, qualificationState: "pending" },
  { group: "C", teamId: "sen", played: 3, won: 0, drawn: 2, lost: 1, goalsFor: 2, goalsAgainst: 5, goalDifference: -3, points: 2, rank: 4, qualificationState: "eliminated" },
];

export const mockMatches: Match[] = [
  { id: "m-001", stage: "group", group: "B", homeTeamId: "bra", awayTeamId: "per", kickoff: "2026-06-18T20:00:00.000Z", venue: "MetLife Stadium", status: "full-time", score: { home: 4, away: 0 }, winnerTeamId: "bra" },
  { id: "m-002", stage: "group", group: "A", homeTeamId: "arg", awayTeamId: "jpn", kickoff: "2026-06-19T19:00:00.000Z", venue: "BMO Field", status: "full-time", score: { home: 2, away: 2 } },
  { id: "m-003", stage: "group", group: "C", homeTeamId: "eng", awayTeamId: "usa", kickoff: "2026-06-20T21:00:00.000Z", venue: "AT&T Stadium", status: "live", score: { home: 1, away: 1 } },
  { id: "m-004", stage: "round-of-32", homeTeamId: "bra", awayTeamId: "usa", kickoff: "2026-06-28T22:00:00.000Z", venue: "SoFi Stadium", status: "scheduled" },
  { id: "m-005", stage: "round-of-32", homeTeamId: "eng", awayTeamId: "jpn", kickoff: "2026-06-29T18:00:00.000Z", venue: "Lumen Field", status: "scheduled" },
];

export const mockDraw: Draw = {
  id: "draw-2026",
  seed: "WC26-LOCK-4812",
  lockedAt: "2026-06-10T18:00:00.000Z",
  participantCount: mockParticipants.length,
  teamCount: 48,
};

export const mockLeaderboard: LeaderboardEntry[] = buildPublicTournamentState({
  generatedAt,
  draw: mockDraw,
  participants: mockParticipants,
  teams: mockTeams,
  assignments: mockAssignments,
  matches: mockMatches,
  standings: mockStandings,
}).leaderboard;

export const mockTournamentState: PublicTournamentState = buildPublicTournamentState({
  generatedAt,
  currentStage: "group",
  draw: mockDraw,
  participants: mockParticipants,
  teams: mockTeams,
  assignments: mockAssignments,
  matches: mockMatches,
  standings: mockStandings,
});

export const emptyFixtureTournamentState: PublicTournamentState = buildPublicTournamentState({
  generatedAt,
  currentStage: "group",
  participants: [],
  teams: mockTeams,
  assignments: [],
  matches: mockMatches,
  standings: mockStandings,
});
