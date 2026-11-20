import type {
  Club,
  NewsItem,
  Player,
  PlayerInterestEvaluation,
  ClubValuationEvaluation,
  SaveState,
  SquadRole,
  TransferOffer,
} from "../types/game";
import { formatMoney, formatWage } from "../utils/format";

// Known derby / historical rivals mapping
const RIVALRY_PAIRS: Array<[string, string, string]> = [
  // Brasil
  ["Santos", "Palmeiras", "Clássico da Saudade"],
  ["Santos", "Corinthians", "Clássico Alvinegro"],
  ["Santos", "São Paulo", "San-São"],
  ["Palmeiras", "Corinthians", "Derby Paulista"],
  ["Palmeiras", "São Paulo", "Choque-Rei"],
  ["Corinthians", "São Paulo", "Majestoso"],
  ["Flamengo", "Fluminense", "Fla-Flu"],
  ["Flamengo", "Vasco da Gama", "Clássico dos Milhões"],
  ["Flamengo", "Botafogo", "Clássico da Rivalidade"],
  ["Fluminense", "Vasco da Gama", "Clássico dos Gigantes"],
  ["Fluminense", "Botafogo", "Clássico Vovô"],
  ["Vasco da Gama", "Botafogo", "Clássico da Amizade"],
  ["Grêmio", "Internacional", "Gre-Nal"],
  ["Atlético Mineiro", "Cruzeiro", "Clássico Mineiro"],
  ["Bahia", "Vitória", "Ba-Vi"],
  ["Ceará", "Fortaleza", "Clássico-Rei"],
  ["Athletico Paranaense", "Coritiba", "Atletiba"],
  // Inglaterra
  ["Arsenal", "Tottenham Hotspur", "North London Derby"],
  ["Arsenal", "Chelsea", "London Derby"],
  ["Chelsea", "Tottenham Hotspur", "London Derby"],
  ["Manchester United", "Manchester City", "Manchester Derby"],
  ["Manchester United", "Liverpool", "North West Derby"],
  ["Manchester United", "Leeds United", "Roses Rivalry"],
  ["Liverpool", "Everton", "Merseyside Derby"],
  // Espanha
  ["Real Madrid", "FC Barcelona", "El Clásico"],
  ["Real Madrid", "Atlético de Madrid", "Derbi Madrileño"],
  ["FC Barcelona", "RCD Espanyol", "Derbi Barceloní"],
  ["Sevilla FC", "Real Betis", "El Gran Derbi"],
  ["Athletic Club", "Real Sociedad", "Derbi Vasco"],
  // Itália
  ["Inter", "AC Milan", "Derby della Madonnina"],
  ["Inter", "Juventus", "Derby d'Italia"],
  ["AC Milan", "Juventus", "Rivalidade Histórica"],
  ["Juventus", "Torino", "Derby della Mole"],
  ["AS Roma", "Lazio", "Derby della Capitale"],
  // Alemanha
  ["Bayern de Munique", "Borussia Dortmund", "Der Klassiker"],
  ["Borussia Dortmund", "FC Schalke 04", "Revierderby"],
  // França
  ["Paris Saint-Germain", "Olympique de Marseille", "Le Classique"],
  ["Olympique Lyonnais", "AS Saint-Étienne", "Derby Rhône-Alpes"],
  // Portugal
  ["SL Benfica", "Sporting CP", "Dérbi de Lisboa"],
  ["SL Benfica", "FC Porto", "O Clássico"],
  ["FC Porto", "Sporting CP", "Rivalidade Norte-Sul"],
  // Holanda
  ["Ajax", "Feyenoord", "De Klassieker"],
  ["Ajax", "PSV Eindhoven", "De Topper"],
];

/**
 * Calculates a club's international prestige rating (30 to 99)
 */
export function calculateClubPrestige(club: Club): number {
  const avgOvr = club.avgOverall || 70;
  // Baseline based on squad quality
  let prestige = (avgOvr - 58) * 2.5;

  // Tier modifier
  const tier = club.tier ?? 1;
  if (tier === 1) prestige += 22;
  else if (tier === 2) prestige += 12;
  else if (tier === 3) prestige += 4;

  // League reputation modifier
  const league = club.league || club.division || "";
  if (league.includes("Premier League")) prestige += 10;
  else if (league.includes("LALIGA")) prestige += 9;
  else if (league.includes("Serie A") || league.includes("Bundesliga")) prestige += 8;
  else if (league.includes("Ligue 1")) prestige += 6;
  else if (league.includes("Brasileirão")) prestige += 5;
  else if (league.includes("Portugal") || league.includes("Eredivisie")) prestige += 5;
  else if (league.includes("Saudi")) prestige += 3;
  else if (league.includes("Championship")) prestige += 3;

  return Math.min(99, Math.max(30, Math.round(prestige)));
}

/**
 * Checks whether two clubs are historical rivals or same-city derbies
 */
export function areRivals(
  clubA?: Club | null,
  clubB?: Club | null
): { isRival: boolean; reason?: string } {
  if (!clubA || !clubB || clubA.id === clubB.id) {
    return { isRival: false };
  }

  const nameA = clubA.name.toLowerCase();
  const nameB = clubB.name.toLowerCase();

  for (const [rA, rB, reason] of RIVALRY_PAIRS) {
    const matchA =
      nameA.includes(rA.toLowerCase()) || rA.toLowerCase().includes(nameA);
    const matchB =
      nameB.includes(rB.toLowerCase()) || rB.toLowerCase().includes(nameB);
    const matchRevA =
      nameA.includes(rB.toLowerCase()) || rB.toLowerCase().includes(nameA);
    const matchRevB =
      nameB.includes(rA.toLowerCase()) || rA.toLowerCase().includes(nameB);

    if ((matchA && matchB) || (matchRevA && matchRevB)) {
      return { isRival: true, reason };
    }
  }

  // Same city check
  if (clubA.city && clubB.city && clubA.city.toLowerCase() === clubB.city.toLowerCase()) {
    return { isRival: true, reason: `Dérbi Local da cidade de ${clubA.city}` };
  }

  return { isRival: false };
}

/**
 * Evaluates a player's genuine interest and feasibility of joining a prospective club
 */
export function evaluatePlayerInterest(
  buyerClub: Club,
  sellerClub: Club | null | undefined,
  player: Player
): PlayerInterestEvaluation {
  const buyerPrestige = calculateClubPrestige(buyerClub);
  const sellerPrestige = sellerClub ? calculateClubPrestige(sellerClub) : 40;
  const prestigeDiff = buyerPrestige - sellerPrestige;

  let score = 50; // Neutral baseline
  const positiveFactors: string[] = [];
  const negativeFactors: string[] = [];

  // 1. Prestige difference
  if (prestigeDiff >= 15) {
    const bonus = Math.min(30, Math.round(prestigeDiff * 1.3));
    score += bonus;
    positiveFactors.push(`Maior prestígio e grandeza do clube (+${bonus}%)`);
  } else if (prestigeDiff >= 5) {
    score += 10;
    positiveFactors.push("Passo à frente na carreira (+10%)");
  } else if (prestigeDiff <= -20) {
    // Huge step down (e.g. leaving top European club for small team or Serie B)
    const penalty = Math.min(45, Math.abs(prestigeDiff) * 1.8);
    score -= penalty;
    negativeFactors.push(`Considera a transferência um retrocesso técnico (-${Math.round(penalty)}%)`);
  } else if (prestigeDiff <= -10) {
    score -= 18;
    negativeFactors.push("Queda moderada de patamar competitivo (-18%)");
  }

  // 2. Nationality & Homecoming / Veteran factor
  const isSouthAmericanPlayer = ["Brasil", "Brazil", "Argentina", "Uruguai", "Uruguay", "Colômbia", "Colombia"].includes(
    player.nationality
  );
  const isBuyerSouthAmerican = buyerClub.country === "Brasil" || (buyerClub.league ?? "").includes("Brasileirão");
  const isSellerAbroad = sellerClub && sellerClub.country !== "Brasil" && !(sellerClub.league ?? "").includes("Brasileirão");

  if (isSouthAmericanPlayer && isBuyerSouthAmerican && isSellerAbroad) {
    if (player.age >= 31) {
      score += 35;
      positiveFactors.push("Desejo de retornar ao país natal em fim de carreira (+35%)");
    } else if (player.age <= 23 && player.potential >= 78) {
      score -= 35;
      negativeFactors.push("Sonho Europeu: jovem atleta prioriza ficar na Europa (-35%)");
    }
  }

  // Young talent wanting big European spotlight
  const isBuyerTopEurope =
    ["Inglaterra", "Espanha", "Itália", "Alemanha", "França"].includes(buyerClub.country ?? "") &&
    buyerPrestige >= 80;
  if (isBuyerTopEurope && isBuyerSouthAmerican && player.age <= 23 && player.potential >= 79) {
    score += 30;
    positiveFactors.push("Sonho de disputar a elite das ligas europeias (+30%)");
  }

  // 3. Squad status in current club
  if (player.isTransferListed) {
    score += 25;
    positiveFactors.push("Listado para transferência: busca novos ares com urgência (+25%)");
  } else if (sellerClub && player.overall >= (sellerClub.avgOverall ?? 72) + 4) {
    score -= 15;
    negativeFactors.push("Atleta é o grande astro do time atual (-15%)");
  }

  // 4. Rivalry penalty
  const rivalry = areRivals(buyerClub, sellerClub);
  if (rivalry.isRival) {
    score -= 40;
    negativeFactors.push(`Rivalidade Histórica (${rivalry.reason}): forte receio da torcida (-40%)`);
  }

  // 5. Playing time expectations (Role)
  let expectedRole: SquadRole = "rotation";
  const ovrDiffVsBuyer = player.overall - (buyerClub.avgOverall ?? 74);
  if (ovrDiffVsBuyer >= 2) {
    expectedRole = "key_player";
    negativeFactors.push("Exigência categórica de ser Estrela Principal e titular indiscutível");
  } else if (ovrDiffVsBuyer >= -2) {
    expectedRole = "important";
  } else if (player.age <= 21) {
    expectedRole = "prospect";
    positiveFactors.push("Jovem em desenvolvimento: aceita brigar por espaço no elenco");
  } else {
    expectedRole = "rotation";
  }

  // 6. Minimum wage expectation
  // Higher overall and higher age or moving down prestige requires higher wage
  let wageMultiplier = 1.15; // standard +15%
  if (prestigeDiff < -10) {
    wageMultiplier = 1.6; // must compensate with huge money
  } else if (prestigeDiff >= 15) {
    wageMultiplier = 1.1; // willing to accept moderate raise
  }
  if (rivalry.isRival) {
    wageMultiplier += 0.4; // hazard bonus
  }

  const minAcceptableWageEur = Math.max(
    2_500,
    Math.round((player.wageEur * wageMultiplier) / 500) * 500
  );

  // Clamp score
  score = Math.max(0, Math.min(100, Math.round(score)));

  let feasibility: "impossible" | "hard" | "open" | "very_interested" = "open";
  let summary = "";

  if (score < 25) {
    feasibility = "impossible";
    summary = "O atleta vê a transferência como inviável e reluta em abrir conversas.";
  } else if (score < 50) {
    feasibility = "hard";
    summary = "O jogador está relutante. Exigirá um salário expressivo e protagonismo absoluto.";
  } else if (score < 75) {
    feasibility = "open";
    summary = "O atleta está receptivo e disposto a avaliar a proposta do clube.";
  } else {
    feasibility = "very_interested";
    summary = "O jogador está muito entusiasmado com a oportunidade e quer fechar o negócio!";
  }

  return {
    interestScore: score,
    feasibility,
    summary,
    positiveFactors,
    negativeFactors,
    minAcceptableWageEur,
    expectedRole,
    loyaltyPenaltyApplied: false,
    rivalryPenaltyApplied: rivalry.isRival,
  };
}

/**
 * Evaluates the seller club's stance, asking price and willingness to sell
 */
export function evaluateClubValuation(
  sellerClub: Club | null | undefined,
  buyerClub: Club,
  player: Player
): ClubValuationEvaluation {
  const baseValue = Math.max(100_000, player.marketValueEur);
  let multiplier = 1.15; // standard asking price is 115% of market value
  let isUntouchable = false;
  let statusText = "O clube aceita negociar pelos valores vigentes de mercado.";

  const rivalry = areRivals(buyerClub, sellerClub);

  if (player.isTransferListed) {
    multiplier = 0.92;
    statusText = "Listado para transferência! Clube vendedor tem pressa em negociar.";
  } else if (rivalry.isRival) {
    multiplier = 1.95;
    statusText = `Taxa de Rivalidade (${rivalry.reason})! O clube adversário cobra pedida astronômica.`;
  } else if (player.age <= 21 && player.potential >= 82) {
    multiplier = 1.6;
    statusText = "Joia da base! Clube vendedor protege sua maior promessa com pedida elevada.";
  } else if (sellerClub && player.overall >= (sellerClub.avgOverall ?? 72) + 3) {
    multiplier = 1.4;
    statusText = "Peça fundamental do elenco: clube vendedor cobra um prêmio considerável.";
  }

  const askingPriceEur = Math.round((baseValue * multiplier) / 50_000) * 50_000;
  // Minimum acceptable fee (usually 85-90% of asking price)
  const minimumAcceptableEur = Math.round((askingPriceEur * 0.88) / 50_000) * 50_000;

  return {
    askingPriceEur,
    minimumAcceptableEur,
    isUntouchable,
    isRival: rivalry.isRival,
    rivalryReason: rivalry.reason,
    statusText,
    suggestedSellOnPct: player.age <= 22 ? 20 : 10,
  };
}

/**
 * Evaluates an offer made by user to the seller club
 */
export function evaluateClubFeeOffer(
  sellerClub: Club,
  buyerClub: Club,
  player: Player,
  offeredFeeEur: number,
  sellOnPct: number
): { accepted: boolean; counterFeeEur?: number; reason: string } {
  const valuation = evaluateClubValuation(sellerClub, buyerClub, player);

  // Sell-on clause discount (e.g. 20% sell on lowers minimum acceptable cash by up to 12%)
  const sellOnDiscount = (sellOnPct / 100) * 0.6; // 20% sell on = 12% discount
  const effectiveMinimum = Math.round(valuation.minimumAcceptableEur * (1 - sellOnDiscount));

  if (offeredFeeEur >= effectiveMinimum) {
    return {
      accepted: true,
      reason: `A diretoria do ${sellerClub.name} aceitou a proposta de ${formatMoney(
        offeredFeeEur
      )}${sellOnPct > 0 ? ` (+ ${sellOnPct}% de futura venda)` : ""}! O jogador foi liberado para negociar termos contratuais.`,
    };
  }

  // Close to minimum? Offer counter-bid
  const deficitPct = (effectiveMinimum - offeredFeeEur) / effectiveMinimum;
  if (deficitPct <= 0.20) {
    const counterFeeEur = Math.round((effectiveMinimum * 1.05) / 50_000) * 50_000;
    return {
      accepted: false,
      counterFeeEur,
      reason: `O ${sellerClub.name} recusou a oferta inicial de ${formatMoney(
        offeredFeeEur
      )}, mas sinalizou que aceita fechar o negócio por ${formatMoney(counterFeeEur)}.`,
    };
  }

  return {
    accepted: false,
    reason: `O ${sellerClub.name} considerou a oferta de ${formatMoney(
      offeredFeeEur
    )} insultante para o valor de ${player.name} e encerrou as conversas no momento. A pedida inicial é de ${formatMoney(
      valuation.askingPriceEur
    )}.`,
  };
}

/**
 * Evaluates contract terms presented to the player
 */
export function evaluateContractOffer(
  buyerClub: Club,
  player: Player,
  interestEval: PlayerInterestEvaluation,
  offeredWageEur: number,
  contractYears: number,
  offeredRole: SquadRole,
  signingBonusEur: number
): {
  accepted: boolean;
  finalScore: number;
  reason: string;
  demands?: { minWageEur: number; minRole: SquadRole };
} {
  let score = interestEval.interestScore;

  // 1. Wage satisfaction
  const wageRatio = offeredWageEur / interestEval.minAcceptableWageEur;
  if (wageRatio >= 1.5) {
    score += 30; // Dream wage!
  } else if (wageRatio >= 1.2) {
    score += 18;
  } else if (wageRatio >= 1.0) {
    score += 8;
  } else if (wageRatio >= 0.85) {
    score -= 15;
  } else {
    score -= 40; // Insulting wage
  }

  // 2. Squad Role satisfaction
  const roleHierarchy: Record<SquadRole, number> = {
    key_player: 4,
    important: 3,
    rotation: 2,
    prospect: 1,
  };

  const expectedRank = roleHierarchy[interestEval.expectedRole];
  const offeredRank = roleHierarchy[offeredRole];

  if (offeredRank > expectedRank) {
    score += 12; // Offered higher status than expected
  } else if (offeredRank === expectedRank) {
    score += 5;
  } else {
    // Demoted role
    const drop = expectedRank - offeredRank;
    score -= drop * 22;
  }

  // 3. Signing Bonus (Luvas)
  if (signingBonusEur > 0) {
    const bonusRatio = signingBonusEur / (player.marketValueEur * 0.1 || 500_000);
    const luvaBoost = Math.min(20, Math.round(bonusRatio * 15));
    score += luvaBoost;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score >= 52) {
    return {
      accepted: true,
      finalScore: score,
      reason: `Negócio fechado! ${player.name} aceitou a proposta contratual de ${formatWage(
        offeredWageEur
      )} por ${contractYears} ano(s) e vestirá as cores do ${buyerClub.name}!`,
    };
  }

  // Refusal details
  let refusalDetail = "";
  if (wageRatio < 1.0) {
    refusalDetail = `O atleta exige no mínimo ${formatWage(
      interestEval.minAcceptableWageEur
    )} de salário.`;
  } else if (offeredRank < expectedRank) {
    refusalDetail = `O jogador não aceita ser rebaixado para '${offeredRole}' e exige o papel de '${interestEval.expectedRole}'.`;
  } else {
    refusalDetail = `O atleta não se sentiu seguro com o projeto esportivo apresentado.`;
  }

  return {
    accepted: false,
    finalScore: score,
    reason: `Proposta recusada pelo atleta (Índice de Interesse: ${score}%). ${refusalDetail}`,
    demands: {
      minWageEur: interestEval.minAcceptableWageEur,
      minRole: interestEval.expectedRole,
    },
  };
}

/**
 * Actively pitches a user's player to the global market, generating 1-3 AI bids within 24h
 */
export function offerPlayerToMarket(
  save: SaveState,
  playerId: number
): { updatedSave: SaveState; message: string; count: number } {
  const player = save.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== save.userClubId) {
    return { updatedSave: save, message: "Jogador não encontrado no elenco.", count: 0 };
  }

  const otherClubs = save.clubs.filter(
    (c) => c.id !== save.userClubId && c.transferBudgetEur >= player.marketValueEur * 0.85
  );

  if (otherClubs.length === 0) {
    return {
      updatedSave: save,
      message: `Nenhum clube do mercado mundial dispõe de orçamento suficiente para bancar ${player.name} no momento.`,
      count: 0,
    };
  }

  // Shuffle and pick 1 to 3 buyers
  const candidates = [...otherClubs].sort(() => Math.random() - 0.5);
  const count = Math.min(candidates.length, Math.floor(Math.random() * 2) + 1); // 1 or 2 bids
  const chosenBuyers = candidates.slice(0, count);

  const existingOffers = save.transferOffers ?? [];
  const newOffers: TransferOffer[] = [];
  const newNews: NewsItem[] = [];

  for (const buyer of chosenBuyers) {
    const discount = player.isTransferListed ? 0.9 : 0.98;
    const multiplier = discount + Math.random() * 0.15;
    const offeredAmount = Math.max(
      500_000,
      Math.round((player.marketValueEur * multiplier) / 50_000) * 50_000
    );
    const wageOffer = Math.round(player.wageEur * (1.1 + Math.random() * 0.25));

    const offerId = `offer-pitch-${player.id}-${buyer.id}-${Date.now()}-${Math.random()}`;
    const offer: TransferOffer = {
      id: offerId,
      fromClubId: buyer.id,
      fromClubName: buyer.name,
      fromClubLeague: buyer.league ?? buyer.division ?? "Liga Internacional",
      playerId: player.id,
      playerName: player.name,
      playerOvr: player.overall,
      playerPos: player.primaryPosition,
      offeredAmountEur: offeredAmount,
      originalValueEur: player.marketValueEur,
      wageOfferEur: wageOffer,
      matchweekReceived: save.currentMatchweek,
      dateReceived: save.currentDate,
      status: "pending",
      buyerReason: `Resposta ao oferecimento do ${player.name} ao mercado. O clube formalizou interesse oficial.`,
    };

    newOffers.push(offer);

    newNews.push({
      id: `news-${offerId}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: save.userClubId,
      title: `📩 PROPOSTA RECEBIDA: ${buyer.name} oficializou oferta por ${player.name}!`,
      body: `Após o jogador ser oferecido ao mercado, o ${buyer.name} apresentou proposta de ${formatMoney(
        offeredAmount
      )} pelo atleta. Responda na aba Mercado.`,
    });
  }

  const updatedOffers = [...newOffers, ...existingOffers];
  const updatedNews = [...newNews, ...save.news].slice(0, 50);

  return {
    updatedSave: {
      ...save,
      transferOffers: updatedOffers,
      news: updatedNews,
    },
    message: `Sucesso! O agente de ${player.name} apresentou o atleta ao mercado e ${count} clube(s) formalizaram propostas oficiais!`,
    count,
  };
}
