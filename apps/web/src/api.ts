import type { PublicTournamentState } from '@world-cup/shared'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'
export type TelemetryEventName =
  | 'page_view'
  | 'organiser_opened'
  | 'sync_clicked'
  | 'draw_clicked'
  | 'bracket_viewed'

export async function fetchTournamentState(): Promise<PublicTournamentState> {
  return fetchJson<PublicTournamentState>('/state')
}

export async function saveParticipant(
  fullName: string,
  adminSecret: string,
): Promise<PublicTournamentState> {
  return organiserRequest('/organiser/participants', adminSecret, {
    method: 'POST',
    body: JSON.stringify({ fullName }),
  })
}

export async function deleteParticipant(
  participantId: string,
  adminSecret: string,
): Promise<PublicTournamentState> {
  return organiserRequest(`/organiser/participants/${encodeURIComponent(participantId)}`, adminSecret, {
    method: 'DELETE',
  })
}

export async function importTeams(adminSecret: string): Promise<PublicTournamentState> {
  return organiserRequest('/organiser/import-teams', adminSecret, { method: 'POST' })
}

export async function runDraw(adminSecret: string): Promise<PublicTournamentState> {
  return organiserRequest('/organiser/draw', adminSecret, { method: 'POST' })
}

export async function syncTournament(adminSecret: string): Promise<PublicTournamentState> {
  return organiserRequest('/organiser/sync', adminSecret, { method: 'POST' })
}

export function trackTelemetryEvent(
  eventName: TelemetryEventName,
  properties: Record<string, string | number | boolean> = {},
): void {
  void fetch(`${apiBaseUrl}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName, properties }),
  }).catch((error: unknown) => {
    console.warn('Telemetry event failed.', error)
  })
}

async function organiserRequest(
  path: string,
  adminSecret: string,
  init: RequestInit,
): Promise<PublicTournamentState> {
  return fetchJson<PublicTournamentState>(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': adminSecret,
      ...init.headers,
    },
  })
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init)

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string }

    throw new Error(body.message ?? `Request failed with ${response.status}`)
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid API response: ${error.message}` : 'Invalid API response.', {
      cause: error,
    })
  }
}
