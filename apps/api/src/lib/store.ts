import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  Assignment,
  Match,
  Participant,
  PublicTournamentState,
  Standing,
  Team,
} from "@world-cup/shared";
import { buildPublicTournamentState } from "@world-cup/shared";
import {
  emptyFixtureTournamentState,
  mockMatches,
  mockStandings,
  mockTeams,
  mockTournamentState,
} from "@world-cup/shared/fixtures/mockState";
import {
  isStateWriteConflict,
  readStateSnapshot,
  writeStateSnapshot,
  type StateSnapshot,
} from "./state-repository";
import type { StoredTournamentData } from "./stored-state";
import {
  applyProviderTeamStages,
  fetchWc2026GroupStandings,
  fetchWc2026Matches,
  fetchWc2026Snapshot,
} from "./wc2026-provider";

export interface ParticipantInput {
  id?: string;
  fullName: string;
}

export interface ParticipantImportInput {
  fullNames: string[];
}

export interface ParticipantImportSummary {
  requestedCount: number;
  addedCount: number;
  skippedDuplicateCount: number;
  totalParticipantCount: number;
}

export interface ParticipantImportResult {
  state: PublicTournamentState;
  summary: ParticipantImportSummary;
}

const maxMutationAttempts = 3;
let mutationQueue = Promise.resolve();

export async function getPublicState(): Promise<PublicTournamentState> {
  const data = await readData();

  return toPublicState(data);
}

export async function listTeams(): Promise<Team[]> {
  const data = await readData();

  return data.teams;
}

export async function listFixtures(): Promise<Match[]> {
  const data = await readData();

  return data.matches;
}

export async function saveParticipant(input: ParticipantInput): Promise<PublicTournamentState> {
  const fullName = normalizeParticipantName(input.fullName);

  if (!fullName) {
    throw new RequestError(400, "Participant full name is required.");
  }

  return mutateData((data) => {
    const now = new Date().toISOString();

    if (input.id) {
      const participant = data.participants.find((item) => item.id === input.id);

      if (!participant) {
        throw new RequestError(404, "Participant not found.");
      }

      participant.fullName = fullName;
      participant.updatedAt = now;
      touch(data, now);

      return toPublicState(data);
    }

    if (data.draw) {
      throw new RequestError(409, "The draw is locked; new participants cannot be added.");
    }

    if (data.participants.length >= 48) {
      throw new RequestError(409, "The sweepstake already has 48 participants.");
    }

    data.participants.push({
      id: randomUUID(),
      fullName,
      createdAt: now,
      updatedAt: now,
    });

    touch(data, now);

    return toPublicState(data);
  });
}

export async function importParticipants(input: ParticipantImportInput): Promise<ParticipantImportResult> {
  const requestedNames = input.fullNames
    .map((fullName) => normalizeParticipantName(fullName))
    .filter((fullName) => fullName.length > 0);

  if (requestedNames.length === 0) {
    throw new RequestError(400, "Paste at least one participant full name.");
  }

  return mutateData((data) => {
    if (data.draw) {
      throw new RequestError(409, "The draw is locked; new participants cannot be added.");
    }

    const existingNameKeys = new Set(data.participants.map((participant) => getParticipantNameKey(participant.fullName)));
    const importedNameKeys = new Set<string>();
    const namesToAdd: string[] = [];
    let skippedDuplicateCount = 0;

    for (const fullName of requestedNames) {
      const nameKey = getParticipantNameKey(fullName);

      if (existingNameKeys.has(nameKey) || importedNameKeys.has(nameKey)) {
        skippedDuplicateCount += 1;
        continue;
      }

      importedNameKeys.add(nameKey);
      namesToAdd.push(fullName);
    }

    if (namesToAdd.length === 0) {
      throw new RequestError(409, "All pasted names are already in the sweepstake.");
    }

    if (data.participants.length + namesToAdd.length > 48) {
      throw new RequestError(
        409,
        `Import would exceed the 48 participant limit. You can add ${48 - data.participants.length} more.`,
      );
    }

    const now = new Date().toISOString();

    data.participants.push(
      ...namesToAdd.map((fullName) => ({
        id: randomUUID(),
        fullName,
        createdAt: now,
        updatedAt: now,
      })),
    );
    touch(data, now);

    return {
      state: toPublicState(data),
      summary: {
        requestedCount: requestedNames.length,
        addedCount: namesToAdd.length,
        skippedDuplicateCount,
        totalParticipantCount: data.participants.length,
      },
    };
  });
}

export async function removeParticipant(id: string): Promise<PublicTournamentState> {
  return mutateData((data) => {
    if (data.draw) {
      throw new RequestError(409, "The draw is locked; participants cannot be removed.");
    }

    const nextParticipants = data.participants.filter((participant) => participant.id !== id);

    if (nextParticipants.length === data.participants.length) {
      throw new RequestError(404, "Participant not found.");
    }

    const now = new Date().toISOString();
    data.participants = nextParticipants;
    touch(data, now);

    return toPublicState(data);
  });
}

export async function importTeamsFromFixture(): Promise<PublicTournamentState> {
  const snapshot = await loadFixtureSnapshot();

  return mutateData((data) => {
    const now = new Date().toISOString();
    const nextTeams = [...snapshot.teams];

    ensureAssignmentsRemainValid(data.assignments, nextTeams);
    data.teams = nextTeams;
    data.matches = [...snapshot.matches];
    data.standings = [...snapshot.standings];
    data.source = snapshot.source;
    touch(data, now);

    return toPublicState(data);
  });
}

export async function runDraw(): Promise<PublicTournamentState> {
  return mutateData((data) => {
    if (data.draw) {
      throw new RequestError(409, "The draw is already locked.");
    }

    if (data.participants.length === 0) {
      throw new RequestError(409, "Add at least one participant before running the draw.");
    }

    if (data.participants.length > data.teams.length) {
      throw new RequestError(409, "There are more participants than available teams.");
    }

    const now = new Date().toISOString();
    const seed = `WC26-LOCK-${randomBytes(16).toString("hex")}`;
    const shuffledTeams = seededShuffle(data.teams, seed);
    const drawId = randomUUID();

    data.draw = {
      id: drawId,
      seed,
      lockedAt: now,
      participantCount: data.participants.length,
      teamCount: data.teams.length,
    };
    data.assignments = data.participants.map((participant, index) => {
      const team = shuffledTeams[index];

      if (!team) {
        throw new Error("Draw validation failed: missing team slot.");
      }

      return {
        participantId: participant.id,
        teamId: team.id,
        drawId,
        seed,
        createdAt: now,
      };
    });

    touch(data, now);

    return toPublicState(data);
  });
}

export async function syncFixtureSnapshot(): Promise<PublicTournamentState> {
  const snapshot = await loadFixtureSnapshot();

  return mutateData((data) => {
    const now = new Date().toISOString();
    const nextTeams = mergeTeams(data.teams, snapshot.teams);

    ensureAssignmentsRemainValid(data.assignments, nextTeams);
    data.matches = [...snapshot.matches];
    data.standings = [...snapshot.standings];
    data.teams = nextTeams;
    data.source = snapshot.source;
    touch(data, now);

    return toPublicState(data);
  });
}

export async function syncMatchesFromFixture(): Promise<PublicTournamentState> {
  return mutateData(async (data) => {
    if (data.teams.length === 0) {
      throw new RequestError(409, "Import teams before syncing matches.");
    }

    const snapshot = await loadMatchesSnapshot(data.teams);
    data.matches = [...snapshot.matches];
    data.teams = applyProviderTeamStages(data.teams, data.standings, data.matches);
    data.source = snapshot.source;
    touch(data, snapshot.generatedAt);

    return toPublicState(data);
  });
}

export async function syncGroupStandingsFromFixture(): Promise<PublicTournamentState> {
  return mutateData(async (data) => {
    if (data.teams.length === 0) {
      throw new RequestError(409, "Import teams before syncing group standings.");
    }

    const snapshot = await loadGroupStandingsSnapshot(data.teams);
    data.standings = [...snapshot.standings];
    data.teams = applyProviderTeamStages(data.teams, data.standings, data.matches);
    data.source = snapshot.source;
    touch(data, snapshot.generatedAt);

    return toPublicState(data);
  });
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function toErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof RequestError) {
    return { status: error.status, message: error.message };
  }

  throw error;
}

async function readData(): Promise<StoredTournamentData> {
  return (await readOrCreateSnapshot()).data;
}

async function readOrCreateSnapshot(): Promise<StateSnapshot> {
  const existing = await readStateSnapshot();

  if (existing) {
    return existing;
  }

  const initial = createInitialData();

  try {
    return await writeStateSnapshot(initial);
  } catch (error) {
    if (isStateWriteConflict(error)) {
      const racedSnapshot = await readStateSnapshot();

      if (racedSnapshot) {
        return racedSnapshot;
      }
    }

    throw error;
  }
}

function createInitialData(): StoredTournamentData {
  if (process.env.WORLD_CUP_SEED_MODE === "demo") {
    return {
      generatedAt: mockTournamentState.generatedAt,
      participants: mockTournamentState.participants,
      teams: mockTournamentState.teams,
      assignments: mockTournamentState.assignments,
      matches: mockTournamentState.matches,
      standings: mockTournamentState.standings,
      source: "fixture",
      ...(mockTournamentState.draw ? { draw: mockTournamentState.draw } : {}),
    };
  }

  return {
    generatedAt: emptyFixtureTournamentState.generatedAt,
    participants: [],
    teams: emptyFixtureTournamentState.teams,
    assignments: [],
    matches: emptyFixtureTournamentState.matches,
    standings: emptyFixtureTournamentState.standings,
    source: "fixture",
  };
}

function toPublicState(data: StoredTournamentData): PublicTournamentState {
  return buildPublicTournamentState({
    generatedAt: data.generatedAt,
    ...(data.draw ? { draw: data.draw } : {}),
    participants: data.participants,
    teams: data.teams,
    assignments: data.assignments,
    matches: data.matches,
    standings: data.standings,
    source: data.source ?? "local",
    totalTeamSlots: 48,
  });
}

async function loadFixtureSnapshot(): Promise<{
  teams: Team[];
  matches: Match[];
  standings: Standing[];
  source: PublicTournamentState["metadata"]["source"];
}> {
  if (process.env.WC2026_API_KEY?.trim()) {
    const snapshot = await fetchWc2026Snapshot();

    return {
      teams: snapshot.teams,
      matches: snapshot.matches,
      standings: snapshot.standings,
      source: "live",
    };
  }

  if (process.env.WORLD_CUP_SEED_MODE === "demo") {
    return {
      teams: mockTeams,
      matches: mockMatches,
      standings: mockStandings,
      source: "fixture",
    };
  }

  throw new RequestError(503, "WC2026_API_KEY is not configured.");
}

async function loadMatchesSnapshot(teams: Team[]): Promise<{
  generatedAt: string;
  matches: Match[];
  source: PublicTournamentState["metadata"]["source"];
}> {
  if (process.env.WC2026_API_KEY?.trim()) {
    return {
      ...(await fetchWc2026Matches(teams)),
      source: "live",
    };
  }

  if (process.env.WORLD_CUP_SEED_MODE === "demo") {
    return {
      generatedAt: new Date().toISOString(),
      matches: mockMatches,
      source: "fixture",
    };
  }

  throw new RequestError(503, "WC2026_API_KEY is not configured.");
}

async function loadGroupStandingsSnapshot(teams: Team[]): Promise<{
  generatedAt: string;
  standings: Standing[];
  source: PublicTournamentState["metadata"]["source"];
}> {
  if (process.env.WC2026_API_KEY?.trim()) {
    return {
      ...(await fetchWc2026GroupStandings(teams)),
      source: "live",
    };
  }

  if (process.env.WORLD_CUP_SEED_MODE === "demo") {
    return {
      generatedAt: new Date().toISOString(),
      standings: mockStandings,
      source: "fixture",
    };
  }

  throw new RequestError(503, "WC2026_API_KEY is not configured.");
}

function touch(data: StoredTournamentData, generatedAt: string): StoredTournamentData {
  data.generatedAt = generatedAt;

  return data;
}

function normalizeParticipantName(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getParticipantNameKey(value: string): string {
  return normalizeParticipantName(value).toLocaleLowerCase("en-GB");
}

function mutateData<T>(mutator: (data: StoredTournamentData) => T | Promise<T>): Promise<T> {
  const result = mutationQueue.then(async () => {
    for (let attempt = 1; attempt <= maxMutationAttempts; attempt += 1) {
      const snapshot = await readOrCreateSnapshot();
      const value = await mutator(snapshot.data);

      try {
        await writeStateSnapshot(snapshot.data, snapshot.etag);

        return value;
      } catch (error) {
        if (isStateWriteConflict(error) && attempt < maxMutationAttempts) {
          continue;
        }

        if (isStateWriteConflict(error)) {
          throw new RequestError(409, "Tournament state changed; retry the action.");
        }

        throw error;
      }
    }

    throw new RequestError(409, "Tournament state changed; retry the action.");
  });

  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

function mergeTeams(_existingTeams: Team[], providerTeams: Team[]): Team[] {
  return providerTeams;
}

function ensureAssignmentsRemainValid(assignments: Assignment[], teams: Team[]): void {
  const teamIds = new Set(teams.map((team) => team.id));
  const orphanedAssignment = assignments.find((assignment) => !teamIds.has(assignment.teamId));

  if (orphanedAssignment) {
    throw new RequestError(
      409,
      "The provider team update would orphan an existing locked assignment.",
    );
  }
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const random = createSeededRandom(seed);
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const item = copy[index];
    const swapItem = copy[swapIndex];

    if (item === undefined || swapItem === undefined) {
      throw new Error("Shuffle index out of range.");
    }

    copy[index] = swapItem;
    copy[swapIndex] = item;
  }

  return copy;
}

function createSeededRandom(seed: string): () => number {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
