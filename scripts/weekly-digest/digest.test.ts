import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Match, PublicTournamentState } from "../../packages/shared/src/index.ts";
import {
  emptyFixtureTournamentState,
  mockTournamentState,
} from "../../packages/shared/src/fixtures/mockState.ts";
import {
  buildDigestSnapshot,
  buildWeeklyDigest,
  type DigestOptions,
  type DigestSnapshot,
} from "./digest.ts";

const baseOptions: DigestOptions = {
  runDate: new Date("2026-06-21T12:00:00.000Z"),
  timezone: "Europe/London",
  daysBack: 7,
  daysAhead: 10,
  topRankingsCount: 48,
};

describe("weekly digest generator", () => {
  it("generates a setup snapshot before the draw is locked", () => {
    const digest = buildWeeklyDigest(emptyFixtureTournamentState, undefined, baseOptions);

    assert.match(digest.markdown, /The draw has not been run yet/);
    assert.match(digest.markdown, /No rankings yet/);
    assert.equal(digest.snapshot.entries.length, 0);
  });

  it("uses group-first summaries during the group stage", () => {
    const digest = buildWeeklyDigest(mockTournamentState, undefined, baseOptions);

    assert.match(digest.markdown, /## Group-stage picture/);
    assert.match(digest.markdown, /### Group A/);
    assert.match(digest.markdown, /Alex Morgan \(Brazil\) beat Omar Ali \(Peru\) 4-0/);
    assert.doesNotMatch(digest.markdown, /## Overall leaderboard/);
  });

  it("switches to the overall leaderboard after all group matches are full-time", () => {
    const state = withCompletedGroupStage(mockTournamentState);
    const digest = buildWeeklyDigest(state, undefined, baseOptions);

    assert.match(digest.markdown, /## Overall leaderboard/);
    assert.doesNotMatch(digest.markdown, /## Group-stage picture/);
    assert.match(digest.markdown, /This is the baseline leaderboard snapshot/);
  });

  it("includes upcoming fixtures with participant and country context", () => {
    const digest = buildWeeklyDigest(mockTournamentState, undefined, baseOptions);

    assert.match(digest.markdown, /## What's next/);
    assert.match(digest.markdown, /Alex Morgan \(Brazil\) vs Daniel Brooks \(United States\)/);
    assert.match(digest.markdown, /Sophie Reed \(England\) vs Maya Singh \(Japan\)/);
  });

  it("uses the previous merged snapshot for movement copy", () => {
    const state = withCompletedGroupStage(mockTournamentState);
    const currentSnapshot = buildDigestSnapshot(state, baseOptions, "knockout");
    const previousSnapshot: DigestSnapshot = {
      ...currentSnapshot,
      runDate: "2026-06-14",
      entries: currentSnapshot.entries.map((entry) =>
        entry.participantName === "Alex Morgan"
          ? { ...entry, overallPosition: entry.overallPosition + 2 }
          : entry,
      ),
    };
    const digest = buildWeeklyDigest(state, previousSnapshot, baseOptions);

    assert.match(digest.markdown, /Movement is compared with the latest merged digest snapshot from 2026-06-14/);
    assert.match(digest.markdown, /Alex Morgan .*Up 2/);
  });

  it("keeps unassigned teams in result copy without crashing", () => {
    const state: PublicTournamentState = {
      ...mockTournamentState,
      matches: [
        ...mockTournamentState.matches,
        {
          id: "m-unassigned",
          stage: "group",
          group: "A",
          homeTeamId: "can",
          awayTeamId: "jpn",
          kickoff: "2026-06-20T18:00:00.000Z",
          venue: "Test Stadium",
          status: "full-time",
          score: { home: 1, away: 1 },
        },
      ],
    };
    const digest = buildWeeklyDigest(state, undefined, baseOptions);

    assert.match(digest.markdown, /Canada \(unassigned\) drew with Maya Singh \(Japan\) 1-1/);
  });
});

function withCompletedGroupStage(state: PublicTournamentState): PublicTournamentState {
  return {
    ...state,
    currentStage: "round-of-32",
    matches: state.matches.map((match): Match => {
      if (match.stage !== "group") {
        return match;
      }

      if (match.status === "full-time") {
        return match;
      }

      return {
        ...match,
        status: "full-time",
        score: match.score ?? { home: 1, away: 0 },
        winnerTeamId: match.winnerTeamId ?? match.homeTeamId,
      };
    }),
  };
}
