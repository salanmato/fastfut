import type {
  Club,
  FACupRound,
  InternationalBreakReport,
  NewsItem,
  SaveState,
  StadiumConfig,
} from "../types/game";
import { getFifaWindows, getSeasonStartYear } from "../utils/calendar";
import { getCupInfo, getPendingCupRound, isUserInRound, simulateFACupRound } from "./faCup";
import { simulateInternationalBreak } from "./nationalTeams";
import { countNonFifaRecoveryDays, recoverSquadStaminaOverDays } from "./fatigueEngine";

export interface CalendarAdvanceResult {
  save: SaveState;
  reachedDate: string;
  reports: InternationalBreakReport[];
  news: NewsItem[];
  stoppedAtCupRound?: FACupRound;
  userCupPrize: number;
}

export function advanceCalendar(
  save: SaveState,
  fromDate: string,
  targetDate: string,
  stadiumByClub: Record<number, StadiumConfig>,
  rng: () => number = Math.random
): CalendarAdvanceResult {
  if (targetDate < fromDate) {
    return {
      save,
      reachedDate: fromDate,
      reports: [],
      news: [],
      userCupPrize: 0,
    };
  }

  const startYear = getSeasonStartYear(save.season ?? targetDate);
  const fifaWindows = getFifaWindows(startYear);
  const processedSet = new Set(save.processedFifaWindowIds ?? []);

  let curSave: SaveState = save;
  let cursorDate = fromDate;
  const reports: InternationalBreakReport[] = [];
  const allNews: NewsItem[] = [];
  let userCupPrize = 0;

  const clubMap = new Map<number, Club>(save.clubs.map((c) => [c.id, c]));
  const userClub = clubMap.get(save.userClubId);
  const cupInfo = getCupInfo(userClub);

  for (let guard = 0; guard < 16; guard++) {
    const pendingCup = getPendingCupRound(curSave.faCup);
    const cupDue = pendingCup && pendingCup.date <= targetDate ? pendingCup : undefined;

    const nextFifa = fifaWindows.find(
      (w) =>
        w.processable &&
        !processedSet.has(w.id) &&
        w.startDate <= targetDate
    );

    if (!cupDue && !nextFifa) {
      break;
    }

    const pickFifa =
      nextFifa && (!cupDue || nextFifa.startDate <= cupDue.date);

    if (pickFifa && nextFifa) {
      const recDays = countNonFifaRecoveryDays(cursorDate, nextFifa.startDate, fifaWindows);
      if (recDays > 0) {
        curSave = {
          ...curSave,
          players: recoverSquadStaminaOverDays(curSave.players, recDays, stadiumByClub),
        };
      }

      const { players: nextPlayers, report, news } = simulateInternationalBreak(
        curSave,
        nextFifa,
        rng
      );
      processedSet.add(nextFifa.id);
      reports.push(report);
      allNews.push(...news);

      const nextBreaks = [report, ...(curSave.internationalBreaks ?? [])].slice(0, 6);
      curSave = {
        ...curSave,
        players: nextPlayers,
        processedFifaWindowIds: Array.from(processedSet),
        internationalBreaks: nextBreaks,
      };
      if (nextFifa.endDate > cursorDate && nextFifa.endDate <= targetDate) {
        cursorDate = nextFifa.endDate;
      } else if (nextFifa.startDate > cursorDate) {
        cursorDate = nextFifa.startDate;
      }
      continue;
    }

    if (cupDue) {
      const recDays = countNonFifaRecoveryDays(cursorDate, cupDue.date, fifaWindows);
      if (recDays > 0) {
        curSave = {
          ...curSave,
          players: recoverSquadStaminaOverDays(curSave.players, recDays, stadiumByClub),
        };
      }
      if (cupDue.date > cursorDate) {
        cursorDate = cupDue.date;
      }

      if (isUserInRound(cupDue, curSave.userClubId)) {
        const reachedDate = cupDue.date > fromDate ? cupDue.date : fromDate;
        const userTie = cupDue.ties.find(
          (t) => !t.played && (t.homeClubId === curSave.userClubId || t.awayClubId === curSave.userClubId)
        );
        const oppId = userTie
          ? userTie.homeClubId === curSave.userClubId
            ? userTie.awayClubId
            : userTie.homeClubId
          : undefined;
        const opp = oppId ? clubMap.get(oppId) : undefined;
        const cupNewsId = `cup-day-${cupDue.index}-${curSave.season ?? "2627"}`;
        const alreadyPosted = curSave.news.some((n) => n.id === cupNewsId) || allNews.some((n) => n.id === cupNewsId);
        if (!alreadyPosted) {
          allNews.push({
            id: cupNewsId,
            matchweek: curSave.currentMatchweek,
            category: "cup",
            clubId: curSave.userClubId,
            title: `Dia de ${cupInfo.shortName}: ${cupDue.shortName} vs ${opp?.shortName ?? "Adversário"}!`,
            body: `Os confrontos da ${cupDue.name} acontecem hoje. Acesse a aba ${cupInfo.shortName} para entrar em campo.`,
          });
        }

        curSave = {
          ...curSave,
          currentDate: reachedDate,
          news: [...allNews, ...curSave.news].slice(0, 50),
        };
        return {
          save: curSave,
          reachedDate,
          reports,
          news: allNews,
          stoppedAtCupRound: cupDue,
          userCupPrize,
        };
      }

      // User eliminated or not in pool: auto-simulate this cup round silently
      const { nextFaCup, nextPlayers, prizeByClub, headlines } = simulateFACupRound(
        curSave.faCup!,
        curSave.clubs,
        curSave.players,
        curSave.tacticsByClub,
        curSave.referees,
        stadiumByClub,
        curSave.userClubId,
        curSave.currentMatchweek
      );
      userCupPrize += prizeByClub.get(curSave.userClubId) ?? 0;
      const nextClubs = curSave.clubs.map((c) => {
        const bonus = prizeByClub.get(c.id) ?? 0;
        return bonus > 0 ? { ...c, transferBudgetEur: c.transferBudgetEur + bonus } : c;
      });
      allNews.push(...headlines);
      curSave = {
        ...curSave,
        clubs: nextClubs,
        players: nextPlayers,
        faCup: nextFaCup,
      };
    }
  }

  const remainingRecDays = countNonFifaRecoveryDays(cursorDate, targetDate, fifaWindows);
  const finalPlayers =
    remainingRecDays > 0
      ? recoverSquadStaminaOverDays(curSave.players, remainingRecDays, stadiumByClub)
      : curSave.players;

  curSave = {
    ...curSave,
    players: finalPlayers,
    currentDate: targetDate,
    news: allNews.length > 0 ? [...allNews, ...curSave.news].slice(0, 50) : curSave.news,
  };

  return {
    save: curSave,
    reachedDate: targetDate,
    reports,
    news: allNews,
    userCupPrize,
  };
}
