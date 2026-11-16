import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Trophy,
  ShoppingBag,
  Building2,
  Play,
  RotateCcw,
  Download,
  Loader2,
} from "lucide-react";
import type {
  MatchResult,
  NewsItem,
  Player,
  RawDatabase,
  SaveState,
  StadiumConfig,
  Tactics,
} from "./types/game";
import {
  autoPickLineup,
  createDefaultStadiumConfig,
  createDefaultTactics,
} from "./engine/matchEngine";
import { computeStandings } from "./engine/standings";
import { formatMoney } from "./utils/format";
import { ClubBadge } from "./components/ClubBadge";
import { ClubSelection } from "./components/ClubSelection";
import { Dashboard } from "./components/Dashboard";
import { TacticsSquad } from "./components/TacticsSquad";
import { MatchdayLive } from "./components/MatchdayLive";
import { LeagueHub } from "./components/LeagueHub";
import { TransferMarket } from "./components/TransferMarket";
import { StadiumHub } from "./components/StadiumHub";
import { PlayerProfileModal } from "./components/PlayerProfileModal";

const SAVE_KEY = "fm2627_pl_save_v1";

type Tab = "dashboard" | "tactics" | "stadium" | "league" | "market" | "matchday";

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

export const App: React.FC = () => {
  const [rawDb, setRawDb] = useState<RawDatabase | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState | null>(() => {
    try {
      const stored = localStorage.getItem(SAVE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as SaveState;
      return {
        ...parsed,
        stadiumByClub: ensureStadiumMap(parsed.clubs, parsed.stadiumByClub),
      };
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [inspectedPlayer, setInspectedPlayer] = useState<Player | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const standings = useMemo(
    () => (save ? computeStandings(save.clubs, save.fixtures) : []),
    [save]
  );

  const stadiumByClub = useMemo(
    () => (save ? ensureStadiumMap(save.clubs, save.stadiumByClub) : {}),
    [save]
  );

  const handleSelectClub = (clubId: number, managerName: string) => {
    if (!rawDb) return;
    const clubs = rawDb.clubs.map((c) => ({ ...c }));
    const players = rawDb.players.map((p) => ({ ...p }));
    const fixtures = rawDb.fixtures.map((f) => ({ ...f }));
    const referees = rawDb.referees.map((r) => ({ ...r }));

    const tacticsByClub: Record<number, Tactics> = {};
    for (const club of clubs) {
      const squad = players.filter((p) => p.clubId === club.id);
      tacticsByClub[club.id] = createDefaultTactics(squad, club.avgOverall);
    }

    const chosenClub = clubs.find((c) => c.id === clubId)!;
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
      news: [
        {
          id: "welcome-1",
          matchweek: 1,
          category: "league",
          clubId,
          title: `${managerName} é apresentado no ${chosenClub.name}!`,
          body: `A diretoria confirmou a contratação de ${managerName} para liderar o projeto na Premier League 2026/27 com orçamento inicial de ${formatMoney(
            chosenClub.transferBudgetEur
          )}.`,
        },
        {
          id: "welcome-2",
          matchweek: 1,
          category: "league",
          title: "Guia da Temporada 2026/27",
          body: "Arsenal defende o título conquistado em 2025/26. Coventry City, Hull City, Ipswich Town, Leeds United e Sunderland buscam surpreender na elite.",
        },
      ],
    };

    setSave(newSave);
    setActiveTab("dashboard");
  };

  const handleResetSave = () => {
    if (!window.confirm("Deseja encerrar o save atual e escolher um novo clube?")) return;
    localStorage.removeItem(SAVE_KEY);
    setSave(null);
    setActiveTab("dashboard");
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

    const nextPlayers = save.players.map((p) => {
      const perf = playedPlayerStats.get(p.id);
      if (!perf) {
        // Rested players recover stamina to 100
        return {
          ...p,
          stamina: Math.min(100, p.stamina + 25),
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
      };
    });

    // Refresh AI lineups for next round to respect fatigue
    const nextTacticsByClub: Record<number, Tactics> = { ...save.tacticsByClub };
    for (const club of save.clubs) {
      if (club.id === save.userClubId) continue;
      const clubPlayers = nextPlayers.filter((p) => p.clubId === club.id);
      const curr = nextTacticsByClub[club.id];
      const picked = autoPickLineup(clubPlayers, curr.formation);
      nextTacticsByClub[club.id] = {
        ...curr,
        starters: picked.starters,
        bench: picked.bench,
      };
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

    setSave({
      ...save,
      clubs: nextClubs,
      currentMatchweek: seasonFinished ? 38 : nextMatchweek,
      seasonFinished,
      fixtures: nextFixtures,
      players: nextPlayers,
      tacticsByClub: nextTacticsByClub,
      stadiumByClub: nextStadiumByClub,
      news: [...newItems, ...save.news].slice(0, 40),
    });

    setActiveTab("dashboard");
    setToast(
      seasonFinished
        ? "Temporada 2026/27 encerrada! Confira a classificação final."
        : userHomeRevenue > 0
        ? `Rodada ${save.currentMatchweek} concluída! Bilheteria em casa: +${formatMoney(
            userHomeRevenue
          )}`
        : `Rodada ${save.currentMatchweek} concluída!`
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

  const handleBuyPlayer = (target: Player) => {
    if (!save) return;
    const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
    if (userClub.transferBudgetEur < target.marketValueEur) return;

    const sellerClubId = target.clubId;
    const nextClubs = save.clubs.map((c) => {
      if (c.id === userClub.id) {
        return { ...c, transferBudgetEur: c.transferBudgetEur - target.marketValueEur };
      }
      if (sellerClubId && c.id === sellerClubId) {
        return { ...c, transferBudgetEur: c.transferBudgetEur + target.marketValueEur };
      }
      return c;
    });

    const nextPlayers = save.players.map((p) =>
      p.id === target.id
        ? {
            ...p,
            clubId: userClub.id,
            clubName: userClub.name,
            league: "Premier League",
          }
        : p
    );

    const nextTacticsByClub = { ...save.tacticsByClub };
    // Remove from seller's tactics if seller is in PL
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

    // Add to user's bench if bench < 7
    const userTac = nextTacticsByClub[userClub.id];
    if (userTac.bench.length < 7) {
      nextTacticsByClub[userClub.id] = {
        ...userTac,
        bench: [...userTac.bench, target.id],
      };
    }

    const newsItem: NewsItem = {
      id: `buy-${target.id}-${Date.now()}`,
      matchweek: save.currentMatchweek,
      category: "transfer",
      clubId: userClub.id,
      title: `OFICIAL: ${target.name} assina com o ${userClub.name}!`,
      body: `Contratação fechada junto ao ${target.clubName} por ${formatMoney(
        target.marketValueEur
      )}.`,
    };

    setSave({
      ...save,
      clubs: nextClubs,
      players: nextPlayers,
      tacticsByClub: nextTacticsByClub,
      news: [newsItem, ...save.news].slice(0, 40),
    });
    setToast(`${target.name} contratado por ${formatMoney(target.marketValueEur)}!`);
  };

  const handleSellPlayer = (target: Player) => {
    if (!save) return;
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

    setSave({
      ...save,
      clubs: nextClubs,
      players: nextPlayers,
      tacticsByClub: nextTacticsByClub,
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

  if (!save && rawDb) {
    return (
      <ClubSelection
        clubs={rawDb.clubs}
        players={rawDb.players}
        onSelectClub={handleSelectClub}
      />
    );
  }

  if (!save) return null;

  const userClub = save.clubs.find((c) => c.id === save.userClubId)!;
  const userSquad = save.players.filter((p) => p.clubId === userClub.id);
  const userTactics = save.tacticsByClub[userClub.id];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <ClubBadge club={userClub} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white">{userClub.name}</span>
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {save.seasonFinished ? "Fim da Temporada" : `Rodada ${save.currentMatchweek}/38`}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Técnico: <span className="text-slate-200">{save.managerName}</span> • Caixa:{" "}
                <span className="font-bold text-emerald-400">
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
              { id: "stadium" as const, label: "Estádio", icon: Building2 },
              { id: "league" as const, label: "Premier League", icon: Trophy },
              { id: "market" as const, label: "Mercado", icon: ShoppingBag },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  disabled={activeTab === "matchday"}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    isActive
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white disabled:opacity-40"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {item.label}
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
          </nav>

          {/* Utility Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportSave}
              title="Exportar Save JSON"
              className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={handleResetSave}
              disabled={activeTab === "matchday"}
              title="Novo Save / Trocar Clube"
              className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-rose-400 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 text-xs font-bold text-emerald-300 shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === "dashboard" && (
          <Dashboard
            userClub={userClub}
            managerName={save.managerName}
            currentMatchweek={save.currentMatchweek}
            seasonFinished={save.seasonFinished}
            clubs={save.clubs}
            players={save.players}
            fixtures={save.fixtures}
            referees={save.referees}
            standings={standings}
            tacticsByClub={save.tacticsByClub}
            stadiumByClub={stadiumByClub}
            news={save.news}
            onStartMatchday={() => setActiveTab("matchday")}
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectPlayer={setInspectedPlayer}
          />
        )}

        {activeTab === "tactics" && (
          <TacticsSquad
            club={userClub}
            players={userSquad}
            tactics={userTactics}
            onChangeTactics={(next) =>
              setSave({
                ...save,
                tacticsByClub: { ...save.tacticsByClub, [userClub.id]: next },
              })
            }
            onSelectPlayer={setInspectedPlayer}
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

        {activeTab === "market" && (
          <TransferMarket
            userClub={userClub}
            players={save.players}
            onBuyPlayer={handleBuyPlayer}
            onSellPlayer={handleSellPlayer}
            onSelectPlayer={setInspectedPlayer}
          />
        )}
      </main>

      {/* Player Modal */}
      <PlayerProfileModal
        player={inspectedPlayer}
        userClubId={userClub.id}
        userBudgetEur={userClub.transferBudgetEur}
        userSquadSize={userSquad.length}
        onClose={() => setInspectedPlayer(null)}
        onBuyPlayer={handleBuyPlayer}
        onSellPlayer={handleSellPlayer}
      />
    </div>
  );
};

export default App;
