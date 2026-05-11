import { app } from "@azure/functions";
import { jsonResponse } from "../lib/http";
import { listFixtures, listTeams } from "../lib/store";

app.http("teams", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "teams",
  handler: async () => jsonResponse(await listTeams(), 200, { cache: "public-state" }),
});

app.http("fixtures", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "fixtures",
  handler: async () => jsonResponse(await listFixtures(), 200, { cache: "public-state" }),
});
