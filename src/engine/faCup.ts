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

export function getLeagueTvBroadcaster(division?: string): string {
  if (!division) return "Transmissão Oficial";
  if (division === "Premier League") return "Sky Sports / TNT Sports";
  if (division.includes("EFL")) return "Sky Sports+";
  if (division.includes("Brasileirão")) return "Globo / Premiere / CazéTV";
  if (division.includes("LALIGA")) return "DAZN / Movistar+";
  if (division.includes("Serie A") || division.includes("Serie B")) return "DAZN / Sky Sport Italia";
  if (division.includes("Bundesliga")) return "Sky Sport / DAZN Deutschland";
  if (division.includes("Ligue 1") || division.includes("Ligue 2")) return "DAZN / beIN SPORTS";
  if (division.includes("Liga Profesional")) return "ESPN Premium / TNT Sports Argentina";
  if (division.includes("Sul-Americana")) return "ESPN / Disney+ / Paramount+";
  if (division.includes("UEFA")) return "UEFA.tv / Prime Video";
  if (division.includes("Liga Portugal")) return "Sport TV Portugal";
  if (division.includes("Eredivisie")) return "ESPN Eredivisie";
  if (division.includes("Major League Soccer")) return "Apple TV (MLS Season Pass)";
  if (division.includes("Saudi")) return "Shahid / SSC Sports";
  if (division.includes("Liga BBVA MX")) return "TUDN / ViX Premium";
  if (division.includes("Scottish")) return "Sky Sports Scotland";
  if (division.includes("Süper Lig")) return "beIN SPORTS Türkiye";
  if (division.includes("Jupiler")) return "DAZN Belgium";
  return "Transmissão Oficial";
}

export function getCupInfo(club?: Club): { name: string; shortName: string; description: string } {
  const country = club?.country ?? "";
  const league = club?.league ?? club?.division ?? "";
  if (country === "Brasil" || league.includes("Brasileirão")) {
    return {
      name: "Copa do Brasil — Mata-Mata Nacional",
      shortName: "Copa do Brasil",
      description: "Torneio eliminatório nacional em jogo único com decisão por pênaltis em caso de empate.",
    };
  }
  if (country === "Espanha" || league.includes("LALIGA")) {
    return {
      name: "Copa del Rey — Mata-Mata Nacional",
      shortName: "Copa del Rey",
      description: "O tradicional torneio de mata-mata espanhol com decisão por pênaltis em caso de empate.",
    };
  }
  if (country === "Itália" || league.includes("Serie A") || league.includes("Serie B")) {
    return {
      name: "Coppa Italia — Mata-Mata Nacional",
      shortName: "Coppa Italia",
      description: "Torneio eliminatório nacional italiano com decisão por pênaltis em caso de empate.",
    };
  }
  if (country === "Alemanha" || league.includes("Bundesliga")) {
    return {
      name: "DFB-Pokal — Copa da Alemanha",
      shortName: "DFB-Pokal",
      description: "Torneio de mata-mata alemão onde zebras históricas acontecem a cada fase.",
    };
  }
  if (country === "França" || league.includes("Ligue 1") || league.includes("Ligue 2")) {
    return {
      name: "Coupe de France — Copa da França",
      shortName: "Coupe de France",
      description: "Mata-mata tradicional do futebol francês em jogo único com pênaltis em caso de empate.",
    };
  }
  if (country === "Argentina" || league.includes("Liga Profesional")) {
    return {
      name: "Copa Argentina — Mata-Mata Nacional",
      shortName: "Copa Argentina",
      description: "Torneio eliminatório da Argentina reunindo os maiores clubes do país.",
    };
  }
  if (country === "Estados Unidos" || league.includes("MLS") || league.includes("Major League Soccer")) {
    return {
      name: "Lamar Hunt US Open Cup",
      shortName: "US Open Cup",
      description: "Copa nacional dos Estados Unidos em formato mata-mata.",
    };
  }
  if (country === "Arábia Saudita" || league.includes("Saudi")) {
    return {
      name: "King's Cup — Copa do Rei da Arábia",
      shortName: "King's Cup",
      description: "Torneio eliminatório do futebol saudita reunindo os gigantes da ROSHN Saudi League.",
    };
  }
  return {
    name: "Emirates FA Cup — Copa da Inglaterra",
    shortName: "FA Cup",
    description: "Torneio eliminatório em jogo único envolvendo clubes das principais divisões.",
  };
}

export function createInitialFACupState(clubs: Club[], userClubId?: number): FACupState {
  const userClub = userClubId ? clubs.find((c) => c.id === userClubId) : undefined;
  const userCountry = userClub?.country ?? "Inglaterra";
  const userLeague = userClub?.league ?? userClub?.division ?? "Premier League";

  // Select clubs for domestic cup: prefer same country or league family
  let candidateClubs = clubs.filter((c) => {
    if (userCountry && userCountry !== "Outro" && c.country === userCountry) return true;
    if (c.league === userLeague) return true;
    return false;
  });

  if (candidateClubs.length < 16) {
    const additional = [...clubs]
      .filter((c) => !candidateClubs.some((existing) => existing.id === c.id))
      .sort((a, b) => b.avgOverall - a.avgOverall);
    candidateClubs = [...candidateClubs, ...additional];
  }

  if (userClub && !candidateClubs.some((c) => c.id === userClub.id)) {
    candidateClubs.unshift(userClub);
  }

  const usableCount =
    candidateClubs.length >= 64 ? 64 : candidateClubs.length >= 32 ? 32 : candidateClubs.length >= 16 ? 16 : 8;
  const startRoundIndex =
    usableCount === 64 ? 0 : usableCount === 32 ? 1 : usableCount === 16 ? 2 : 3;

  let poolClubs = candidateClubs.slice(0, usableCount);
  if (userClub && !poolClubs.some((c) => c.id === userClub.id)) {
    poolClubs[poolClubs.length - 1] = userClub;
  }

  const pool = shuffleArray(poolClubs);
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

  const userClub = clubMap.get(userClubId);
  const cupInfo = getCupInfo(userClub);

  if (userTieSummary) {
    headlines.push({
      id: `fac-user-${rIdx}-${Date.now()}`,
      matchweek: currentMatchweek,
      category: "cup",
      clubId: userClubId,
      title: `${cupInfo.shortName} (${round.shortName})`,
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
      title: `ZEBRA NA ${cupInfo.shortName.toUpperCase()}! ${biggest.winner.name} elimina ${biggest.loser.name}`,
      body: `Surpresa na ${round.shortName}: ${biggest.score} (${biggest.winner.division ?? "divisão de acesso"} derruba clube da ${biggest.loser.division ?? "divisão superior"}).`,
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
      title: `${champClub.name} é CAMPEÃO da ${cupInfo.shortName} 2026/27!`,
      body: `O ${champClub.name} levantou o troféu da ${cupInfo.name} e faturou a premiação de ${formatMoney(
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
  userClubId?: number,
  divisionName?: string
): Fixture[] {
  // Select up to 20 clubs (always keeping userClubId) for a balanced 38-matchweek season
  let activePool = [...divisionClubs].sort((a, b) => b.avgOverall - a.avgOverall);
  if (activePool.length > 20) {
    const userClub = userClubId ? activePool.find((c) => c.id === userClubId) : undefined;
    const others = activePool.filter((c) => c.id !== userClubId).slice(0, userClub ? 19 : 20);
    activePool = userClub ? [userClub, ...others] : others;
  }

  // Ensure even team count without removing user club
  if (activePool.length % 2 !== 0 && activePool.length > 2) {
    if (userClubId && activePool[activePool.length - 1].id === userClubId) {
      activePool.splice(activePool.length - 2, 1);
    } else {
      activePool.pop();
    }
  }

  const n = activePool.length;
  if (n < 2) return [];

  const tvChannel = getLeagueTvBroadcaster(
    divisionName ?? divisionClubs[0]?.league ?? divisionClubs[0]?.division ?? "Premier League"
  );

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
        tvBroadcaster: tvChannel,
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
