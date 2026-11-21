import type {
  ClubSynergyTracker,
  Formation,
  MatchResult,
  Player,
  SaveState,
  Tactics,
} from "../types/game";
import { getPrimaryLanguage } from "./transferNegotiationEngine";

export type { ClubSynergyTracker } from "../types/game";

export interface SectorSynergy {
  score: number; // 0..100
  label: string;
  multiplier: number; // e.g. 0.95 to 1.08
  description: string;
}

export interface SynergyPartnership {
  idA: number;
  idB: number;
  nameA: string;
  nameB: string;
  posA: string;
  posB: string;
  roleA: string;
  roleB: string;
  sharedMatches: number;
  strength: "starting" | "solid" | "strong" | "legendary";
  strengthLabel: string;
  strengthColor: string;
  sector: "Zaga" | "Meio-Campo" | "Ataque" | "Lateral/Ponta" | "Geral";
  isCompatriot: boolean;
  sameLanguage: boolean;
}

export type SynergyTier = "developing" | "regular" | "strong" | "masterclass";

export interface TeamSynergyResult {
  clubId: number;
  overallScore: number; // 0..100
  tier: SynergyTier;
  tierLabel: string;
  tierColor: string;
  overallMultiplier: number; // 0.95 to 1.07 applied to overall team power
  bonusPercentFormatted: string; // e.g. "+5.2%" or "-2.1%"

  // 1. Shared Matches Factor (Quanto mais jogam juntos, melhoram)
  sharedMatchesFactor: {
    avgSharedMatches: number;
    score: number; // 0..100
    label: string;
    description: string;
  };

  // 2. Tactical Familiarity Factor (Consistência na mesma formação)
  tacticalFamiliarityFactor: {
    consecutiveMatches: number;
    formation: Formation;
    score: number; // 0..100
    label: string;
    description: string;
  };

  // 3. Cultural & Language Chemistry Factor
  culturalChemistryFactor: {
    compatriotPairsCount: number;
    sameLanguagePairsCount: number;
    score: number; // 0..100
    label: string;
    description: string;
  };

  // Sector breakdown
  sectors: {
    defense: SectorSynergy;
    midfield: SectorSynergy;
    attack: SectorSynergy;
  };

  // Key player partnerships in this lineup
  topPartnerships: SynergyPartnership[];
}

/**
 * Creates canonical pair key so order of IDs does not matter (e.g. "12-45")
 */
export function makePairKey(idA: number, idB: number): string {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

/**
 * Retrieves existing tracker or auto-bootstraps realistic tenure synergy for existing saves
 */
export function getOrCreateClubSynergyTracker(
  save: Pick<SaveState, "clubs" | "players" | "currentMatchweek" | "tacticsByClub"> & {
    synergyByClub?: Record<number, ClubSynergyTracker>;
  },
  clubId: number
): ClubSynergyTracker {
  if (save.synergyByClub?.[clubId]) {
    return save.synergyByClub[clubId];
  }

  const clubPlayers = save.players.filter((p) => p.clubId === clubId);
  const clubTactics = save.tacticsByClub[clubId];
  const formation = clubTactics?.formation ?? "4-3-3";
  const matchweek = Math.max(1, save.currentMatchweek ?? 1);

  const pairMatches: Record<string, number> = {};

  // Seed established pairs based on season appearances
  for (let i = 0; i < clubPlayers.length; i++) {
    for (let j = i + 1; j < clubPlayers.length; j++) {
      const pA = clubPlayers[i];
      const pB = clubPlayers[j];
      const minApps = Math.min(pA.seasonAppearances ?? 0, pB.seasonAppearances ?? 0);
      if (minApps > 0) {
        const key = makePairKey(pA.id, pB.id);
        // Base tenure: if both played many matches, they shared most of them
        pairMatches[key] = Math.max(1, Math.round(minApps * 0.82));
      }
    }
  }

  const consecutive = Math.min(matchweek, 4);

  return {
    clubId,
    pairMatches,
    lastFormation: formation,
    consecutiveMatchesWithFormation: consecutive,
    totalMatchesTracked: Math.max(0, matchweek - 1),
  };
}

/**
 * Classifies synergy strength of a duo
 */
export function getPartnershipStrength(sharedMatches: number): {
  strength: "starting" | "solid" | "strong" | "legendary";
  strengthLabel: string;
  strengthColor: string;
} {
  if (sharedMatches >= 14) {
    return {
      strength: "legendary",
      strengthLabel: "Sintonia Lendária",
      strengthColor: "text-amber-400 border-amber-500/40 bg-amber-500/10",
    };
  }
  if (sharedMatches >= 8) {
    return {
      strength: "strong",
      strengthLabel: "Forte Entrosamento",
      strengthColor: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    };
  }
  if (sharedMatches >= 4) {
    return {
      strength: "solid",
      strengthLabel: "Boa Parceria",
      strengthColor: "text-sky-400 border-sky-500/40 bg-sky-500/10",
    };
  }
  return {
    strength: "starting",
    strengthLabel: "Em Construção",
    strengthColor: "text-slate-400 border-slate-700 bg-slate-800/40",
  };
}

/**
 * Determines sector for a pair of positions
 */
function getPairSector(
  roleA: string,
  roleB: string
): "Zaga" | "Meio-Campo" | "Ataque" | "Lateral/Ponta" | "Geral" {
  if (
    (roleA === "DEF" && roleB === "DEF") ||
    (roleA === "GK" && roleB === "DEF") ||
    (roleA === "DEF" && roleB === "GK")
  ) {
    return "Zaga";
  }
  if (roleA === "MID" && roleB === "MID") {
    return "Meio-Campo";
  }
  if (roleA === "ATT" && roleB === "ATT") {
    return "Ataque";
  }
  if (
    (roleA === "DEF" && roleB === "ATT") ||
    (roleA === "ATT" && roleB === "DEF")
  ) {
    return "Lateral/Ponta";
  }
  return "Geral";
}

/**
 * Main Synergy Algorithm:
 * Evaluates the chemistry and synergy of any starting XI based on:
 * 1. Matches played together (Shared Appearances)
 * 2. Tactical Familiarity (Consecutive matches using this formation)
 * 3. Cultural & Linguistic compatibility
 */
export function calculateTeamSynergy(
  starters: Player[],
  tactics: Tactics,
  tracker: ClubSynergyTracker
): TeamSynergyResult {
  const clubId = tracker.clubId;
  const n = starters.length;

  if (n < 2) {
    return {
      clubId,
      overallScore: 50,
      tier: "regular",
      tierLabel: "Entrosamento Básico",
      tierColor: "text-slate-300",
      overallMultiplier: 1.0,
      bonusPercentFormatted: "+0.0%",
      sharedMatchesFactor: {
        avgSharedMatches: 0,
        score: 50,
        label: "Poucos Dados",
        description: "Elenco incompleto para cálculo detalhado.",
      },
      tacticalFamiliarityFactor: {
        consecutiveMatches: 1,
        formation: tactics.formation,
        score: 50,
        label: "Padrão",
        description: "Formação inicial básica.",
      },
      culturalChemistryFactor: {
        compatriotPairsCount: 0,
        sameLanguagePairsCount: 0,
        score: 50,
        label: "Equilibrada",
        description: "Equipe com conexões culturais neutras.",
      },
      sectors: {
        defense: { score: 50, label: "Regular", multiplier: 1.0, description: "Desempenho neutro." },
        midfield: { score: 50, label: "Regular", multiplier: 1.0, description: "Desempenho neutro." },
        attack: { score: 50, label: "Regular", multiplier: 1.0, description: "Desempenho neutro." },
      },
      topPartnerships: [],
    };
  }

  // 1. Calculate Shared Matches between all pairs in the lineup
  let totalPairScore = 0;
  let totalPairsCount = 0;
  let totalSharedMatchesSum = 0;

  let defSharedSum = 0;
  let defPairsCount = 0;

  let midSharedSum = 0;
  let midPairsCount = 0;

  let attSharedSum = 0;
  let attPairsCount = 0;

  let compatriotPairsCount = 0;
  let sameLanguagePairsCount = 0;

  const allPartnerships: SynergyPartnership[] = [];

  for (let i = 0; i < n; i++) {
    const pA = starters[i];
    const langA = getPrimaryLanguage(pA.nationality);

    for (let j = i + 1; j < n; j++) {
      const pB = starters[j];
      const langB = getPrimaryLanguage(pB.nationality);

      const pairKey = makePairKey(pA.id, pB.id);
      const sharedMatches = tracker.pairMatches[pairKey] || 0;
      totalSharedMatchesSum += sharedMatches;
      totalPairsCount += 1;

      // Cultural / Language check
      const isCompatriot = pA.nationality.toLowerCase() === pB.nationality.toLowerCase();
      const sameLanguage =
        isCompatriot ||
        (langA.language === langB.language && langA.language !== "other");

      if (isCompatriot) compatriotPairsCount += 1;
      if (sameLanguage) sameLanguagePairsCount += 1;

      // Sector classification
      const sector = getPairSector(pA.roleCategory, pB.roleCategory);

      // Score for this specific pair (0 to 100):
      // 0 games = 30, 4 games = 60, 8 games = 80, 14+ games = 100
      let pairScore = Math.min(100, 30 + Math.pow(sharedMatches, 0.72) * 11.5);

      // Cultural boost to pairing (+3 to +5)
      if (isCompatriot) pairScore = Math.min(100, pairScore + 5);
      else if (sameLanguage) pairScore = Math.min(100, pairScore + 3);

      totalPairScore += pairScore;

      // Sector tracking
      if (sector === "Zaga") {
        defSharedSum += pairScore;
        defPairsCount += 1;
      } else if (sector === "Meio-Campo") {
        midSharedSum += pairScore;
        midPairsCount += 1;
      } else if (sector === "Ataque") {
        attSharedSum += pairScore;
        attPairsCount += 1;
      }

      // Record partnership
      const strengthInfo = getPartnershipStrength(sharedMatches);
      allPartnerships.push({
        idA: pA.id,
        idB: pB.id,
        nameA: pA.name,
        nameB: pB.name,
        posA: pA.primaryPosition,
        posB: pB.primaryPosition,
        roleA: pA.roleCategory,
        roleB: pB.roleCategory,
        sharedMatches,
        strength: strengthInfo.strength,
        strengthLabel: strengthInfo.strengthLabel,
        strengthColor: strengthInfo.strengthColor,
        sector,
        isCompatriot,
        sameLanguage,
      });
    }
  }

  const avgSharedMatches =
    totalPairsCount > 0
      ? Math.round((totalSharedMatchesSum / totalPairsCount) * 10) / 10
      : 0;

  const sharedMatchesScore =
    totalPairsCount > 0 ? Math.round(totalPairScore / totalPairsCount) : 50;

  // Shared matches label
  let sharedMatchesLabel = "Em Construção";
  let sharedMatchesDesc = "Jogadores ainda se conhecendo em campo.";
  if (avgSharedMatches >= 12) {
    sharedMatchesLabel = "Sintonia Total";
    sharedMatchesDesc = "Base titular veterana com dezenas de jogos juntos.";
  } else if (avgSharedMatches >= 7) {
    sharedMatchesLabel = "Muito Entrosados";
    sharedMatchesDesc = "Espinha dorsal consolidada com ótimo ritmo de jogo conjunto.";
  } else if (avgSharedMatches >= 3.5) {
    sharedMatchesLabel = "Entrosamento Sólido";
    sharedMatchesDesc = "Boa sequência de partidas juntos como titulares.";
  }

  // 2. Tactical Familiarity Score
  const consec = tracker.consecutiveMatchesWithFormation || 1;
  const isSameFormation = tracker.lastFormation === tactics.formation;
  const effectiveConsec = isSameFormation ? consec : 1;

  // 1 match = 50%, 2 matches = 66%, 4 matches = 84%, 7+ matches = 100%
  const tacticalFamiliarityScore = Math.min(
    100,
    Math.round(48 + Math.min(effectiveConsec, 8) * 6.5)
  );

  let tacticalLabel = "Básica";
  let tacticalDesc = "Formação recém-adotada; time ainda adaptando funções táticas.";
  if (effectiveConsec >= 6) {
    tacticalLabel = "Automatizada (Mestria)";
    tacticalDesc = `${effectiveConsec} rodadas consecutivas no ${tactics.formation}. Movimentações ensaiadas e naturais.`;
  } else if (effectiveConsec >= 3) {
    tacticalLabel = "Consistente";
    tacticalDesc = `${effectiveConsec} rodadas na mesma formação ${tactics.formation}.`;
  }

  // 3. Cultural Chemistry Score
  const totalPairs = Math.max(1, totalPairsCount);
  const culturalRatio = (sameLanguagePairsCount + compatriotPairsCount * 0.5) / totalPairs;
  const culturalChemistryScore = Math.min(
    100,
    Math.round(45 + Math.min(1, culturalRatio * 1.8) * 55)
  );

  let culturalLabel = "Mista";
  let culturalDesc = "Elenco multinacional com comunicação padrão.";
  if (culturalChemistryScore >= 80) {
    culturalLabel = "Excelente Conexão";
    culturalDesc = "Alta compatibilidade de idioma e compatriotas em setores-chave.";
  } else if (culturalChemistryScore >= 65) {
    culturalLabel = "Boa Harmonia";
    culturalDesc = "Conexões linguísticas e culturais fluidas no vestiário.";
  }

  // Overall Synergy Weighted Synthesis:
  // 55% Shared Matches, 25% Tactical Familiarity, 20% Cultural Chemistry
  const overallScore = Math.max(
    20,
    Math.min(
      100,
      Math.round(
        sharedMatchesScore * 0.55 +
          tacticalFamiliarityScore * 0.25 +
          culturalChemistryScore * 0.20
      )
    )
  );

  // Overall Multiplier for match simulation (0.95x at 30% to 1.07x at 95%+)
  // 50% = 1.00x
  const overallMultiplier =
    Math.round((0.94 + (overallScore / 100) * 0.12) * 1000) / 1000;

  const bonusPctVal = Math.round((overallMultiplier - 1) * 1000) / 10;
  const bonusPercentFormatted = `${bonusPctVal >= 0 ? "+" : ""}${bonusPctVal.toFixed(1)}%`;

  // Tier classification
  let tier: SynergyTier = "regular";
  let tierLabel = "Entrosamento Regular";
  let tierColor = "text-sky-400";

  if (overallScore >= 86) {
    tier = "masterclass";
    tierLabel = "Sintonia Lendária ⚡";
    tierColor = "text-amber-400";
  } else if (overallScore >= 72) {
    tier = "strong";
    tierLabel = "Grande Entrosamento";
    tierColor = "text-emerald-400";
  } else if (overallScore < 45) {
    tier = "developing";
    tierLabel = "Em Construção";
    tierColor = "text-rose-400";
  }

  // Sectors calculation
  const calcSec = (sum: number, count: number, name: string): SectorSynergy => {
    const secScore =
      count > 0 ? Math.round(sum / count) : Math.round(overallScore * 0.95);
    const mult = Math.round((0.95 + (secScore / 100) * 0.11) * 1000) / 1000;
    let label = "Regular";
    let description = `Linha de ${name.toLowerCase()} atuando de forma consistente.`;
    if (secScore >= 85) {
      label = "Impecável";
      description = `Movimentações e coberturas automatizadas no setor de ${name.toLowerCase()}.`;
    } else if (secScore >= 70) {
      label = "Afiada";
      description = `Ótima sintonia e comunicação nas jogadas de ${name.toLowerCase()}.`;
    } else if (secScore < 45) {
      label = "Desajustada";
      description = `Peças novas precisando de mais minutos juntas no setor de ${name.toLowerCase()}.`;
    }
    return { score: secScore, label, multiplier: mult, description };
  };

  const sectors = {
    defense: calcSec(defSharedSum, defPairsCount, "Defesa"),
    midfield: calcSec(midSharedSum, midPairsCount, "Meio-Campo"),
    attack: calcSec(attSharedSum, attPairsCount, "Ataque"),
  };

  // Top Partnerships sorted by shared matches
  const topPartnerships = [...allPartnerships]
    .sort((a, b) => b.sharedMatches - a.sharedMatches)
    .slice(0, 6);

  return {
    clubId,
    overallScore,
    tier,
    tierLabel,
    tierColor,
    overallMultiplier,
    bonusPercentFormatted,
    sharedMatchesFactor: {
      avgSharedMatches,
      score: sharedMatchesScore,
      label: sharedMatchesLabel,
      description: sharedMatchesDesc,
    },
    tacticalFamiliarityFactor: {
      consecutiveMatches: effectiveConsec,
      formation: tactics.formation,
      score: tacticalFamiliarityScore,
      label: tacticalLabel,
      description: tacticalDesc,
    },
    culturalChemistryFactor: {
      compatriotPairsCount,
      sameLanguagePairsCount,
      score: culturalChemistryScore,
      label: culturalLabel,
      description: culturalDesc,
    },
    sectors,
    topPartnerships,
  };
}

/**
 * Updates pairwise shared matches for all clubs that played in a matchweek.
 * Automatically called when a round is finalized.
 */
export function recordMatchweekSynergy(
  save: SaveState,
  results: MatchResult[]
): Record<number, ClubSynergyTracker> {
  const currentTrackers: Record<number, ClubSynergyTracker> = {
    ...(save.synergyByClub ?? {}),
  };

  const fixtureMap = new Map(save.fixtures.map((f) => [f.id, f]));

  for (const res of results) {
    const fx = fixtureMap.get(res.fixtureId);
    if (!fx) continue;

    // Clubs in this match
    const clubsInMatch = [fx.homeClubId, fx.awayClubId];

    for (const cId of clubsInMatch) {
      const tracker = getOrCreateClubSynergyTracker(
        { ...save, synergyByClub: currentTrackers },
        cId
      );

      // Starters from tactics who started
      const tactics = save.tacticsByClub[cId];
      if (!tactics) continue;

      const starters = tactics.starters;

      // Increment pair matches for all 11 starters who started together
      for (let i = 0; i < starters.length; i++) {
        for (let j = i + 1; j < starters.length; j++) {
          const key = makePairKey(starters[i], starters[j]);
          tracker.pairMatches[key] = (tracker.pairMatches[key] || 0) + 1;
        }
      }

      // Check tactical familiarity continuity
      if (tracker.lastFormation === tactics.formation) {
        tracker.consecutiveMatchesWithFormation =
          (tracker.consecutiveMatchesWithFormation || 0) + 1;
      } else {
        tracker.lastFormation = tactics.formation;
        tracker.consecutiveMatchesWithFormation = 1;
      }

      tracker.totalMatchesTracked = (tracker.totalMatchesTracked || 0) + 1;
      currentTrackers[cId] = tracker;
    }
  }

  return currentTrackers;
}
