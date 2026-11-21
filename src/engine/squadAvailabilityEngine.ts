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

  // Check if current formation even supports their desired primary position
  const formationSupportsDesired = slots.some((s) =>
    s.preferredPositions.includes(desiredPosition)
  );

  let positionalCompatibility: "ideal" | "acceptable" | "out_of_position" | "formation_mismatch" =
    "ideal";
  let isOutOfPosition = false;
  let outOfPositionReason: string | undefined;

  if (starterIdx >= 0) {
    const assignedSlot = slots[starterIdx];
    if (assignedSlot) {
      if (assignedSlot.preferredPositions[0] === desiredPosition) {
        positionalCompatibility = "ideal";
      } else if (
        assignedSlot.preferredPositions.includes(desiredPosition) ||
        player.positions?.includes(assignedSlot.preferredPositions[0])
      ) {
        positionalCompatibility = "acceptable";
      } else {
        positionalCompatibility = "out_of_position";
        isOutOfPosition = true;
        outOfPositionReason = `Escalado improvisado como ${assignedSlot.preferredPositions[0]}, mas almeja atuar como ${desiredPosition}.`;
      }
    }
  } else if (!formationSupportsDesired) {
    positionalCompatibility = "formation_mismatch";
    isOutOfPosition = true;
    outOfPositionReason = `O esquema tático ${formation} do ${club.name} não utiliza a posição de ${desiredPosition}.`;
  }

  // Check playing time / underused status
  let isUnderused = false;
  let underusedReason: string | undefined;

  if (currentTacticalRole !== "starter") {
    if (currentMatchweek >= 3) {
      if ((player.seasonAppearances ?? 0) === 0) {
        isUnderused = true;
        underusedReason = `Sem minutagem na temporada: 0 partidas disputadas em ${currentMatchweek} rodadas.`;
      } else if ((player.seasonAppearances ?? 0) / currentMatchweek < 0.28) {
        isUnderused = true;
        underusedReason = `Pouco aproveitado: apenas ${player.seasonAppearances} jogos em ${currentMatchweek} rodadas.`;
      }
    } else if (currentTacticalRole === "unselected") {
      isUnderused = true;
      underusedReason = `Fora dos planos imediatos do treinador (não relacionado para o banco).`;
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
        : `Atleta jovem (${player.age} anos) com alto potencial (${player.potential}) precisando de minutagem para se desenvolver.`;
    } else {
      suggestedListing = "transfer";
      suggestedReason = isOutOfPosition ? "out_of_position" : "lack_of_playtime";
      suggestedReasonLabel = isOutOfPosition
        ? "À Venda (Fora de Posição)"
        : "À Venda (Pouco Usado)";
      suggestedReasonText = isOutOfPosition
        ? `Insatisfeito por não exercer a função de ${desiredPosition} que almeja e pede para ser negociado pelo ${club.name}.`
        : `Sem espaço na equipe (${player.seasonAppearances ?? 0} jogos) e colocado na lista de transferências do ${club.name}.`;
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

    // If player has become a regular starter in their primary position, remove them from listings
    if (status.currentTacticalRole === "starter" && !status.isOutOfPosition) {
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
