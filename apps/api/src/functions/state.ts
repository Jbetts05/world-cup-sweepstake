import { app } from "@azure/functions";
import { jsonResponse } from "../lib/http";
import { getPublicState } from "../lib/store";

app.http("state", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "state",
  handler: async () => jsonResponse(await getPublicState()),
});
