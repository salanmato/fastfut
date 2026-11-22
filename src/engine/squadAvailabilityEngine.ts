import type { Club, Formation, Player, Tactics } from "../types/game";
import { getFormationSlots } from "../utils/format";

export interface PlayerSquadStatusAnalysis {
  isUnderused: boolean;
  underusedReason?: string;
  isOutOfPosition: boolean;
  outOfPositionReason?: string;
  desiredPosition: string;
  currentTacticalRole: "starter" | "bench" | "unselected";
  positionalCompatibility: "ideal" | "acceptable" | "out_of_position" | "formation_mismatch";
  suggestedListing: "none" | "loan" | "transfer";
  suggestedReason?:
    | "lack_of_playtime"
    | "out_of_position"
    | "development_loan"
    | "surplus_depth";
  suggestedReasonLabel?: string;
  suggestedReasonText?: string;
}

export function arePositionsCompatible(
  posA: string,
  posB: string
): "ideal" | "compatible" | "mismatch" {
  if (posA === posB) return "ideal";

  // Direct flank equivalence (RM <-> RW, LM <-> LW, RB <-> RWB, LB <-> LWB)
  if ((posA === "RM" && posB === "RW") || (posA === "RW" && posB === "RM")) return "ideal";
  if ((posA === "LM" && posB === "LW") || (posA === "LW" && posB === "LM")) return "ideal";
  if ((posA === "RB" && posB === "RWB") || (posA === "RWB" && posB === "RB")) return "ideal";
  if ((posA === "LB" && posB === "LWB") || (posA === "LWB" && posB === "LB")) return "ideal";
  if ((posA === "ST" && posB === "CF") || (posA === "CF" && posB === "ST")) return "ideal";

  // Central midfield versatility (CM <-> CAM, CM <-> CDM)
  if ((posA === "CAM" && posB === "CM") || (posA === "CM" && posB === "CAM")) return "compatible";
  if ((posA === "CDM" && posB === "CM") || (posA === "CM" && posB === "CDM")) return "compatible";
  if (
    (posA === "CAM" && (posB === "LW" || posB === "RW")) ||
    ((posA === "LW" || posA === "RW") && posB === "CAM")
  )
    return "compatible";
  if ((posA === "CF" && posB === "CAM") || (posA === "CAM" && posB === "CF")) return "compatible";
  if ((posA === "CB" && posB === "CDM") || (posA === "CDM" && posB === "CB")) return "compatible";
  if ((posA === "RB" && posB === "CB") || (posA === "LB" && posB === "CB")) return "compatible";

  return "mismatch";
}

/**
 * Analyzes whether a player is underused or playing out of their desired position in a club.
 */
export function evaluatePlayerSquadStatus(
  player: Player,
  club: Club,
  tactics?: Tactics,
  _allSquadPlayers?: Player[],
  currentMatchweek = 1
): PlayerSquadStatusAnalysis {
  const desiredPosition = player.primaryPosition;
  const formation: Formation = tactics?.formation ?? "4-3-3";
  const slots = getFormationSlots(formation);

  const starters = tactics?.starters ?? [];
  const bench = tactics?.bench ?? [];

  const starterIdx = starters.indexOf(player.id);
  const isBench = bench.includes(player.id);
  const currentTacticalRole: "starter" | "bench" | "unselected" =
    starterIdx >= 0 ? "starter" : isBench ? "bench" : "unselected";

  // Check if current formation supports their position or a compatible role
  const allPlayerPositions = [desiredPosition, ...(player.positions ?? [])];
  const formationSupportsDesired = slots.some((s) => {
    return allPlayerPositions.some((pPos) => {
      if (s.preferredPositions.includes(pPos)) return true;
      return s.preferredPositions.some(
        (pref) => arePositionsCompatible(pPos, pref) !== "mismatch"
      );
    });
  });

  let positionalCompatibility: "ideal" | "acceptable" | "out_of_position" | "formation_mismatch" =
    "ideal";
  let isOutOfPosition = false;
  let outOfPositionReason: string | undefined;

  if (starterIdx >= 0) {
    const assignedSlot = slots[starterIdx];
    if (assignedSlot) {
      const slotLabel = assignedSlot.preferredPositions[0];
      const directCompat = arePositionsCompatible(desiredPosition, slotLabel);

      if (directCompat === "ideal" || assignedSlot.preferredPositions.includes(desiredPosition)) {
        positionalCompatibility = "ideal";
        isOutOfPosition = false;
      } else if (
        directCompat === "compatible" ||
        allPlayerPositions.includes(slotLabel) ||
        allPlayerPositions.some((p) => assignedSlot.preferredPositions.includes(p)) ||
        allPlayerPositions.some((p) => arePositionsCompatible(p, slotLabel) !== "mismatch") ||
        assignedSlot.roleCategory === player.roleCategory
      ) {
        positionalCompatibility = "acceptable";
        isOutOfPosition = false;
      } else {
        // Genuinely conflicting role (e.g. forward as defender)
        positionalCompatibility = "out_of_position";
        isOutOfPosition = true;
        outOfPositionReason = `Escalado improvisado como ${slotLabel}, função muito distante da sua posição natural de ${desiredPosition}.`;
      }
    }
  } else if (!formationSupportsDesired) {
    positionalCompatibility = "formation_mismatch";
    isOutOfPosition = true;
    outOfPositionReason = `O esquema tático ${formation} do ${club.name} não utiliza funções compatíveis com ${desiredPosition}.`;
  }

  // Check playing time / underused status
  let isUnderused = false;
  let underusedReason: string | undefined;

  // Star / Franchise players: protected against artificial underuse listings
  const isStarPlayer =
    player.overall >= 82 ||
    player.overall >= club.avgOverall + 1.5 ||
    (player.marketValueEur ?? 0) >= 35_000_000;

  if (currentTacticalRole !== "starter") {
    // During early matchweeks (1-4), the season has just begun; no player should complain of "lack of playtime"
    if (currentMatchweek >= 5) {
      const appearances = player.seasonAppearances ?? 0;
      const ratio = appearances / currentMatchweek;

      if (appearances === 0) {
        isUnderused = true;
        underusedReason = `Sem minutagem na temporada: 0 partidas disputadas em ${currentMatchweek} rodadas.`;
      } else if (ratio < 0.20 && currentMatchweek >= 6) {
        isUnderused = true;
        underusedReason = `Pouco aproveitado: apenas ${appearances} jogos em ${currentMatchweek} rodadas.`;
      }
    } else if (currentMatchweek <= 4 && currentTacticalRole === "unselected") {
      // At season start, only true reserve / surplus players (well below club quality) are flagged for listing
      if (!isStarPlayer && player.overall < club.avgOverall - 2) {
        isUnderused = true;
        underusedReason = `Fora dos planos imediatos do treinador (reserva sem espaço no elenco).`;
      }
    }
  }

  // Determine suggested listing for sale or loan based on age, potential, and reason
  let suggestedListing: "none" | "loan" | "transfer" = "none";
  let suggestedReason:
    | "lack_of_playtime"
    | "out_of_position"
    | "development_loan"
    | "surplus_depth"
    | undefined;
  let suggestedReasonLabel: string | undefined;
  let suggestedReasonText: string | undefined;

  // 1. Starters NEVER ask to leave or get listed!
  if (currentTacticalRole === "starter") {
    return {
      isUnderused: false,
      underusedReason: undefined,
      isOutOfPosition,
      outOfPositionReason,
      desiredPosition,
      currentTacticalRole,
      positionalCompatibility,
      suggestedListing: "none",
    };
  }

  // 2. Star players (>= 82 OVR or franchise players) are protected:
  // An elite player does not demand to be sold unless genuinely frozen out for many weeks (mw >= 8 with 0 mins)
  if (isStarPlayer && (currentMatchweek < 8 || (player.seasonAppearances ?? 0) > 0)) {
    return {
      isUnderused,
      underusedReason,
      isOutOfPosition,
      outOfPositionReason,
      desiredPosition,
      currentTacticalRole,
      positionalCompatibility,
      suggestedListing: "none",
    };
  }

  // 3. For non-stars, check if loan or transfer applies:
  if (isOutOfPosition || isUnderused) {
    const isYoungDev =
      player.age <= 22 ||
      (player.age <= 24 && player.potential >= 76 && player.potential - player.overall >= 3);

    if (isYoungDev) {
      suggestedListing = "loan";
      suggestedReason = isOutOfPosition ? "out_of_position" : "development_loan";
      suggestedReasonLabel = isOutOfPosition
        ? "Busca Empréstimo na Posição"
        : "Disponível p/ Empréstimo (Rodagem)";
      suggestedReasonText = isOutOfPosition
        ? `Jovem promissor (${player.age} anos, Potencial ${player.potential}) busca empréstimo para atuar como ${desiredPosition} titular.`
        : `Atleta jovem (${player.age} anos) com potencial (${player.potential}) precisando de minutagem para se desenvolver.`;
    } else if (player.age >= 23 && !isStarPlayer) {
      suggestedListing = "transfer";
      suggestedReason = isOutOfPosition ? "out_of_position" : "lack_of_playtime";
      suggestedReasonLabel = isOutOfPosition
        ? "À Venda (Fora de Posição)"
        : "À Venda (Pouco Usado)";
      suggestedReasonText = isOutOfPosition
        ? `Insatisfeito por não exercer a função de ${desiredPosition} no ${club.name} e busca novos ares.`
        : `Sem espaço no elenco do ${club.name} (${player.seasonAppearances ?? 0} jogos) e colocado na lista de transferências.`;
    }
  }

  return {
    isUnderused,
    underusedReason,
    isOutOfPosition,
    outOfPositionReason,
    desiredPosition,
    currentTacticalRole,
    positionalCompatibility,
    suggestedListing,
    suggestedReason,
    suggestedReasonLabel,
    suggestedReasonText,
  };
}

/**
 * Automatically applies realistic transfer and loan listings for all AI clubs across the league.
 * Dynamically marks surplus/underused players for sale and young talents for loan,
 * while clearing listings for players who have become regular starters.
 */
export function updateLeagueTransferAndLoanListings(
  clubs: Club[],
  players: Player[],
  tacticsByClub: Record<number, Tactics>,
  currentMatchweek = 1,
  userClubId: number
): Player[] {
  return players.map((p) => {
    // Preserve manual user squad listings
    if (p.clubId === userClubId) {
      return p;
    }

    if (!p.clubId) {
      return p;
    }

    const club = clubs.find((c) => c.id === p.clubId);
    if (!club) return p;

    // Loaned players stay in their active loan state
    if (p.loan?.isLoan) {
      return {
        ...p,
        isTransferListed: false,
        isLoanListed: false,
      };
    }

    const clubTactics = tacticsByClub[club.id];
    const status = evaluatePlayerSquadStatus(
      p,
      club,
      clubTactics,
      undefined,
      currentMatchweek
    );

    // If player is a regular starter or has no listing suggestion, ensure they are unlisted
    if (status.currentTacticalRole === "starter" || status.suggestedListing === "none") {
      if (p.isTransferListed || p.isLoanListed) {
        return {
          ...p,
          isTransferListed: false,
          isLoanListed: false,
          listingReason: undefined,
          listingReasonLabel: undefined,
          listingReasonText: undefined,
        };
      }
      return p;
    }

    if (status.suggestedListing === "loan") {
      return {
        ...p,
        isLoanListed: true,
        isTransferListed: false,
        listingReason: status.suggestedReason,
        listingReasonLabel: status.suggestedReasonLabel,
        listingReasonText: status.suggestedReasonText,
      };
    }

    if (status.suggestedListing === "transfer") {
      return {
        ...p,
        isTransferListed: true,
        isLoanListed: false,
        listingReason: status.suggestedReason,
        listingReasonLabel: status.suggestedReasonLabel,
        listingReasonText: status.suggestedReasonText,
      };
    }

    return {
      ...p,
      isTransferListed: false,
      isLoanListed: false,
      listingReason: undefined,
      listingReasonLabel: undefined,
      listingReasonText: undefined,
    };
  });
}
