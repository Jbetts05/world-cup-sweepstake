import { app } from "@azure/functions";
import { jsonResponse, parseJsonBody, requireAdminSecret } from "../lib/http";
import {
  importTeamsFromFixture,
  removeParticipant,
  runDraw,
  saveParticipant,
  syncFixtureSnapshot,
  toErrorResponse,
  type ParticipantInput,
} from "../lib/store";

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
      return jsonResponse(await saveParticipant(await parseParticipantInput(request)));
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
      return jsonResponse(await removeParticipant(id));
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

    return jsonResponse(await importTeamsFromFixture());
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
      return jsonResponse(await runDraw(), 201);
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

    return jsonResponse(await syncFixtureSnapshot());
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
