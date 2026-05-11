import type { Team } from '@world-cup/shared'

const fifaCodeToFlagCode: Record<string, string> = {
  ARG: 'ar',
  AUS: 'au',
  BEL: 'be',
  BOL: 'bo',
  BRA: 'br',
  CAN: 'ca',
  CHI: 'cl',
  CIV: 'ci',
  COL: 'co',
  CRC: 'cr',
  CRO: 'hr',
  DEN: 'dk',
  ENG: 'gb-eng',
  ESP: 'es',
  FRA: 'fr',
  GER: 'de',
  GHA: 'gh',
  HAI: 'ht',
  IND: 'in',
  ITA: 'it',
  JPN: 'jp',
  KOR: 'kr',
  KSA: 'sa',
  MAR: 'ma',
  MEX: 'mx',
  NED: 'nl',
  NIR: 'gb-nir',
  NOR: 'no',
  NZL: 'nz',
  PER: 'pe',
  POL: 'pl',
  POR: 'pt',
  QAT: 'qa',
  RSA: 'za',
  SCO: 'gb-sct',
  SEN: 'sn',
  SRB: 'rs',
  SUI: 'ch',
  TUN: 'tn',
  TUR: 'tr',
  UAE: 'ae',
  URU: 'uy',
  USA: 'us',
  WAL: 'gb-wls',
}

export function getFlagSrc(team: Team): string {
  const flagCode = fifaCodeToFlagCode[team.fifaCode.toUpperCase()]

  return flagCode ? `/flags/${flagCode}.svg` : '/flags/un.svg'
}
