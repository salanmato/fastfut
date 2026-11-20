import type {
  Club,
  FACupRound,
  FACupState,
  FACupTie,
  Fixture,
  NewsItem,
  Player,
  Referee,
  StadiumConfig,
  Tactics,
} from "../types/game";
import { autoPickLineup, createDefaultTactics, simulateFullMatch } from "./matchEngine";
import { formatMoney } from "../utils/format";

const ROUND_TEMPLATES: Array<{
  index: number;
  name: string;
  shortName: string;
  triggerMatchweek: number;
  date: string;
  prizeEur: number;
}> = [
  {
    index: 0,
    name: "3ª Fase (32-avos de Final)",
    shortName: "32-avos",
    triggerMatchweek: 10,
    date: "2026-11-07",
    prizeEur: 1_000_000,
  },
  {
    index: 1,
    name: "4ª Fase (16-avos de Final)",
    shortName: "16-avos",
    triggerMatchweek: 16,
    date: "2026-12-19",
    prizeEur: 1_800_000,
  },
  {
    index: 2,
    name: "Oitavas de Final",
    shortName: "Oitavas",
    triggerMatchweek: 21,
    date: "2027-01-16",
    prizeEur: 3_000_000,
  },
  {
    index: 3,
    name: "Quartas de Final",
    shortName: "Quartas",
    triggerMatchweek: 27,
    date: "2027-02-27",
    prizeEur: 5_000_000,
  },
  {
    index: 4,
    name: "Semifinais (Wembley)",
    shortName: "Semifinal",
    triggerMatchweek: 32,
    date: "2027-04-17",
    prizeEur: 8_000_000,
  },
  {
    index: 5,
    name: "Final (Wembley)",
    shortName: "Final",
    triggerMatchweek: 36,
    date: "2027-05-15",
    prizeEur: 12_000_000,
  },
];

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createInitialFACupState(clubs: Club[]): FACupState {
  const usableCount =
    clubs.length >= 64 ? 64 : clubs.length >= 32 ? 32 : clubs.length >= 16 ? 16 : 8;
  const startRoundIndex =
    usableCount === 64 ? 0 : usableCount === 32 ? 1 : usableCount === 16 ? 2 : 3;

  const pool = shuffleArray(clubs.slice(0, usableCount));
  const initialTies: FACupTie[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    initialTies.push({
      id: `fac-r${startRoundIndex}-t${i / 2 + 1}`,
      roundIndex: startRoundIndex,
      homeClubId: pool[i].id,
      awayClubId: pool[i + 1].id,
      played: false,
      homeGoals: null,
      awayGoals: null,
      homePenalties: null,
      awayPenalties: null,
      winnerClubId: null,
    });
  }

  const rounds: FACupRound[] = ROUND_TEMPLATES.map((tpl) => ({
    ...tpl,
    completed: tpl.index < startRoundIndex,
    ties: tpl.index === startRoundIndex ? initialTies : [],
  }));

  return {
    season: "2026/27",
    currentRoundIndex: startRoundIndex,
    championClubId: null,
    rounds,
  };
}

function simulatePenaltyShootout(homeOvr: number, awayOvr: number): [number, number] {
  let homeScore = 0;
  let awayScore = 0;
  const homeProb = Math.min(0.84, Math.max(0.68, 0.75 + (homeOvr - awayOvr) * 0.004));
  const awayProb = Math.min(0.84, Math.max(0.68, 0.75 + (awayOvr - homeOvr) * 0.004));

  for (let kick = 0; kick < 5; kick++) {
    if (Math.random() < homeProb) homeScore++;
    const remainingHome = 4 - kick;
    if (awayScore > homeScore + 5 - kick || homeScore > awayScore + 5 - kick) break;
    if (Math.random() < awayProb) awayScore++;
    if (homeScore > awayScore + remainingHome || awayScore > homeScore + remainingHome) break;
  }

  while (homeScore === awayScore) {
    const hHit = Math.random() < homeProb;
    const aHit = Math.random() < awayProb;
    if (hHit) homeScore++;
    if (aHit) awayScore++;
  }

  return [homeScore, awayScore];
}

export function simulateFACupRound(
  faCup: FACupState,
  clubs: Club[],
  players: Player[],
  tacticsByClub: Record<number, Tactics>,
  referees: Referee[],
  stadiumByClub: Record<number, StadiumConfig>,
  userClubId: number,
  currentMatchweek: number
): {
  nextFaCup: FACupState;
  prizeByClub: Map<number, number>;
  headlines: NewsItem[];
} {
  const rIdx = faCup.currentRoundIndex;
  const round = faCup.rounds[rIdx];
  if (!round || round.completed || faCup.championClubId !== null) {
    return { nextFaCup: faCup, prizeByClub: new Map(), headlines: [] };
  }

  const clubMap = new Map(clubs.map((c) => [c.id, c]));
  const prizeByClub = new Map<number, number>();
  const headlines: NewsItem[] = [];
  const winners: Club[] = [];
  let userTieSummary: string | null = null;
  const upsets: Array<{ winner: Club; loser: Club; score: string; gap: number }> = [];

  const updatedTies: FACupTie[] = round.ties.map((tie, idx) => {
    const homeClub = clubMap.get(tie.homeClubId)!;
    const awayClub = clubMap.get(tie.awayClubId)!;
    const homePlayers = players.filter((p) => p.clubId === homeClub.id);
    const awayPlayers = players.filter((p) => p.clubId === awayClub.id);

    const ensureClubTactics = (c: Club, squad: Player[]): Tactics => {
      const existing = tacticsByClub[c.id];
      if (existing && existing.starters.length >= 11) {
        const picked = autoPickLineup(squad, existing.formation);
        return { ...existing, starters: picked.starters, bench: picked.bench };
      }
      return createDefaultTactics(squad, c.avgOverall);
    };

    const hTac =
      homeClub.id === userClubId && tacticsByClub[userClubId]
        ? tacticsByClub[userClubId]
        : ensureClubTactics(homeClub, homePlayers);
    const aTac =
      awayClub.id === userClubId && tacticsByClub[userClubId]
        ? tacticsByClub[userClubId]
        : ensureClubTactics(awayClub, awayPlayers);

    const ref = referees[(rIdx * 31 + idx) % referees.length] ?? {
      id: 1,
      name: "Michael Oliver",
      country: "England",
      avgCardsPerGame: 3.8,
    };

    const fx: Fixture = {
      id: 90000 + rIdx * 100 + idx,
      matchweek: round.triggerMatchweek,
      date: round.date,
      kickoffTimeUk: "15:00",
      homeClubId: homeClub.id,
      awayClubId: awayClub.id,
      tvBroadcaster: "BBC / ITV Sport",
      refereeId: ref.id,
      played: false,
      homeGoals: null,
      awayGoals: null,
    };

    const res = simulateFullMatch(
      fx,
      homeClub,
      awayClub,
      homePlayers,
      awayPlayers,
      hTac,
      aTac,
      ref,
      stadiumByClub[homeClub.id]
    );

    let winnerClub = res.homeGoals > res.awayGoals ? homeClub : awayClub;
    let homePens: number | null = null;
    let awayPens: number | null = null;

    if (res.homeGoals === res.awayGoals) {
      const [hp, ap] = simulatePenaltyShootout(homeClub.avgOverall, awayClub.avgOverall);
      homePens = hp;
      awayPens = ap;
      winnerClub = hp > ap ? homeClub : awayClub;
    }

    const loserClub = winnerClub.id === homeClub.id ? awayClub : homeClub;
    winners.push(winnerClub);
    prizeByClub.set(winnerClub.id, (prizeByClub.get(winnerClub.id) ?? 0) + round.prizeEur);

    const penSuffix =
      homePens !== null && awayPens !== null ? ` (${homePens}–${awayPens} pên.)` : "";
    const scoreStr = `${homeClub.shortName} ${res.homeGoals} x ${res.awayGoals} ${awayClub.shortName}${penSuffix}`;

    if (homeClub.id === userClubId || awayClub.id === userClubId) {
      const didWin = winnerClub.id === userClubId;
      userTieSummary = didWin
        ? `${scoreStr} — ${winnerClub.name} avança e fatura +${formatMoney(round.prizeEur)}!`
        : `${scoreStr} — ${winnerClub.name} eliminou o seu time na ${round.shortName}.`;
    }

    const winnerTier = winnerClub.tier ?? 1;
    const loserTier = loserClub.tier ?? 1;
    if (winnerTier > loserTier) {
      upsets.push({
        winner: winnerClub,
        loser: loserClub,
        score: scoreStr,
        gap: winnerTier - loserTier,
      });
    }

    return {
      ...tie,
      played: true,
      homeGoals: res.homeGoals,
      awayGoals: res.awayGoals,
      homePenalties: homePens,
      awayPenalties: awayPens,
      winnerClubId: winnerClub.id,
    };
  });

  if (userTieSummary) {
    headlines.push({
      id: `fac-user-${rIdx}-${Date.now()}`,
      matchweek: currentMatchweek,
      category: "cup",
      clubId: userClubId,
      title: `Copa da Inglaterra (${round.shortName})`,
      body: userTieSummary,
    });
  }

  upsets.sort((a, b) => b.gap - a.gap);
  if (upsets.length > 0) {
    const biggest = upsets[0];
    headlines.push({
      id: `fac-upset-${rIdx}-${Date.now()}`,
      matchweek: currentMatchweek,
      category: "cup",
      title: `ZEBRA NA FA CUP! ${biggest.winner.name} elimina ${biggest.loser.name}`,
      body: `Surpresa na ${round.shortName}: ${biggest.score} (${biggest.winner.division ?? "EFL"} derruba clube da ${biggest.loser.division ?? "divisão superior"}).`,
    });
  }

  const nextRounds = faCup.rounds.map((r, i) =>
    i === rIdx ? { ...r, completed: true, ties: updatedTies } : { ...r }
  );

  let nextRoundIndex = rIdx;
  let championClubId: number | null = faCup.championClubId;

  if (rIdx + 1 < nextRounds.length && winners.length >= 2) {
    nextRoundIndex = rIdx + 1;
    const nextTies: FACupTie[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (!winners[i + 1]) break;
      nextTies.push({
        id: `fac-r${nextRoundIndex}-t${i / 2 + 1}`,
        roundIndex: nextRoundIndex,
        homeClubId: winners[i].id,
        awayClubId: winners[i + 1].id,
        played: false,
        homeGoals: null,
        awayGoals: null,
        homePenalties: null,
        awayPenalties: null,
        winnerClubId: null,
      });
    }
    nextRounds[nextRoundIndex] = {
      ...nextRounds[nextRoundIndex],
      ties: nextTies,
    };
  } else if (winners.length === 1) {
    const champClub = winners[0];
    championClubId = champClub.id;
    headlines.unshift({
      id: `fac-champ-${Date.now()}`,
      matchweek: currentMatchweek,
      category: "cup",
      clubId: champClub.id,
      title: `${champClub.name} é CAMPEÃO da Copa da Inglaterra 2026/27!`,
      body: `Em Wembley, o ${champClub.name} levantou a taça da Emirates FA Cup e levou o prêmio de ${formatMoney(
        round.prizeEur
      )}!`,
    });
  }

  return {
    nextFaCup: {
      ...faCup,
      currentRoundIndex: nextRoundIndex,
      championClubId,
      rounds: nextRounds,
    },
    prizeByClub,
    headlines,
  };
}

export function extractMatchweekDates(fixtures: Fixture[]): string[] {
  const dateByMw = new Map<number, string>();
  for (const fx of fixtures) {
    if (!dateByMw.has(fx.matchweek)) {
      dateByMw.set(fx.matchweek, fx.date);
    }
  }
  const dates: string[] = [];
  for (let mw = 1; mw <= 38; mw++) {
    dates.push(dateByMw.get(mw) ?? "2026-08-22");
  }
  return dates;
}

export function generateDivisionFixtures(
  divisionClubs: Club[],
  allMatchweekDates: string[],
  referees: Referee[],
  userClubId?: number
): Fixture[] {
  // Select up to 20 clubs (always keeping userClubId) for a balanced 38-matchweek season
  let activePool = [...divisionClubs].sort((a, b) => b.avgOverall - a.avgOverall);
  if (activePool.length > 20) {
    const userClub = userClubId ? activePool.find((c) => c.id === userClubId) : undefined;
    const others = activePool.filter((c) => c.id !== userClubId).slice(0, userClub ? 19 : 20);
    activePool = userClub ? [userClub, ...others] : others;
  }

  // Ensure even team count
  if (activePool.length % 2 !== 0 && activePool.length > 2) {
    activePool = activePool.slice(0, activePool.length - 1);
  }

  const n = activePool.length;
  if (n < 2) return [];

  // Build canonical single round-robin legs using circle method
  const ids = activePool.map((c) => c.id);
  const half = n / 2;
  const fixed = ids[0];
  let rotating = ids.slice(1);
  const singleLegRounds: Array<Array<[number, number]>> = [];

  for (let r = 0; r < n - 1; r++) {
    const roundPairs: Array<[number, number]> = [];
    const cur = [fixed, ...rotating];
    for (let i = 0; i < half; i++) {
      const a = cur[i];
      const b = cur[n - 1 - i];
      roundPairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    singleLegRounds.push(roundPairs);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  const fixtures: Fixture[] = [];
  let nextFxId = 1;

  for (let mw = 1; mw <= 38; mw++) {
    const idxZero = mw - 1;
    const legIndex = Math.floor(idxZero / singleLegRounds.length);
    const roundInLeg = idxZero % singleLegRounds.length;
    const pairs = singleLegRounds[roundInLeg];
    const date = allMatchweekDates[idxZero] ?? "2026-08-22";

    for (const [h, a] of pairs) {
      const swapHome = legIndex % 2 === 1;
      const homeClubId = swapHome ? a : h;
      const awayClubId = swapHome ? h : a;
      const ref = referees[(nextFxId * 5) % referees.length] ?? referees[0];
      fixtures.push({
        id: nextFxId,
        matchweek: mw,
        date,
        kickoffTimeUk: "15:00",
        homeClubId,
        awayClubId,
        tvBroadcaster: "EFL / Sky Sports+",
        refereeId: ref.id,
        played: false,
        homeGoals: null,
        awayGoals: null,
      });
      nextFxId++;
    }
  }

  return fixtures;
}
