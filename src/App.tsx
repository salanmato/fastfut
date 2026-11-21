import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Trophy,
  ShoppingBag,
  Building2,
  Play,
  Download,
  Loader2,
  Home,
  Calendar as CalendarIcon,
  Lock,
  Unlock,
  Flame,
  Award,
  BarChart3,
  GraduationCap,
} from "lucide-react";
import type {
  Club,
  MatchInjury,
  MatchResult,
  NewsItem,
  Player,
  RawDatabase,
  SaveState,
  SquadRole,
  StadiumConfig,
  Tactics,
  WorldTransfer,
} from "./types/game";
import {
  autoPickLineup,
  createDefaultStadiumConfig,
  createDefaultTactics,
} from "./engine/matchEngine";
import { computeStandings } from "./engine/standings";
import {
  advanceToNextSeason,
  type SeasonTransitionReport,
} from "./engine/seasonProgression";
import {
  createInitialFACupState,
  extractMatchweekDates,
  generateDivisionFixtures,
  simulateFACupRound,
} from "./engine/faCup";
import { formatMoney, formatWage } from "./utils/format";
import { getKitThemePalette } from "./utils/clubVisuals";
import {
  autoAssignClubShirtNumbers,
  changeClubPlayerShirtNumber,
  ensureAllPlayersShirtNumbers,
  evaluateShirtNumberAffinity,
} from "./utils/shirtNumbers";
import {
  addDaysIso,
  formatDatePtBr,
  getDefaultDateForMatchweek,
  getNextMatchFixture,
  getTransferWindowStatus,
  POST_SEASON_WINDOW_START,
  SUMMER_WINDOW_END,
  WINTER_WINDOW_END,
  WINTER_WINDOW_START,
} from "./utils/calendar";
import { ClubBadge } from "./components/ClubBadge";
import { ClubKit } from "./components/ClubKit";
import { MainMenu } from "./components/MainMenu";
import { ClubSelection } from "./components/ClubSelection";
import { Dashboard } from "./components/Dashboard";
import { TacticsSquad } from "./components/TacticsSquad";
import { MatchdayLive } from "./components/MatchdayLive";
import { LeagueHub } from "./components/LeagueHub";
import { TransferMarket } from "./components/TransferMarket";
import { StadiumHub } from "./components/StadiumHub";
import { CalendarHub } from "./components/CalendarHub";
import { FACupHub } from "./components/FACupHub";
import { PlayerProfileModal } from "./components/PlayerProfileModal";
import { TransferNegotiationModal } from "./components/TransferNegotiationModal";
import { SeasonReviewDashboard } from "./components/SeasonReviewDashboard";
import { SquadPerformanceAnalysis } from "./components/SquadPerformanceAnalysis";
import { YouthAcademyHub } from "./components/YouthAcademyHub";
import {
  initializeSquadCategoriesAndLoans,
  promoteYouthPlayer,
  demoteToYouthSquad,
  loanOutPlayer,
  exerciseBuyOption,
} from "./engine/youthAndLoansEngine";
import {
  generateAiOffersForUser,
  respondToTransferOffer,
  simulateAiWorldTransfers,
} from "./engine/transfersEngine";
import { offerPlayerToMarket } from "./engine/transferNegotiationEngine";
import {
  getOrCreateClubSynergyTracker,
  recordMatchweekSynergy,
} from "./engine/synergyEngine";

const SAVE_KEY = "fm2627_pl_save_v1";

type Tab =
  | "dashboard"
  | "tactics"
  | "academy"
  | "squad_analysis"
  | "stadium"
  | "calendar"
  | "league"
  | "facup"
  | "market"
  | "matchday"
  | "season_review";
type Screen = "menu" | "select_club" | "game";

function ensureStadiumMap(
  clubs: SaveState["clubs"],
  existing?: Record<number, StadiumConfig>
): Record<number, StadiumConfig> {
  const map: Record<number, StadiumConfig> = {};
  for (const club of clubs) {
    map[club.id] = existing?.[club.id]
      ? { ...existing[club.id] }
      : createDefaultStadiumConfig(club);
  }
  return map;
}

function hydrateSave(parsed: SaveState): SaveState {
  const defaultDate = getDefaultDateForMatchweek(
    parsed.fixtures,
    parsed.currentMatchweek,
    parsed.seasonFinished,
    parsed.userClubId
  );
  return {
    ...parsed,
    players: initializeSquadCategoriesAndLoans(
      ensureAllPlayersShirtNumbers(parsed.players),
      parsed.clubs
    ),
    stadiumByClub: ensureStadiumMap(parsed.clubs, parsed.stadiumByClub),
    kitTheme: parsed.kitTheme ?? "home",
    autoOpenFormationOnRedCard: parsed.autoOpenFormationOnRedCard ?? true,
    currentDate: parsed.currentDate ?? defaultDate,
    shortlistIds: parsed.shortlistIds ?? [],
    allowTransfersOutsideWindow: parsed.allowTransfersOutsideWindow ?? false,
    faCup: parsed.faCup ?? createInitialFACupState(parsed.clubs),
  };
}

function buildWindowMilestoneNews(
  prevDate: string,
  nextDate: string,
  matchweek: number,
  prevSeasonFinished: boolean,
  nextSeasonFinished: boolean
): NewsItem[] {
  const items: NewsItem[] = [];

  if (!nextSeasonFinished) {
    if (prevDate < SUMMER_WINDOW_END && nextDate === SUMMER_WINDOW_END) {
      items.push({
        id: `win-summer-dl-${Date.now()}`,
        matchweek,
        category: "transfer",
        title: "DEADLINE DAY! Último dia da Janela de Verão",
        body: "O mercado fecha hoje (01/09/2026) antes da Rodada 3. Aproveite as últimas horas para reforçar o elenco!",
      });
    } else if (
      prevDate <= SUMMER_WINDOW_END &&
      nextDate > SUMMER_WINDOW_END &&
      nextDate < WINTER_WINDOW_START
    ) {
      items.push({
        id: `win-summer-close-${Date.now()}`,
        matchweek,
        category: "transfer",
        title: "Janela de Verão Encerrada",
        body: "O mercado de transferências fechou e só reabrirá em 01/01/2027 para a Janela de Inverno.",
      });
    }

    if (
      prevDate < WINTER_WINDOW_START &&
      nextDate >= WINTER_WINDOW_START &&
      nextDate <= WINTER_WINDOW_END
    ) {
      items.push({
        id: `win-winter-open-${Date.now()}`,
        matchweek,
        category: "transfer",
        title: "Janela de Inverno Aberta!",
        body: "Chegamos a janeiro! O mercado de transferências está oficialmente aberto até 02/02/2027.",
      });
    }

    if (prevDate < WINTER_WINDOW_END && nextDate === WINTER_WINDOW_END) {
      items.push({
        id: `win-winter-dl-${Date.now()}`,
        matchweek,
        category: "transfer",
        title: "DEADLINE DAY de Inverno! Último dia de mercado",
        body: "Últimas horas para contratar ou vender antes do fechamento hoje (02/02/2027).",
      });
    } else if (prevDate <= WINTER_WINDOW_END && nextDate > WINTER_WINDOW_END) {
      items.push({
        id: `win-winter-close-${Date.now()}`,
        matchweek,
        category: "transfer",
        title: "Janela de Inverno Encerrada",
        body: `O mercado fechou até ${formatDatePtBr(
          POST_SEASON_WINDOW_START
        )} (pós-temporada). Use a Lista de Alvos para observar reforços.`,
      });
    }
  } else if (!prevSeasonFinished && nextSeasonFinished) {
    items.push({
      id: `win-post-open-${Date.now()}`,
      matchweek,
      category: "transfer",
      title: "Janela de Pós-Temporada Aberta",
      body: "Com o término da Premier League 2026/27, o mercado foi reaberto para reformulação do elenco.",
    });
  }

  return items;
}

export const App: React.FC = () => {
  const [rawDb, setRawDb] = useState<RawDatabase | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState | null>(() => {
    try {
      const stored = localStorage.getItem(SAVE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as SaveState;
      return hydrateSave(parsed);
    } catch {
      return null;
    }
  });
  const [screen, setScreen] = useState<Screen>("menu");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [inspectedPlayer, setInspectedPlayer] = useState<Player | null>(null);
  const [negotiatingPlayer, setNegotiatingPlayer] = useState<Player | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [transitionReport, setTransitionReport] = useState<SeasonTransitionReport | null>(null);

  useEffect(() => {
    fetch("/data/fm2627.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<RawDatabase>;
      })
      .then((data) => setRawDb(data))
      .catch((err) => setLoadError(String(err)));
  }, []);

  useEffect(() => {
    if (!save) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // ignore storage quota errors
    }
  }, [save]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const leagueClubs = useMemo(() => {
    if (!save) return [];
    const uc = save.clubs.find((c) => c.id === save.userClubId);
    const leagueName = uc?.league ?? uc?.division ?? "Premier League";
    const inLeague = save.clubs.filter(
      (c) => (c.league ?? c.division ?? "Premier League") === leagueName
    );
    if (inLeague.length > 20 && save.fixtures.length > 0) {
      const fxIds = new Set<number>();
      for (const fx of save.fixtures) {
        fxIds.add(fx.homeClubId);
        fxIds.add(fx.awayClubId);
      }
      const active = inLeague.filter((c) => fxIds.has(c.id));
      if (active.length > 0) return active;
    }
    return inLeague.length > 0 ? inLeague : save.clubs.filter((c) => c.division === uc?.division);
  }, [save]);

  const standings = useMemo(
    () => (save ? computeStandings(leagueClubs, save.fixtures) : []),
    [save, leagueClubs]
  );

  const stadiumByClub = useMemo(
    () => (save ? ensureStadiumMap(save.clubs, save.stadiumByClub) : {}),
    [save]
  );

  const handleSelectClub = (
    clubId: number,
    managerName: string,
    kitTheme: "home" | "away" = "home"
  ) => {
    if (!rawDb) return;
    const clubs = rawDb.clubs.map((c) => ({ ...c }));
    const rawPlayers = initializeSquadCategoriesAndLoans(
      ensureAllPlayersShirtNumbers(rawDb.players.map((p) => ({ ...p }))),
      clubs
    );
    const referees = rawDb.referees.map((r) => ({ ...r }));

    const tacticsByClub: Record<number, Tactics> = {};
    for (const club of clubs) {
      const squad = rawPlayers.filter(
        (p) => p.clubId === club.id && p.squadCategory !== "youth"
      );
      tacticsByClub[club.id] = createDefaultTactics(squad, club.avgOverall);
    }

    const chosenClub = clubs.find((c) => c.id === clubId)!;
    const players = autoAssignClubShirtNumbers(
      rawPlayers,
      clubId,
      tacticsByClub[clubId]?.starters ?? []
    );
    const chosenDivision = chosenClub.league ?? chosenClub.division ?? "Premier League";
    const fixtures =
      chosenDivision !== "Premier League"
        ? generateDivisionFixtures(
            clubs.filter(
              (c) => (c.league ?? c.division ?? "Premier League") === chosenDivision
            ),
            extractMatchweekDates(rawDb.fixtures),
            referees,
            clubId
          )
        : rawDb.fixtures.map((f) => ({ ...f }));

    const initialDate = getDefaultDateForMatchweek(fixtures, 1, false, clubId);
    const newSave: SaveState = {
      version: 1,
      managerName,
      userClubId: clubId,
      currentMatchweek: 1,
      seasonFinished: false,
      clubs,
      referees,
      players,
      fixtures,
      tacticsByClub,
      stadiumByClub: ensureStadiumMap(clubs),
      kitTheme,
      autoOpenFormationOnRedCard: true,
      currentDate: initialDate,
      shortlistIds: [],
      allowTransfersOutsideWindow: false,
      faCup: createInitialFACupState(clubs),
      news: [
        {
          id: "welcome-1",
          matchweek: 1,
          category: "league",
          clubId,
          title: `${managerName} é apresentado no ${chosenClub.name}!`,
          body: `A diretoria confirmou a contratação de ${managerName} para liderar o projeto na ${chosenDivision} 2026/27 com orçamento inicial de ${formatMoney(
            chosenClub.transferBudgetEur
          )}.`,
        },
        {
          id: "welcome-2",
          matchweek: 1,
          category: "cup",
          title: "Copa da Inglaterra 2026/27 (64 Clubes)",
          body: "Todos os 64 clubes ingleses das 4 divisões disputam o mata-mata da Emirates FA Cup a partir da Rodada 10.",
        },
        {
          id: "welcome-3",
          matchweek: 1,
          category: "transfer",
          title: "Janela de Verão Aberta até 01/09/2026",
          body: "O mercado está aberto durante a pré-temporada e as duas primeiras rodadas. Depois, só reabrirá em janeiro de 2027.",
        },
      ],
    };

    setSave(newSave);
    setActiveTab("dashboard");
    setScreen("game");
  };

  const handleDeleteSave = () => {
    if (!window.confirm("Apagar o save local armazenado neste navegador?")) return;
    localStorage.removeItem(SAVE_KEY);
    setSave(null);
    setActiveTab("dashboard");
    setScreen("menu");
    setToast("Save local removido.");
  };

  const handleImportSave = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SaveState;
        if (
          !parsed ||
          typeof parsed.userClubId !== "number" ||
          !Array.isArray(parsed.clubs) ||
          !Array.isArray(parsed.players) ||
          !Array.isArray(parsed.fixtures)
        ) {
          throw new Error("Arquivo de save inválido.");
        }
        const hydrated = hydrateSave(parsed);
        setSave(hydrated);
        setActiveTab("dashboard");
        setScreen("game");
        const club = hydrated.clubs.find((c) => c.id === hydrated.userClubId);
        setToast(
          `Save carregado: ${club?.name ?? "Clube"} (Rodada ${hydrated.currentMatchweek})`
        );
      } catch {
        setToast("Erro: o arquivo selecionado não é um save válido do FM 26/27.");
      }
    };
    reader.readAsText(file);
  };

  const handleExportSave = () => {
    if (!save) return;
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fm2627_${save.userClubId}_rodada${save.currentMatchweek}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFinishMatchweek = (results: MatchResult[]) => {
    if (!save) return;

    const resultMap = new Map(results.map((r) => [r.fixtureId, r]));
    const clubMap = new Map(save.clubs.map((c) => [c.id, c]));
    const nextMatchweek = save.currentMatchweek + 1;
    const seasonFinished = save.currentMatchweek >= 38;

    // Update fixtures
    const nextFixtures = save.fixtures.map((fx) => {
      const res = resultMap.get(fx.id);
      if (!res) return fx;
      return {
        ...fx,
        played: true,
        homeGoals: res.homeGoals,
        awayGoals: res.awayGoals,
        result: res,
      };
    });

    // Aggregate player appearances, goals, assists, cards, ratings
    const playedPlayerStats = new Map<
      number,
      { goals: number; assists: number; yellows: number; reds: number; rating: number }
    >();

    for (const res of results) {
      for (const [pidStr, rating] of Object.entries(res.playerRatings)) {
        const pid = Number(pidStr);
        playedPlayerStats.set(pid, {
          goals: 0,
          assists: 0,
          yellows: 0,
          reds: 0,
          rating,
        });
      }
      for (const ev of res.events) {
        if (ev.type === "goal") {
          const scorer = playedPlayerStats.get(ev.playerId);
          if (scorer) scorer.goals += 1;
          if (ev.assistPlayerId) {
            const assister = playedPlayerStats.get(ev.assistPlayerId);
            if (assister) assister.assists += 1;
          }
        } else if (ev.type === "yellow_card") {
          const offender = playedPlayerStats.get(ev.playerId);
          if (offender) offender.yellows += 1;
        } else if (ev.type === "red_card") {
          const offender = playedPlayerStats.get(ev.playerId);
          if (offender) offender.reds += 1;
        }
      }
    }

    const newInjuryMap = new Map<number, MatchInjury>();
    for (const res of results) {
      for (const inj of res.injuries ?? []) {
        newInjuryMap.set(inj.playerId, inj);
      }
    }

    const nextPlayers = save.players.map((p) => {
      const perf = playedPlayerStats.get(p.id);
      const newInj = newInjuryMap.get(p.id);
      const prevInjLeft = p.injuryMatchesLeft ?? 0;
      const nextInjLeft = newInj ? newInj.matchesOut : Math.max(0, prevInjLeft - 1);
      const nextInjType = newInj
        ? newInj.injuryType
        : nextInjLeft > 0
        ? p.injuryType
        : undefined;

      if (!perf) {
        // Rested players recover stamina to 100
        return {
          ...p,
          stamina: Math.min(100, p.stamina + 25),
          injuryMatchesLeft: nextInjLeft,
          injuryType: nextInjType,
        };
      }
      const prevApps = p.seasonAppearances;
      const newApps = prevApps + 1;
      const newAvg =
        Math.round(((p.seasonAvgRating * prevApps + perf.rating) / newApps) * 100) / 100;
      const staminaDrop = 16 - Math.min(8, Math.floor((p.stats.stamina - 65) / 5));
      const postRecovery = Math.max(58, Math.min(100, p.stamina - Math.max(6, staminaDrop) + 8));

      return {
        ...p,
        seasonAppearances: newApps,
        seasonGoals: p.seasonGoals + perf.goals,
        seasonAssists: p.seasonAssists + perf.assists,
        seasonYellowCards: p.seasonYellowCards + perf.yellows,
        seasonRedCards: p.seasonRedCards + perf.reds,
        seasonAvgRating: newAvg,
        stamina: postRecovery,
        injuryMatchesLeft: nextInjLeft,
        injuryType: nextInjType,
      };
    });

    // Refresh AI lineups for next round (skipping injured players) & move injured user starters out safely
    const nextTacticsByClub: Record<number, Tactics> = { ...save.tacticsByClub };
    for (const club of save.clubs) {
      const clubPlayers = nextPlayers.filter((p) => p.clubId === club.id);
      const curr = nextTacticsByClub[club.id];
      if (club.id !== save.userClubId) {
        const picked = autoPickLineup(clubPlayers, curr.formation);
        nextTacticsByClub[club.id] = {
          ...curr,
          starters: picked.starters,
          bench: picked.bench,
        };
      } else {
        const injuredSet = new Set(
          clubPlayers.filter((p) => (p.injuryMatchesLeft ?? 0) > 0).map((p) => p.id)
        );
        if (
          curr.starters.some((id) => injuredSet.has(id)) ||
          curr.bench.some((id) => injuredSet.has(id))
        ) {
          const picked = autoPickLineup(clubPlayers, curr.formation);
          nextTacticsByClub[club.id] = {
            ...curr,
            starters: picked.starters,
            bench: picked.bench,
          };
        }
      }
    }

    // Credit gate revenue & update stadium metrics for every home club
    const nextStadiumByClub: Record<number, StadiumConfig> = ensureStadiumMap(
      save.clubs,
      save.stadiumByClub
    );
    const revenueEarnedByClub = new Map<number, number>();
    let userHomeRevenue = 0;
    let userHomeAttendance = 0;

    for (const res of results) {
      const fx = save.fixtures.find((f) => f.id === res.fixtureId);
      if (!fx) continue;
      const rev = res.gateRevenueEur ?? 0;
      const att = res.attendance ?? 0;
      if (rev > 0) {
        revenueEarnedByClub.set(
          fx.homeClubId,
          (revenueEarnedByClub.get(fx.homeClubId) ?? 0) + rev
        );
      }
      const prevCfg = nextStadiumByClub[fx.homeClubId];
      if (prevCfg) {
        const newMatches = prevCfg.totalHomeMatches + 1;
        const newAvg = Math.round(
          (prevCfg.avgAttendance * prevCfg.totalHomeMatches + att) / newMatches
        );
        nextStadiumByClub[fx.homeClubId] = {
          ...prevCfg,
          totalHomeMatches: newMatches,
          totalGateRevenueEur: prevCfg.totalGateRevenueEur + rev,
          avgAttendance: newAvg,
        };
      }
      if (fx.homeClubId === save.userClubId) {
        userHomeRevenue = rev;
        userHomeAttendance = att;
      }
    }

    const nextClubs = save.clubs.map((c) => {
      const earned = revenueEarnedByClub.get(c.id) ?? 0;
      return earned > 0
        ? { ...c, transferBudgetEur: c.transferBudgetEur + earned }
        : c;
    });

    // Generate News Headlines for this matchweek
    const newItems: NewsItem[] = [];
    const userRes = results.find((r) => {
      const fx = save.fixtures.find((f) => f.id === r.fixtureId);
      return fx && (fx.homeClubId === save.userClubId || fx.awayClubId === save.userClubId);
    });
    if (userRes) {
      const fx = save.fixtures.find((f) => f.id === userRes.fixtureId)!;
      const h = clubMap.get(fx.homeClubId)!;
      const a = clubMap.get(fx.awayClubId)!;
      const gateText =
        fx.homeClubId === save.userClubId && userHomeRevenue > 0
          ? ` • Público ${userHomeAttendance.toLocaleString("pt-BR")} (Bilheteria +${formatMoney(
              userHomeRevenue
            )})`
          : "";
      newItems.push({
        id: `news-user-${save.currentMatchweek}`,
        matchweek: save.currentMatchweek,
        category: "match",
        clubId: save.userClubId,
        title: `Rodada ${save.currentMatchweek}: ${h.shortName} ${userRes.homeGoals} x ${userRes.awayGoals} ${a.shortName}`,
        body: `Posse ${userRes.homeStats.possession}% - ${userRes.awayStats.possession}% • xG ${userRes.homeStats.xg.toFixed(
          2
        )} - ${userRes.awayStats.xg.toFixed(2)}${gateText}.`,
      });
    }

    // Medical department news for user's injured players
    for (const inj of newInjuryMap.values()) {
      if (inj.clubId === save.userClubId) {
        const p = nextPlayers.find((pl) => pl.id === inj.playerId);
        if (p) {
          newItems.push({
            id: `news-inj-${save.currentMatchweek}-${p.id}`,
            matchweek: save.currentMatchweek,
            category: "injury",
            clubId: save.userClubId,
            title: `Departamento Médico: ${p.name} fica fora por ${inj.matchesOut} rodada(s)`,
            body: `Exames confirmaram ${inj.injuryType.toLowerCase()} durante a Rodada ${save.currentMatchweek}.`,
          });
        }
      }
    }

    // Biggest margin match of the round
    const biggest = [...results].sort(
      (a, b) =>
        Math.abs(b.homeGoals - b.awayGoals) - Math.abs(a.homeGoals - a.awayGoals) ||
        b.homeGoals + b.awayGoals - (a.homeGoals + a.awayGoals)
    )[0];
    if (biggest && (!userRes || biggest.fixtureId !== userRes.fixtureId)) {
      const fx = save.fixtures.find((f) => f.id === biggest.fixtureId)!;
      const h = clubMap.get(fx.homeClubId)!;
      const a = clubMap.get(fx.awayClubId)!;
      newItems.push({
        id: `news-big-${save.currentMatchweek}`,
        matchweek: save.currentMatchweek,
        category: "league",
        title: `Destaque da Rodada ${save.currentMatchweek}: ${h.name} ${biggest.homeGoals}–${biggest.awayGoals} ${a.name}`,
        body: `Partida movimentada no ${h.stadium} com ${
          biggest.homeGoals + biggest.awayGoals
        } gols na rodada.`,
      });
    }

    const prevDate =
      save.currentDate ??
      getDefaultDateForMatchweek(
        save.fixtures,
        save.currentMatchweek,
        save.seasonFinished,
        save.userClubId
      );
    const nextMwValue = seasonFinished ? 38 : nextMatchweek;
    const nextDate = getDefaultDateForMatchweek(
      nextFixtures,
      nextMwValue,
      seasonFinished,
      save.userClubId
    );
    const milestoneNews = buildWindowMilestoneNews(
      prevDate,
      nextDate,
      nextMwValue,
      save.seasonFinished,
      seasonFinished
    );

    const activeCup = save.faCup ?? createInitialFACupState(nextClubs);
    const dueCupRound = !seasonFinished
      ? activeCup.rounds.find(
          (r) => !r.completed && r.triggerMatchweek === nextMwValue
        )
      : undefined;
    const cupNews: NewsItem[] = dueCupRound
      ? [
          {
            id: `fac-due-${nextMwValue}`,
            matchweek: nextMwValue,
            category: "cup",
            title: `Copa da Inglaterra: ${dueCupRound.name} disponível!`,
            body: `Os confrontos eliminatórios da ${dueCupRound.shortName} estão prontos. Acesse a aba FA Cup para simular a fase.`,
          },
        ]
      : [];

    // Transfer Market: AI Offers & World Transfers Simulation
    const windowStatus = getTransferWindowStatus(
      nextDate,
      seasonFinished,
      save.allowTransfersOutsideWindow
    );

    let finalClubs: Club[] = nextClubs;
    let finalPlayers: Player[] = nextPlayers;
    let transferNews: NewsItem[] = [];
    let nextTransferOffers = save.transferOffers ?? [];
    let nextWorldTransfers = save.worldTransfers ?? [];
    let offerToastMsg: string | null = null;

    if (windowStatus.isOpen && !seasonFinished) {
      // 1. AI Transfer Offers for user players
      const { offers: generatedOffers, news: offerNews } = generateAiOffersForUser(
        {
          ...save,
          clubs: finalClubs,
          players: finalPlayers,
          currentDate: nextDate,
          currentMatchweek: nextMwValue,
          transferOffers: nextTransferOffers,
        },
        windowStatus
      );
      if (generatedOffers.length > 0) {
        nextTransferOffers = [...generatedOffers, ...nextTransferOffers];
        transferNews = [...transferNews, ...offerNews];
        offerToastMsg = `PROPOSTA: ${generatedOffers[0].fromClubName} ofereceu ${formatMoney(
          generatedOffers[0].offeredAmountEur
        )} por ${generatedOffers[0].playerName}!`;
      }

      // 2. AI World Transfers Simulation
      const {
        nextClubs: worldClubs,
        nextPlayers: worldPlayers,
        transfers: simTransfers,
        news: simNews,
      } = simulateAiWorldTransfers(
        {
          ...save,
          clubs: finalClubs,
          players: finalPlayers,
          currentDate: nextDate,
          currentMatchweek: nextMwValue,
        },
        2
      );
      finalClubs = worldClubs;
      finalPlayers = worldPlayers;
      if (simTransfers.length > 0) {
        nextWorldTransfers = [...simTransfers, ...nextWorldTransfers].slice(0, 100);
        transferNews = [...transferNews, ...simNews];
      }
    }

    // Update team synergy for all clubs that played this round (quanto mais jogam juntos, melhoram)
    const nextSynergyByClub = recordMatchweekSynergy(save, results);

    setSave({
      ...save,
      clubs: finalClubs,
      currentMatchweek: nextMwValue,
      seasonFinished,
      currentDate: nextDate,
      fixtures: nextFixtures,
      players: finalPlayers,
      tacticsByClub: nextTacticsByClub,
      stadiumByClub: nextStadiumByClub,
      synergyByClub: nextSynergyByClub,
      faCup: activeCup,
      transferOffers: nextTransferOffers,
      worldTransfers: nextWorldTransfers,
      news: [...cupNews, ...transferNews, ...milestoneNews, ...newItems, ...save.news].slice(0, 50),
    });

    setActiveTab(seasonFinished ? "season_review" : "dashboard");
    const milestoneToast = offerToastMsg
      ? offerToastMsg
      : dueCupRound
      ? `FA Cup liberada: ${dueCupRound.name}!`
      : milestoneNews[0]?.title;
    setToast(
      seasonFinished
        ? "Temporada 2026/27 encerrada! Confira o Dashboard de Desempenho."
        : milestoneToast
        ? milestoneToast
        : userHomeRevenue > 0
        ? `Rodada ${save.currentMatchweek} concluída! Bilheteria em casa: +${formatMoney(
            userHomeRevenue
          )}`
        : `Rodada ${save.currentMatchweek} concluída!`
    );
  };

  const handleSimulateFACupRound = () => {
    if (!save) return;
    const currentCup = save.faCup ?? createInitialFACupState(save.clubs);
    const activeRound = currentCup.rounds[currentCup.currentRoundIndex];
    if (!activeRound || activeRound.completed) return;

    const { nextFaCup, prizeByClub, headlines } = simulateFACupRound(
      currentCup,
      save.clubs,
      save.players,
      save.tacticsByClub,
      save.referees,
      stadiumByClub,
      save.userClubId,
      save.currentMatchweek
    );

    const nextClubs = save.clubs.map((c) => {
      const bonus = prizeByClub.get(c.id) ?? 0;
      return bonus > 0 ? { ...c, transferBudgetEur: c.transferBudgetEur + bonus } : c;
    });

    const userBonus = prizeByClub.get(save.userClubId) ?? 0;
    setSave({
      ...save,
      clubs: nextClubs,
      faCup: nextFaCup,
      news: [...headlines, ...save.news].slice(0, 40),
    });

    setToast(
      userBonus > 0
        ? `${activeRound.shortName} concluída! Seu clube avançou e faturou +${formatMoney(
            userBonus
          )}.`
        : headlines[0]?.title ?? `Copa da Inglaterra (${activeRound.shortName}) concluída!`
    );
  };

  const handleAdvanceToNextSeason = () => {
    if (!save) return;
    const { nextSave, report } = advanceToNextSeason(save);
    setSave(nextSave);
    setTransitionReport(report);
    setActiveTab("dashboard");
    setToast(
      `Bem-vindo à Temporada ${report.newSeason}! Novo orçamento e calendário de 38 rodadas disponíveis.`
    );
  };

  const handleUpdateStadiumConfig = (nextConfig: StadiumConfig) => {
    if (!save) return;
    setSave({
      ...save,
      stadiumByClub: {
        ...stadiumByClub,
        [save.userClubId]: nextConfig,
      },
    });
  };

  const handleExpandCapacity = () => {
    if (!save) return;
    const cost = 12_000_000;
    const club = save.clubs.find((c) => c.id === save.userClubId);
    if (!club || club.transferBudgetEur < cost) return;

    const nextClubs = save.clubs.map((c) =>
      c.id === club.id
        ? {
            ...c,
            capacity: c.capacity + 2500,
            transferBudgetEur: c.transferBudgetEur - cost,
          }
        : c
    );
    const newsItem: NewsItem = {
      id: `stad-exp-${Date.now()}`,
      matchweek: save.currentMatchweek,
      category: "stadium",
      clubId: club.id,
      title: `${club.stadium} ampliado em +2.500 lugares!`,
      body: `O ${club.name} concluiu investimento de ${formatMoney(
        cost
      )} na expansão das arquibancadas. Nova capacidade: ${(club.capacity + 2500).toLocaleString(
        "pt-BR"
      )}.`,
    };

    setSave({
      ...save,
      clubs: nextClubs,
      news: [newsItem, ...save.news].slice(0, 40),
    });
    setToast(`${club.stadium} expandido para ${(club.capacity + 2500).toLocaleString("pt-BR")} lugares!`);
  };

  const handleUpgradeVip = () => {
    if (!save) return;
    const cost = 6_000_000;
    const club = save.clubs.find((c) => c.id === save.userClubId);
    const curr = stadiumByClub[save.userClubId];
    if (!club || !curr || curr.vipLevel >= 5 || club.transferBudgetEur < cost) return;

    const nextLevel = curr.vipLevel + 1;
    setSave({
      ...save,
      clubs: save.clubs.map((c) =>
        c.id === club.id ? { ...c, transferBudgetEur: c.transferBudgetEur - cost } : c
      ),
      stadiumByClub: {
        ...stadiumByClub,
        [club.id]: { ...curr, vipLevel: nextLevel },
      },
    });
    setToast(`Setor VIP do ${club.stadium} evoluído para Nível ${nextLevel}!`);
  };

  const handleUpgradeTurf = () => {
    if (!save) return;
    const cost = 5_000_000;
    const club = save.clubs.find((c) => c.id === save.userClubId);
    const curr = stadiumByClub[save.userClubId];
    if (!club || !curr || curr.turfLevel >= 5 || club.transferBudgetEur < cost) return;

    const nextLevel = curr.turfLevel + 1;
    setSave({
      ...save,
      clubs: save.clubs.map((c) =>
        c.id === club.id ? { ...c, transferBudgetEur: c.transferBudgetEur - cost } : c
      ),
      stadiumByClub: {
        ...stadiumByClub,
        [club.id]: { ...curr, turfLevel: nextLevel },
      },
    });
    setToast(`Gramado Híbrido do ${club.stadium} evoluído para Nível ${nextLevel}!`);
  };

  const currentDate = save
    ? save.currentDate ??
      getDefaultDateForMatchweek(
        save.fixtures,
        save.currentMatchweek,
        save.seasonFinished,
        save.userClubId
      )
    : "2026-08-15";

  const windowStatus = getTransferWindowStatus(
    currentDate,
    save?.seasonFinished ?? false,
    save?.allowTransfersOutsideWindow ?? false
  );

  const handleToggleShortlist = (playerId: number) => {
    if (!save) return;
    const curr = save.shortlistIds ?? [];
    const exists = curr.includes(playerId);
    const next = exists ? curr.filter((id) => id !== playerId) : [...curr, playerId];
    setSave({ ...save, shortlistIds: next });
    const targetPlayer = save.players.find((p) => p.id === playerId);
    setToast(
      exists
        ? `${targetPlayer?.name ?? "Atleta"} removido da Lista de Alvos.`
        : `${targetPlayer?.name ?? "Atleta"} adicionado à Lista de Alvos!`
    );
  };

  const handleAdvanceDays = (days: number) => {
    if (!save || save.seasonFinished) return;
    const nextFx = getNextMatchFixture(save.fixtures, save.currentMatchweek, save.userClubId);
    let targetDate = addDaysIso(currentDate, days);
    if (nextFx && targetDate > nextFx.date) {
      targetDate = nextFx.date;
    }
    if (targetDate <= currentDate) return;

    const milestoneNews = buildWindowMilestoneNews(
      currentDate,
      targetDate,
      save.currentMatchweek,
      save.seasonFinished,
      save.seasonFinished
    );

    setSave({
      ...save,
      currentDate: targetDate,
      news: [...milestoneNews, ...save.news].slice(0, 40),
    });
    setToast(
      milestoneNews[0]?.title ?? `Calendário avançado para ${formatDatePtBr(targetDate)}`
    );
  };

  const handleAdvanceToMatchday = () => {
    if (!save || save.seasonFinished) return;
    const nextFx = getNextMatchFixture(save.fixtures, save.currentMatchweek, save.userClubId);
    if (!nextFx) return;
    if (currentDate >= nextFx.date) {
      setActiveTab("matchday");
      return;
    }

    const milestoneNews = buildWindowMilestoneNews(
      currentDate,
      nextFx.date,
      save.currentMatchweek,
      save.seasonFinished,
      save.seasonFinished
    );

    setSave({
      ...save,
      currentDate: nextFx.date,
      news: [...milestoneNews, ...save.news].slice(0, 40),
    });
    setToast(
      milestoneNews[0]?.title ??
        `Data avançada para o Dia de Jogo (${formatDatePtBr(nextFx.date)})!`
    );
  };

  const handleStartNegotiation = (target: Player) => {
    if (!windowStatus.isOpen) {
      setToast("Mercado fechado! Negociações só podem ser realizadas durante a janela de transferências.");
      return;
    }
    setNegotiatingPlayer(target);
  };

  const handleBuyPlayer = (target: Player) => {
    handleStartNegotiation(target);
  };

  const handleCompleteTransfer = (
    target: Player,
    finalFeeEur: number,
    wageEur: number,
    squadRole: SquadRole,
    sellOnPct: number
  ) => {
    if (!save) return;
    const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
    const sellerClubId = target.clubId;

    const nextClubs = save.clubs.map((c) => {
      if (c.id === userClub.id) {
        return { ...c, transferBudgetEur: Math.max(0, c.transferBudgetEur - finalFeeEur) };
      }
      if (sellerClubId && c.id === sellerClubId) {
        return { ...c, transferBudgetEur: c.transferBudgetEur + finalFeeEur };
      }
      return c;
    });

    const mappedPlayers = save.players.map((p) =>
      p.id === target.id
        ? {
            ...p,
            clubId: userClub.id,
            clubName: userClub.name,
            league: userClub.division ?? userClub.league ?? "Liga",
            wageEur,
            squadCategory: "first_team" as const,
            isTransferListed: false,
            shirtNumber: undefined,
          }
        : p
    );
    const nextPlayers = ensureAllPlayersShirtNumbers(mappedPlayers);

    const nextTacticsByClub = { ...save.tacticsByClub };
    if (sellerClubId && nextTacticsByClub[sellerClubId]) {
      const sellerSquad = nextPlayers.filter((p) => p.clubId === sellerClubId);
      const currSeller = nextTacticsByClub[sellerClubId];
      const picked = autoPickLineup(sellerSquad, currSeller.formation);
      nextTacticsByClub[sellerClubId] = {
        ...currSeller,
        starters: picked.starters,
        bench: picked.bench,
      };
    }

    const userTac = nextTacticsByClub[userClub.id];
    if (userTac && userTac.bench.length < 7) {
      nextTacticsByClub[userClub.id] = {
        ...userTac,
        bench: [...userTac.bench, target.id],
      };
    }

    const boughtPlayer = nextPlayers.find((p) => p.id === target.id);
    const sellerClub = save.clubs.find((c) => c.id === sellerClubId);

    const newsItem: NewsItem = {
      id: `buy-${target.id}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: userClub.id,
      title: `REFORÇO DE PESO: ${target.name} assina com o ${userClub.name}!`,
      body: `Negócio fechado em definitivo por ${formatMoney(finalFeeEur)} junto ao ${
        sellerClub?.name || target.clubName || "mercado"
      } (salário: ${formatWage(wageEur)}, papel: ${squadRole})${sellOnPct > 0 ? ` com ${sellOnPct}% de futura venda` : ""}${
        boughtPlayer?.shirtNumber ? ` (vestirá a camisa #${boughtPlayer.shirtNumber})` : ""
      }.`,
    };

    const worldTransfer: WorldTransfer = {
      id: `wt-buy-${target.id}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      date: save.currentDate ?? new Date().toISOString().slice(0, 10),
      playerId: target.id,
      playerName: target.name,
      playerOvr: target.overall,
      playerPos: target.primaryPosition,
      fromClubId: sellerClubId ?? 0,
      fromClubName: sellerClub?.name ?? target.clubName ?? "Mercado",
      fromClubLeague: sellerClub?.league ?? sellerClub?.division ?? target.league ?? "Liga",
      toClubId: userClub.id,
      toClubName: userClub.name,
      toClubLeague: userClub.division ?? userClub.league ?? "Liga",
      feeEur: finalFeeEur,
      headline: `${target.name} contratado pelo ${userClub.name} por ${formatMoney(finalFeeEur)}!`,
    };

    const nextSave: SaveState = {
      ...save,
      clubs: nextClubs,
      players: nextPlayers,
      tacticsByClub: nextTacticsByClub,
      worldTransfers: [worldTransfer, ...(save.worldTransfers ?? [])].slice(0, 100),
      news: [newsItem, ...save.news].slice(0, 50),
    };

    setSave(nextSave);
    setToast(`Negócio concluído! ${target.name} é oficialmente do ${userClub.name}!`);
    setNegotiatingPlayer(null);
  };

  const handleToggleTransferListed = (playerId: number) => {
    if (!save) return;
    const target = save.players.find((p) => p.id === playerId);
    if (!target) return;
    const nextStatus = !target.isTransferListed;
    const nextPlayers = save.players.map((p) =>
      p.id === playerId ? { ...p, isTransferListed: nextStatus } : p
    );
    const nextSave: SaveState = { ...save, players: nextPlayers };
    setSave(nextSave);
    setToast(
      nextStatus
        ? `${target.name} colocado na Lista de Transferências! Clubes enviarão mais propostas.`
        : `${target.name} retirado da Lista de Transferências.`
    );
  };

  const handleOfferPlayerToMarket = (playerId: number) => {
    if (!save) return;
    const res = offerPlayerToMarket(save, playerId);
    setSave(res.updatedSave);
    setToast(res.message);
  };

  const handleChangeShirtNumber = (playerId: number, newNumber: number) => {
    if (!save) return;
    const { nextPlayers, swappedWith } = changeClubPlayerShirtNumber(
      save.players,
      save.userClubId,
      playerId,
      newNumber
    );
    setSave({ ...save, players: nextPlayers });
    const updated = nextPlayers.find((p) => p.id === playerId);
    if (updated) {
      const aff = evaluateShirtNumberAffinity(updated);
      const swapTxt = swappedWith ? ` (trocou com ${swappedWith.name})` : "";
      setToast(
        `Camisa #${updated.shirtNumber} atribuída a ${updated.name}: ${aff.label} (${aff.bonusPctText})${swapTxt}`
      );
    }
  };

  const handleAutoAssignShirtNumbers = () => {
    if (!save) return;
    const userTac = save.tacticsByClub[save.userClubId];
    const nextPlayers = autoAssignClubShirtNumbers(
      save.players,
      save.userClubId,
      userTac?.starters ?? []
    );
    setSave({ ...save, players: nextPlayers });
    setToast("Numeração do elenco otimizada conforme histórico e função de cada atleta!");
  };

  const handlePromoteYouth = (playerId: number) => {
    if (!save) return;
    const { nextPlayers, promotedPlayer } = promoteYouthPlayer(
      save.players,
      playerId,
      save.userClubId
    );
    if (!promotedPlayer) return;
    const numberedPlayers = ensureAllPlayersShirtNumbers(nextPlayers);
    const userTac = save.tacticsByClub[save.userClubId];
    const nextTacticsByClub = { ...save.tacticsByClub };
    if (userTac && userTac.bench.length < 7) {
      nextTacticsByClub[save.userClubId] = {
        ...userTac,
        bench: [...userTac.bench, playerId],
      };
    }
    const newsItem: NewsItem = {
      id: `promo-youth-${playerId}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: save.userClubId,
      title: `JOIA PROMOVIDA: ${promotedPlayer.name} sobe ao elenco principal!`,
      body: `O técnico promoveu o jovem ${promotedPlayer.name} (${promotedPlayer.primaryPosition}, ${promotedPlayer.overall} OVR, ${promotedPlayer.potential}★) das categorias de base para treinar e jogar com os profissionais.`,
    };
    setSave({
      ...save,
      players: numberedPlayers,
      tacticsByClub: nextTacticsByClub,
      news: [newsItem, ...save.news].slice(0, 50),
    });
    setToast(`${promotedPlayer.name} foi promovido ao Elenco Principal!`);
  };

  const handleDemoteToYouth = (playerId: number) => {
    if (!save) return;
    const userTac = save.tacticsByClub[save.userClubId];
    const { nextPlayers, nextTactics, demotedPlayer } = demoteToYouthSquad(
      save.players,
      playerId,
      save.userClubId,
      userTac
    );
    if (!demotedPlayer) return;
    setSave({
      ...save,
      players: nextPlayers,
      tacticsByClub: { ...save.tacticsByClub, [save.userClubId]: nextTactics },
    });
    setToast(`${demotedPlayer.name} foi movido para a Base Sub-20.`);
  };

  const handleLoanOutYouth = (playerId: number, destinationClubId: number) => {
    if (!save) return;
    const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
    const destClub = save.clubs.find((c) => c.id === destinationClubId);
    if (!destClub) return;

    const { nextPlayers, loanedPlayer } = loanOutPlayer(
      save.players,
      playerId,
      userClub,
      destClub,
      save.season ?? "2026/27"
    );
    if (!loanedPlayer) return;

    const newsItem: NewsItem = {
      id: `loan-out-${playerId}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: save.userClubId,
      title: `EMPRÉSTIMO: ${loanedPlayer.name} ruma ao ${destClub.name}!`,
      body: `O jovem atleta foi emprestado ao ${destClub.name} para ganhar rodagem na temporada. Retornará ao fim do contrato.`,
    };

    setSave({
      ...save,
      players: nextPlayers,
      news: [newsItem, ...save.news].slice(0, 50),
    });
    setToast(`${loanedPlayer.name} emprestado ao ${destClub.name}!`);
  };

  const handleExerciseBuyOption = (playerId: number) => {
    if (!save) return;
    const { nextPlayers, nextClubs, success, message } = exerciseBuyOption(
      save.players,
      save.clubs,
      playerId,
      save.userClubId
    );
    if (!success) {
      setToast(message);
      return;
    }
    const boughtPlayer = nextPlayers.find((p) => p.id === playerId);
    const newsItem: NewsItem = {
      id: `loan-buy-${playerId}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: save.userClubId,
      title: `EM DEFINITIVO: ${boughtPlayer?.name} é comprado pelo ${save.clubs.find((c) => c.id === save.userClubId)?.name}!`,
      body: message,
    };
    setSave({
      ...save,
      clubs: nextClubs,
      players: nextPlayers,
      news: [newsItem, ...save.news].slice(0, 50),
    });
    setToast(message);
  };

  const handleAcceptTransferOffer = (offerId: string) => {
    if (!save) return;
    const { nextSave, message } = respondToTransferOffer(save, offerId, "accept");
    setSave(nextSave);
    setToast(message);
  };

  const handleRejectTransferOffer = (offerId: string) => {
    if (!save) return;
    const { nextSave, message } = respondToTransferOffer(save, offerId, "reject");
    setSave(nextSave);
    setToast(message);
  };

  const handleCounterTransferOffer = (offerId: string, counterAmountEur: number) => {
    if (!save) return;
    const { nextSave, message } = respondToTransferOffer(
      save,
      offerId,
      "counter",
      counterAmountEur
    );
    setSave(nextSave);
    setToast(message);
  };

  const handleSellPlayer = (target: Player) => {
    if (!save) return;
    if (!windowStatus.isOpen) {
      setToast("Mercado fechado! Vendas só podem ser concluídas com a janela aberta.");
      return;
    }
    const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
    const userSquad = save.players.filter((p) => p.clubId === userClub.id);
    if (userSquad.length <= 16) return;

    const saleRevenue = Math.round(target.marketValueEur * 0.92);
    const nextClubs = save.clubs.map((c) =>
      c.id === userClub.id
        ? { ...c, transferBudgetEur: c.transferBudgetEur + saleRevenue }
        : c
    );

    const nextPlayers = save.players.map((p) =>
      p.id === target.id
        ? {
            ...p,
            clubId: null,
            clubName: "Mercado Internacional",
            league: "Outros Clubes",
          }
        : p
    );

    const nextTacticsByClub = { ...save.tacticsByClub };
    const remainingUserSquad = nextPlayers.filter((p) => p.clubId === userClub.id);
    const currTac = nextTacticsByClub[userClub.id];
    if (currTac.starters.includes(target.id) || currTac.bench.includes(target.id)) {
      const picked = autoPickLineup(remainingUserSquad, currTac.formation);
      nextTacticsByClub[userClub.id] = {
        ...currTac,
        starters: picked.starters,
        bench: picked.bench,
      };
    }

    const newsItem: NewsItem = {
      id: `sell-${target.id}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: userClub.id,
      title: `${userClub.name} negocia ${target.name}`,
      body: `O clube aceitou proposta de ${formatMoney(saleRevenue)} pela transferência de ${
        target.name
      }.`,
    };

    const nextTransferOffers = (save.transferOffers ?? []).filter(
      (o) => o.playerId !== target.id
    );

    setSave({
      ...save,
      clubs: nextClubs,
      players: nextPlayers,
      tacticsByClub: nextTacticsByClub,
      transferOffers: nextTransferOffers,
      news: [newsItem, ...save.news].slice(0, 40),
    });
    setToast(`${target.name} vendido por ${formatMoney(saleRevenue)}!`);
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center">
        <div className="max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6">
          <h2 className="text-lg font-bold text-rose-400">Erro ao carregar banco de dados</h2>
          <p className="mt-2 text-xs text-slate-400">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!rawDb && !save) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-slate-300">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <p className="text-sm font-semibold">Carregando base de dados Premier League 2026/27...</p>
      </div>
    );
  }

  const handleToggleSaveKitTheme = () => {
    if (!save) return;
    const club = save.clubs.find((c) => c.id === save.userClubId);
    const nextTheme: "home" | "away" = (save.kitTheme ?? "home") === "home" ? "away" : "home";
    setSave({ ...save, kitTheme: nextTheme });
    setToast(
      nextTheme === "home"
        ? `Tema alterado: Uniforme 1 (Titular)${club ? ` do ${club.shortName}` : ""}`
        : `Tema alterado: Uniforme 2 (Reserva)${club ? ` do ${club.shortName}` : ""}`
    );
  };

  if (screen === "menu") {
    return (
      <>
        <MainMenu
          rawDb={rawDb}
          save={save}
          standings={standings}
          onContinue={() => setScreen("game")}
          onNewGame={() => setScreen("select_club")}
          onImportSave={handleImportSave}
          onExportSave={handleExportSave}
          onDeleteSave={handleDeleteSave}
          onToggleKitTheme={handleToggleSaveKitTheme}
          onToggleAutoFormation={() =>
            save &&
            setSave({
              ...save,
              autoOpenFormationOnRedCard: !(save.autoOpenFormationOnRedCard ?? true),
            })
          }
          onToggleAllowTransfersOutsideWindow={() => {
            if (!save) return;
            const nextVal = !(save.allowTransfersOutsideWindow ?? false);
            setSave({ ...save, allowTransfersOutsideWindow: nextVal });
            setToast(
              nextVal
                ? "Modo Livre: transferências permitidas fora da janela oficial."
                : "Regras oficiais ativadas: mercado restrito às janelas."
            );
          }}
        />
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-emerald-500/60 bg-slate-900 px-4 py-3 text-xs font-bold text-emerald-300">
            {toast}
          </div>
        )}
      </>
    );
  }

  if ((screen === "select_club" || !save) && rawDb) {
    return (
      <ClubSelection
        clubs={rawDb.clubs}
        players={rawDb.players}
        onSelectClub={handleSelectClub}
        onBackToMenu={() => setScreen("menu")}
      />
    );
  }

  if (!save) return null;

  const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
  const userSquad = save.players.filter((p) => p.clubId === userClub.id);
  const userTactics = save.tacticsByClub[userClub.id];
  const kitTheme: "home" | "away" = save.kitTheme ?? "home";
  const palette = getKitThemePalette(userClub, kitTheme);

  const handleToggleKitTheme = handleToggleSaveKitTheme;

  return (
    <div
      className="club-theme-root min-h-screen text-slate-100"
      style={{ ...palette.pageBackgroundStyle, ...palette.cssVars }}
    >
      {/* Top Navbar */}
      <header
        className="sticky top-0 z-30 border-b transition-colors duration-300"
        style={palette.headerStyle}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <ClubBadge club={userClub} size="md" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base text-white">{userClub.name}</h1>
                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-100">
                  {save.season ?? "2026/27"} • {save.seasonFinished ? "Fim da Temporada" : `Rodada ${save.currentMatchweek}/38`}
                </span>
                <button
                  onClick={() => activeTab !== "matchday" && setActiveTab("calendar")}
                  disabled={activeTab === "matchday"}
                  title="Abrir Calendário & Janelas de Transferência"
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition ${
                    windowStatus.isDeadlineDay
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : windowStatus.isOpen
                      ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
                      : "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/30"
                  } disabled:opacity-60`}
                >
                  <CalendarIcon className="h-2.5 w-2.5" />
                  <span>{formatDatePtBr(currentDate)}</span>
                  <span>•</span>
                  {windowStatus.isDeadlineDay ? (
                    <Flame className="h-2.5 w-2.5" />
                  ) : windowStatus.isOpen ? (
                    <Unlock className="h-2.5 w-2.5" />
                  ) : (
                    <Lock className="h-2.5 w-2.5" />
                  )}
                  <span>{windowStatus.badgeText}</span>
                </button>
              </div>
              <div className="text-[11px] text-slate-300/90">
                Técnico: <span className="text-white font-semibold">{save.managerName}</span> • Caixa:{" "}
                <span className="font-bold text-emerald-300">
                  {formatMoney(userClub.transferBudgetEur)}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "dashboard" as const, label: "Visão Geral", icon: LayoutDashboard },
              { id: "tactics" as const, label: "Tática & Elenco", icon: Users },
              { id: "academy" as const, label: "Base Sub-20", icon: GraduationCap },
              { id: "squad_analysis" as const, label: "Desempenho", icon: BarChart3 },
              { id: "calendar" as const, label: "Calendário", icon: CalendarIcon },
              { id: "stadium" as const, label: "Estádio", icon: Building2 },
              {
                id: "league" as const,
                label:
                  !userClub.division || userClub.division === "Premier League"
                    ? "Premier League"
                    : "Liga & Divisões",
                icon: Trophy,
              },
              { id: "facup" as const, label: "FA Cup", icon: Award },
              { id: "market" as const, label: "Mercado", icon: ShoppingBag },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const pendingOffersCount = (save?.transferOffers ?? []).filter(
                (o) => o.status === "pending"
              ).length;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  disabled={activeTab === "matchday"}
                  style={
                    isActive
                      ? { backgroundColor: palette.accentPrimary, color: palette.accentText }
                      : undefined
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    isActive
                      ? "ring-0"
                      : "text-slate-200 hover:bg-white/10 hover:text-white disabled:opacity-40"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {item.label}
                  {item.id === "market" && pendingOffersCount > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                      {pendingOffersCount}
                    </span>
                  )}
                </button>
              );
            })}

            {!save.seasonFinished && activeTab !== "matchday" && (
              <button
                onClick={() => setActiveTab("matchday")}
                className="ml-1 inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300"
              >
                <Play className="h-3.5 w-3.5 fill-current" /> Dia de Jogo
              </button>
            )}

            {save.seasonFinished && (
              <button
                onClick={() => setActiveTab("season_review")}
                style={
                  activeTab === "season_review"
                    ? { backgroundColor: palette.accentPrimary, color: palette.accentText }
                    : undefined
                }
                className={`ml-1 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black transition ${
                  activeTab === "season_review"
                    ? ""
                    : "border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                }`}
              >
                <Trophy className="h-3.5 w-3.5 fill-current" /> Review da Temporada
              </button>
            )}
          </nav>

          {/* Utility Buttons + Uniform Theme Switcher */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setScreen("menu")}
              disabled={activeTab === "matchday"}
              title="Voltar ao Menu Inicial"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/25 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <Home className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Menu</span>
            </button>
            <button
              onClick={handleToggleKitTheme}
              title="Alternar tema entre Uniforme 1 (Titular) e Uniforme 2 (Reserva)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-white/10"
            >
              <ClubKit club={userClub} variant={kitTheme} size="xs" />
              <span className="hidden md:inline">
                {kitTheme === "home" ? "Uniforme 1" : "Uniforme 2"}
              </span>
            </button>
            <button
              onClick={handleExportSave}
              title="Exportar Save JSON"
              className="rounded-lg border border-white/15 bg-black/25 p-2 text-slate-300 hover:text-white"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-emerald-500/60 bg-slate-900 px-4 py-3 text-xs font-bold text-emerald-300">
          {toast}
        </div>
      )}

      {/* Main Content */}
      <main
        className={`mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 ${
          activeTab === "matchday" ? "py-2 sm:py-3" : "py-6"
        }`}
      >
        {activeTab === "dashboard" && (
          <Dashboard
            userClub={userClub}
            managerName={save.managerName}
            currentMatchweek={save.currentMatchweek}
            seasonFinished={save.seasonFinished}
            currentSeason={save.season ?? "2026/27"}
            currentDate={currentDate}
            windowStatus={windowStatus}
            faCup={save.faCup}
            clubs={save.clubs}
            players={save.players}
            fixtures={save.fixtures}
            referees={save.referees}
            standings={standings}
            tacticsByClub={save.tacticsByClub}
            stadiumByClub={stadiumByClub}
            userKitVariant={kitTheme}
            news={save.news}
            onStartMatchday={() => setActiveTab("matchday")}
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectPlayer={setInspectedPlayer}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarHub
            userClub={userClub}
            clubs={save.clubs}
            fixtures={save.fixtures}
            currentMatchweek={save.currentMatchweek}
            seasonFinished={save.seasonFinished}
            currentSeason={save.season ?? "2026/27"}
            currentDate={currentDate}
            windowStatus={windowStatus}
            onAdvanceDays={handleAdvanceDays}
            onAdvanceToMatchday={handleAdvanceToMatchday}
            onOpenMarket={() => setActiveTab("market")}
            onStartMatchday={() => setActiveTab("matchday")}
          />
        )}

        {activeTab === "tactics" && (
          <TacticsSquad
            club={userClub}
            players={userSquad}
            tactics={userTactics}
            synergyTracker={getOrCreateClubSynergyTracker(save, userClub.id)}
            onChangeTactics={(next) =>
              setSave({
                ...save,
                tacticsByClub: { ...save.tacticsByClub, [userClub.id]: next },
              })
            }
            onSelectPlayer={setInspectedPlayer}
            onChangeShirtNumber={handleChangeShirtNumber}
            onAutoAssignShirtNumbers={handleAutoAssignShirtNumbers}
            onNavigateToAcademy={() => setActiveTab("academy")}
          />
        )}

        {activeTab === "academy" && (
          <YouthAcademyHub
            userClub={userClub}
            allClubs={save.clubs}
            players={save.players}
            onPromoteYouth={handlePromoteYouth}
            onDemoteToYouth={handleDemoteToYouth}
            onLoanOutYouth={handleLoanOutYouth}
            onExerciseBuyOption={handleExerciseBuyOption}
            onSelectPlayer={setInspectedPlayer}
          />
        )}

        {activeTab === "squad_analysis" && (
          <SquadPerformanceAnalysis
            userClub={userClub}
            players={save.players}
            fixtures={save.fixtures}
            tactics={userTactics}
            synergyTracker={getOrCreateClubSynergyTracker(save, userClub.id)}
            currentMatchweek={save.currentMatchweek}
            currentSeason={save.season ?? "2026/27"}
            onSelectPlayer={setInspectedPlayer}
            onNavigateToTactics={() => setActiveTab("tactics")}
          />
        )}

        {activeTab === "stadium" && (
          <StadiumHub
            userClub={userClub}
            clubs={save.clubs}
            stadiumByClub={stadiumByClub}
            onUpdateStadiumConfig={handleUpdateStadiumConfig}
            onExpandCapacity={handleExpandCapacity}
            onUpgradeVip={handleUpgradeVip}
            onUpgradeTurf={handleUpgradeTurf}
          />
        )}

        {activeTab === "matchday" && (
          <MatchdayLive
            matchweek={save.currentMatchweek}
            userClubId={userClub.id}
            clubs={save.clubs}
            players={save.players}
            fixtures={save.fixtures}
            referees={save.referees}
            tacticsByClub={save.tacticsByClub}
            stadiumByClub={stadiumByClub}
            synergyByClub={save.synergyByClub}
            userKitVariant={kitTheme}
            autoOpenFormationOnRedCard={save.autoOpenFormationOnRedCard ?? true}
            onToggleAutoFormationOnRedCard={() =>
              setSave({
                ...save,
                autoOpenFormationOnRedCard: !(save.autoOpenFormationOnRedCard ?? true),
              })
            }
            onFinishMatchweek={handleFinishMatchweek}
          />
        )}

        {activeTab === "league" && (
          <LeagueHub
            userClubId={userClub.id}
            currentMatchweek={save.currentMatchweek}
            clubs={save.clubs}
            players={save.players}
            fixtures={save.fixtures}
            standings={standings}
            onSelectPlayer={setInspectedPlayer}
          />
        )}

        {activeTab === "facup" && save.faCup && (
          <FACupHub
            faCup={save.faCup}
            clubs={save.clubs}
            userClubId={userClub.id}
            currentMatchweek={save.currentMatchweek}
            onSimulateCurrentRound={handleSimulateFACupRound}
          />
        )}

        {activeTab === "market" && (
          <TransferMarket
            userClub={userClub}
            clubs={save.clubs}
            players={save.players}
            windowStatus={windowStatus}
            currentDate={currentDate}
            shortlistIds={save.shortlistIds ?? []}
            transferOffers={save.transferOffers}
            worldTransfers={save.worldTransfers}
            onBuyPlayer={handleBuyPlayer}
            onStartNegotiation={handleStartNegotiation}
            onToggleTransferListed={handleToggleTransferListed}
            onOfferPlayerToMarket={handleOfferPlayerToMarket}
            onSellPlayer={handleSellPlayer}
            onSelectPlayer={setInspectedPlayer}
            onToggleShortlist={handleToggleShortlist}
            onOpenCalendar={() => setActiveTab("calendar")}
            onAcceptOffer={handleAcceptTransferOffer}
            onRejectOffer={handleRejectTransferOffer}
            onCounterOffer={handleCounterTransferOffer}
          />
        )}

        {activeTab === "season_review" && (
          <SeasonReviewDashboard
            userClub={userClub}
            clubs={save.clubs}
            players={save.players}
            fixtures={save.fixtures}
            standings={standings}
            faCup={save.faCup}
            stadiumConfig={stadiumByClub[userClub.id]}
            userTactics={userTactics}
            currentSeason={save.season ?? "2026/27"}
            seasonNumber={save.seasonNumber ?? 1}
            seasonHistory={save.seasonHistory}
            onAdvanceToNextSeason={handleAdvanceToNextSeason}
            onSelectPlayer={setInspectedPlayer}
            onNavigateToLeague={() => setActiveTab("league")}
            onNavigateToMarket={() => setActiveTab("market")}
            onNavigateToCalendar={() => setActiveTab("calendar")}
          />
        )}
      </main>

      {/* Player Modal */}
      <PlayerProfileModal
        player={
          inspectedPlayer
            ? save.players.find((p) => p.id === inspectedPlayer.id) ?? inspectedPlayer
            : null
        }
        userClubId={userClub.id}
        userClub={userClub}
        sellerClub={
          inspectedPlayer && inspectedPlayer.clubId
            ? save.clubs.find((c) => c.id === inspectedPlayer.clubId)
            : undefined
        }
        userBudgetEur={userClub.transferBudgetEur}
        userSquadSize={userSquad.length}
        allPlayers={save.players}
        windowStatus={windowStatus}
        isShortlisted={
          inspectedPlayer ? (save.shortlistIds ?? []).includes(inspectedPlayer.id) : false
        }
        onToggleShortlist={handleToggleShortlist}
        onChangeShirtNumber={handleChangeShirtNumber}
        onClose={() => setInspectedPlayer(null)}
        onBuyPlayer={handleBuyPlayer}
        onStartNegotiation={handleStartNegotiation}
        onToggleTransferListed={handleToggleTransferListed}
        onOfferPlayerToMarket={handleOfferPlayerToMarket}
        onSellPlayer={handleSellPlayer}
        onPromoteYouth={handlePromoteYouth}
        onDemoteToYouth={handleDemoteToYouth}
        onExerciseBuyOption={handleExerciseBuyOption}
      />

      {/* Transfer Negotiation Modal */}
      {negotiatingPlayer && (
        <TransferNegotiationModal
          player={
            save.players.find((p) => p.id === negotiatingPlayer.id) ?? negotiatingPlayer
          }
          userClub={userClub}
          sellerClub={
            negotiatingPlayer.clubId
              ? save.clubs.find((c) => c.id === negotiatingPlayer.clubId)
              : undefined
          }
          userBudgetEur={userClub.transferBudgetEur}
          allPlayers={save.players}
          onClose={() => setNegotiatingPlayer(null)}
          onCompleteTransfer={handleCompleteTransfer}
        />
      )}

      {/* Season Transition Report Modal */}
      {transitionReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-emerald-500/60 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-black uppercase text-emerald-300 border border-emerald-500/40">
                  Nova Temporada Iniciada!
                </span>
                <h2 className="mt-1 font-h1 text-2xl text-white">
                  Bem-vindo à Temporada {transitionReport.newSeason}!
                </h2>
              </div>
              <button
                onClick={() => setTransitionReport(null)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Campaign status */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Status da Campanha Anterior ({transitionReport.previousSeason})
                </div>
                <div className="mt-1 text-base font-black text-white">
                  {transitionReport.userClubName} terminou em {transitionReport.userRank}º Lugar ({transitionReport.userPoints} pts)
                </div>
                {transitionReport.userPromoted && (
                  <div className="mt-1 font-bold text-emerald-400">
                    ACESSO CONQUISTADO! O clube subiu para a {transitionReport.userDivision}!
                  </div>
                )}
                {transitionReport.userRelegated && (
                  <div className="mt-1 font-bold text-rose-400">
                    REBAIXAMENTO: O clube disputará a {transitionReport.userDivision}.
                  </div>
                )}
              </div>

              {/* Promotions & Relegations */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="text-[10px] font-bold uppercase text-emerald-400">Clubes Promovidos</div>
                  <div className="mt-1 text-xs text-white">
                    {transitionReport.promotedClubs.length > 0
                      ? transitionReport.promotedClubs.join(", ")
                      : "Sem alterações nesta divisão"}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                  <div className="text-[10px] font-bold uppercase text-rose-400">Clubes Rebaixados</div>
                  <div className="mt-1 text-xs text-white">
                    {transitionReport.relegatedClubs.length > 0
                      ? transitionReport.relegatedClubs.join(", ")
                      : "Sem alterações nesta divisão"}
                  </div>
                </div>
              </div>

              {/* Financial Boost */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-[10px] font-bold uppercase text-slate-400">Injeção Financeira</div>
                <div className="mt-1 flex items-baseline justify-between text-base font-black text-emerald-400">
                  <span>Premiação da Liga + Contrato de TV</span>
                  <span>+{formatMoney(transitionReport.totalBudgetAddedEur)}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Valores creditados integralmente no orçamento de transferências para a Janela de Verão.
                </p>
              </div>

              {/* Player Development */}
              {transitionReport.improvedPlayers.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-[10px] font-bold uppercase text-sky-400">
                    Desenvolvimento de Jovens Atletas (Evolução de Overall)
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {transitionReport.improvedPlayers.slice(0, 10).map((p, i) => (
                      <div key={i} className="flex justify-between border-b border-slate-800/60 pb-1">
                        <span className="text-white">{p.name}</span>
                        <span className="font-bold text-emerald-400">
                          {p.oldOvr} → {p.newOvr} (+{p.newOvr - p.oldOvr})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setTransitionReport(null)}
                className="w-full rounded-xl bg-emerald-500 py-3 text-center text-sm font-black text-slate-950 transition hover:bg-emerald-400 sm:w-auto sm:px-6"
              >
                Ir para a Pré-Temporada {transitionReport.newSeason} →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
