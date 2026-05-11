import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { motion } from 'motion/react'
import type { Match, Participant, PublicTournamentState, Team } from '@world-cup/shared'
import {
  deleteParticipant,
  fetchTournamentState,
  importTeams,
  runDraw,
  saveParticipant,
  syncTournament,
} from './api'
import { getFlagSrc } from './flags'
import './App.css'

const stageLabels: Record<string, string> = {
  group: 'Group stage',
  'round-of-32': 'Round of 32',
  'round-of-16': 'Round of 16',
  'quarter-final': 'Quarter-final',
  'semi-final': 'Semi-final',
  'third-place': 'Third-place match',
  final: 'Final',
  champion: 'Champion',
  eliminated: 'Eliminated',
}

const bracketStages = [
  { stage: 'round-of-32', title: 'Round of 32', abbreviation: 'R32' },
  { stage: 'round-of-16', title: 'Round of 16', abbreviation: 'R16' },
  { stage: 'quarter-final', title: 'Quarter-finals', abbreviation: 'QF' },
  { stage: 'semi-final', title: 'Semi-finals', abbreviation: 'SF' },
  { stage: 'final', title: 'Final', abbreviation: 'F' },
] as const

const stageRank: Record<string, number> = {
  group: 1,
  'round-of-32': 2,
  'round-of-16': 3,
  'quarter-final': 4,
  'semi-final': 5,
  final: 6,
  champion: 7,
  eliminated: 0,
}

function getTeam(state: PublicTournamentState, teamId: string): Team | undefined {
  return state.teams.find((item) => item.id === teamId)
}

function formatMatch(state: PublicTournamentState, match: Match): string {
  const home = getTeam(state, match.homeTeamId)
  const away = getTeam(state, match.awayTeamId)
  const score = match.score ? ` ${match.score.home}-${match.score.away}` : ''

  return `${home?.fifaCode ?? match.homeTeamId}${score} ${away?.fifaCode ?? match.awayTeamId}`
}

function formatKickoff(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

function getLocalTimeZoneLabel(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const timeZoneName = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value

  return timeZoneName ? `Local time · ${timeZoneName}` : `Local time · ${timeZone}`
}

function shortName(value: string): string {
  const [firstName, ...rest] = value.split(' ')
  const lastInitial = rest.at(-1)?.charAt(0)

  return lastInitial ? `${firstName} ${lastInitial}.` : value
}

function App() {
  const [state, setState] = useState<PublicTournamentState>()
  const [isOrganiserMode, setIsOrganiserMode] = useState(() =>
    new URLSearchParams(window.location.search).has('organiser'),
  )
  const [adminSecret, setAdminSecret] = useState(() => sessionStorage.getItem('worldCupAdminSecret') ?? '')
  const [participantName, setParticipantName] = useState('')
  const [notice, setNotice] = useState('Loading tournament state...')
  const [isBusy, setIsBusy] = useState(false)

  const refreshState = useCallback(async () => {
    try {
      setState(await fetchTournamentState())
      setNotice('Tournament state loaded from the API.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to load tournament state.')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshState()
  }, [refreshState])

  useEffect(() => {
    if (adminSecret) {
      sessionStorage.setItem('worldCupAdminSecret', adminSecret)
    } else {
      sessionStorage.removeItem('worldCupAdminSecret')
    }
  }, [adminSecret])

  const groups = useMemo(
    () => (state ? [...new Set(state.standings.map((standing) => standing.group))] : []),
    [state],
  )
  const liveMatch = state?.matches.find((match) => match.status === 'live')
  const upcomingFixtures = state?.matches.filter((match) => match.status !== 'full-time').slice(0, 4) ?? []
  const recentScores = state?.matches.filter((match) => match.status === 'full-time').slice(0, 4) ?? []
  const hasAdminSecret = Boolean(adminSecret.trim())

  async function runOrganiserAction(
    action: () => Promise<PublicTournamentState>,
    successMessage: string,
  ) {
    if (!adminSecret.trim()) {
      setNotice('Enter the organiser secret before running organiser actions.')
      return
    }

    setIsBusy(true)
    try {
      setState(await action())
      setNotice(successMessage)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Organiser action failed.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleParticipantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await runOrganiserAction(
      () => saveParticipant(participantName, adminSecret),
      `Added ${participantName.trim()} to the sweepstake.`,
    )
    setParticipantName('')
  }

  if (!state) {
    return (
      <main className="app-shell loading-shell">
        <div className="stadium-glow" aria-hidden="true" />
        <p className="eyebrow">World Cup Sweepstake</p>
        <h1>Loading control room</h1>
        <p className="hero-summary">{notice}</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="stadium-backdrop" aria-hidden="true" />
      <motion.section
        className="control-room"
        aria-labelledby="page-title"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut' }}
      >
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">26</div>
            <div>
              <h1 id="page-title">World Cup Sweepstake</h1>
              <span>{state.metadata.totalTeamSlots} teams</span>
            </div>
          </div>
          <nav className="top-nav" aria-label="Dashboard sections">
            <a href="#overview" aria-current="page">Overview</a>
            <a href="#groups">Groups</a>
            <a href="#fixtures">Fixtures</a>
            <a href="#bracket">Bracket</a>
            <a href="#leaderboard">Leaderboard</a>
            <a href="#rules">Rules</a>
          </nav>
          <div className="topbar-actions" aria-label="Tournament snapshot">
            <span className="status-chip" title={state.draw ? `Draw locked · ${state.draw.seed}` : 'Awaiting draw'}>
              {state.draw ? `Draw locked · ${state.draw.seed}` : 'Awaiting draw'}
            </span>
            <span>{state.metadata.assignedTeamCount}/{state.participants.length || state.metadata.totalTeamSlots} assigned</span>
          </div>
        </header>

        <section className="admin-panel" aria-labelledby="organiser-heading">
        {isOrganiserMode ? (
          <>
            <div>
              <p className="eyebrow">Organiser</p>
              <h2 id="organiser-heading">Setup controls</h2>
              <p className="admin-copy" role="status" aria-live="polite" data-testid="organiser-status">
                {notice}
              </p>
            </div>
            <div className="admin-controls">
              <label>
                <span>Admin secret</span>
                <input
                  aria-label="Admin secret"
                  type="password"
                  value={adminSecret}
                  onChange={(event) => setAdminSecret(event.target.value)}
                  placeholder="x-admin-secret"
                />
              </label>
              <form className="participant-form" onSubmit={handleParticipantSubmit}>
                <label>
                  <span>Participant full name</span>
                  <input
                    aria-label="Participant full name"
                    value={participantName}
                    onChange={(event) => setParticipantName(event.target.value)}
                    placeholder="Alex Morgan"
                    disabled={Boolean(state.draw) || isBusy}
                  />
                </label>
                <button type="submit" disabled={Boolean(state.draw) || isBusy || !participantName.trim()}>
                  Add participant
                </button>
              </form>
              <div className="button-row">
                <button
                  type="button"
                  disabled={isBusy || !hasAdminSecret}
                  onClick={() =>
                    void runOrganiserAction(() => importTeams(adminSecret), 'Teams refreshed from fixture data.')
                  }
                >
                  Import teams
                </button>
                <button
                  type="button"
                  disabled={Boolean(state.draw) || isBusy || !hasAdminSecret}
                  onClick={() => void runOrganiserAction(() => runDraw(adminSecret), 'Draw locked permanently.')}
                >
                  Run draw
                </button>
                <button
                  type="button"
                  disabled={isBusy || !hasAdminSecret}
                  onClick={() => void runOrganiserAction(() => syncTournament(adminSecret), 'Tournament data synced.')}
                >
                  Sync data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminSecret('')
                    setIsOrganiserMode(false)
                    setNotice('Public tournament board loaded.')
                    window.history.replaceState(null, '', window.location.pathname)
                  }}
                >
                  Close organiser
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="organiser-gate">
            <div>
              <p className="eyebrow">Public view</p>
              <h2 id="organiser-heading">Tournament board</h2>
              <p className="admin-copy">Organiser controls are hidden from the public board.</p>
            </div>
            <button type="button" onClick={() => setIsOrganiserMode(true)}>
              Organiser sign-in
            </button>
          </div>
        )}
        </section>

        {isOrganiserMode && (
          <section className="participant-dock" aria-label="Participant setup">
            <div className="section-heading">
              <p className="eyebrow">Entrants</p>
              <h2>Participant setup</h2>
            </div>
            <div className="assignment-list">
              {state.participants.length === 0 ? (
                <EmptyLine title="No participants entered" detail="Add full names before running the draw." />
              ) : (
                <ParticipantList
                  participants={state.participants}
                  drawLocked={Boolean(state.draw)}
                  isBusy={isBusy}
                  onRemove={(participant) =>
                    void runOrganiserAction(
                      () => deleteParticipant(participant.id, adminSecret),
                      `Removed ${participant.fullName}.`,
                    )
                  }
                />
              )}
            </div>
          </section>
        )}

        <section className="dashboard-grid" aria-label="Tournament command centre" id="overview">
          <motion.section className="panel group-panel" id="groups" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <PanelHeading eyebrow="Group stage" title="Tables" />
            <div className="group-grid">
              {groups.map((group) => (
                <div className="group-table" key={group}>
                  <h3>Group {group}</h3>
                  {state.standings
                    .filter((standing) => standing.group === group)
                    .map((standing) => {
                      const team = getTeam(state, standing.teamId)

                      return (
                        <div className="standing-row" key={standing.teamId}>
                          {team ? <FlagIcon team={team} /> : <span />}
                          <strong>{team?.fifaCode ?? standing.teamId}</strong>
                          <span>{standing.points}</span>
                        </div>
                      )
                    })}
                </div>
              ))}
            </div>
            <div className="legend-row">
              <span><i className="legend-dot legend-qualified" /> Qualified</span>
              <span><i className="legend-dot legend-playoff" /> Playoff</span>
              <span><i className="legend-dot legend-eliminated" /> Eliminated</span>
            </div>
          </motion.section>

          <motion.section className="panel bracket-panel" id="bracket" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
            <PanelHeading eyebrow="Knockout bracket" title="Tournament draw" />
            <TournamentBracket state={state} />
          </motion.section>

          <aside className="rail-panel" id="fixtures" aria-label="Fixtures and results">
            <FixturePanel title="Upcoming fixtures" matches={upcomingFixtures} state={state} empty="No upcoming fixtures" showTimezoneLabel />
            <FixturePanel title="Recent scores" matches={recentScores} state={state} empty="No recent scores" compactScore />
          </aside>

          <motion.section className="panel leaderboard-panel" id="leaderboard" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <PanelHeading eyebrow="Leaderboard" title="Sweepstake standings" />
            <div className="leaderboard-table">
              <div className="leaderboard-header">
                <span>#</span>
                <span>Participant</span>
                <span>Team</span>
                <span>Status</span>
                <span>Points</span>
              </div>
              {state.leaderboard.length > 0 ? (
                state.leaderboard.slice(0, 6).map((entry, index) => (
                  <motion.div
                    className="leaderboard-row"
                    key={entry.participant.id}
                    whileHover={{ backgroundColor: 'rgba(146, 194, 112, 0.08)' }}
                  >
                    <span className="rank">{index + 1}</span>
                    <strong>{entry.participant.fullName}</strong>
                    <span className="team-with-flag"><FlagIcon team={entry.team} /> {entry.team.name}</span>
                    <span className={`status status-${entry.status}`}>{stageLabels[entry.stage]}</span>
                    <span>{entry.points}</span>
                  </motion.div>
                ))
              ) : (
                <EmptyLine title="No locked assignments yet" detail="Add participants, then run the draw once." />
              )}
            </div>
          </motion.section>

          <section className="panel assignments-panel" aria-label="Country assignments">
            <PanelHeading eyebrow="Assignments" title="Country and person" />
            <div className="assignment-list">
              {state.assignments.length > 0 ? (
                state.assignments.slice(0, 8).map((assignment) => {
                  const participant = state.participants.find((item) => item.id === assignment.participantId)
                  const team = getTeam(state, assignment.teamId)

                  if (!participant || !team) {
                    return null
                  }

                  return (
                    <motion.div
                      className="assignment-row"
                      key={assignment.participantId}
                      whileHover={{ backgroundColor: 'rgba(146, 194, 112, 0.08)' }}
                    >
                      <span className="team-with-flag"><FlagIcon team={team} /> {team.fifaCode}</span>
                      <strong>{participant.fullName}</strong>
                      <em>{team.name}</em>
                    </motion.div>
                  )
                })
              ) : (
                <EmptyLine
                  title={state.participants.length > 0 ? `${state.participants.length} entrants awaiting draw` : 'No participants entered'}
                  detail="Assignments appear here once the organiser locks the draw."
                />
              )}
            </div>
          </section>

          <section className="panel rules-panel" id="rules" aria-label="Draw rules and setup">
            <PanelHeading eyebrow="Rules & setup" title="How it works" />
            <div className="rules-grid">
              <div className="rule-block">
                <span>01</span>
                <strong>One locked draw</strong>
                <p>The organiser adds full names, then runs the draw once. Each participant gets one team and the seed is locked for auditability.</p>
              </div>
              <div className="rule-block">
                <span>02</span>
                <strong>Progression scoring</strong>
                <p>The leaderboard follows the assigned country through WC2026 stages, then uses group points, goal difference, and goals for as tie-breakers.</p>
              </div>
              <div className="rule-block finance-block">
                <span>03</span>
                <strong>Entry split</strong>
                <p>48 entries at $10 creates a $480 pot: $240 prize pool and $240 charity contribution.</p>
              </div>
              <div className="rule-block finance-block">
                <span>04</span>
                <strong>Prize and charity</strong>
                <p>Winner $90, runner-up $60, third $30, group heroes $30, wooden spoon $30. With Microsoft matching, the charity total can reach $480 for UNICEF.</p>
              </div>
            </div>
          </section>

          <section className="panel live-panel" aria-label="Live feed">
            <PanelHeading eyebrow="Live feed" title={liveMatch ? formatMatch(state, liveMatch) : 'Awaiting sync'} />
            <p>{liveMatch ? liveMatch.venue : `${state.metadata.provider} · ${state.metadata.syncCadence} sync`}</p>
          </section>
        </section>
      </motion.section>
    </main>
  )
}

function PanelHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  )
}

function FlagIcon({ team }: { team: Team }) {
  return <img className="flag-icon" src={getFlagSrc(team)} alt={`${team.name} flag`} loading="lazy" />
}

function FixturePanel({
  title,
  matches,
  state,
  empty,
  compactScore = false,
  showTimezoneLabel = false,
}: {
  title: string
  matches: Match[]
  state: PublicTournamentState
  empty: string
  compactScore?: boolean
  showTimezoneLabel?: boolean
}) {
  return (
    <section className="side-card">
      <div className="side-card-heading">
        <h2>{title}</h2>
        {showTimezoneLabel ? <span>{getLocalTimeZoneLabel()}</span> : null}
      </div>
      {matches.length > 0 ? (
        <div className="fixture-list">
          {matches.map((match) => {
            const home = getTeam(state, match.homeTeamId)
            const away = getTeam(state, match.awayTeamId)
            const score = match.score ? `${match.score.home} - ${match.score.away}` : formatKickoff(match.kickoff)

            return (
              <div className="fixture-row" key={match.id}>
                <span className="team-with-flag">{home ? <FlagIcon team={home} /> : null} {home?.fifaCode ?? match.homeTeamId}</span>
                <strong>{compactScore ? score : match.status === 'live' ? 'Live' : score}</strong>
                <span className="team-with-flag">{away ? <FlagIcon team={away} /> : null} {away?.fifaCode ?? match.awayTeamId}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyLine title={empty} detail="Sync tournament data to refresh this panel." />
      )}
    </section>
  )
}

interface EmptyLineProps {
  title: string
  detail: string
}

function EmptyLine({ title, detail }: EmptyLineProps) {
  return (
    <div className="empty-line">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

interface ParticipantListProps {
  participants: Participant[]
  drawLocked: boolean
  isBusy: boolean
  onRemove: (participant: Participant) => void
}

function ParticipantList({ participants, drawLocked, isBusy, onRemove }: ParticipantListProps) {
  if (participants.length === 0) {
    return <EmptyLine title="No participants entered" detail="Use organiser controls to add full names." />
  }

  return participants.slice(0, 8).map((participant, index) => (
    <motion.div
      className="assignment-row"
      key={participant.id}
      whileHover={{ backgroundColor: 'rgba(217, 177, 90, 0.08)' }}
    >
      <span>{String(index + 1).padStart(2, '0')}</span>
      <strong>{participant.fullName}</strong>
      <button type="button" disabled={drawLocked || isBusy} onClick={() => onRemove(participant)}>
        Remove
      </button>
    </motion.div>
  ))
}

interface TournamentBracketProps {
  state: PublicTournamentState
}

interface BracketTeamSlot {
  team?: Team
  participant?: Participant
  isWinner: boolean
}

function TournamentBracket({ state }: TournamentBracketProps) {
  const rounds = buildBracketRounds(state)

  return (
    <div className="tournament-bracket" aria-label="Tournament draw visualiser">
      {rounds.length > 0 ? (
        rounds.map((round, roundIndex) => (
          <BracketColumn title={round.title} key={round.title}>
            {round.matches.map((match) => (
              <BracketMatch
                key={match.match.id}
                label={match.label}
                isFinal={roundIndex === rounds.length - 1}
              >
                <TeamSlot slot={match.homeSlot} />
                <TeamSlot slot={match.awaySlot} />
              </BracketMatch>
            ))}
          </BracketColumn>
        ))
      ) : (
        <BracketColumn title="Knockout pending">
          <BracketMatch label="Live bracket">
            <EmptyTeamSlot label="Qualifiers appear here" />
            <EmptyTeamSlot label="Populates from API results" />
          </BracketMatch>
        </BracketColumn>
      )}
    </div>
  )
}

interface BracketRound {
  title: string
  abbreviation: string
  matches: Array<{
    match: Match
    label: string
    homeSlot: BracketTeamSlot
    awaySlot: BracketTeamSlot
  }>
}

function buildBracketRounds(state: PublicTournamentState): BracketRound[] {
  const participantById = new Map(state.participants.map((participant) => [participant.id, participant]))
  const assignmentByTeamId = new Map(state.assignments.map((assignment) => [assignment.teamId, assignment]))

  return bracketStages
    .map((round) => {
      const matches = state.matches
        .filter((match) => match.stage === round.stage)
        .sort((left, right) =>
          new Date(left.kickoff).getTime() - new Date(right.kickoff).getTime() ||
          left.id.localeCompare(right.id),
        )
        .map((match, index) => ({
          match,
          label: `${round.abbreviation} ${index + 1}`,
          homeSlot: buildBracketTeamSlot(state, participantById, assignmentByTeamId, match.homeTeamId, match),
          awaySlot: buildBracketTeamSlot(state, participantById, assignmentByTeamId, match.awayTeamId, match),
        }))

      return { title: round.title, abbreviation: round.abbreviation, matches }
    })
    .filter((round) => round.matches.length > 0)
}

function buildBracketTeamSlot(
  state: PublicTournamentState,
  participantById: Map<string, Participant>,
  assignmentByTeamId: Map<string, { participantId: string }>,
  teamId: string,
  match: Match,
): BracketTeamSlot {
  const team = getTeam(state, teamId)

  if (!team || !shouldShowTeamInMatch(team, match)) {
    return { isWinner: false }
  }

  const assignment = assignmentByTeamId.get(team.id)

  return {
    team,
    participant: assignment ? participantById.get(assignment.participantId) : undefined,
    isWinner: match.winnerTeamId === team.id,
  }
}

function shouldShowTeamInMatch(team: Team, match: Match): boolean {
  if (match.status !== 'scheduled' || match.score || match.winnerTeamId) {
    return true
  }

  return (stageRank[team.stage] ?? 0) >= (stageRank[match.stage] ?? 0)
}

interface BracketColumnProps {
  title: string
  children: React.ReactNode
}

function BracketColumn({ title, children }: BracketColumnProps) {
  return (
    <div className="bracket-column">
      <h3>{title}</h3>
      <div className="bracket-column-stack">{children}</div>
    </div>
  )
}

interface BracketMatchProps {
  label: string
  children: React.ReactNode
}

function BracketMatch({ label, children, isFinal = false }: BracketMatchProps & { isFinal?: boolean }) {
  return (
    <motion.div className={`bracket-match ${isFinal ? 'bracket-final' : ''}`} whileHover={{ x: 4 }}>
      <span className="match-label">{label}</span>
      {children}
    </motion.div>
  )
}

function TeamSlot({ slot }: { slot: BracketTeamSlot }) {
  if (!slot.team) {
    return <EmptyTeamSlot label="Qualifier pending" />
  }

  return (
    <div className={`team-slot ${slot.participant ? 'team-slot-owned' : ''} ${slot.isWinner ? 'team-slot-winner' : ''}`}>
      <FlagIcon team={slot.team} />
      <strong>{slot.team.fifaCode}</strong>
      <span>{slot.participant ? shortName(slot.participant.fullName) : 'No entrant assigned'}</span>
      <em>{slot.team.name}</em>
    </div>
  )
}

function EmptyTeamSlot({ label }: { label: string }) {
  return (
    <div className="team-slot">
      <span className="flag-icon flag-placeholder" aria-hidden="true" />
      <strong>TBD</strong>
      <span>{label}</span>
      <em>Awaiting team</em>
    </div>
  )
}

export default App
