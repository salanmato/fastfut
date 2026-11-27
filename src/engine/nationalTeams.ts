import type {
  Club,
  FifaWindow,
  InternationalBreakReport,
  NationalCallup,
  NationalMatchResult,
  NewsItem,
  Player,
  RoleCategory,
  SaveState,
} from "../types/game";
import { normalizeNation, type Confederation, type NormalizedNation } from "../utils/nations";

export interface NationalSquadMember {
  player: Player;
  score: number;
  role: "starter" | "reserve";
}

export interface NationalSquad {
  nation: NormalizedNation;
  members: NationalSquadMember[];
  preList: NationalSquadMember[];
  strength: number;
  isFull: boolean;
  eligibleCount: number;
}

const CALLUP_QUOTAS: Record<RoleCategory, number> = {
  GK: 3,
  DEF: 9,
  MID: 8,
  ATT: 6,
};

const STARTER_QUOTAS: Record<RoleCategory, number> = {
  GK: 1,
  DEF: 4,
  MID: 3,
  ATT: 3,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeSelectionScore(p: Player): number {
  const formBonus =
    p.seasonAppearances >= 3
      ? clamp((p.seasonAvgRating - 6.6) * 2.5, -3, 3)
      : 0;
  const agePenalty = p.age >= 35 ? -2 : 0;
  const wonderkidBonus = p.age <= 21 && p.potential >= 85 ? 1 : 0;
  return p.overall + formBonus + agePenalty + wonderkidBonus;
}

export function buildNationalSquads(players: Player[]): Map<string, NationalSquad> {
  const grouped = new Map<
    string,
    { nation: NormalizedNation; candidates: Array<{ player: Player; score: number }> }
  >();

  for (const p of players) {
    if (p.clubId === null) continue;
    if (p.injuryMatchesLeft && p.injuryMatchesLeft > 0) continue;
    if (p.overall < 58) continue;

    const nation = normalizeNation(p.nationality);
    const score = computeSelectionScore(p);
    let bucket = grouped.get(nation.key);
    if (!bucket) {
      bucket = { nation, candidates: [] };
      grouped.set(nation.key, bucket);
    }
    bucket.candidates.push({ player: p, score });
  }

  const squads = new Map<string, NationalSquad>();

  for (const [key, { nation, candidates }] of grouped.entries()) {
    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        b.player.overall - a.player.overall ||
        b.player.potential - a.player.potential ||
        a.player.id - b.player.id
    );

    const eligibleCount = candidates.length;
    const isFull = eligibleCount >= 11;
    const pool = isFull
      ? candidates
      : candidates.filter((c) => c.player.overall >= 72);

    if (pool.length === 0) continue;

    const selectedIds = new Set<number>();
    const selectedRaw: Array<{ player: Player; score: number }> = [];

    const roles: RoleCategory[] = ["GK", "DEF", "MID", "ATT"];
    for (const rc of roles) {
      const quota = CALLUP_QUOTAS[rc];
      let count = 0;
      for (const item of pool) {
        if (item.player.roleCategory !== rc) continue;
        selectedIds.add(item.player.id);
        selectedRaw.push(item);
        count++;
        if (count >= quota) break;
      }
    }

    if (isFull && selectedRaw.length < 26) {
      for (const item of pool) {
        if (selectedRaw.length >= 26) break;
        if (selectedIds.has(item.player.id)) continue;
        if (item.player.roleCategory === "GK") continue;
        selectedIds.add(item.player.id);
        selectedRaw.push(item);
      }
      if (selectedRaw.length < 26) {
        for (const item of pool) {
          if (selectedRaw.length >= 26) break;
          if (selectedIds.has(item.player.id)) continue;
          selectedIds.add(item.player.id);
          selectedRaw.push(item);
        }
      }
    }

    // Determine starters per roleCategory
    const roleCounts: Record<RoleCategory, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    selectedRaw.sort((a, b) => b.score - a.score || b.player.overall - a.player.overall);

    const members: NationalSquadMember[] = selectedRaw.map((item) => {
      const rc = item.player.roleCategory;
      const rank = roleCounts[rc];
      roleCounts[rc] = rank + 1;
      const role: "starter" | "reserve" =
        rank < STARTER_QUOTAS[rc] ? "starter" : "reserve";
      return {
        player: item.player,
        score: item.score,
        role,
      };
    });

    // Sort cleanly: starters first (GK, DEF, MID, ATT), then reserves (GK, DEF, MID, ATT)
    const roleOrder: Record<RoleCategory, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
    members.sort((a, b) => {
      if (a.role !== b.role) return a.role === "starter" ? -1 : 1;
      if (a.player.roleCategory !== b.player.roleCategory) {
        return roleOrder[a.player.roleCategory] - roleOrder[b.player.roleCategory];
      }
      return b.score - a.score;
    });

    const starterOveralls = members
      .filter((m) => m.role === "starter")
      .map((m) => m.player.overall);
    let strengthSum = starterOveralls.reduce((s, v) => s + v, 0);
    const missingStarters = Math.max(0, 11 - starterOveralls.length);
    strengthSum += missingStarters * 62;
    const strength = Math.round((strengthSum / 11) * 10) / 10;

    const preList: NationalSquadMember[] = candidates
      .filter((c) => !selectedIds.has(c.player.id))
      .slice(0, 6)
      .map((c) => ({ player: c.player, score: c.score, role: "reserve" }));

    squads.set(key, {
      nation,
      members,
      preList,
      strength,
      isFull,
      eligibleCount,
    });
  }

  return squads;
}

function samplePoisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 9);
  return k - 1;
}

function pickWeightedIndex(weights: number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(rng() * weights.length);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

interface MatchPair {
  home: NationalSquad;
  away: NationalSquad;
  matchIndex: number;
}

function buildBreakFixtures(squadsMap: Map<string, NationalSquad>): MatchPair[] {
  const byConfed = new Map<Confederation, NationalSquad[]>();
  for (const sq of squadsMap.values()) {
    const list = byConfed.get(sq.nation.confed) ?? [];
    list.push(sq);
    byConfed.set(sq.nation.confed, list);
  }

  const pairs: MatchPair[] = [];
  const leftovers: NationalSquad[] = [];

  for (const list of byConfed.values()) {
    list.sort((a, b) => b.strength - a.strength);
    let i = 0;
    while (i + 3 < list.length) {
      const a = list[i];
      const b = list[i + 1];
      const c = list[i + 2];
      const d = list[i + 3];
      pairs.push({ home: a, away: b, matchIndex: 1 });
      pairs.push({ home: c, away: d, matchIndex: 1 });
      pairs.push({ home: c, away: a, matchIndex: 2 });
      pairs.push({ home: d, away: b, matchIndex: 2 });
      i += 4;
    }
    while (i < list.length) {
      leftovers.push(list[i]);
      i++;
    }
  }

  // Pair remaining nations across confederations
  leftovers.sort((a, b) => b.strength - a.strength);
  let j = 0;
  while (j + 3 < leftovers.length) {
    const a = leftovers[j];
    const b = leftovers[j + 1];
    const c = leftovers[j + 2];
    const d = leftovers[j + 3];
    pairs.push({ home: a, away: b, matchIndex: 1 });
    pairs.push({ home: c, away: d, matchIndex: 1 });
    pairs.push({ home: c, away: a, matchIndex: 2 });
    pairs.push({ home: d, away: b, matchIndex: 2 });
    j += 4;
  }
  if (j + 1 < leftovers.length) {
    const a = leftovers[j];
    const b = leftovers[j + 1];
    pairs.push({ home: a, away: b, matchIndex: 1 });
    pairs.push({ home: b, away: a, matchIndex: 2 });
    j += 2;
  }
  if (j < leftovers.length) {
    // Single remaining nation: pair with nearest squad as cross-confed friendly
    const solo = leftovers[j];
    const allSorted = Array.from(squadsMap.values())
      .filter((s) => s.nation.key !== solo.nation.key)
      .sort((x, y) => Math.abs(x.strength - solo.strength) - Math.abs(y.strength - solo.strength));
    if (allSorted.length >= 2) {
      pairs.push({ home: solo, away: allSorted[0], matchIndex: 1 });
      pairs.push({ home: allSorted[1], away: solo, matchIndex: 2 });
    }
  }

  return pairs;
}

export function simulateInternationalBreak(
  save: SaveState,
  window: FifaWindow,
  rng: () => number = Math.random
): {
  players: Player[];
  report: InternationalBreakReport;
  news: NewsItem[];
} {
  const squads = buildNationalSquads(save.players);
  const clubMap = new Map<number, Club>(save.clubs.map((c) => [c.id, c]));
  const userClub = clubMap.get(save.userClubId);

  const playerMatchCount = new Map<number, number>();
  const playerStats = new Map<
    number,
    {
      nationKey: string;
      nationLabel: string;
      flag: string;
      confed: Confederation;
      role: "starter" | "reserve";
      apps: number;
      minutes: number;
      goals: number;
      assists: number;
      staminaLoss: number;
      injuryMatches?: number;
      injuryType?: string;
    }
  >();

  // Identify 3rd GKs per squad so they don't accumulate outfield sub minutes
  const thirdGkIds = new Set<number>();
  for (const sq of squads.values()) {
    const gks = sq.members.filter((m) => m.player.roleCategory === "GK");
    for (let k = 2; k < gks.length; k++) {
      thirdGkIds.add(gks[k].player.id);
    }
    for (const m of sq.members) {
      playerStats.set(m.player.id, {
        nationKey: sq.nation.key,
        nationLabel: sq.nation.labelPt,
        flag: sq.nation.flag,
        confed: sq.nation.confed,
        role: m.role,
        apps: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        staminaLoss: 0,
      });
    }
  }

  const pairs = buildBreakFixtures(squads);
  const allResults: NationalMatchResult[] = [];

  const recordTeamAppearance = (
    sq: NationalSquad,
    goalsScored: number
  ) => {
    const participants: NationalSquadMember[] = [];
    for (const m of sq.members) {
      const prevApps = playerMatchCount.get(m.player.id) ?? 0;
      if (prevApps >= 2) continue;

      if (m.role === "starter") {
        playerMatchCount.set(m.player.id, prevApps + 1);
        const mins = 80 + Math.floor(rng() * 11); // 80..90 -> 160..180 over 2 games
        const st = playerStats.get(m.player.id)!;
        st.apps += 1;
        st.minutes += mins;
        participants.push(m);
      } else if (!thirdGkIds.has(m.player.id) && rng() < 0.4) {
        playerMatchCount.set(m.player.id, prevApps + 1);
        const mins = 15 + Math.floor(rng() * 16); // 15..30
        const st = playerStats.get(m.player.id)!;
        st.apps += 1;
        st.minutes += mins;
        participants.push(m);
      }
    }

    if (goalsScored <= 0 || participants.length === 0) return;

    const goalPosWeight: Record<RoleCategory, number> = {
      ATT: 5,
      MID: 2.5,
      DEF: 0.7,
      GK: 0,
    };
    const assistPosWeight: Record<RoleCategory, number> = {
      ATT: 3,
      MID: 4.5,
      DEF: 1.5,
      GK: 0.1,
    };

    const goalWeights = participants.map(
      (m) =>
        goalPosWeight[m.player.roleCategory] *
        Math.max(0.4, (m.player.faceStats.shooting || 50) / 70)
    );

    for (let g = 0; g < goalsScored; g++) {
      const scorerIdx = pickWeightedIndex(goalWeights, rng);
      const scorer = participants[scorerIdx];
      const st = playerStats.get(scorer.player.id)!;
      st.goals += 1;

      if (participants.length >= 2 && rng() < 0.78) {
        const assistWeights = participants.map((m, idx) =>
          idx === scorerIdx
            ? 0
            : assistPosWeight[m.player.roleCategory] *
              Math.max(0.4, (m.player.faceStats.passing || 50) / 70)
        );
        const assisterIdx = pickWeightedIndex(assistWeights, rng);
        if (assisterIdx !== scorerIdx) {
          const astSt = playerStats.get(participants[assisterIdx].player.id)!;
          astSt.assists += 1;
        }
      }
    }
  };

  for (const pair of pairs) {
    const lambdaHome = clamp(
      1.3 + (pair.home.strength - pair.away.strength) * 0.06 + 0.15,
      0.2,
      3.5
    );
    const lambdaAway = clamp(
      1.3 + (pair.away.strength - pair.home.strength) * 0.06,
      0.2,
      3.5
    );
    const homeGoals = samplePoisson(lambdaHome, rng);
    const awayGoals = samplePoisson(lambdaAway, rng);

    allResults.push({
      nationKey: pair.home.nation.key,
      nationLabel: pair.home.nation.labelPt,
      flag: pair.home.nation.flag,
      opponentKey: pair.away.nation.key,
      opponentLabel: pair.away.nation.labelPt,
      opponentFlag: pair.away.nation.flag,
      goalsFor: homeGoals,
      goalsAgainst: awayGoals,
      isHome: true,
      competition: window.competition,
      matchIndex: pair.matchIndex,
    });
    allResults.push({
      nationKey: pair.away.nation.key,
      nationLabel: pair.away.nation.labelPt,
      flag: pair.away.nation.flag,
      opponentKey: pair.home.nation.key,
      opponentLabel: pair.home.nation.labelPt,
      opponentFlag: pair.home.nation.flag,
      goalsFor: awayGoals,
      goalsAgainst: homeGoals,
      isHome: false,
      competition: window.competition,
      matchIndex: pair.matchIndex,
    });

    recordTeamAppearance(pair.home, homeGoals);
    recordTeamAppearance(pair.away, awayGoals);
  }

  // Apply stamina, morale & injury effects across all players
  let restedCount = 0;
  const updatedPlayers: Player[] = save.players.map((p) => {
    const st = playerStats.get(p.id);
    if (st) {
      const club = p.clubId ? clubMap.get(p.clubId) : undefined;
      const clubConfed = club?.country
        ? normalizeNation(club.country).confed
        : st.confed;
      const baseLoss = st.role === "starter" ? 26 : 11;
      const travelPenalty = st.confed !== clubConfed ? 8 : 0;
      const staminaLoss = baseLoss + travelPenalty;
      st.staminaLoss = staminaLoss;

      const injChance = st.role === "starter" ? 0.04 : 0.015;
      let nextInjuryMatches = p.injuryMatchesLeft;
      let nextInjuryType = p.injuryType;
      if (st.apps > 0 && rng() < injChance) {
        const dur = 1 + Math.floor(rng() * 3); // 1..3
        const injLabel = `Lesão na seleção (${st.nationLabel})`;
        st.injuryMatches = dur;
        st.injuryType = injLabel;
        nextInjuryMatches = dur;
        nextInjuryType = injLabel;
      }

      return {
        ...p,
        stamina: Math.max(38, p.stamina - staminaLoss),
        morale: Math.min(100, p.morale + 3 + st.goals * 2),
        injuryMatchesLeft: nextInjuryMatches,
        injuryType: nextInjuryType,
      };
    }

    if (p.clubId !== null) {
      if (p.clubId === save.userClubId) restedCount++;
      return {
        ...p,
        stamina: Math.min(100, p.stamina + 28),
      };
    }

    return p;
  });

  // Build User Club Callups & Snubs
  const userCallups: NationalCallup[] = [];
  const userSnubs: InternationalBreakReport["userSnubs"] = [];
  const userNationKeys = new Set<string>();
  if (userClub?.country) {
    userNationKeys.add(normalizeNation(userClub.country).key);
  }

  for (const p of save.players) {
    if (p.clubId !== save.userClubId) continue;
    const st = playerStats.get(p.id);
    if (st) {
      userNationKeys.add(st.nationKey);
      userCallups.push({
        playerId: p.id,
        playerName: p.name,
        clubId: save.userClubId,
        clubName: userClub?.name ?? p.clubName,
        position: p.primaryPosition,
        overall: p.overall,
        age: p.age,
        nationKey: st.nationKey,
        nationLabel: st.nationLabel,
        flag: st.flag,
        role: st.role,
        apps: st.apps,
        minutes: st.minutes,
        goals: st.goals,
        assists: st.assists,
        staminaLoss: st.staminaLoss,
        injuryMatches: st.injuryMatches,
        injuryType: st.injuryType,
      });
    } else if (p.overall >= 74) {
      const nat = normalizeNation(p.nationality);
      let reason = "Opção técnica da comissão";
      if (p.injuryMatchesLeft && p.injuryMatchesLeft > 0) {
        reason = "Lesionado — fora da lista";
      } else {
        const sq = squads.get(nat.key);
        if (sq) {
          const ahead = sq.members.filter(
            (m) => m.player.roleCategory === p.roleCategory
          ).length;
          if (ahead > 0) {
            reason = `Concorrência: ${ahead} à frente na posição`;
          }
        }
      }
      userSnubs.push({
        playerId: p.id,
        playerName: p.name,
        overall: p.overall,
        position: p.primaryPosition,
        nationLabel: nat.labelPt,
        flag: nat.flag,
        reason,
      });
    }
  }

  userCallups.sort((a, b) => b.overall - a.overall || b.goals - a.goals);
  userSnubs.sort((a, b) => b.overall - a.overall);

  const relevantResults = allResults.filter((r) => userNationKeys.has(r.nationKey));

  const report: InternationalBreakReport = {
    windowId: window.id,
    label: window.label,
    startDate: window.startDate,
    endDate: window.endDate,
    competition: window.competition,
    userCallups,
    userSnubs,
    results: relevantResults,
    restedCount,
  };

  // News generation
  const news: NewsItem[] = [];
  const clubLabel = userClub?.shortName ?? "Seu Clube";
  if (userCallups.length > 0) {
    const namesPreview = userCallups
      .slice(0, 4)
      .map((c) => `${c.flag} ${c.playerName}`)
      .join(", ");
    news.push({
      id: `intl-sum-${window.id}`,
      matchweek: save.currentMatchweek,
      category: "international",
      clubId: save.userClubId,
      title: `${window.label}: ${userCallups.length} convocados do ${clubLabel}`,
      body: `${namesPreview}${
        userCallups.length > 4 ? ` e mais ${userCallups.length - 4}` : ""
      } defenderam suas seleções em ${window.competition}. ${restedCount} atletas descansaram (+28 energia).`,
    });
  } else {
    news.push({
      id: `intl-sum-${window.id}`,
      matchweek: save.currentMatchweek,
      category: "international",
      clubId: save.userClubId,
      title: `${window.label}: elenco do ${clubLabel} aproveita pausa`,
      body: `Nenhum atleta do ${clubLabel} foi convocado nesta janela. ${restedCount} jogadores recuperaram energia (+28).`,
    });
  }

  for (const injured of userCallups.filter((c) => c.injuryMatches)) {
    news.push({
      id: `intl-inj-${window.id}-${injured.playerId}`,
      matchweek: save.currentMatchweek,
      category: "injury",
      clubId: save.userClubId,
      title: `Baixa na Data FIFA: ${injured.playerName} retorna lesionado`,
      body: `${injured.flag} ${injured.playerName} sofreu uma contusão defendendo ${injured.nationLabel} e ficará fora por ${injured.injuryMatches} rodada(s).`,
    });
  }

  const standoutScorers = userCallups.filter((c) => c.goals >= 2);
  if (standoutScorers.length > 0) {
    const star = standoutScorers[0];
    news.push({
      id: `intl-star-${window.id}-${star.playerId}`,
      matchweek: save.currentMatchweek,
      category: "international",
      clubId: save.userClubId,
      title: `Brilho internacional: ${star.playerName} marca ${star.goals} gols pela ${star.nationLabel}!`,
      body: `${star.flag} Em grande fase, ${star.playerName} volta com moral elevada para o ${clubLabel}.`,
    });
  }

  return {
    players: updatedPlayers,
    report,
    news,
  };
}
