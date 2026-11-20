import type {
  Club,
  EnglishDivision,
  NewsItem,
  PastSeasonRecord,
  Player,
  SaveState,
} from "../types/game";
import { computeStandings } from "./standings";
import {
  createInitialFACupState,
  extractMatchweekDates,
  generateDivisionFixtures,
} from "./faCup";
import { addDaysIso, getDefaultDateForMatchweek, getSeasonStartYear } from "../utils/calendar";
import { formatMoney } from "../utils/format";
import { generateAnnualYouthIntake } from "./youthAndLoansEngine";

export interface SeasonTransitionReport {
  previousSeason: string;
  newSeason: string;
  seasonNumber: number;
  userClubName: string;
  userDivision: EnglishDivision;
  userRank: number;
  userPoints: number;
  isChampion: boolean;
  userPromoted: boolean;
  userRelegated: boolean;
  promotedClubs: string[];
  relegatedClubs: string[];
  prizeMoneyEur: number;
  tvSponsorEur: number;
  totalBudgetAddedEur: number;
  improvedPlayers: Array<{ name: string; oldOvr: number; newOvr: number }>;
  declinedPlayers: Array<{ name: string; oldOvr: number; newOvr: number }>;
  youthIntake?: Array<{ name: string; position: string; ovr: number; pot: number }>;
  returnedLoans?: string[];
}

export interface SeasonTransitionResult {
  nextSave: SaveState;
  report: SeasonTransitionReport;
}

function getLeaguePrizeMoney(rank: number, division: EnglishDivision): number {
  if (division === "Premier League") {
    return Math.max(6_000_000, Math.round((21 - rank) * 1_800_000 + 4_000_000));
  }
  if (division === "EFL Championship") {
    return Math.max(2_000_000, Math.round((25 - rank) * 550_000 + 1_500_000));
  }
  if (division === "EFL League One") {
    return Math.max(800_000, Math.round((17 - rank) * 200_000 + 600_000));
  }
  return Math.max(400_000, Math.round((5 - rank) * 150_000 + 300_000));
}

function getSeasonSponsorTvRevenue(division: EnglishDivision): number {
  switch (division) {
    case "Premier League":
      return 30_000_000;
    case "EFL Championship":
      return 10_000_000;
    case "EFL League One":
      return 3_500_000;
    case "EFL League Two":
      return 1_500_000;
    default:
      return 10_000_000;
  }
}

export function advanceToNextSeason(save: SaveState): SeasonTransitionResult {
  const currentSeason = save.season ?? "2026/27";
  const startYear = getSeasonStartYear(currentSeason);
  const nextStartYear = startYear + 1;
  const nextSeason = `${nextStartYear}/${String(nextStartYear + 1).slice(-2)}`;
  const nextSeasonNumber = (save.seasonNumber ?? 1) + 1;

  const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
  const userDiv = (userClub.division ?? "Premier League") as EnglishDivision;

  // Compute standings for user's division
  const divClubs = save.clubs.filter((c) => (c.division ?? "Premier League") === userDiv);
  const standings = computeStandings(divClubs, save.fixtures);
  const userStandingIdx = standings.findIndex((s) => s.club.id === save.userClubId);
  const userRank = userStandingIdx >= 0 ? userStandingIdx + 1 : 1;
  const userStanding = userStandingIdx >= 0 ? standings[userStandingIdx] : null;
  const isChampion = userRank === 1;

  // 1. Promoção e Rebaixamento
  const promotedClubNames: string[] = [];
  const relegatedClubNames: string[] = [];
  let userPromoted = false;
  let userRelegated = false;

  // Clone clubs for modification
  const updatedClubs = save.clubs.map((c) => ({ ...c }));
  const clubById = new Map<number, Club>(updatedClubs.map((c) => [c.id, c]));

  // Premier League <-> Championship
  const plClubs = updatedClubs.filter((c) => (c.division ?? "Premier League") === "Premier League");
  const champClubs = updatedClubs.filter((c) => c.division === "EFL Championship");
  const leagueOneClubs = updatedClubs.filter((c) => c.division === "EFL League One");
  const leagueTwoClubs = updatedClubs.filter((c) => c.division === "EFL League Two");

  // Determine PL relegated (3 clubs)
  let plRelegatedIds: number[] = [];
  if (userDiv === "Premier League") {
    // Bottom 3 in standings
    plRelegatedIds = standings.slice(Math.max(0, standings.length - 3)).map((s) => s.club.id);
  } else {
    // Bottom 3 by avgOverall
    plRelegatedIds = [...plClubs]
      .sort((a, b) => a.avgOverall - b.avgOverall)
      .slice(0, 3)
      .map((c) => c.id);
  }

  // Determine Championship promoted (3 clubs)
  let champPromotedIds: number[] = [];
  if (userDiv === "EFL Championship") {
    champPromotedIds = standings.slice(0, 3).map((s) => s.club.id);
  } else {
    champPromotedIds = [...champClubs]
      .sort((a, b) => b.avgOverall - a.avgOverall)
      .slice(0, 3)
      .map((c) => c.id);
  }

  // Determine Championship relegated (3 clubs)
  let champRelegatedIds: number[] = [];
  if (userDiv === "EFL Championship") {
    champRelegatedIds = standings.slice(Math.max(0, standings.length - 3)).map((s) => s.club.id);
  } else {
    champRelegatedIds = [...champClubs]
      .sort((a, b) => a.avgOverall - b.avgOverall)
      .slice(0, 3)
      .map((c) => c.id);
  }

  // Determine League One promoted (3 clubs)
  let l1PromotedIds: number[] = [];
  if (userDiv === "EFL League One") {
    l1PromotedIds = standings.slice(0, 3).map((s) => s.club.id);
  } else {
    l1PromotedIds = [...leagueOneClubs]
      .sort((a, b) => b.avgOverall - a.avgOverall)
      .slice(0, 3)
      .map((c) => c.id);
  }

  // Determine League One relegated (2 clubs)
  let l1RelegatedIds: number[] = [];
  if (userDiv === "EFL League One") {
    l1RelegatedIds = standings.slice(Math.max(0, standings.length - 2)).map((s) => s.club.id);
  } else {
    l1RelegatedIds = [...leagueOneClubs]
      .sort((a, b) => a.avgOverall - b.avgOverall)
      .slice(0, 2)
      .map((c) => c.id);
  }

  // Determine League Two promoted (2 clubs)
  let l2PromotedIds: number[] = [];
  if (userDiv === "EFL League Two") {
    l2PromotedIds = standings.slice(0, 2).map((s) => s.club.id);
  } else {
    l2PromotedIds = [...leagueTwoClubs]
      .sort((a, b) => b.avgOverall - a.avgOverall)
      .slice(0, 2)
      .map((c) => c.id);
  }

  // Apply Premier League <-> Championship transitions
  for (const id of plRelegatedIds) {
    const c = clubById.get(id);
    if (c) {
      c.division = "EFL Championship";
      c.tier = 2;
      relegatedClubNames.push(c.name);
      if (c.id === save.userClubId) userRelegated = true;
    }
  }
  for (const id of champPromotedIds) {
    const c = clubById.get(id);
    if (c) {
      c.division = "Premier League";
      c.tier = 1;
      promotedClubNames.push(c.name);
      if (c.id === save.userClubId) userPromoted = true;
    }
  }

  // Apply Championship <-> League One transitions
  for (const id of champRelegatedIds) {
    const c = clubById.get(id);
    if (c) {
      c.division = "EFL League One";
      c.tier = 3;
      relegatedClubNames.push(c.name);
      if (c.id === save.userClubId) userRelegated = true;
    }
  }
  for (const id of l1PromotedIds) {
    const c = clubById.get(id);
    if (c) {
      c.division = "EFL Championship";
      c.tier = 2;
      promotedClubNames.push(c.name);
      if (c.id === save.userClubId) userPromoted = true;
    }
  }

  // Apply League One <-> League Two transitions
  for (const id of l1RelegatedIds) {
    const c = clubById.get(id);
    if (c) {
      c.division = "EFL League Two";
      c.tier = 4;
      relegatedClubNames.push(c.name);
      if (c.id === save.userClubId) userRelegated = true;
    }
  }
  for (const id of l2PromotedIds) {
    const c = clubById.get(id);
    if (c) {
      c.division = "EFL League One";
      c.tier = 3;
      promotedClubNames.push(c.name);
      if (c.id === save.userClubId) userPromoted = true;
    }
  }

  // 2. Budget & Prize Injection
  const userNewClub = clubById.get(save.userClubId)!;
  const newDivision = (userNewClub.division ?? "Premier League") as EnglishDivision;
  const leaguePrize = getLeaguePrizeMoney(userRank, userDiv);
  const tvSponsor = getSeasonSponsorTvRevenue(newDivision);
  const totalAdded = leaguePrize + tvSponsor;
  userNewClub.transferBudgetEur += totalAdded;

  // 3. Squad Progression & Aging
  const improvedPlayers: Array<{ name: string; oldOvr: number; newOvr: number }> = [];
  const declinedPlayers: Array<{ name: string; oldOvr: number; newOvr: number }> = [];

  const updatedPlayers: Player[] = save.players.map((p) => {
    const isUserPlayer = p.clubId === save.userClubId;
    const newAge = p.age + 1;
    let newOvr = p.overall;

    if (newAge <= 22 && p.potential > p.overall) {
      const growth = Math.min(p.potential - p.overall, Math.floor(Math.random() * 2) + 1);
      newOvr += growth;
      if (growth > 0 && isUserPlayer) {
        improvedPlayers.push({ name: p.name, oldOvr: p.overall, newOvr });
      }
    } else if (newAge <= 25 && p.potential > p.overall) {
      const growth = Math.random() < 0.5 ? 1 : 0;
      newOvr += growth;
      if (growth > 0 && isUserPlayer) {
        improvedPlayers.push({ name: p.name, oldOvr: p.overall, newOvr });
      }
    } else if (newAge >= 33) {
      const decline = Math.random() < 0.65 ? 1 : 0;
      newOvr = Math.max(52, newOvr - decline);
      if (decline > 0 && isUserPlayer) {
        declinedPlayers.push({ name: p.name, oldOvr: p.overall, newOvr });
      }
    }

    const valueMultiplier = newOvr > p.overall ? 1.15 : newOvr < p.overall ? 0.85 : 1.0;
    const marketValueEur = Math.round(p.marketValueEur * valueMultiplier);

    return {
      ...p,
      age: newAge,
      overall: newOvr,
      marketValueEur,
      seasonAppearances: 0,
      seasonGoals: 0,
      seasonAssists: 0,
      seasonYellowCards: 0,
      seasonRedCards: 0,
      seasonAvgRating: 0,
      stamina: 100,
      injuryMatchesLeft: 0,
      redSuspendedMatchesLeft: 0,
    };
  });

  // 3b. Loans Expiration and Return
  const returnedLoans: string[] = [];
  const processedLoanPlayers = updatedPlayers.map((p) => {
    if (p.loan?.isLoan && p.loan.loanEndSeason === currentSeason) {
      const parentClub = clubById.get(p.loan.parentClubId);
      if (p.clubId === save.userClubId) {
        returnedLoans.push(`${p.name} (retornou ao ${p.loan.parentClubName})`);
      } else if (p.loan.parentClubId === save.userClubId) {
        returnedLoans.push(`${p.name} (retornou de empréstimo do ${p.clubName})`);
      }
      return {
        ...p,
        clubId: p.loan.parentClubId,
        clubName: p.loan.parentClubName,
        league: parentClub?.league ?? parentClub?.division ?? p.loan.parentClubLeague ?? "Liga",
        loan: undefined,
        squadCategory: "first_team" as const,
      };
    }
    return p;
  });

  // 3c. Annual Youth Intake for User's Academy
  const maxPlayerId = Math.max(0, ...processedLoanPlayers.map((p) => p.id));
  const { newPlayers: youthIntake } = generateAnnualYouthIntake(
    userNewClub,
    nextSeason,
    maxPlayerId + 1
  );
  const finalPlayers = [...processedLoanPlayers, ...youthIntake];

  // 4. Archive Season Record
  const userSquad = save.players.filter((p) => p.clubId === save.userClubId);
  const mvp = [...userSquad]
    .filter((p) => p.seasonAppearances >= 8)
    .sort((a, b) => b.seasonAvgRating - a.seasonAvgRating)[0];
  const topScorer = [...userSquad].sort((a, b) => b.seasonGoals - a.seasonGoals)[0];

  const seasonRecord: PastSeasonRecord = {
    season: currentSeason,
    division: userDiv,
    position: userRank,
    points: userStanding?.points ?? 0,
    won: userStanding?.won ?? 0,
    drawn: userStanding?.drawn ?? 0,
    lost: userStanding?.lost ?? 0,
    goalsFor: userStanding?.goalsFor ?? 0,
    goalsAgainst: userStanding?.goalsAgainst ?? 0,
    championClubName: standings[0]?.club.name ?? "Campeão",
    faCupChampionName: save.faCup?.championClubId
      ? save.clubs.find((c) => c.id === save.faCup!.championClubId)?.name
      : undefined,
    clubMvpName: mvp ? `${mvp.name} (${mvp.seasonAvgRating.toFixed(1)}★)` : undefined,
    clubTopScorerName: topScorer && topScorer.seasonGoals > 0
      ? `${topScorer.name} (${topScorer.seasonGoals}⚽)`
      : undefined,
  };

  const nextHistory = [seasonRecord, ...(save.seasonHistory ?? [])];

  // 5. Generate New Fixtures for User's New Division
  const newDivClubs = updatedClubs.filter(
    (c) => (c.division ?? "Premier League") === newDivision
  );
  const baseMatchweekDates = extractMatchweekDates(save.fixtures);
  const nextMatchweekDates = baseMatchweekDates.map((d) => addDaysIso(d, 364));

  const nextFixtures = generateDivisionFixtures(
    newDivClubs,
    nextMatchweekDates,
    save.referees,
    save.userClubId
  );

  const initialDate = getDefaultDateForMatchweek(
    nextFixtures,
    1,
    false,
    save.userClubId
  );

  // 6. Reset FA Cup for the new season
  const nextFaCup = createInitialFACupState(updatedClubs);

  // 7. News Items for New Season
  const welcomeNews = [
    {
      id: `season-start-${nextStartYear}`,
      matchweek: 1,
      category: "league" as const,
      clubId: save.userClubId,
      title: `🚀 BEM-VINDO À TEMPORADA ${nextSeason}!`,
      body: `A temporada ${nextSeason} da ${newDivision} começou oficialmente! O ${userNewClub.name} recebeu +${formatMoney(
        totalAdded
      )} em premiações e verbas de TV, totalizando orçamento de ${formatMoney(
        userNewClub.transferBudgetEur
      )} para contratações na Janela de Verão.`,
    },
    ...(userPromoted
      ? [
          {
            id: `promo-${nextStartYear}`,
            matchweek: 1,
            category: "league" as const,
            clubId: save.userClubId,
            title: `🎉 HISTÓRICO! ${userNewClub.name} comemora o acesso à ${newDivision}!`,
            body: `Após campanha brilhante, o clube garantiu a vaga na divisão superior e agora mede forças com a elite nacional.`,
          },
        ]
      : userRelegated
      ? [
          {
            id: `releg-${nextStartYear}`,
            matchweek: 1,
            category: "league" as const,
            clubId: save.userClubId,
            title: `⚠️ Reconstrução: ${userNewClub.name} disputará a ${newDivision}`,
            body: `O clube inicia a temporada com o objetivo claro de reconquistar seu espaço e lutar pelo acesso imediato.`,
          },
        ]
      : []),
  ];

  const youthNews: NewsItem = {
    id: `youth-intake-${nextStartYear}`,
    matchweek: 1,
    category: "league",
    clubId: save.userClubId,
    title: `🌱 NOVA SAFRA DA BASE: ${youthIntake.length} promessas chegam à academia!`,
    body: `A peneira anual da categoria de base promoveu ${youthIntake
      .map((y) => `${y.name} (${y.primaryPosition}, ${y.potential}★)`)
      .join(", ")} ao elenco Sub-20 do ${userNewClub.name}.`,
  };

  const nextSave: SaveState = {
    ...save,
    season: nextSeason,
    seasonNumber: nextSeasonNumber,
    seasonFinished: false,
    currentMatchweek: 1,
    currentDate: initialDate,
    clubs: updatedClubs,
    players: finalPlayers,
    fixtures: nextFixtures,
    faCup: nextFaCup,
    seasonHistory: nextHistory,
    news: [youthNews, ...welcomeNews, ...save.news].slice(0, 50),
  };

  const report: SeasonTransitionReport = {
    previousSeason: currentSeason,
    newSeason: nextSeason,
    seasonNumber: nextSeasonNumber,
    userClubName: userNewClub.name,
    userDivision: newDivision,
    userRank,
    userPoints: userStanding?.points ?? 0,
    isChampion,
    userPromoted,
    userRelegated,
    promotedClubs: promotedClubNames,
    relegatedClubs: relegatedClubNames,
    prizeMoneyEur: leaguePrize,
    tvSponsorEur: tvSponsor,
    totalBudgetAddedEur: totalAdded,
    improvedPlayers,
    declinedPlayers,
    youthIntake: youthIntake.map((y) => ({
      name: y.name,
      position: y.primaryPosition,
      ovr: y.overall,
      pot: y.potential,
    })),
    returnedLoans,
  };

  return { nextSave, report };
}
