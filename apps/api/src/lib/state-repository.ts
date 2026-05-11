import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BlobServiceClient, type BlockBlobClient } from "@azure/storage-blob";
import type { StoredTournamentData } from "./stored-state";

export interface StateSnapshot {
  data: StoredTournamentData;
  etag?: string;
}

interface StateRepository {
  read(): Promise<StateSnapshot | undefined>;
  write(data: StoredTournamentData, etag: string | undefined): Promise<StateSnapshot>;
}

const localDataPath =
  process.env.WORLD_CUP_DATA_PATH ??
  join(process.cwd(), "data", "tournament-state.local.json");
const backend = process.env.WORLD_CUP_STORAGE_BACKEND ?? "local";
let repository: StateRepository | undefined;

export async function readStateSnapshot(): Promise<StateSnapshot | undefined> {
  return getRepository().read();
}

export async function writeStateSnapshot(
  data: StoredTournamentData,
  etag?: string,
): Promise<StateSnapshot> {
  return getRepository().write(data, etag);
}

export function isStateWriteConflict(error: unknown): boolean {
  return hasStatusCode(error, 409) || hasStatusCode(error, 412);
}

function createStateRepository(storageBackend: string): StateRepository {
  if (storageBackend === "azure-blob") {
    return new BlobStateRepository();
  }

  if (storageBackend !== "local") {
    throw new Error(
      `Unsupported WORLD_CUP_STORAGE_BACKEND "${storageBackend}". Use "local" or "azure-blob".`,
    );
  }

  return new LocalFileStateRepository(localDataPath);
}

function getRepository(): StateRepository {
  repository ??= createStateRepository(backend);

  return repository;
}

class LocalFileStateRepository implements StateRepository {
  constructor(private readonly dataPath: string) {}

  async read(): Promise<StateSnapshot | undefined> {
    try {
      const content = await readFile(this.dataPath, "utf8");

      return { data: JSON.parse(content) as StoredTournamentData };
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async write(data: StoredTournamentData): Promise<StateSnapshot> {
    await mkdir(dirname(this.dataPath), { recursive: true });
    const temporaryPath = `${this.dataPath}.${process.pid}.${randomUUID()}.tmp`;

    await writeFile(temporaryPath, serialize(data), "utf8");
    await rename(temporaryPath, this.dataPath);

    return { data };
  }
}

class BlobStateRepository implements StateRepository {
  private blobClient: BlockBlobClient | undefined;

  async read(): Promise<StateSnapshot | undefined> {
    const blobClient = await this.getBlobClient();

    try {
      const response = await blobClient.download(0);
      const content = await streamToString(response.readableStreamBody);

      return {
        data: JSON.parse(content) as StoredTournamentData,
        ...(response.etag ? { etag: response.etag } : {}),
      };
    } catch (error) {
      if (hasStatusCode(error, 404)) {
        return undefined;
      }

      throw error;
    }
  }

  async write(data: StoredTournamentData, etag: string | undefined): Promise<StateSnapshot> {
    const blobClient = await this.getBlobClient();
    const content = serialize(data);
    const response = await blobClient.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: "application/json" },
      conditions: etag ? { ifMatch: etag } : { ifNoneMatch: "*" },
    });

    return {
      data,
      ...(response.etag ? { etag: response.etag } : {}),
    };
  }

  private async getBlobClient(): Promise<BlockBlobClient> {
    if (this.blobClient) {
      return this.blobClient;
    }

    const connectionString =
      process.env.WORLD_CUP_STORAGE_CONNECTION_STRING ?? process.env.AzureWebJobsStorage;

    if (!connectionString?.trim()) {
      throw new Error(
        "Azure Blob state storage requires WORLD_CUP_STORAGE_CONNECTION_STRING or AzureWebJobsStorage.",
      );
    }

    const containerName = process.env.WORLD_CUP_STATE_CONTAINER ?? "world-cup-state";
    const blobName = process.env.WORLD_CUP_STATE_BLOB ?? "tournament-state.json";
    const containerClient =
      BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);

    await containerClient.createIfNotExists();
    this.blobClient = containerClient.getBlockBlobClient(blobName);

    return this.blobClient;
  }
}

function serialize(data: StoredTournamentData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function streamToString(stream: NodeJS.ReadableStream | undefined): Promise<string> {
  if (!stream) {
    return "";
  }

  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  );
}
