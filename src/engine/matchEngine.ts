import type {
  Club,
  Fixture,
  Formation,
  MatchEvent,
  MatchInjury,
  MatchResult,
  MatchTeamStats,
  Player,
  Referee,
  StadiumConfig,
  Tactics,
} from "../types/game";
import { getFormationSlots } from "../utils/format";
import { evaluateShirtNumberAffinity } from "../utils/shirtNumbers";
import type { TeamSynergyResult } from "./synergyEngine";

export interface TeamPower {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  overall: number;
  synergyScore?: number;
  synergyMultiplier?: number;
  synergyTierLabel?: string;
}

export interface MatchStadiumMetrics {
  ticketPriceEur: number;
  occupancyRate: number;
  attendance: number;
  stadiumCapacity: number;
  gateRevenueEur: number;
  homeBoost: number;
  homeAdvantagePct: number;
  homeSynergy?: TeamSynergyResult;
  awaySynergy?: TeamSynergyResult;
}

export interface LivePitchContext {
  ballX: number;
  ballY: number;
  carrierId: number | null;
  carrierClubId: number;
  lastPasserId: number | null;
  closestDefenderId: number | null;
  playPhase: "build_up" | "progression" | "final_third" | "counter";
  attackProgress: number;
  pendingVisualShot?: boolean;
}

export interface LiveMatchSession {
  fixtureId: number;
  homeClubId: number;
  awayClubId: number;
  minute: number;
  firstHalfExtra: number;
  firstHalfEnd: number;
  secondHalfExtra: number;
  stoppageEnd: number;
  isHalftime?: boolean;
  secondHalfStarted?: boolean;
  finished: boolean;
  homeGoals: number;
  awayGoals: number;
  homeStats: MatchTeamStats;
  awayStats: MatchTeamStats;
  events: MatchEvent[];
  homeActiveIds: number[];
  awayActiveIds: number[];
  homeBenchIds: number[];
  awayBenchIds: number[];
  homeSubbedOutIds: number[];
  awaySubbedOutIds: number[];
  homeSubsUsed: number;
  awaySubsUsed: number;
  yellowCardedIds: number[];
  redCardedIds: number[];
  injuredIds: number[];
  injuries: MatchInjury[];
  playerStamina: Record<number, number>;
  playerRatings: Record<number, number>;
  possessionAccumulatorHome: number;
  possessionTicks: number;
  referee: Referee;
  attendance: number;
  stadiumCapacity: number;
  gateRevenueEur: number;
  homeAdvantagePct: number;
  homeSynergy?: TeamSynergyResult;
  awaySynergy?: TeamSynergyResult;
  pitchContext?: LivePitchContext;
}

export function autoPickLineup(
  players: Player[],
  formation: Formation
): { starters: number[]; bench: number[] } {
  const slots = getFormationSlots(formation);
  const healthy = players.filter((p) => (p.injuryMatchesLeft ?? 0) === 0);
  const injured = players.filter((p) => (p.injuryMatchesLeft ?? 0) > 0);
  const available = healthy.length >= 11 ? [...healthy] : [...healthy, ...injured];
  const starters: number[] = [];

  const effectiveOvr = (p: Player) => p.overall * (0.65 + 0.35 * (p.stamina / 100));

  for (const slot of slots) {
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < available.length; i++) {
      const p = available[i];
      let posBonus = 0;
      if (p.primaryPosition === slot.preferredPositions[0]) {
        posBonus = 18;
      } else if (slot.preferredPositions.some((pos) => p.positions.includes(pos))) {
        posBonus = 12;
      } else if (p.roleCategory === slot.roleCategory) {
        posBonus = 6;
      } else if (slot.roleCategory === "GK" || p.roleCategory === "GK") {
        posBonus = -45;
      }

      const score = effectiveOvr(p) + posBonus;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      starters.push(available[bestIdx].id);
      available.splice(bestIdx, 1);
    }
  }

  // Pick 7 balanced bench players (1 GK, 2 DEF, 2 MID, 2 ATT)
  const bench: number[] = [];
  const desiredBenchRoles: Array<Player["roleCategory"]> = [
    "GK",
    "DEF",
    "DEF",
    "MID",
    "MID",
    "ATT",
    "ATT",
  ];
  available.sort((a, b) => effectiveOvr(b) - effectiveOvr(a));

  for (const role of desiredBenchRoles) {
    const idx = available.findIndex((p) => p.roleCategory === role);
    if (idx >= 0) {
      bench.push(available[idx].id);
      available.splice(idx, 1);
    }
  }
  while (bench.length < 7 && available.length > 0) {
    const next = available.shift()!;
    bench.push(next.id);
  }

  return { starters, bench };
}

export function createDefaultTactics(players: Player[], clubAvgOverall: number): Tactics {
  const formations: Formation[] =
    clubAvgOverall >= 82
      ? ["4-3-3", "4-2-3-1"]
      : clubAvgOverall >= 76
      ? ["4-2-3-1", "4-4-2", "4-3-3"]
      : ["4-4-2", "5-3-2", "3-5-2"];
  const formation = formations[players.length % formations.length];
  const { starters, bench } = autoPickLineup(players, formation);

  return {
    formation,
    mentality: clubAvgOverall >= 82 ? "Attacking" : clubAvgOverall >= 75 ? "Balanced" : "Defensive",
    pressing: clubAvgOverall >= 80 ? "High" : "Medium",
    passingStyle: clubAvgOverall >= 81 ? "Short" : "Mixed",
    starters,
    bench,
  };
}

export function createDefaultStadiumConfig(club: Club): StadiumConfig {
  const defaultPrice = Math.round(
    Math.max(45, Math.min(75, 42 + Math.max(0, club.avgOverall - 72) * 2.2))
  );
  return {
    ticketPriceEur: defaultPrice,
    pitchStyle: "Balanced",
    vipLevel: club.avgOverall >= 82 ? 2 : 1,
    turfLevel: club.avgOverall >= 82 ? 2 : 1,
    totalHomeMatches: 0,
    totalGateRevenueEur: 0,
    avgAttendance: 0,
  };
}

export function computeMatchStadiumMetrics(
  homeClub: Club,
  awayClub: Club,
  config?: StadiumConfig
): MatchStadiumMetrics {
  const cfg = config ?? createDefaultStadiumConfig(homeClub);
  const ticketPrice = cfg.ticketPriceEur;
  const fairPrice =
    45 +
    Math.max(0, (homeClub.avgOverall - 72) * 2.2) +
    Math.max(0, (awayClub.avgOverall - 78) * 1.1);
  const matchAppeal = (homeClub.avgOverall + awayClub.avgOverall) / 2;
  const appealBonus = (matchAppeal - 76) * 0.008;
  const priceImpact = (fairPrice - ticketPrice) * 0.0045;

  const occupancyRate = Math.max(
    0.72,
    Math.min(1.0, 0.92 + appealBonus + priceImpact)
  );
  const attendance = Math.round(homeClub.capacity * occupancyRate);
  const vipBonusEur = cfg.vipLevel * 350_000;
  const gateRevenueEur = Math.round(attendance * ticketPrice + vipBonusEur);
  const homeBoost =
    1.02 +
    Math.min(0.045, (attendance / 75000) * 0.045 * occupancyRate) +
    (cfg.turfLevel - 1) * 0.004;
  const homeAdvantagePct = Math.round((homeBoost - 1) * 1000) / 10;

  return {
    ticketPriceEur: ticketPrice,
    occupancyRate,
    attendance,
    stadiumCapacity: homeClub.capacity,
    gateRevenueEur,
    homeBoost,
    homeAdvantagePct,
  };
}

export function computeTeamPower(
  activePlayers: Player[],
  tactics: Tactics,
  isHome: boolean,
  stadiumCapacity: number,
  redCards = 0,
  staminaOverrides?: Record<number, number>,
  stadiumConfig?: StadiumConfig,
  attendanceOverride?: number,
  synergy?: TeamSynergyResult
): TeamPower {
  if (activePlayers.length === 0) {
    return {
      attack: 60,
      midfield: 60,
      defense: 60,
      goalkeeper: 60,
      overall: 60,
      synergyScore: synergy?.overallScore,
      synergyMultiplier: synergy?.overallMultiplier,
      synergyTierLabel: synergy?.tierLabel,
    };
  }

  const getEff = (p: Player, val: number) => {
    const stam = staminaOverrides?.[p.id] ?? p.stamina;
    const fatigueFactor = 0.72 + 0.28 * (Math.max(15, stam) / 100);
    const shirtFactor = evaluateShirtNumberAffinity(p).multiplier;
    return val * fatigueFactor * shirtFactor;
  };

  const gks = activePlayers.filter((p) => p.roleCategory === "GK");
  const defs = activePlayers.filter((p) => p.roleCategory === "DEF");
  const mids = activePlayers.filter((p) => p.roleCategory === "MID");
  const atts = activePlayers.filter((p) => p.roleCategory === "ATT");

  const avg = (arr: number[], fallback: number) =>
    arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : fallback;

  const gkScore = gks.length
    ? avg(
        gks.map((p) => getEff(p, p.overall * 0.55 + p.faceStats.reflexes * 0.45)),
        72
      )
    : 52;

  const defList = defs.length ? defs : activePlayers.filter((p) => p.roleCategory !== "GK");
  const defScore = avg(
    defList.map((p) =>
      getEff(
        p,
        p.faceStats.defending * 0.55 + p.faceStats.physicality * 0.25 + p.overall * 0.2
      )
    ),
    70
  );

  const midList = mids.length ? mids : activePlayers.filter((p) => p.roleCategory !== "GK");
  const midScore = avg(
    midList.map((p) =>
      getEff(
        p,
        p.faceStats.passing * 0.4 + p.faceStats.dribbling * 0.3 + p.overall * 0.3
      )
    ),
    72
  );

  const attPool = [...atts, ...mids.filter((p) => p.primaryPosition === "CAM")];
  const attList = attPool.length ? attPool : activePlayers.filter((p) => p.roleCategory !== "GK");
  const attScore = avg(
    attList.map((p) =>
      getEff(
        p,
        p.faceStats.shooting * 0.42 +
          p.faceStats.pace * 0.23 +
          p.faceStats.dribbling * 0.2 +
          p.overall * 0.15
      )
    ),
    72
  );

  // Tactical modifiers
  let attMod = 1.0;
  let midMod = 1.0;
  let defMod = 1.0;

  if (tactics.mentality === "Attacking") {
    attMod += 0.065;
    midMod += 0.02;
    defMod -= 0.05;
  } else if (tactics.mentality === "Defensive") {
    attMod -= 0.06;
    defMod += 0.065;
  }

  if (tactics.pressing === "High") {
    midMod += 0.04;
    attMod += 0.02;
  } else if (tactics.pressing === "Low") {
    defMod += 0.03;
  }

  if (tactics.passingStyle === "Short") {
    midMod += 0.035;
  } else if (tactics.passingStyle === "Direct") {
    attMod += 0.03;
    midMod -= 0.02;
  }

  // Stadium pitch style synergy for home team
  if (isHome && stadiumConfig) {
    if (stadiumConfig.pitchStyle === "Fast" && tactics.passingStyle === "Short") {
      midMod += 0.025;
      attMod += 0.025;
    } else if (stadiumConfig.pitchStyle === "Heavy" && tactics.passingStyle === "Direct") {
      attMod += 0.025;
      defMod += 0.025;
    }
  }

  // Synergy sector multipliers (entrosamento por setor e tempo juntos)
  if (synergy) {
    attMod *= synergy.sectors.attack.multiplier;
    midMod *= synergy.sectors.midfield.multiplier;
    defMod *= synergy.sectors.defense.multiplier;
  }

  let homeBoost = 1.0;
  if (isHome) {
    const effectiveAttendance = attendanceOverride ?? Math.round(stadiumCapacity * 0.92);
    const occRatio = stadiumCapacity > 0 ? Math.min(1, effectiveAttendance / stadiumCapacity) : 0.92;
    const turfBonus = ((stadiumConfig?.turfLevel ?? 1) - 1) * 0.004;
    homeBoost =
      1.02 +
      Math.min(0.045, (effectiveAttendance / 75000) * 0.045 * occRatio) +
      turfBonus;
  }

  const redPenalty = Math.pow(0.84, redCards);

  const attack = Math.round(attScore * attMod * homeBoost * redPenalty * 10) / 10;
  const midfield = Math.round(midScore * midMod * homeBoost * redPenalty * 10) / 10;
  const defense = Math.round(defScore * defMod * homeBoost * redPenalty * 10) / 10;
  const goalkeeper = Math.round(gkScore * (isHome ? 1.015 : 1.0) * 10) / 10;
  const overall = Math.round(((attack + midfield + defense + goalkeeper) / 4) * 10) / 10;

  return {
    attack,
    midfield,
    defense,
    goalkeeper,
    overall,
    synergyScore: synergy?.overallScore,
    synergyMultiplier: synergy?.overallMultiplier,
    synergyTierLabel: synergy?.tierLabel,
  };
}

function weightedPick<T>(items: T[], weightFn: (item: T) => number): T {
  const weights = items.map((item) => Math.max(0.01, weightFn(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function initLiveMatchSession(
  fixture: Fixture,
  homePlayers: Player[],
  awayPlayers: Player[],
  homeTactics: Tactics,
  awayTactics: Tactics,
  referee: Referee,
  homeClub?: Club,
  awayClub?: Club,
  homeStadiumConfig?: StadiumConfig,
  homeSynergy?: TeamSynergyResult,
  awaySynergy?: TeamSynergyResult
): LiveMatchSession {
  const homeActiveIds = [...homeTactics.starters];
  const awayActiveIds = [...awayTactics.starters];

  const playerStamina: Record<number, number> = {};
  const playerRatings: Record<number, number> = {};

  for (const p of [...homePlayers, ...awayPlayers]) {
    playerStamina[p.id] = Math.max(45, p.stamina);
  }
  for (const id of [...homeActiveIds, ...awayActiveIds]) {
    playerRatings[id] = 6.5;
  }

  const stadiumMetrics =
    homeClub && awayClub
      ? computeMatchStadiumMetrics(homeClub, awayClub, homeStadiumConfig)
      : {
          attendance: 32000,
          stadiumCapacity: 35000,
          gateRevenueEur: 1950000,
          homeAdvantagePct: 4.0,
        };

  const firstHalfExtra = 1 + Math.floor(Math.random() * 3);
  const secondHalfExtra = 3 + Math.floor(Math.random() * 4);
  const firstHalfEnd = 45 + firstHalfExtra;
  const stoppageEnd = 90 + secondHalfExtra;

  return {
    fixtureId: fixture.id,
    homeClubId: fixture.homeClubId,
    awayClubId: fixture.awayClubId,
    minute: 0,
    firstHalfExtra,
    firstHalfEnd,
    secondHalfExtra,
    stoppageEnd,
    isHalftime: false,
    secondHalfStarted: false,
    finished: false,
    homeGoals: 0,
    awayGoals: 0,
    homeStats: {
      possession: 50,
      shots: 0,
      shotsOnTarget: 0,
      xg: 0,
      corners: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      offsides: 0,
      woodwork: 0,
    },
    awayStats: {
      possession: 50,
      shots: 0,
      shotsOnTarget: 0,
      xg: 0,
      corners: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      offsides: 0,
      woodwork: 0,
    },
    events: [],
    homeActiveIds,
    awayActiveIds,
    homeBenchIds: [...homeTactics.bench],
    awayBenchIds: [...awayTactics.bench],
    homeSubbedOutIds: [],
    awaySubbedOutIds: [],
    homeSubsUsed: 0,
    awaySubsUsed: 0,
    yellowCardedIds: [],
    redCardedIds: [],
    injuredIds: [],
    injuries: [],
    playerStamina,
    playerRatings,
    possessionAccumulatorHome: 50,
    possessionTicks: 1,
    referee,
    attendance: stadiumMetrics.attendance,
    stadiumCapacity: stadiumMetrics.stadiumCapacity,
    gateRevenueEur: stadiumMetrics.gateRevenueEur,
    homeAdvantagePct: stadiumMetrics.homeAdvantagePct,
    homeSynergy,
    awaySynergy,
  };
}

export function performLiveSubstitution(
  session: LiveMatchSession,
  clubId: number,
  playerOutId: number,
  playerInId: number,
  playerOutName: string,
  playerInName: string
): boolean {
  const isHome = clubId === session.homeClubId;
  const activeIds = isHome ? session.homeActiveIds : session.awayActiveIds;
  const benchIds = isHome ? session.homeBenchIds : session.awayBenchIds;
  const subsUsed = isHome ? session.homeSubsUsed : session.awaySubsUsed;

  if (subsUsed >= 5) return false;
  const outIdx = activeIds.indexOf(playerOutId);
  const inIdx = benchIds.indexOf(playerInId);
  if (outIdx === -1 || inIdx === -1) return false;

  activeIds[outIdx] = playerInId;
  benchIds.splice(inIdx, 1);

  if (isHome) {
    session.homeSubbedOutIds.push(playerOutId);
    session.homeSubsUsed += 1;
  } else {
    session.awaySubbedOutIds.push(playerOutId);
    session.awaySubsUsed += 1;
  }

  session.playerRatings[playerInId] = session.playerRatings[playerInId] ?? 6.4;
  session.events.push({
    id: `sub-${session.fixtureId}-${session.minute}-${playerInId}`,
    minute: Math.max(1, session.minute),
    type: "substitution",
    clubId,
    playerId: playerInId,
    playerName: playerInName,
    assistPlayerId: playerOutId,
    assistPlayerName: playerOutName,
    text: `Substituição: entra ${playerInName} no lugar de ${playerOutName}.`,
  });

  return true;
}

function maybePerformAiSub(
  session: LiveMatchSession,
  isHome: boolean,
  playerMap: Map<number, Player>
): void {
  const subsUsed = isHome ? session.homeSubsUsed : session.awaySubsUsed;
  if (subsUsed >= 4) return;
  if (session.minute < 58 || session.minute > 86) return;
  if (Math.random() > 0.14) return;

  const activeIds = isHome ? session.homeActiveIds : session.awayActiveIds;
  const benchIds = isHome ? session.homeBenchIds : session.awayBenchIds;
  if (benchIds.length === 0) return;

  // Find most fatigued outfield starter
  const outfieldActive = activeIds
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p))
    .filter((p) => p.roleCategory !== "GK")
    .sort((a, b) => (session.playerStamina[a.id] ?? 100) - (session.playerStamina[b.id] ?? 100));

  const candidateOut = outfieldActive[0];
  if (!candidateOut || (session.playerStamina[candidateOut.id] ?? 100) > 76) return;

  const benchPlayers = benchIds
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p))
    .filter((p) => p.roleCategory !== "GK");
  if (benchPlayers.length === 0) return;

  const sameRole = benchPlayers
    .filter((p) => p.roleCategory === candidateOut.roleCategory)
    .sort((a, b) => b.overall - a.overall);
  const candidateIn =
    sameRole[0] ?? benchPlayers.sort((a, b) => b.overall - a.overall)[0];
  if (!candidateIn) return;

  performLiveSubstitution(
    session,
    isHome ? session.homeClubId : session.awayClubId,
    candidateOut.id,
    candidateIn.id,
    candidateOut.name,
    candidateIn.name
  );
}


const WINGER_POSITIONS = ["LW", "RW", "LM", "RM", "LAM", "RAM"];

function avgOf(players: Player[], fn: (p: Player) => number, fallback: number): number {
  if (players.length === 0) return fallback;
  return players.reduce((sum, p) => sum + fn(p), 0) / players.length;
}

/**
 * Offside risk multiplier (1.0 = league average, ~2 offsides per team per match).
 * - Direct passing / through balls and attacking mentality raise the risk.
 * - Fast attackers with weak positioning/reactions get caught more often.
 * - A high defensive line (High pressing) with good defensive awareness lays offside traps.
 */
export function computeOffsideRiskMultiplier(
  attackers: Player[],
  defenders: Player[],
  attTactics: Tactics,
  defTactics: Tactics
): number {
  const forwards = attackers.filter(
    (p) => p.roleCategory === "ATT" || p.primaryPosition === "CAM" || WINGER_POSITIONS.includes(p.primaryPosition)
  );
  const backline = defenders.filter((p) => p.roleCategory === "DEF" || p.roleCategory === "GK");

  let mult = 1;
  mult += attTactics.passingStyle === "Direct" ? 0.4 : attTactics.passingStyle === "Short" ? -0.2 : 0;
  mult += attTactics.mentality === "Attacking" ? 0.12 : attTactics.mentality === "Defensive" ? -0.12 : 0;

  // Defensive line height: High press = high line = more traps
  mult += defTactics.pressing === "High" ? 0.35 : defTactics.pressing === "Low" ? -0.25 : 0;
  mult += defTactics.mentality === "Attacking" ? 0.1 : defTactics.mentality === "Defensive" ? -0.1 : 0;

  const defAwareness = avgOf(backline, (p) => p.stats.defensiveAwareness, 70);
  mult += (defAwareness - 70) * 0.012;

  const fwdPace = avgOf(forwards, (p) => p.faceStats.pace, 75);
  const fwdTiming = avgOf(forwards, (p) => (p.stats.positioning + p.stats.reactions) / 2, 75);
  mult += (fwdPace - 75) * 0.01;
  mult -= (fwdTiming - 75) * 0.012;

  return Math.max(0.45, Math.min(2.2, mult));
}

function pickOffsideOffender(attackers: Player[], session: LiveMatchSession): Player | null {
  const candidates = attackers.filter((p) => p.roleCategory !== "GK");
  if (candidates.length === 0) return null;
  return weightedPick(candidates, (p) => {
    let role = 0.12;
    if (p.roleCategory === "ATT") role = WINGER_POSITIONS.includes(p.primaryPosition) ? 2.4 : 3.2;
    else if (p.primaryPosition === "CAM") role = 1.4;
    else if (p.roleCategory === "MID") role = 0.6;
    const pace = 0.6 + p.faceStats.pace / 100;
    const timing = 1.5 - (p.stats.positioning + p.stats.reactions) / 200;
    const stam = session.playerStamina[p.id] ?? 100;
    return role * pace * timing * (0.9 + 0.1 * (stam / 100));
  });
}

export function stepLiveMatchMinute(
  session: LiveMatchSession,
  playerMap: Map<number, Player>,
  homeClub: Club,
  awayClub: Club,
  homeTactics: Tactics,
  awayTactics: Tactics,
  userClubId: number | null,
  homeStadiumConfig?: StadiumConfig
): void {
  if (session.finished || session.isHalftime) return;

  session.minute += 1;
  const min = session.minute;

  // Stoppage time announcement for 1st half
  if (min === 45 && !session.secondHalfStarted) {
    session.events.push({
      id: `stoppage-1st-${session.fixtureId}-${min}`,
      minute: 45,
      type: "stoppage_time",
      clubId: session.homeClubId,
      playerId: 0,
      playerName: "4º Árbitro",
      text: `⏱ Placa subiu! O quarto árbitro indica +${session.firstHalfExtra} minuto(s) de acréscimo no 1º tempo.`,
    });
  }

  // Stoppage time announcement for 2nd half
  if (min === 90 && session.secondHalfStarted) {
    session.events.push({
      id: `stoppage-2nd-${session.fixtureId}-${min}`,
      minute: 90,
      type: "stoppage_time",
      clubId: session.homeClubId,
      playerId: 0,
      playerName: "4º Árbitro",
      text: `⏱ Placa subiu! O quarto árbitro indica +${session.secondHalfExtra} minuto(s) de acréscimo no 2º tempo.`,
    });
  }

  const homeActive = session.homeActiveIds
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p));
  const awayActive = session.awayActiveIds
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p));

  const homePower = computeTeamPower(
    homeActive,
    homeTactics,
    true,
    homeClub.capacity,
    session.homeStats.redCards,
    session.playerStamina,
    homeStadiumConfig,
    session.attendance,
    session.homeSynergy
  );
  const awayPower = computeTeamPower(
    awayActive,
    awayTactics,
    false,
    homeClub.capacity,
    session.awayStats.redCards,
    session.playerStamina,
    undefined,
    undefined,
    session.awaySynergy
  );

  // Drain stamina (home turf level reduces home fatigue)
  const homeTurfFactor = 1 - ((homeStadiumConfig?.turfLevel ?? 1) - 1) * 0.05;
  const drainFor = (isHome: boolean, tactics: Tactics, active: Player[]) => {
    const baseDrain =
      (tactics.pressing === "High" ? 0.56 : tactics.pressing === "Medium" ? 0.44 : 0.34) +
      (tactics.mentality === "Attacking" ? 0.08 : tactics.mentality === "Defensive" ? -0.05 : 0);
    const turfMult = isHome ? homeTurfFactor : 1;
    for (const p of active) {
      const mult =
        (p.roleCategory === "GK" ? 0.16 : 1 - (p.stats.stamina - 70) * 0.004) * turfMult;
      session.playerStamina[p.id] = Math.max(
        18,
        (session.playerStamina[p.id] ?? 100) - baseDrain * mult
      );
    }
  };
  drainFor(true, homeTactics, homeActive);
  drainFor(false, awayTactics, awayActive);

  // AI substitutions
  if (session.homeClubId !== userClubId) {
    maybePerformAiSub(session, true, playerMap);
  }
  if (session.awayClubId !== userClubId) {
    maybePerformAiSub(session, false, playerMap);
  }

  // Possession tick
  const midDiff = homePower.midfield - awayPower.midfield;
  const targetHomePoss = Math.max(26, Math.min(74, 50 + midDiff * 1.45 + (Math.random() * 6 - 3)));
  session.possessionAccumulatorHome += targetHomePoss;
  session.possessionTicks += 1;
  const homePoss = Math.round(session.possessionAccumulatorHome / session.possessionTicks);
  session.homeStats.possession = homePoss;
  session.awayStats.possession = 100 - homePoss;

  // Causal Fouls & Cards: triggered by a defender's tackle on the ball carrier
  const refFactor = session.referee.avgCardsPerGame / 4.2;
  const checkFoul = (
    isDefendingHome: boolean,
    defActive: Player[],
    defTactics: Tactics,
    attActive: Player[],
    preferredOffender?: Player,
    preferredVictim?: Player,
    probMult = 1.0
  ): { fouled: boolean; cardIssued: boolean; offender?: Player; victim?: Player } => {
    const pressBonus = defTactics.pressing === "High" ? 0.025 : defTactics.pressing === "Low" ? -0.012 : 0;
    if (Math.random() >= (0.11 + pressBonus) * (0.85 + refFactor * 0.15) * probMult) {
      return { fouled: false, cardIssued: false };
    }

    const stats = isDefendingHome ? session.homeStats : session.awayStats;
    const clubId = isDefendingHome ? session.homeClubId : session.awayClubId;
    const defClubName = isDefendingHome ? homeClub.shortName : awayClub.shortName;
    stats.fouls += 1;

    const defOutfield = defActive.filter((p) => p.roleCategory !== "GK");
    if (defOutfield.length === 0) return { fouled: true, cardIssued: false };
    const offender =
      preferredOffender && preferredOffender.roleCategory !== "GK"
        ? preferredOffender
        : weightedPick(defOutfield, (p) =>
            p.roleCategory === "DEF" ? 1.8 : p.roleCategory === "MID" ? 1.3 : 0.7
          );

    const attOutfield = attActive.filter((p) => p.roleCategory !== "GK");
    const victim =
      preferredVictim && preferredVictim.roleCategory !== "GK"
        ? preferredVictim
        : attOutfield.length > 0
        ? weightedPick(attOutfield, (p) =>
            p.roleCategory === "ATT" ? 1.7 : p.roleCategory === "MID" ? 1.4 : 0.6
          )
        : undefined;

    if (Math.random() < 0.165 * refFactor) {
      const alreadyYellow = session.yellowCardedIds.includes(offender.id);
      if (alreadyYellow || Math.random() < 0.03) {
        // Red card
        stats.redCards += 1;
        session.redCardedIds.push(offender.id);
        session.playerRatings[offender.id] = Math.max(
          3.5,
          (session.playerRatings[offender.id] ?? 6.5) - 1.5
        );
        if (isDefendingHome) {
          session.homeActiveIds = session.homeActiveIds.filter((id) => id !== offender.id);
        } else {
          session.awayActiveIds = session.awayActiveIds.filter((id) => id !== offender.id);
        }
        session.events.push({
          id: `red-${session.fixtureId}-${min}-${offender.id}`,
          minute: min,
          type: "red_card",
          clubId,
          playerId: offender.id,
          playerName: offender.name,
          assistPlayerId: victim?.id,
          assistPlayerName: victim?.name,
          text: alreadyYellow
            ? `🟥 SEGUNDO AMARELO E EXPULSÃO! ${offender.name} (${defClubName}) chega atrasado na dividida com ${victim?.name ?? "o adversário"} e recebe o vermelho!`
            : `🟥 CARTÃO VERMELHO DIRETO! Entrada duríssima de ${offender.name} (${defClubName}) para parar a arrancada de ${victim?.name ?? "o adversário"}!`,
        });
        return { fouled: true, cardIssued: true, offender, victim };
      } else {
        stats.yellowCards += 1;
        session.yellowCardedIds.push(offender.id);
        session.playerRatings[offender.id] = Math.max(
          4.5,
          (session.playerRatings[offender.id] ?? 6.5) - 0.3
        );
        session.events.push({
          id: `yel-${session.fixtureId}-${min}-${offender.id}`,
          minute: min,
          type: "yellow_card",
          clubId,
          playerId: offender.id,
          playerName: offender.name,
          assistPlayerId: victim?.id,
          assistPlayerName: victim?.name,
          text: victim
            ? `🟨 CARTÃO AMARELO! ${offender.name} (${defClubName}) para o avanço de ${victim.name} com falta dura e é advertido pelo árbitro.`
            : `🟨 Cartão amarelo para ${offender.name} (${defClubName}) por falta tática na disputa de bola.`,
        });
        return { fouled: true, cardIssued: true, offender, victim };
      }
    }
    return { fouled: true, cardIssued: false, offender, victim };
  };

  // Causal Injuries check: tied to the player suffering a tackle or sprinting with the ball
  const INJURY_TYPES = [
    "Distensão na coxa",
    "Entorse no tornozelo",
    "Lesão na panturrilha",
    "Estiramento muscular",
    "Pancada no joelho",
  ];
  const checkInjury = (
    isHome: boolean,
    active: Player[],
    tactics: Tactics,
    preferredVictim?: Player,
    tackler?: Player,
    fromFoul = false
  ): boolean => {
    const clubId = isHome ? session.homeClubId : session.awayClubId;
    const clubName = isHome ? homeClub.shortName : awayClub.shortName;
    const teamInjuriesCount = session.injuries.filter((i) => i.clubId === clubId).length;
    if (teamInjuriesCount >= 1) return false;

    const candidates = active.filter(
      (p) => p.roleCategory !== "GK" && !session.injuredIds.includes(p.id)
    );
    if (candidates.length === 0) return false;

    const avgStam =
      candidates.reduce((sum, p) => sum + (session.playerStamina[p.id] ?? 100), 0) /
      candidates.length;
    const fatigueRisk = avgStam < 55 ? 0.0008 : avgStam < 68 ? 0.0003 : 0.0001;
    const pressMult = tactics.pressing === "High" ? 1.25 : tactics.pressing === "Low" ? 0.8 : 1.0;
    const turfMult = isHome ? homeTurfFactor : 1.0;
    // Hard fouls only cause an injury ~3.5% of the time; non-foul muscular injuries are rare (~8-10% per match)
    const injuryProb = fromFoul
      ? 0.035 * turfMult
      : (0.00045 * pressMult + fatigueRisk) * turfMult;

    if (Math.random() > injuryProb) return false;

    const victim =
      preferredVictim &&
      preferredVictim.roleCategory !== "GK" &&
      !session.injuredIds.includes(preferredVictim.id)
        ? preferredVictim
        : weightedPick(candidates, (p) => {
            const stam = session.playerStamina[p.id] ?? 100;
            return Math.max(0.5, (115 - stam) / 30);
          });

    const injuryType = INJURY_TYPES[Math.floor(Math.random() * INJURY_TYPES.length)];
    const matchesOut = 1 + Math.floor(Math.random() * 4);

    session.injuredIds.push(victim.id);
    session.injuries.push({
      playerId: victim.id,
      clubId,
      injuryType,
      matchesOut,
    });
    session.events.push({
      id: `inj-${session.fixtureId}-${min}-${victim.id}`,
      minute: min,
      type: "injury",
      clubId,
      playerId: victim.id,
      playerName: victim.name,
      assistPlayerId: tackler?.id,
      assistPlayerName: tackler?.name,
      text: fromFoul && tackler
        ? `🚑 LESÃO NA DIVIDIDA! Após sofrer a entrada de ${tackler.name}, ${victim.name} (${clubName}) sente ${injuryType} e ficará ${matchesOut} rodada(s) no DM.`
        : `🚑 LESÃO NO LANCE! Durante a arrancada com a bola, ${victim.name} (${clubName}) sente ${injuryType} e precisará ficar ${matchesOut} rodada(s) no DM.`,
    });

    const subsUsed = isHome ? session.homeSubsUsed : session.awaySubsUsed;
    const benchIds = isHome ? session.homeBenchIds : session.awayBenchIds;

    if (clubId !== userClubId) {
      const benchOutfield = benchIds
        .map((id) => playerMap.get(id))
        .filter((p): p is Player => Boolean(p))
        .filter((p) => p.roleCategory !== "GK");
      const sameRole = benchOutfield
        .filter((p) => p.roleCategory === victim.roleCategory)
        .sort((a, b) => b.overall - a.overall);
      const subIn = sameRole[0] ?? benchOutfield.sort((a, b) => b.overall - a.overall)[0];
      if (subsUsed < 5 && subIn) {
        performLiveSubstitution(session, clubId, victim.id, subIn.id, victim.name, subIn.name);
      } else if (isHome) {
        session.homeActiveIds = session.homeActiveIds.filter((id) => id !== victim.id);
      } else {
        session.awayActiveIds = session.awayActiveIds.filter((id) => id !== victim.id);
      }
    } else if (subsUsed >= 5) {
      if (isHome) {
        session.homeActiveIds = session.homeActiveIds.filter((id) => id !== victim.id);
      } else {
        session.awayActiveIds = session.awayActiveIds.filter((id) => id !== victim.id);
      }
    }
    return true;
  };

  // Corner kick generator & set-piece handler
  const pickCornerTaker = (team: Player[]): Player => {
    const outfield = team.filter((p) => p.roleCategory !== "GK");
    if (outfield.length === 0) return team[0] || homeActive[0];
    const candidates = outfield.filter(
      (p) =>
        p.roleCategory === "MID" ||
        p.primaryPosition === "CAM" ||
        WINGER_POSITIONS.includes(p.primaryPosition)
    );
    const pool = candidates.length > 0 ? candidates : outfield;
    return pool.sort((a, b) => (b.faceStats.passing || 70) - (a.faceStats.passing || 70))[0];
  };

  const triggerCornerKick = (
    isCornerHome: boolean,
    shooter: Player,
    deflector?: Player,
    origin: "gk_save" | "deflected_shot" = "deflected_shot"
  ) => {
    const cornerClubId = isCornerHome ? session.homeClubId : session.awayClubId;
    const cornerClubName = isCornerHome ? homeClub.shortName : awayClub.shortName;
    const cornerStats = isCornerHome ? session.homeStats : session.awayStats;
    const cornerTeam = isCornerHome ? homeActive : awayActive;
    const taker = pickCornerTaker(cornerTeam);

    cornerStats.corners += 1;

    const saveTexts = [
      `⛳ ESCANTEIO para o ${cornerClubName}! ${shooter.name} solta uma bomba no alvo, ${deflector?.name ?? "o goleiro"} espalma pela linha de fundo e ${taker.name} vai cobrar!`,
      `⛳ ESCANTEIO! Defesaça de ${deflector?.name ?? "o goleiro"} no chute colocado de ${shooter.name} (${cornerClubName}), mandando para escanteio!`,
      `⛳ ESCANTEIO para o ${cornerClubName}! ${shooter.name} finaliza forte e ${deflector?.name ?? "o goleiro"} salva com a ponta dos dedos por cima do travessão!`,
    ];
    const deflectedTexts = [
      `⛳ ESCANTEIO para o ${cornerClubName}! Finalização perigosa de ${shooter.name} explode no carrinho de ${deflector?.name ?? "zagueiro"} e sai pela linha de fundo!`,
      `⛳ ESCANTEIO! ${shooter.name} (${cornerClubName}) bate cruzado para o gol, a zaga desvia tirando tinta da trave e ${taker.name} corre para a bandeirinha!`,
      `⛳ ESCANTEIO para o ${cornerClubName}! Chute forte de ${shooter.name} é bloqueado na hora H por ${deflector?.name ?? "a defesa"} pela linha de fundo!`,
    ];
    const pool = origin === "gk_save" ? saveTexts : deflectedTexts;
    const text = pool[Math.floor(Math.random() * pool.length)];

    session.events.push({
      id: `corner-${session.fixtureId}-${min}-${taker.id}-${cornerStats.corners}`,
      minute: min,
      type: "corner",
      clubId: cornerClubId,
      playerId: taker.id,
      playerName: taker.name,
      assistPlayerId: shooter.id,
      assistPlayerName: shooter.name,
      text,
    });

    session.playerRatings[taker.id] = Math.min(10.0, (session.playerRatings[taker.id] ?? 6.5) + 0.05);

    // 22% chance of a dangerous header following the corner kick
    if (Math.random() < 0.22) {
      const potentialHeaders = cornerTeam.filter(
        (p) => p.id !== taker.id && (p.roleCategory === "ATT" || p.roleCategory === "DEF")
      );
      const headerTaker =
        potentialHeaders.length > 0
          ? potentialHeaders.sort((a, b) => (b.stats.strength || 70) - (a.stats.strength || 70))[0]
          : null;

      if (headerTaker) {
        cornerStats.shots += 1;
        const headerXg = 0.18;
        cornerStats.xg = Math.round((cornerStats.xg + headerXg) * 100) / 100;

        if (Math.random() < 0.25) {
          cornerStats.shotsOnTarget += 1;
          if (isCornerHome) session.homeGoals += 1;
          else session.awayGoals += 1;

          session.playerRatings[headerTaker.id] = Math.min(
            10.0,
            (session.playerRatings[headerTaker.id] ?? 6.5) + 1.2
          );
          session.playerRatings[taker.id] = Math.min(
            10.0,
            (session.playerRatings[taker.id] ?? 6.5) + 0.65
          );

          session.events.push({
            id: `goal-corner-${session.fixtureId}-${min}-${headerTaker.id}-${cornerStats.shots}`,
            minute: min,
            type: "goal",
            clubId: cornerClubId,
            playerId: headerTaker.id,
            playerName: headerTaker.name,
            assistPlayerId: taker.id,
            assistPlayerName: taker.name,
            text: `GOOOOL DE CABEÇA do ${cornerClubName}! ${headerTaker.name} sobe no terceiro andar após escanteio milimétrico de ${taker.name} e estufa a rede!`,
          });
        } else if (Math.random() < 0.24) {
          cornerStats.woodwork = (cornerStats.woodwork ?? 0) + 1;
          session.playerRatings[headerTaker.id] = Math.min(
            10.0,
            (session.playerRatings[headerTaker.id] ?? 6.5) + 0.14
          );
          session.events.push({
            id: `woodwork-corner-${session.fixtureId}-${min}-${headerTaker.id}-${cornerStats.shots}`,
            minute: min,
            type: "woodwork",
            clubId: cornerClubId,
            playerId: headerTaker.id,
            playerName: headerTaker.name,
            assistPlayerId: taker.id,
            assistPlayerName: taker.name,
            text: `💥 NO TRAVESSÃO! ${headerTaker.name} (${cornerClubName}) sobe mais que todo mundo no escanteio de ${taker.name} e testa firme na trave!`,
          });
        } else {
          session.events.push({
            id: `chance-corner-${session.fixtureId}-${min}-${headerTaker.id}-${cornerStats.shots}`,
            minute: min,
            type: "chance",
            clubId: cornerClubId,
            playerId: headerTaker.id,
            playerName: headerTaker.name,
            text: `UHHH! Quase o gol do ${cornerClubName}! ${headerTaker.name} antecipa a zaga no escanteio e cabeceia com muito perigo raspando o travessão!`,
          });
        }
      }
    }
  };

  // Causal Attacking chance generation (uses live 2D pitch ball carrier & passer when available)
  const resolveAttack = (
    isHome: boolean,
    attPower: TeamPower,
    defPower: TeamPower,
    attTeam: Player[],
    defTeam: Player[],
    attTactics: Tactics,
    clubName: string,
    preferredShooter?: Player,
    preferredAssister?: Player,
    probMultiplier = 1.0,
    forceTrigger = false
  ): boolean => {
    const clubId = isHome ? session.homeClubId : session.awayClubId;
    const stats = isHome ? session.homeStats : session.awayStats;

    // Average ~13.5 shots per team over ~93 minutes, with attacking mentality & synergy impact
    const mentalityBonus =
      attTactics.mentality === "Attacking" ? 0.024 : attTactics.mentality === "Defensive" ? -0.018 : 0;
    const baseChanceProb =
      0.136 +
      (attPower.attack - defPower.defense) * 0.0024 +
      (attPower.midfield - defPower.midfield) * 0.0014 +
      mentalityBonus;
    const clampedProb = Math.max(0.06, Math.min(0.65, baseChanceProb * probMultiplier));
    if (!forceTrigger && Math.random() > clampedProb) return false;

    const attackers = attTeam.filter((p) => p.roleCategory !== "GK");
    if (attackers.length === 0) return false;

    const shooter =
      preferredShooter &&
      preferredShooter.roleCategory !== "GK" &&
      (preferredShooter.roleCategory === "ATT" ||
        preferredShooter.roleCategory === "MID" ||
        Math.random() < 0.72)
        ? preferredShooter
        : weightedPick(attackers, (p) => {
            const isWinger = ["LW", "RW", "LM", "RM", "LAM", "RAM"].includes(p.primaryPosition);
            const isWingBack = ["LB", "RB", "LWB", "RWB"].includes(p.primaryPosition);
            const isAttackingMentality = attTactics.mentality === "Attacking";
            let roleMult = 0.26;
            if (p.roleCategory === "ATT") {
              roleMult = isWinger ? 2.75 : 3.35;
              if (attTactics.passingStyle === "Direct" && isWinger) roleMult += 0.35;
            } else if (p.primaryPosition === "CAM") {
              roleMult = 2.15 + (isAttackingMentality ? 0.35 : 0);
            } else if (p.roleCategory === "MID") {
              roleMult = p.primaryPosition === "CM" ? 1.35 + (isAttackingMentality ? 0.25 : 0) : 0.9;
            } else if (isWingBack) {
              roleMult = 0.58 + (isAttackingMentality ? 0.28 : 0);
            }

            const stam = session.playerStamina[p.id] ?? p.stamina;
            const staminaReadiness = 0.85 + 0.15 * (Math.max(20, stam) / 100);
            const finishingBlend =
              0.4 +
              (p.stats.finishing * 0.55 +
                p.faceStats.dribbling * 0.25 +
                p.faceStats.pace * (attTactics.passingStyle === "Direct" ? 0.32 : 0.2)) /
                100;
            return roleMult * finishingBlend * staminaReadiness * evaluateShirtNumberAffinity(p).multiplier;
          });

    const possibleAssisters = attackers.filter((p) => p.id !== shooter.id);
    const assistProb =
      attTactics.passingStyle === "Short" ? 0.78 : attTactics.passingStyle === "Direct" ? 0.68 : 0.73;
    const assister =
      preferredAssister &&
      preferredAssister.id !== shooter.id &&
      preferredAssister.roleCategory !== "GK"
        ? preferredAssister
        : possibleAssisters.length > 0 && Math.random() < assistProb
        ? weightedPick(possibleAssisters, (p) => {
            const isCreator = p.primaryPosition === "CAM" || p.primaryPosition === "CM";
            const isWinger = ["LW", "RW", "LM", "RM", "LAM", "RAM"].includes(p.primaryPosition);
            const isFullback = ["LB", "RB", "LWB", "RWB"].includes(p.primaryPosition);
            let roleMult = 0.35;
            if (isCreator) {
              roleMult = (p.primaryPosition === "CAM" ? 2.65 : 2.1) + (attTactics.passingStyle === "Short" ? 0.35 : 0);
            } else if (isWinger) {
              roleMult = 2.25;
            } else if (isFullback) {
              roleMult = 1.35 + (attTactics.mentality === "Attacking" ? 0.35 : 0);
            } else if (p.roleCategory === "ATT") {
              roleMult = 1.5 + (attTactics.passingStyle === "Short" ? 0.25 : 0);
            } else if (p.roleCategory === "MID") {
              roleMult = 1.45 + (attTactics.passingStyle === "Direct" ? 0.35 : 0);
            }

            const playmakeBlend =
              0.4 +
              (p.faceStats.passing * 0.55 +
                p.faceStats.dribbling * 0.25 +
                p.faceStats.pace * 0.2) /
                100;
            return roleMult * playmakeBlend * evaluateShirtNumberAffinity(p).multiplier;
          })
        : undefined;

    const keeper = defTeam.find((p) => p.roleCategory === "GK");
    const shooterShirtMult = evaluateShirtNumberAffinity(shooter).multiplier;

    stats.shots += 1;
    const shotQuality =
      0.08 +
      Math.max(0, (shooter.stats.finishing * shooterShirtMult - defPower.defense) * 0.0032) +
      Math.random() * 0.22;
    const xg = Math.round(Math.min(0.55, Math.max(0.04, shotQuality)) * 100) / 100;
    stats.xg = Math.round((stats.xg + xg) * 100) / 100;

    const onTargetProb = Math.max(
      0.28,
      Math.min(0.62, 0.38 + (shooter.faceStats.shooting * shooterShirtMult - 72) * 0.004)
    );
    if (Math.random() > onTargetProb) {
      const woodworkProb = 0.085 + Math.max(0, (shooter.stats.finishing - 70) * 0.0012);
      if (Math.random() < woodworkProb) {
        // Shot hits the goalpost or crossbar ("Bola na Trave") and ricochets back into play!
        stats.woodwork = (stats.woodwork ?? 0) + 1;
        session.playerRatings[shooter.id] = Math.min(
          10.0,
          (session.playerRatings[shooter.id] ?? 6.5) + 0.14
        );
        const woodworkTexts = [
          `💥 NA TRAVE! ${shooter.name} (${clubName}) solta uma bomba colocada, o goleiro só olha e a bola explode no poste!`,
          `💥 NO TRAVESSÃO! Que pecado! ${shooter.name} (${clubName}) finaliza com categoria e carimba o travessão antes da zaga afastar!`,
          assister
            ? `💥 EXPLODE NA TRAVE! ${shooter.name} (${clubName}) recebe passe açucarado de ${assister.name}, bate cruzado e a bola sacode a trave!`
            : `💥 CARIMBOU A MADEIRA! Chute venenosíssimo de ${shooter.name} (${clubName}) bate na quina da trave e volta para a área!`,
        ];
        const chosenWoodworkText =
          woodworkTexts[Math.floor(Math.random() * woodworkTexts.length)];
        session.events.push({
          id: `woodwork-${session.fixtureId}-${min}-${shooter.id}-${stats.shots}`,
          minute: min,
          type: "woodwork",
          clubId,
          playerId: shooter.id,
          playerName: shooter.name,
          assistPlayerId: assister?.id,
          assistPlayerName: assister?.name,
          text: chosenWoodworkText,
        });
      } else if (Math.random() < 0.42) {
        // Shot blocked/deflected by a defender across the endline for a corner!
        const defOutfield = defTeam.filter((p) => p.roleCategory === "DEF");
        const blocker =
          defOutfield.length > 0
            ? defOutfield[Math.floor(Math.random() * defOutfield.length)]
            : defTeam.find((p) => p.roleCategory !== "GK");
        if (blocker) {
          session.playerRatings[blocker.id] = Math.min(
            10.0,
            (session.playerRatings[blocker.id] ?? 6.5) + 0.08
          );
        }
        triggerCornerKick(isHome, shooter, blocker, "deflected_shot");
      } else if (xg >= 0.16) {
        const missTexts = [
          `Finalização perigosa! ${shooter.name} (${clubName}) ganha na velocidade da marcação e chuta cruzado, assustando o goleiro!`,
          `Quase o gol! ${shooter.name} (${clubName}) se antecipa ao zagueiro na área e finaliza de primeira, tirando tinta da trave!`,
          `Pressão total! ${shooter.name} (${clubName}) recebe cruzamento açucarado e cabeceia com veneno por cima do travessão!`,
          `Uhhh! ${shooter.name} (${clubName}) solta uma bomba da entrada da área que passa raspando o poste!`,
        ];
        const chosenText = missTexts[Math.floor(Math.random() * missTexts.length)];
        session.events.push({
          id: `miss-${session.fixtureId}-${min}-${shooter.id}-${stats.shots}`,
          minute: min,
          type: "chance",
          clubId,
          playerId: shooter.id,
          playerName: shooter.name,
          assistPlayerId: assister?.id,
          assistPlayerName: assister?.name,
          text: chosenText,
        });
      }
      return true;
    }

    stats.shotsOnTarget += 1;

    // Goal vs GK Save
    const keeperShirtMult = keeper ? evaluateShirtNumberAffinity(keeper).multiplier : 1.0;
    const gkAbility = keeper
      ? (keeper.overall * 0.6 + keeper.faceStats.reflexes * 0.4) * keeperShirtMult
      : 55;
    const goalProb = Math.max(
      0.16,
      Math.min(
        0.46,
        0.27 + (shooter.stats.finishing * shooterShirtMult - gkAbility) * 0.005 + (xg - 0.16) * 0.4
      )
    );

    if (Math.random() < goalProb) {
      // VAR / assistant referee: goal can be ruled out for offside
      const isForward =
        shooter.roleCategory === "ATT" ||
        shooter.primaryPosition === "CAM" ||
        WINGER_POSITIONS.includes(shooter.primaryPosition);
      const defTacticsForCheck = isHome ? awayTactics : homeTactics;
      const offsideMult = computeOffsideRiskMultiplier(attTeam, defTeam, attTactics, defTacticsForCheck);
      const disallowProb = (isForward ? 0.05 : 0.012) * offsideMult;
      if (Math.random() < disallowProb) {
        stats.offsides = (stats.offsides ?? 0) + 1;
        session.playerRatings[shooter.id] = Math.max(
          4.5,
          (session.playerRatings[shooter.id] ?? 6.5) - 0.25
        );
        session.events.push({
          id: `offside-goal-${session.fixtureId}-${min}-${shooter.id}-${stats.shots}`,
          minute: min,
          type: "offside",
          clubId,
          playerId: shooter.id,
          playerName: shooter.name,
          assistPlayerId: assister?.id,
          assistPlayerName: assister?.name,
          disallowedGoal: true,
          text: `GOL ANULADO! ${shooter.name} (${clubName}) balança a rede após passe de ${assister?.name ?? "companheiro"}, mas a bandeirinha assinala impedimento e o VAR confirma.`,
        });
        return true;
      }

      if (isHome) session.homeGoals += 1;
      else session.awayGoals += 1;

      session.playerRatings[shooter.id] = Math.min(10.0, (session.playerRatings[shooter.id] ?? 6.5) + 1.15);
      if (assister) {
        session.playerRatings[assister.id] = Math.min(10.0, (session.playerRatings[assister.id] ?? 6.5) + 0.65);
      }

      session.events.push({
        id: `goal-${session.fixtureId}-${min}-${shooter.id}-${stats.shots}`,
        minute: min,
        type: "goal",
        clubId,
        playerId: shooter.id,
        playerName: shooter.name,
        assistPlayerId: assister?.id,
        assistPlayerName: assister?.name,
        text: assister
          ? `GOOOOL do ${clubName}! ${shooter.name} completa belo passe de ${assister.name} e manda para o fundo da rede!`
          : `GOOOOL do ${clubName}! ${shooter.name} acerta uma finalização imparável no canto!`,
      });
      return true;
    } else if (keeper) {
      session.playerRatings[keeper.id] = Math.min(10.0, (session.playerRatings[keeper.id] ?? 6.5) + 0.28);
      const isCornerSave = Math.random() < 0.48;
      if (isCornerSave) {
        triggerCornerKick(isHome, shooter, keeper, "gk_save");
      } else if (xg >= 0.2) {
        session.events.push({
          id: `save-${session.fixtureId}-${min}-${keeper.id}-${stats.shots}`,
          minute: min,
          type: "save",
          clubId: isHome ? session.awayClubId : session.homeClubId,
          playerId: keeper.id,
          playerName: keeper.name,
          assistPlayerId: shooter.id,
          assistPlayerName: shooter.name,
          text: `Defesaça de ${keeper.name}! Segura firme chute venenoso de ${shooter.name} (${clubName}).`,
        });
      }
      return true;
    }
    return true;
  };

  // Causal Offside: triggered during a through-ball pass attempt from passer to offender
  const checkOffside = (
    isHome: boolean,
    attTeam: Player[],
    defTeam: Player[],
    attTactics: Tactics,
    defTactics: Tactics,
    clubName: string,
    preferredPasser?: Player,
    probMult = 1.0
  ): boolean => {
    const mult = computeOffsideRiskMultiplier(attTeam, defTeam, attTactics, defTactics);
    if (Math.random() > 0.0155 * mult * probMult) return false;
    const offender = pickOffsideOffender(attTeam, session);
    if (!offender) return false;

    const passerCandidates = attTeam.filter(
      (p) => p.id !== offender.id && p.roleCategory !== "GK"
    );
    const passer =
      preferredPasser &&
      preferredPasser.id !== offender.id &&
      preferredPasser.roleCategory !== "GK"
        ? preferredPasser
        : passerCandidates.find((p) => p.roleCategory === "MID") ?? passerCandidates[0];

    const stats = isHome ? session.homeStats : session.awayStats;
    stats.offsides = (stats.offsides ?? 0) + 1;
    session.playerRatings[offender.id] = Math.max(
      4.5,
      (session.playerRatings[offender.id] ?? 6.5) - 0.08
    );
    session.events.push({
      id: `offside-${session.fixtureId}-${min}-${offender.id}-${stats.offsides}`,
      minute: min,
      type: "offside",
      clubId: isHome ? session.homeClubId : session.awayClubId,
      playerId: offender.id,
      playerName: offender.name,
      assistPlayerId: passer?.id,
      assistPlayerName: passer?.name,
      text: passer
        ? `🚩 IMPEDIMENTO! ${passer.name} tenta o lançamento em profundidade para ${offender.name} (${clubName}), que estava adiantado atrás da linha da zaga!`
        : `🚩 Impedimento! ${offender.name} (${clubName}) arranca antes da hora no lançamento e a bandeirinha levanta a bandeira.`,
    });
    return true;
  };

  // Unified Causal Minute Resolution:
  // If 2D pitch context is active, events originate strictly from the live ball carrier, passer, presser, and pitch zone!
  const ctx = session.pitchContext;
  if (ctx) {
    const possIsHome = ctx.carrierClubId === session.homeClubId;
    const attTeam = possIsHome ? homeActive : awayActive;
    const defTeam = possIsHome ? awayActive : homeActive;
    const attTactics = possIsHome ? homeTactics : awayTactics;
    const defTactics = possIsHome ? awayTactics : homeTactics;
    const attPower = possIsHome ? homePower : awayPower;
    const defPower = possIsHome ? awayPower : homePower;
    const attClubName = possIsHome ? homeClub.shortName : awayClub.shortName;

    const carrier =
      (ctx.carrierId ? playerMap.get(ctx.carrierId) : undefined) ??
      attTeam.find((p) => p.roleCategory !== "GK");
    const lastPasser =
      ctx.lastPasserId && ctx.lastPasserId !== carrier?.id
        ? playerMap.get(ctx.lastPasserId)
        : undefined;
    const closestDefender =
      (ctx.closestDefenderId ? playerMap.get(ctx.closestDefenderId) : undefined) ??
      defTeam.find((p) => p.roleCategory !== "GK");

    // 1. Defending team challenges the ball carrier (Foul / Card duel)
    const foulRes = checkFoul(
      !possIsHome,
      defTeam,
      defTactics,
      attTeam,
      closestDefender,
      carrier,
      1.85
    );

    // 2. Injury check: only hard carded fouls have a small (~3.5%) chance of contact injury; otherwise rare muscular fatigue check
    let injuryStopped = false;
    if (foulRes.cardIssued) {
      injuryStopped = checkInjury(
        possIsHome,
        attTeam,
        attTactics,
        foulRes.victim ?? carrier,
        foulRes.offender ?? closestDefender,
        true
      );
    } else if (!foulRes.fouled) {
      injuryStopped = checkInjury(
        possIsHome,
        attTeam,
        attTactics,
        carrier,
        closestDefender,
        false
      );
    }

    // 3. If no card/injury stoppage interrupted play, resolve attacking progression from current pitch zone
    if (!foulRes.cardIssued && !injuryStopped) {
      const inAttackingHalf = ctx.attackProgress >= 0.42 || Boolean(ctx.pendingVisualShot);
      if (inAttackingHalf) {
        const wasOffside = checkOffside(
          possIsHome,
          attTeam,
          defTeam,
          attTactics,
          defTactics,
          attClubName,
          lastPasser ?? carrier,
          2.1
        );
        if (!wasOffside && (ctx.attackProgress >= 0.52 || ctx.pendingVisualShot)) {
          const forceVisualShot = Boolean(ctx.pendingVisualShot);
          ctx.pendingVisualShot = false;
          const zoneMult = forceVisualShot
            ? 2.8
            : ctx.attackProgress >= 0.72
            ? 2.35
            : 1.85;
          resolveAttack(
            possIsHome,
            attPower,
            defPower,
            attTeam,
            defTeam,
            attTactics,
            attClubName,
            carrier,
            lastPasser,
            zoneMult,
            forceVisualShot && Math.random() < 0.58
          );
        }
      }
    } else {
      ctx.pendingVisualShot = false;
    }
  } else {
    // Background AI matches / Instant Simulate-to-End fallback (causal roles preserved in events)
    const homeFoul = checkFoul(true, homeActive, homeTactics, awayActive);
    const awayFoul = checkFoul(false, awayActive, awayTactics, homeActive);
    checkInjury(true, homeActive, homeTactics, awayFoul.victim, awayFoul.offender, awayFoul.cardIssued);
    checkInjury(false, awayActive, awayTactics, homeFoul.victim, homeFoul.offender, homeFoul.cardIssued);

    const prevTotalGoals = session.homeGoals + session.awayGoals;
    const homeOffside = checkOffside(true, homeActive, awayActive, homeTactics, awayTactics, homeClub.shortName);
    if (!homeOffside) {
      resolveAttack(true, homePower, awayPower, homeActive, awayActive, homeTactics, homeClub.shortName);
    }

    const homeJustScored = session.homeGoals + session.awayGoals > prevTotalGoals;
    if (!homeJustScored) {
      const awayOffside = checkOffside(false, awayActive, homeActive, awayTactics, homeTactics, awayClub.shortName);
      if (!awayOffside) {
        resolveAttack(false, awayPower, homePower, awayActive, homeActive, awayTactics, awayClub.shortName);
      }
    }
  }

  // Check half-time break (end of 1st half)
  if (!session.secondHalfStarted && min >= session.firstHalfEnd) {
    session.isHalftime = true;
    session.events.push({
      id: `whistle-ht-${session.fixtureId}-${min}`,
      minute: min,
      type: "whistle",
      clubId: session.homeClubId,
      playerId: 0,
      playerName: "Árbitro",
      text: "Fim do primeiro tempo! O árbitro apita o intervalo de jogo.",
    });
    return;
  }

  // Check end of match (full time)
  if (session.secondHalfStarted && min >= session.stoppageEnd) {
    session.finished = true;
    session.events.push({
      id: `whistle-ft-${session.fixtureId}-${min}`,
      minute: min,
      type: "whistle",
      clubId: session.homeClubId,
      playerId: 0,
      playerName: "Árbitro",
      text: "Fim de jogo! O árbitro apita o encerramento da partida.",
    });

    // Clean sheet / win bonuses on ratings
    for (const id of session.homeActiveIds) {
      const p = playerMap.get(id);
      if (!p) continue;
      if (session.awayGoals === 0 && (p.roleCategory === "GK" || p.roleCategory === "DEF")) {
        session.playerRatings[id] = Math.min(10, (session.playerRatings[id] ?? 6.5) + 0.45);
      }
      if (session.homeGoals > session.awayGoals) {
        session.playerRatings[id] = Math.min(10, (session.playerRatings[id] ?? 6.5) + 0.25);
      }
    }
    for (const id of session.awayActiveIds) {
      const p = playerMap.get(id);
      if (!p) continue;
      if (session.homeGoals === 0 && (p.roleCategory === "GK" || p.roleCategory === "DEF")) {
        session.playerRatings[id] = Math.min(10, (session.playerRatings[id] ?? 6.5) + 0.45);
      }
      if (session.awayGoals > session.homeGoals) {
        session.playerRatings[id] = Math.min(10, (session.playerRatings[id] ?? 6.5) + 0.25);
      }
    }
  }
}

export function finalizeMatchResult(session: LiveMatchSession): MatchResult {
  let motmId: number | undefined;
  let bestRating = -1;
  const roundedRatings: Record<number, number> = {};

  for (const [idStr, raw] of Object.entries(session.playerRatings)) {
    const id = Number(idStr);
    const val = Math.round(Math.max(4.0, Math.min(10.0, raw)) * 10) / 10;
    roundedRatings[id] = val;
    if (val > bestRating) {
      bestRating = val;
      motmId = id;
    }
  }

  return {
    fixtureId: session.fixtureId,
    homeGoals: session.homeGoals,
    awayGoals: session.awayGoals,
    homeStats: { ...session.homeStats },
    awayStats: { ...session.awayStats },
    events: [...session.events],
    playerRatings: roundedRatings,
    motmPlayerId: motmId,
    attendance: session.attendance,
    stadiumCapacity: session.stadiumCapacity,
    gateRevenueEur: session.gateRevenueEur,
    homeAdvantagePct: session.homeAdvantagePct,
    injuries: [...session.injuries],
  };
}

export function simulateFullMatch(
  fixture: Fixture,
  homeClub: Club,
  awayClub: Club,
  homePlayers: Player[],
  awayPlayers: Player[],
  homeTactics: Tactics,
  awayTactics: Tactics,
  referee: Referee,
  homeStadiumConfig?: StadiumConfig,
  homeSynergy?: TeamSynergyResult,
  awaySynergy?: TeamSynergyResult
): MatchResult {
  const playerMap = new Map<number, Player>();
  for (const p of [...homePlayers, ...awayPlayers]) {
    playerMap.set(p.id, p);
  }
  const session = initLiveMatchSession(
    fixture,
    homePlayers,
    awayPlayers,
    homeTactics,
    awayTactics,
    referee,
    homeClub,
    awayClub,
    homeStadiumConfig,
    homeSynergy,
    awaySynergy
  );
  while (!session.finished) {
    stepLiveMatchMinute(
      session,
      playerMap,
      homeClub,
      awayClub,
      homeTactics,
      awayTactics,
      null,
      homeStadiumConfig
    );
  }
  return finalizeMatchResult(session);
}
