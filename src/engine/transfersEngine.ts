import type {
  Club,
  NewsItem,
  Player,
  SaveState,
  TransferOffer,
  WorldTransfer,
} from "../types/game";
import type { TransferWindowStatus } from "../utils/calendar";
import { formatMoney } from "../utils/format";
import { repairLineup } from "./matchEngine";

export interface GenerateOffersResult {
  offers: TransferOffer[];
  news: NewsItem[];
}

export function generateAiOffersForUser(
  save: SaveState,
  windowStatus: TransferWindowStatus
): GenerateOffersResult {
  if (!windowStatus.isOpen || save.seasonFinished) {
    return { offers: [], news: [] };
  }

  const existingPending = (save.transferOffers ?? []).filter(
    (o) => o.status === "pending"
  );
  if (existingPending.length >= 3) {
    return { offers: [], news: [] };
  }

  const pendingPlayerIds = new Set(existingPending.map((o) => o.playerId));
  const userSquad = save.players.filter(
    (p) => p.clubId === save.userClubId && !pendingPlayerIds.has(p.id)
  );

  if (userSquad.length <= 16) {
    return { offers: [], news: [] };
  }

  // Find attractive candidates (heavily favoring transfer-listed players)
  const candidates: Array<{ player: Player; targetType: "star" | "wonderkid" | "solid" }> = [];
  const listedPlayers = userSquad.filter((p) => p.isTransferListed);

  for (const p of userSquad) {
    if (p.isTransferListed) {
      candidates.push({ player: p, targetType: p.overall >= 80 ? "star" : "solid" });
    } else if (p.overall >= 80 || (p.seasonGoals ?? 0) >= 4 || (p.seasonAvgRating ?? 0) >= 7.2) {
      candidates.push({ player: p, targetType: "star" });
    } else if (p.age <= 22 && p.potential >= 79) {
      candidates.push({ player: p, targetType: "wonderkid" });
    } else if (p.overall >= 74 && p.marketValueEur >= 5_000_000) {
      candidates.push({ player: p, targetType: "solid" });
    }
  }

  if (candidates.length === 0) {
    return { offers: [], news: [] };
  }

  // Chance of receiving an offer in this matchweek (higher on deadline day, summer window, or if players are listed)
  let baseChance = windowStatus.isDeadlineDay ? 0.80 : 0.45;
  if (listedPlayers.length > 0) {
    baseChance = Math.max(baseChance, 0.75);
  }

  if (Math.random() > baseChance && existingPending.length > 0) {
    return { offers: [], news: [] };
  }

  // Prioritize listed player if available
  let pickedCandidate = candidates[Math.floor(Math.random() * candidates.length)];
  if (listedPlayers.length > 0 && Math.random() < 0.65) {
    const listed = listedPlayers[Math.floor(Math.random() * listedPlayers.length)];
    pickedCandidate = { player: listed, targetType: listed.overall >= 80 ? "star" : "solid" };
  }
  const target = pickedCandidate.player;

  // Potential buyers from all 13 leagues
  const otherClubs = save.clubs.filter((c) => c.id !== save.userClubId);

  let buyerClubs: Club[] = [];
  let multiplier = 1.05;
  let buyerReason = "Buscando reforçar o elenco para a temporada.";

  const isSaudiTarget = (target.overall >= 78 || target.age >= 28) && Math.random() < 0.35;
  if (isSaudiTarget) {
    const saudiClubs = otherClubs.filter(
      (c) => c.league === "ROSHN Saudi League" && c.transferBudgetEur >= target.marketValueEur * 1.15
    );
    if (saudiClubs.length > 0) {
      buyerClubs = saudiClubs;
      multiplier = 1.25 + Math.random() * 0.3; // 125% - 155%
      buyerReason = "Mega-proposta do futebol saudita com salário astronômico e compensação acima do mercado.";
    }
  }

  if (buyerClubs.length === 0 && (pickedCandidate.targetType === "star" || target.potential >= 83)) {
    // Top European giants
    const eliteClubs = otherClubs.filter(
      (c) =>
        (c.tier === 1 || c.avgOverall >= 80) &&
        c.transferBudgetEur >= target.marketValueEur * 1.05
    );
    if (eliteClubs.length > 0) {
      buyerClubs = eliteClubs;
      multiplier = 1.1 + Math.random() * 0.2; // 110% - 130%
      buyerReason = "Interesse de gigante continental com ambições de título e competições internacionais.";
    }
  }

  if (buyerClubs.length === 0) {
    // Any club that can afford it
    buyerClubs = otherClubs.filter(
      (c) => c.transferBudgetEur >= target.marketValueEur * 0.95
    );
    multiplier = 0.98 + Math.random() * 0.15; // 98% - 113%
    buyerReason = "O clube busca um titular imediato para suprir carência na posição.";
  }

  if (buyerClubs.length === 0) {
    return { offers: [], news: [] };
  }

  const buyer = buyerClubs[Math.floor(Math.random() * buyerClubs.length)];
  const offeredAmount = Math.max(
    1_000_000,
    Math.round((target.marketValueEur * multiplier) / 100_000) * 100_000
  );
  const wageOffer = Math.round(target.wageEur * (1.2 + Math.random() * 0.4));

  const offerId = `offer-${target.id}-${buyer.id}-${Date.now()}`;
  const newOffer: TransferOffer = {
    id: offerId,
    fromClubId: buyer.id,
    fromClubName: buyer.name,
    fromClubLeague: buyer.league ?? buyer.division ?? "Liga Internacional",
    playerId: target.id,
    playerName: target.name,
    playerOvr: target.overall,
    playerPos: target.primaryPosition,
    offeredAmountEur: offeredAmount,
    originalValueEur: target.marketValueEur,
    wageOfferEur: wageOffer,
    matchweekReceived: save.currentMatchweek,
    dateReceived: save.currentDate,
    status: "pending",
    buyerReason,
  };

  const newsItem: NewsItem = {
    id: `news-offer-${offerId}`,
    matchweek: save.currentMatchweek,
    category: "transfer",
    clubId: save.userClubId,
    title: `PROPOSTA OFICIAL: ${buyer.name} quer contratar ${target.name}!`,
    body: `O ${buyer.name} (${newOffer.fromClubLeague}) formalizou proposta de ${formatMoney(
      offeredAmount
    )} por ${target.name} (valor de mercado: ${formatMoney(
      target.marketValueEur
    )}). Acesse a aba Mercado para responder à diretoria.`,
  };

  return { offers: [newOffer], news: [newsItem] };
}

export interface RespondOfferResult {
  nextSave: SaveState;
  message: string;
  success: boolean;
}

export function respondToTransferOffer(
  save: SaveState,
  offerId: string,
  action: "accept" | "reject" | "counter",
  counterAmountEur?: number
): RespondOfferResult {
  const offers = save.transferOffers ?? [];
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) {
    return { nextSave: save, message: "Proposta não encontrada.", success: false };
  }

  const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
  const buyerClub = save.clubs.find((c) => c.id === offer.fromClubId);
  const targetPlayer = save.players.find((p) => p.id === offer.playerId);

  if (action === "reject") {
    const updatedOffers = offers.map((o) =>
      o.id === offerId ? { ...o, status: "rejected" as const } : o
    );
    const rejectNews: NewsItem = {
      id: `news-rej-${offerId}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: userClub.id,
      title: `${userClub.name} recusa oferta do ${offer.fromClubName}`,
      body: `A diretoria recusou a proposta de ${formatMoney(offer.offeredAmountEur)} por ${
        offer.playerName
      }. O atleta segue focado no elenco.`,
    };
    return {
      nextSave: {
        ...save,
        transferOffers: updatedOffers,
        news: [rejectNews, ...save.news].slice(0, 50),
      },
      message: `Proposta de ${formatMoney(offer.offeredAmountEur)} por ${offer.playerName} recusada!`,
      success: true,
    };
  }

  if (action === "accept") {
    if (!targetPlayer) {
      return { nextSave: save, message: "Jogador não encontrado no elenco.", success: false };
    }

    const finalFee = offer.counterAmountEur ?? offer.offeredAmountEur;

    // Update clubs' budgets
    const nextClubs = save.clubs.map((c) => {
      if (c.id === userClub.id) {
        return { ...c, transferBudgetEur: c.transferBudgetEur + finalFee };
      }
      if (buyerClub && c.id === buyerClub.id) {
        return {
          ...c,
          transferBudgetEur: Math.max(0, c.transferBudgetEur - finalFee),
        };
      }
      return c;
    });

    // Move player
    const nextPlayers = save.players.map((p) => {
      if (p.id === targetPlayer.id) {
        return {
          ...p,
          clubId: buyerClub?.id ?? null,
          clubName: buyerClub?.name ?? offer.fromClubName,
          league: buyerClub?.league ?? buyerClub?.division ?? offer.fromClubLeague,
          wageEur: offer.wageOfferEur,
          shirtNumber: undefined,
        };
      }
      return p;
    });

    // Adjust user tactics if starter/bench
    const nextTactics = { ...save.tacticsByClub };
    const userTac = nextTactics[userClub.id];
    if (userTac && (userTac.starters.includes(targetPlayer.id) || userTac.bench.includes(targetPlayer.id))) {
      const remainingSquad = nextPlayers.filter((p) => p.clubId === userClub.id);
      const picked = repairLineup(remainingSquad, userTac);
      nextTactics[userClub.id] = {
        ...userTac,
        starters: picked.starters,
        bench: picked.bench,
      };
    }

    // When an offer is accepted for a player, remove all other offers for this player so they disappear completely
    const updatedOffers = offers
      .filter((o) => o.playerId !== targetPlayer.id || o.id === offerId)
      .map((o) =>
        o.id === offerId ? { ...o, status: "accepted" as const } : o
      );

    const worldTransferRecord: WorldTransfer = {
      id: `wt-${offer.id}`,
      matchweek: save.currentMatchweek,
      date: save.currentDate ?? new Date().toISOString().slice(0, 10),
      playerId: targetPlayer.id,
      playerName: targetPlayer.name,
      playerOvr: targetPlayer.overall,
      playerPos: targetPlayer.primaryPosition,
      fromClubId: userClub.id,
      fromClubName: userClub.name,
      fromClubLeague: userClub.league ?? userClub.division ?? "Liga",
      toClubId: buyerClub?.id ?? 0,
      toClubName: offer.fromClubName,
      toClubLeague: offer.fromClubLeague,
      feeEur: finalFee,
      headline: `${targetPlayer.name} deixa o ${userClub.name} rumo ao ${offer.fromClubName}!`,
    };

    const acceptNews: NewsItem = {
      id: `news-acc-${offerId}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: userClub.id,
      title: `TRANSFERÊNCIA CONCLUÍDA: ${targetPlayer.name} vendido ao ${offer.fromClubName}!`,
      body: `Negócio fechado em ${formatMoney(finalFee)}. Os valores já foram adicionados ao orçamento de transferências do ${userClub.name}.`,
    };

    return {
      nextSave: {
        ...save,
        clubs: nextClubs,
        players: nextPlayers,
        tacticsByClub: nextTactics,
        transferOffers: updatedOffers,
        worldTransfers: [worldTransferRecord, ...(save.worldTransfers ?? [])].slice(0, 100),
        news: [acceptNews, ...save.news].slice(0, 50),
      },
      message: `Venda de ${targetPlayer.name} confirmada por ${formatMoney(finalFee)}!`,
      success: true,
    };
  }

  if (action === "counter") {
    if (!counterAmountEur || counterAmountEur <= offer.offeredAmountEur) {
      return {
        nextSave: save,
        message: "O valor da contraproposta deve ser superior à oferta inicial.",
        success: false,
      };
    }

    const increasePct = (counterAmountEur - offer.offeredAmountEur) / offer.offeredAmountEur;
    const buyerBudget = buyerClub?.transferBudgetEur ?? 100_000_000;

    // AI accepts counter-offer if within 20% increase and within budget
    if (increasePct <= 0.20 && counterAmountEur <= buyerBudget) {
      const updatedOffer: TransferOffer = {
        ...offer,
        offeredAmountEur: counterAmountEur,
        counterAmountEur,
      };
      const updatedOffers = offers.map((o) => (o.id === offerId ? updatedOffer : o));
      // Re-run with accept logic
      return respondToTransferOffer(
        { ...save, transferOffers: updatedOffers },
        offerId,
        "accept"
      );
    } else {
      // AI refuses counter-offer
      const updatedOffers = offers.map((o) =>
        o.id === offerId
          ? {
              ...o,
              status: "countered" as const,
              counterAmountEur,
            }
          : o
      );
      const counterRejectNews: NewsItem = {
        id: `news-cnt-rej-${offerId}`,
        matchweek: save.currentMatchweek,
        category: "transfer",
        clubId: userClub.id,
        title: `${offer.fromClubName} recusa contraproposta por ${offer.playerName}`,
        body: `O clube comprador considerou a pedida de ${formatMoney(
          counterAmountEur
        )} acima do teto estipulado e encerrou as conversas no momento.`,
      };
      return {
        nextSave: {
          ...save,
          transferOffers: updatedOffers,
          news: [counterRejectNews, ...save.news].slice(0, 50),
        },
        message: `O ${offer.fromClubName} considerou a pedida de ${formatMoney(
          counterAmountEur
        )} muito alta e encerrou a negociação.`,
        success: false,
      };
    }
  }

  return { nextSave: save, message: "Ação inválida.", success: false };
}

export function simulateAiWorldTransfers(
  save: SaveState,
  count = 2
): { nextClubs: Club[]; nextPlayers: Player[]; transfers: WorldTransfer[]; news: NewsItem[] } {
  const eligibleBuyers = save.clubs.filter(
    (c) => c.id !== save.userClubId && c.transferBudgetEur >= 12_000_000
  );
  if (eligibleBuyers.length === 0) {
    return { nextClubs: save.clubs, nextPlayers: save.players, transfers: [], news: [] };
  }

  const updatedClubs = [...save.clubs];
  const updatedPlayers = [...save.players];
  const newTransfers: WorldTransfer[] = [];
  const newNews: NewsItem[] = [];

  const shuffledBuyers = [...eligibleBuyers].sort(() => Math.random() - 0.5);

  let dealsDone = 0;
  for (const buyer of shuffledBuyers) {
    if (dealsDone >= count) break;

    // Pick a seller that is not userClub and not buyer
    const potentialSellers = updatedClubs.filter(
      (c) => c.id !== save.userClubId && c.id !== buyer.id
    );
    if (potentialSellers.length === 0) continue;

    const seller = potentialSellers[Math.floor(Math.random() * potentialSellers.length)];
    const sellerSquad = updatedPlayers.filter((p) => p.clubId === seller.id);
    if (sellerSquad.length <= 18) continue; // Keep seller squad healthy

    // Find players buyer can afford
    const affordablePlayers = sellerSquad.filter(
      (p) =>
        p.marketValueEur >= 4_000_000 &&
        p.marketValueEur * 1.1 <= buyer.transferBudgetEur &&
        p.overall >= 74
    );
    if (affordablePlayers.length === 0) continue;

    const target = affordablePlayers[Math.floor(Math.random() * affordablePlayers.length)];
    const fee = Math.round(target.marketValueEur * (1.02 + Math.random() * 0.15));

    // Execute transfer in memory
    const buyerIdx = updatedClubs.findIndex((c) => c.id === buyer.id);
    const sellerIdx = updatedClubs.findIndex((c) => c.id === seller.id);
    const targetIdx = updatedPlayers.findIndex((p) => p.id === target.id);

    if (buyerIdx >= 0) {
      updatedClubs[buyerIdx] = {
        ...updatedClubs[buyerIdx],
        transferBudgetEur: Math.max(0, updatedClubs[buyerIdx].transferBudgetEur - fee),
      };
    }
    if (sellerIdx >= 0) {
      updatedClubs[sellerIdx] = {
        ...updatedClubs[sellerIdx],
        transferBudgetEur: updatedClubs[sellerIdx].transferBudgetEur + fee,
      };
    }
    if (targetIdx >= 0) {
      updatedPlayers[targetIdx] = {
        ...updatedPlayers[targetIdx],
        clubId: buyer.id,
        clubName: buyer.name,
        league: buyer.league ?? buyer.division ?? "Liga Internacional",
        shirtNumber: undefined,
      };
    }

    const wt: WorldTransfer = {
      id: `wt-sim-${target.id}-${buyer.id}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      date: save.currentDate ?? new Date().toISOString().slice(0, 10),
      playerId: target.id,
      playerName: target.name,
      playerOvr: target.overall,
      playerPos: target.primaryPosition,
      fromClubId: seller.id,
      fromClubName: seller.name,
      fromClubLeague: seller.league ?? seller.division ?? "Liga",
      toClubId: buyer.id,
      toClubName: buyer.name,
      toClubLeague: buyer.league ?? buyer.division ?? "Liga",
      feeEur: fee,
      headline: `BOMBA NO MERCADO: ${target.name} assina com o ${buyer.name} por ${formatMoney(fee)}!`,
    };

    newTransfers.push(wt);

    // Only broadcast headline news for high-profile moves (fee >= 15M or player ovr >= 80)
    if (fee >= 15_000_000 || target.overall >= 80) {
      newNews.push({
        id: `news-wt-${wt.id}`,
        matchweek: save.currentMatchweek,
        category: "transfer",
        title: `MERCADO GLOBAL: ${target.name} no ${buyer.name}!`,
        body: `O ${buyer.name} confirmou a contratação de ${target.name} (${target.primaryPosition}, OVR ${target.overall}) junto ao ${seller.name} por ${formatMoney(fee)}.`,
      });
    }

    dealsDone++;
  }

  return {
    nextClubs: updatedClubs,
    nextPlayers: updatedPlayers,
    transfers: newTransfers,
    news: newNews,
  };
}

export function sellUserPlayerToAiClub(
  save: SaveState,
  player: Player
): { nextClubs: Club[]; nextPlayers: Player[]; buyerClub: Club; salePrice: number } {
  const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
  const salePrice = Math.round(player.marketValueEur * 0.95);

  // Look for a suitable buyer among the 228 clubs
  const candidateBuyers = save.clubs.filter(
    (c) => c.id !== userClub.id && c.transferBudgetEur >= salePrice
  );

  let chosenBuyer: Club;
  if (candidateBuyers.length > 0) {
    // Prefer clubs in higher tier or matching league / continent
    candidateBuyers.sort((a, b) => b.transferBudgetEur - a.transferBudgetEur);
    chosenBuyer = candidateBuyers[0];
  } else {
    // Rich fallback from elite clubs
    const richest = [...save.clubs]
      .filter((c) => c.id !== userClub.id)
      .sort((a, b) => b.transferBudgetEur - a.transferBudgetEur)[0];
    chosenBuyer = richest ?? {
      id: 9999,
      name: "Mercado Internacional",
      shortName: "MKT",
      league: "Mercado Global",
      division: "Mercado Global",
      tier: 1,
      country: "Internacional",
      city: "Global",
      stadium: "Arena Internacional",
      capacity: 50000,
      transferBudgetEur: 500_000_000,
      weeklyWageBudgetEur: 5_000_000,
      reputation: 80,
      avgOverall: 78,
      primaryColor: "#059669",
      secondaryColor: "#10b981",
    };
  }

  const nextClubs = save.clubs.map((c) => {
    if (c.id === userClub.id) {
      return { ...c, transferBudgetEur: c.transferBudgetEur + salePrice };
    }
    if (c.id === chosenBuyer.id) {
      return {
        ...c,
        transferBudgetEur: Math.max(0, c.transferBudgetEur - salePrice),
      };
    }
    return c;
  });

  const nextPlayers = save.players.map((p) => {
    if (p.id === player.id) {
      return {
        ...p,
        clubId: chosenBuyer.id,
        clubName: chosenBuyer.name,
        league: chosenBuyer.league ?? chosenBuyer.division ?? "Liga Internacional",
        shirtNumber: undefined,
      };
    }
    return p;
  });

  return { nextClubs, nextPlayers, buyerClub: chosenBuyer, salePrice };
}
