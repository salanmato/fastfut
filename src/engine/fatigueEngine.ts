import type {
  FifaWindow,
  Player,
  StadiumConfig,
  Tactics,
} from "../types/game";
import { addDaysIso, isDateInFifaWindow } from "../utils/calendar";

/**
 * Daily stamina recovery rate per calendar day (percentage points/day).
 * GKs recover faster; high-stamina, younger players and better turf/physio facilities recover faster.
 */
export function computeDailyRecoveryRate(
  player: Player,
  turfLevel = 1
): number {
  if (player.roleCategory === "GK") return 8;
  const raw =
    4.2 +
    (Math.max(45, player.stats.stamina) - 70) * 0.03 -
    (player.age >= 32 ? (player.age - 31) * 0.18 : 0) +
    (turfLevel - 1) * 0.25;
  return Math.max(2.8, Math.min(5.8, raw));
}

export function recoverPlayerOverDays(
  player: Player,
  days: number,
  turfLevel = 1
): number {
  if (days <= 0) return Math.round(player.stamina);
  const rate = computeDailyRecoveryRate(player, turfLevel);
  return Math.min(100, Math.round(player.stamina + rate * days));
}

export function projectPlayerStamina(
  player: Player,
  daysUntilMatch: number,
  turfLevel = 1
): number {
  return recoverPlayerOverDays(player, Math.max(0, daysUntilMatch), turfLevel);
}

export function recoverSquadStaminaOverDays(
  players: Player[],
  days: number,
  stadiumByClub?: Record<number, StadiumConfig>
): Player[] {
  if (days <= 0) return players;
  return players.map((p) => {
    if (p.clubId === null) return p;
    if (p.stamina >= 100) return p;
    const turfLevel = stadiumByClub?.[p.clubId]?.turfLevel ?? 1;
    const nextStam = recoverPlayerOverDays(p, days, turfLevel);
    if (nextStam === p.stamina) return p;
    return { ...p, stamina: nextStam };
  });
}

export function applyPostMatchFatigue(
  player: Player,
  minutesPlayed: number,
  tactics?: Tactics,
  turfLevel = 1
): number {
  const curStam = Math.round(player.stamina);
  if (minutesPlayed <= 0) return curStam;

  if (player.roleCategory === "GK") {
    const drop = Math.max(1, Math.round(4 * Math.min(1, minutesPlayed / 90)));
    return Math.max(92, curStam - drop);
  }

  const minsRatio = Math.max(0.08, Math.min(1.05, minutesPlayed / 90));
  const pressBase =
    tactics?.pressing === "High" ? 27 : tactics?.pressing === "Low" ? 19 : 23;
  const mentMod =
    tactics?.mentality === "Attacking"
      ? 2
      : tactics?.mentality === "Defensive"
      ? -1.5
      : 0;
  const stamAttrMult = 1 - (Math.max(45, player.stats.stamina) - 72) * 0.008;
  const ageMult =
    player.age >= 31 ? 1 + Math.min(0.2, (player.age - 30) * 0.035) : 1;
  const turfMult = 1 - (turfLevel - 1) * 0.03;

  const drop = Math.max(
    3,
    Math.round(
      (pressBase + mentMod) *
        stamAttrMult *
        ageMult *
        turfMult *
        Math.pow(minsRatio, 0.85)
    )
  );
  return Math.max(35, curStam - drop);
}

export function countNonFifaRecoveryDays(
  fromDate: string,
  toDate: string,
  fifaWindows: FifaWindow[]
): number {
  if (toDate <= fromDate) return 0;
  let count = 0;
  for (let cur = addDaysIso(fromDate, 1); cur <= toDate; cur = addDaysIso(cur, 1)) {
    if (!isDateInFifaWindow(cur, fifaWindows)) {
      count++;
    }
  }
  return count;
}
