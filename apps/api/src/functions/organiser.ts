import { app } from "@azure/functions";
import { jsonResponse, parseJsonBody, requireAdminSecret } from "../lib/http";
import {
  importParticipants,
  importTeamsFromFixture,
  removeParticipant,
  runDraw,
  saveParticipant,
  syncFixtureSnapshot,
  toErrorResponse,
  type ParticipantImportInput,
  type ParticipantInput,
} from "../lib/store";
import { trackEvent } from "../lib/telemetry";

app.http("saveParticipant", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "organiser/participants",
  handler: async (request) => {
    const authError = requireAdminSecret(request);

    if (authError) {
      return authError;
    }

    try {
      const state = await saveParticipant(await parseParticipantInput(request));
      trackEvent("organiser_participant_saved", {}, { participantCount: state.participants.length });

      return jsonResponse(state);
    } catch (error) {
      const response = toErrorResponse(error);

      return jsonResponse({ message: response.message }, response.status);
    }
  },
});

app.http("importParticipants", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "organiser/participants/import",
  handler: async (request) => {
    const authError = requireAdminSecret(request);

    if (authError) {
      return authError;
    }

    try {
      const result = await importParticipants(await parseParticipantImportInput(request));
      trackEvent("organiser_participants_imported", {}, {
        requestedCount: result.summary.requestedCount,
        addedCount: result.summary.addedCount,
        skippedDuplicateCount: result.summary.skippedDuplicateCount,
        participantCount: result.summary.totalParticipantCount,
      });

      return jsonResponse(result, 201);
    } catch (error) {
      const response = toErrorResponse(error);

      return jsonResponse({ message: response.message }, response.status);
    }
  },
});

app.http("deleteParticipant", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "organiser/participants/{id}",
  handler: async (request) => {
    const authError = requireAdminSecret(request);

    if (authError) {
      return authError;
    }

    const id = request.params.id;

    if (!id) {
      return jsonResponse({ message: "Participant id is required." }, 400);
    }

    try {
      const state = await removeParticipant(id);
      trackEvent("organiser_participant_removed", {}, { participantCount: state.participants.length });

      return jsonResponse(state);
    } catch (error) {
      const response = toErrorResponse(error);

      return jsonResponse({ message: response.message }, response.status);
    }
  },
});

app.http("importTeams", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "organiser/import-teams",
  handler: async (request) => {
    const authError = requireAdminSecret(request);

    if (authError) {
      return authError;
    }

    const state = await importTeamsFromFixture();
    trackEvent("organiser_teams_imported", { source: state.metadata.provider }, { teamCount: state.teams.length });

    return jsonResponse(state);
  },
});

app.http("runDraw", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "organiser/draw",
  handler: async (request) => {
    const authError = requireAdminSecret(request);

    if (authError) {
      return authError;
    }

    try {
      const state = await runDraw();
      trackEvent("organiser_draw_locked", {}, {
        participantCount: state.participants.length,
        assignedTeamCount: state.metadata.assignedTeamCount,
      });

      return jsonResponse(state, 201);
    } catch (error) {
      const response = toErrorResponse(error);

      return jsonResponse({ message: response.message }, response.status);
    }
  },
});

app.http("syncTournamentData", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "organiser/sync",
  handler: async (request) => {
    const authError = requireAdminSecret(request);

    if (authError) {
      return authError;
    }

    const state = await syncFixtureSnapshot();
    trackEvent("organiser_sync_completed", { source: state.metadata.provider }, {
      teamCount: state.teams.length,
      matchCount: state.matches.length,
    });

    return jsonResponse(state);
  },
});

async function parseParticipantInput(request: Parameters<typeof parseJsonBody>[0]): Promise<ParticipantInput> {
  const body = await parseJsonBody(request);
  const id = typeof body.id === "string" ? body.id : undefined;

  return {
    ...(id ? { id } : {}),
    fullName: typeof body.fullName === "string" ? body.fullName : "",
  };
}

async function parseParticipantImportInput(request: Parameters<typeof parseJsonBody>[0]): Promise<ParticipantImportInput> {
  const body = await parseJsonBody(request);

  return {
    fullNames: Array.isArray(body.fullNames)
      ? body.fullNames.map((fullName) => (typeof fullName === "string" ? fullName : ""))
      : [],
  };
}
