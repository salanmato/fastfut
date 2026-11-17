export type RoleCategory = "GK" | "DEF" | "MID" | "ATT";

export type Formation = "4-3-3" | "4-4-2" | "4-2-3-1" | "3-5-2" | "5-3-2";

export type Mentality = "Defensive" | "Balanced" | "Attacking";

export type Pressing = "Low" | "Medium" | "High";

export type PassingStyle = "Short" | "Mixed" | "Direct";

export type PitchStyle = "Fast" | "Balanced" | "Heavy";

export interface StadiumConfig {
  ticketPriceEur: number;
  pitchStyle: PitchStyle;
  vipLevel: number; // 1..5
  turfLevel: number; // 1..5
  totalHomeMatches: number;
  totalGateRevenueEur: number;
  avgAttendance: number;
}

export type EnglishDivision =
  | "Premier League"
  | "EFL Championship"
  | "EFL League One"
  | "EFL League Two";

export interface Club {
  id: number;
  name: string;
  shortName: string;
  division?: EnglishDivision;
  tier?: number; // 1..4
  primaryColor: string;
  secondaryColor: string;
  badgeUrl?: string;
  stadiumImageUrl?: string;
  stadium: string;
  city: string;
  capacity: number;
  capacityNote: string;
  foundedYear: number;
  status: string;
  previousSeasonContext: string;
  manager: string;
  managerNationality: string;
  managerAppointed: string;
  previousClub: string;
  notableHonours: string;
  transferBudgetEur: number;
  wageBudgetWeeklyEur: number;
  avgOverall: number;
}

export interface Referee {
  id: number;
  name: string;
  country: string;
  avgCardsPerGame: number;
}

export interface PlayerAttributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physicality: number;
  reflexes: number;
}

export interface PlayerDetailedStats {
  acceleration: number;
  sprintSpeed: number;
  positioning: number;
  finishing: number;
  shotPower: number;
  longShots: number;
  vision: number;
  crossing: number;
  shortPassing: number;
  longPassing: number;
  dribbling: number;
  agility: number;
  reactions: number;
  ballControl: number;
  composure: number;
  interceptions: number;
  headingAccuracy: number;
  defensiveAwareness: number;
  standingTackle: number;
  slidingTackle: number;
  jumping: number;
  stamina: number;
  strength: number;
  aggression: number;
}

export interface Player {
  id: number;
  eaId: number;
  name: string;
  fullName: string;
  clubId: number | null;
  clubName: string;
  league: string;
  overall: number;
  potential: number;
  primaryPosition: string;
  positions: string[];
  roleCategory: RoleCategory;
  nationality: string;
  age: number;
  heightCm: number;
  weightKg: number;
  preferredFoot: string;
  weakFoot: number;
  skillMoves: number;
  accelerateType: string;
  playstylesPlus: string[];
  playstylesBase: string[];
  fcIqRoles: string;
  faceStats: PlayerAttributes;
  stats: PlayerDetailedStats;
  imageUrl: string;
  marketValueEur: number;
  wageEur: number;
  contractUntil: string;
  morale: number;
  stamina: number;
  seasonGoals: number;
  seasonAssists: number;
  seasonAppearances: number;
  seasonYellowCards: number;
  seasonRedCards: number;
  seasonAvgRating: number;
  shirtNumber?: number;
  preferredNumbers?: number[];
  injuryMatchesLeft?: number;
  injuryType?: string;
}

export type MatchEventType =
  | "goal"
  | "chance"
  | "save"
  | "yellow_card"
  | "red_card"
  | "injury"
  | "substitution";

export interface MatchEvent {
  id: string;
  minute: number;
  type: MatchEventType;
  clubId: number;
  playerId: number;
  playerName: string;
  assistPlayerId?: number;
  assistPlayerName?: string;
  text: string;
}

export interface MatchTeamStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface MatchInjury {
  playerId: number;
  clubId: number;
  injuryType: string;
  matchesOut: number;
}

export interface MatchResult {
  fixtureId: number;
  homeGoals: number;
  awayGoals: number;
  homeStats: MatchTeamStats;
  awayStats: MatchTeamStats;
  events: MatchEvent[];
  playerRatings: Record<number, number>;
  motmPlayerId?: number;
  attendance?: number;
  stadiumCapacity?: number;
  gateRevenueEur?: number;
  homeAdvantagePct?: number;
  injuries?: MatchInjury[];
}

export interface Fixture {
  id: number;
  matchweek: number;
  date: string;
  kickoffTimeUk: string;
  homeClubId: number;
  awayClubId: number;
  tvBroadcaster: string;
  refereeId: number;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  result?: MatchResult;
}

export interface Tactics {
  formation: Formation;
  mentality: Mentality;
  pressing: Pressing;
  passingStyle: PassingStyle;
  starters: number[];
  bench: number[];
}

export interface StandingRow {
  position: number;
  club: Club;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ("W" | "D" | "L")[];
}

export interface NewsItem {
  id: string;
  matchweek: number;
  category: "match" | "transfer" | "league" | "injury" | "stadium" | "cup";
  title: string;
  body: string;
  clubId?: number;
}

export interface FACupTie {
  id: string;
  roundIndex: number; // 0..5
  homeClubId: number;
  awayClubId: number;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  winnerClubId: number | null;
}

export interface FACupRound {
  index: number; // 0..5
  name: string;
  shortName: string;
  triggerMatchweek: number;
  date: string;
  prizeEur: number;
  completed: boolean;
  ties: FACupTie[];
}

export interface FACupState {
  season: string;
  currentRoundIndex: number;
  championClubId: number | null;
  rounds: FACupRound[];
}

export interface RawDatabase {
  season: string;
  league: string;
  clubs: Club[];
  referees: Referee[];
  players: Player[];
  fixtures: Fixture[];
}

export interface PastSeasonRecord {
  season: string;
  division: string;
  position: number;
  points: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  championClubName: string;
  faCupChampionName?: string;
  clubMvpName?: string;
  clubTopScorerName?: string;
}

export interface SaveState {
  version: number;
  managerName: string;
  userClubId: number;
  currentMatchweek: number;
  seasonFinished: boolean;
  season?: string;
  seasonNumber?: number;
  seasonHistory?: PastSeasonRecord[];
  clubs: Club[];
  referees: Referee[];
  players: Player[];
  fixtures: Fixture[];
  tacticsByClub: Record<number, Tactics>;
  stadiumByClub?: Record<number, StadiumConfig>;
  kitTheme?: "home" | "away";
  autoOpenFormationOnRedCard?: boolean;
  currentDate?: string;
  shortlistIds?: number[];
  allowTransfersOutsideWindow?: boolean;
  faCup?: FACupState;
  news: NewsItem[];
}
