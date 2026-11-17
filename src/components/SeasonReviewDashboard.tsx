import React, { useMemo } from "react";
import {
  Trophy,
  Award,
  Star,
  Flame,
  Shield,
  DollarSign,
  Sparkles,
  Building2,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import type {
  Club,
  FACupState,
  Fixture,
  Player,
  StadiumConfig,
  PastSeasonRecord,
  StandingRow,
  Tactics,
} from "../types/game";
import { formatMoney, getRoleBadgeClass } from "../utils/format";
import { ClubBadge } from "./ClubBadge";
import { PlayerAvatar } from "./PlayerAvatar";

interface SeasonReviewDashboardProps {
  userClub: Club;
  clubs: Club[];
  players: Player[];
  fixtures: Fixture[];
  standings: StandingRow[];
  faCup?: FACupState;
  stadiumConfig?: StadiumConfig;
  userTactics?: Tactics;
  currentSeason?: string;
  seasonNumber?: number;
  seasonHistory?: PastSeasonRecord[];
  onAdvanceToNextSeason?: () => void;
  onSelectPlayer: (p: Player) => void;
  onNavigateToLeague: () => void;
  onNavigateToMarket: () => void;
  onNavigateToCalendar: () => void;
}

export const SeasonReviewDashboard: React.FC<SeasonReviewDashboardProps> = ({
  userClub,
  clubs,
  players,
  fixtures,
  standings,
  faCup,
  stadiumConfig,
  currentSeason = "2026/27",
  seasonNumber = 1,
  seasonHistory,
  onAdvanceToNextSeason,
  onSelectPlayer,
  onNavigateToLeague,
  onNavigateToMarket,
  onNavigateToCalendar,
}) => {
  const clubMap = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  const activeSeason = currentSeason;
  const startYr = useMemo(() => {
    const match = activeSeason.match(/^(\d{4})/);
    return match ? parseInt(match[1], 10) : 2026;
  }, [activeSeason]);
  const nextSeasonName = `${startYr + 1}/${String(startYr + 2).slice(-2)}`;

  // User Squad & Stats
  const userSquad = useMemo(
    () => players.filter((p) => p.clubId === userClub.id),
    [players, userClub.id]
  );

  // League campaign metrics
  const userStandingIdx = standings.findIndex((s) => s.club.id === userClub.id);
  const userStanding = userStandingIdx >= 0 ? standings[userStandingIdx] : null;
  const userRank = userStandingIdx >= 0 ? userStandingIdx + 1 : 1;
  const totalClubs = standings.length;

  // Played fixtures for user club
  const userFixtures = useMemo(
    () =>
      fixtures
        .filter((f) => f.played && (f.homeClubId === userClub.id || f.awayClubId === userClub.id))
        .map((f) => {
          const isHome = f.homeClubId === userClub.id;
          const userGoals = (isHome ? f.homeGoals : f.awayGoals) ?? 0;
          const oppGoals = (isHome ? f.awayGoals : f.homeGoals) ?? 0;
          const diff = userGoals - oppGoals;
          const oppClubId = isHome ? f.awayClubId : f.homeClubId;
          const oppClub = clubMap.get(oppClubId);
          const outcome: "W" | "D" | "L" = diff > 0 ? "W" : diff === 0 ? "D" : "L";
          return {
            fixture: f,
            isHome,
            userGoals,
            oppGoals,
            diff,
            oppClub,
            outcome,
            matchweek: f.matchweek,
          };
        }),
    [fixtures, userClub.id, clubMap]
  );

  // Home vs Away stats
  const homeMatches = userFixtures.filter((m) => m.isHome);
  const awayMatches = userFixtures.filter((m) => !m.isHome);

  const homeWins = homeMatches.filter((m) => m.outcome === "W").length;
  const homeDraws = homeMatches.filter((m) => m.outcome === "D").length;
  const homeLosses = homeMatches.filter((m) => m.outcome === "L").length;
  const homeGf = homeMatches.reduce((s, m) => s + m.userGoals, 0);
  const homeGa = homeMatches.reduce((s, m) => s + m.oppGoals, 0);

  const awayWins = awayMatches.filter((m) => m.outcome === "W").length;
  const awayDraws = awayMatches.filter((m) => m.outcome === "D").length;
  const awayLosses = awayMatches.filter((m) => m.outcome === "L").length;
  const awayGf = awayMatches.reduce((s, m) => s + m.userGoals, 0);
  const awayGa = awayMatches.reduce((s, m) => s + m.oppGoals, 0);

  const cleanSheetsCount = userFixtures.filter((m) => m.oppGoals === 0).length;

  // Streaks
  let longestWinStreak = 0;
  let currentWinStreak = 0;
  let longestUnbeatenStreak = 0;
  let currentUnbeatenStreak = 0;

  for (const m of userFixtures) {
    if (m.outcome === "W") {
      currentWinStreak += 1;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
    } else {
      currentWinStreak = 0;
    }

    if (m.outcome === "W" || m.outcome === "D") {
      currentUnbeatenStreak += 1;
      longestUnbeatenStreak = Math.max(longestUnbeatenStreak, currentUnbeatenStreak);
    } else {
      currentUnbeatenStreak = 0;
    }
  }

  // Notable matches
  const sortedByMargin = [...userFixtures].sort((a, b) => b.diff - a.diff);
  const biggestWin = sortedByMargin.length > 0 && sortedByMargin[0].diff > 0 ? sortedByMargin[0] : null;
  const heaviestDefeat =
    sortedByMargin.length > 0 && sortedByMargin[sortedByMargin.length - 1].diff < 0
      ? sortedByMargin[sortedByMargin.length - 1]
      : null;

  const highestScoringMatch = [...userFixtures].sort(
    (a, b) => b.userGoals + b.oppGoals - (a.userGoals + a.oppGoals)
  )[0];

  // FA Cup performance
  const faCupProgress = useMemo(() => {
    if (!faCup) return null;
    let highestRound = "Não disputada";
    let wonCup = false;
    let isRunnerUp = false;
    let playedCupMatches = 0;
    let cupWins = 0;
    let prizeMoney = 0;

    for (const r of faCup.rounds) {
      for (const t of r.ties) {
        if (t.homeClubId === userClub.id || t.awayClubId === userClub.id) {
          playedCupMatches += 1;
          highestRound = r.name;
          if (t.played) {
            const won = t.winnerClubId === userClub.id;
            if (won) {
              cupWins += 1;
              prizeMoney += r.prizeEur;
              if (r.index === faCup.rounds.length - 1 || r.shortName === "Final") {
                wonCup = true;
              }
            } else if (r.index === faCup.rounds.length - 1 || r.shortName === "Final") {
              isRunnerUp = true;
            }
          }
        }
      }
    }

    return {
      highestRound,
      wonCup,
      isRunnerUp,
      playedCupMatches,
      cupWins,
      prizeMoney,
    };
  }, [faCup, userClub.id]);

  // Individual Awards
  const playersWithApps = userSquad.filter((p) => p.seasonAppearances > 0);

  // MVP: highest seasonAvgRating with min 8 apps, fallback to any apps
  const mvp = useMemo(() => {
    const qualified = playersWithApps.filter((p) => p.seasonAppearances >= 8);
    const pool = qualified.length > 0 ? qualified : playersWithApps;
    return [...pool].sort(
      (a, b) =>
        b.seasonAvgRating - a.seasonAvgRating ||
        b.seasonGoals + b.seasonAssists - (a.seasonGoals + a.seasonAssists) ||
        b.overall - a.overall
    )[0];
  }, [playersWithApps]);

  // Golden Boot (Top Scorer)
  const topScorer = useMemo(() => {
    return [...userSquad].sort(
      (a, b) => b.seasonGoals - a.seasonGoals || b.seasonAssists - a.seasonAssists || b.overall - a.overall
    )[0];
  }, [userSquad]);

  // Top Assister (Playmaker)
  const topAssister = useMemo(() => {
    return [...userSquad].sort(
      (a, b) => b.seasonAssists - a.seasonAssists || b.seasonGoals - a.seasonGoals || b.overall - a.overall
    )[0];
  }, [userSquad]);

  // Young Player of the Season (<= 23 years old)
  const bestYoungster = useMemo(() => {
    const youngsters = playersWithApps.filter((p) => p.age <= 23);
    return [...youngsters].sort(
      (a, b) =>
        b.seasonAvgRating - a.seasonAvgRating ||
        b.seasonGoals + b.seasonAssists - (a.seasonGoals + a.seasonAssists) ||
        b.overall - a.overall
    )[0];
  }, [playersWithApps]);

  // Goalkeeper of the Season
  const bestGk = useMemo(() => {
    const gks = userSquad.filter((p) => p.roleCategory === "GK");
    return [...gks].sort((a, b) => b.seasonAppearances - a.seasonAppearances || b.overall - a.overall)[0];
  }, [userSquad]);

  // Iron Man (Most appearances)
  const ironMan = useMemo(() => {
    return [...userSquad].sort((a, b) => b.seasonAppearances - a.seasonAppearances || b.overall - a.overall)[0];
  }, [userSquad]);

  // Team of the Season (Club Best XI)
  const bestXI = useMemo(() => {
    const gks = userSquad.filter((p) => p.roleCategory === "GK").sort((a, b) => b.seasonAvgRating - a.seasonAvgRating);
    const defs = userSquad.filter((p) => p.roleCategory === "DEF").sort((a, b) => b.seasonAvgRating - a.seasonAvgRating);
    const mids = userSquad.filter((p) => p.roleCategory === "MID").sort((a, b) => b.seasonAvgRating - a.seasonAvgRating);
    const atts = userSquad.filter((p) => p.roleCategory === "ATT").sort((a, b) => b.seasonAvgRating - a.seasonAvgRating);

    const xi: Player[] = [];
    if (gks[0]) xi.push(gks[0]);
    defs.slice(0, 4).forEach((p) => xi.push(p));
    mids.slice(0, 3).forEach((p) => xi.push(p));
    atts.slice(0, 3).forEach((p) => xi.push(p));

    return xi;
  }, [userSquad]);

  // Objective Status & Badge
  const isChampion = userRank === 1;
  const isUcl = userRank >= 2 && userRank <= 4;
  const isUel = userRank === 5 || userRank === 6;
  const isConference = userRank === 7;
  const isRelegated = userRank >= Math.max(1, totalClubs - 2);

  const verdict = isChampion
    ? { title: "CAMPEÃO INGLÊS!", tone: "gold", text: "Temporada histórica! Conquistou o título mais cobiçado com maestria." }
    : isUcl
    ? { title: "Vaga na UEFA Champions League", tone: "blue", text: "Excelente campanha no G4! O clube disputará a elite do futebol europeu." }
    : isUel
    ? { title: "Vaga na UEFA Europa League", tone: "orange", text: "Ótimo campeonato! O clube carimbou o passaporte para competições continentais." }
    : isConference
    ? { title: "Vaga na Conference League", tone: "emerald", text: "Campanha competitiva concluída na zona de qualificação europeia." }
    : isRelegated
    ? { title: "Rebaixamento Amargo", tone: "red", text: "Campanha abaixo do esperado. O clube precisará se reestruturar para voltar à divisão principal." }
    : { title: "Manutenção Assegurada", tone: "slate", text: "Temporada de solidez e cumprimento dos objetivos na primeira metade da tabela." };

  // Financial totals
  const totalGateRevenue = stadiumConfig?.totalGateRevenueEur ?? (userStanding ? userStanding.won * 2_400_000 : 38_000_000);
  const totalFaCupPrize = faCupProgress?.prizeMoney ?? 0;
  const leaguePrizeEur = Math.round(Math.max(5_000_000, (21 - userRank) * 4_800_000));
  const estimatedRevenue = totalGateRevenue + totalFaCupPrize + leaguePrizeEur;

  return (
    <div className="space-y-6">
      {/* Hero Banner: Season Summary & Verdict */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 md:p-8">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-slate-950 p-2 border border-slate-800">
              <ClubBadge club={userClub} size="lg" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 text-xs font-black uppercase tracking-wider">
                  Temporada {activeSeason} Concluída
                </span>
                <span className="text-xs text-slate-400">
                  {userClub.division ?? "Premier League"} • 38 Rodadas Disputadas
                </span>
              </div>
              <h1 className="mt-1 font-h1 text-3xl md:text-4xl text-white tracking-wide">
                Relatório de Desempenho: {userClub.name}
              </h1>
              <p className="mt-1 text-sm text-slate-300 max-w-2xl">{verdict.text}</p>
            </div>
          </div>

          {/* Big Position Badge */}
          <div className="flex items-center gap-3 shrink-0 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Classificação Final</div>
              <div
                className={`text-4xl font-black ${
                  isChampion
                    ? "text-amber-400"
                    : isUcl
                    ? "text-sky-300"
                    : isRelegated
                    ? "text-rose-400"
                    : "text-emerald-400"
                }`}
              >
                {userRank}º Lugar
              </div>
              <div className="mt-0.5 text-xs font-bold text-slate-300">
                {userStanding ? `${userStanding.points} Pontos` : "-"}
              </div>
            </div>
            {isChampion ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40">
                <Trophy className="h-6 w-6" />
              </div>
            ) : isUcl ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40">
                <Star className="h-6 w-6" />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40">
                <Award className="h-6 w-6" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Campaign Numbers Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: "Jogos", val: userStanding?.played ?? 38, sub: "Rodadas" },
          { label: "Vitórias", val: userStanding?.won ?? 0, sub: `${Math.round(((userStanding?.won ?? 0) / 38) * 100)}% de vitórias`, highlight: "text-emerald-400" },
          { label: "Empates", val: userStanding?.drawn ?? 0, sub: "Jogos iguais" },
          { label: "Derrotas", val: userStanding?.lost ?? 0, sub: `${Math.round(((userStanding?.lost ?? 0) / 38) * 100)}% de derrotas`, highlight: userStanding && userStanding.lost > 15 ? "text-rose-400" : "text-white" },
          { label: "Gols Marcados", val: userStanding?.goalsFor ?? 0, sub: `${((userStanding?.goalsFor ?? 0) / 38).toFixed(1)} por jogo`, highlight: "text-sky-300" },
          { label: "Gols Sofridos", val: userStanding?.goalsAgainst ?? 0, sub: `${((userStanding?.goalsAgainst ?? 0) / 38).toFixed(1)} por jogo` },
          {
            label: "Saldo de Gols",
            val: (userStanding?.goalDifference ?? 0) > 0 ? `+${userStanding?.goalDifference}` : userStanding?.goalDifference ?? 0,
            sub: `${cleanSheetsCount} clean sheets`,
            highlight: (userStanding?.goalDifference ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
          },
        ].map((item, idx) => (
          <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900 p-3.5 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</div>
            <div className={`mt-0.5 text-2xl font-black ${item.highlight ?? "text-white"}`}>{item.val}</div>
            <div className="mt-0.5 text-[10px] text-slate-400 truncate">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* 2-Column: Individual Season Awards & Home vs Away Breakdown */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Player Awards & Highlights (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-h2 text-xl text-white flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                Premiações Individuais da Temporada
              </h2>
              <span className="text-xs text-slate-400">Votação do Clube</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* MVP */}
              {mvp && (
                <button
                  onClick={() => onSelectPlayer(mvp)}
                  className="flex items-center gap-3 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3.5 text-left transition hover:bg-amber-400/15"
                >
                  <div className="relative">
                    <PlayerAvatar name={mvp.name} imageUrl={mvp.imageUrl} size="sm" accentColor={userClub.primaryColor} />
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-black text-[10px]">
                      ★
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                      Craque da Temporada (MVP)
                    </span>
                    <div className="truncate text-sm font-black text-white">{mvp.name}</div>
                    <div className="text-xs text-amber-200">
                      Nota Média: <strong>{mvp.seasonAvgRating.toFixed(2)}</strong> • {mvp.seasonAppearances} jogos
                    </div>
                  </div>
                </button>
              )}

              {/* Golden Boot */}
              {topScorer && (
                <button
                  onClick={() => onSelectPlayer(topScorer)}
                  className="flex items-center gap-3 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3.5 text-left transition hover:bg-emerald-500/15"
                >
                  <div className="relative">
                    <PlayerAvatar name={topScorer.name} imageUrl={topScorer.imageUrl} size="sm" accentColor={userClub.primaryColor} />
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-slate-950 font-black text-[10px]">
                      ⚽
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                      Artilheiro (Chuteira de Ouro)
                    </span>
                    <div className="truncate text-sm font-black text-white">{topScorer.name}</div>
                    <div className="text-xs text-emerald-200">
                      <strong>{topScorer.seasonGoals} gols</strong> em {topScorer.seasonAppearances} jogos
                    </div>
                  </div>
                </button>
              )}

              {/* Playmaker (Top Assists) */}
              {topAssister && (
                <button
                  onClick={() => onSelectPlayer(topAssister)}
                  className="flex items-center gap-3 rounded-xl border border-sky-500/50 bg-sky-500/10 p-3.5 text-left transition hover:bg-sky-500/15"
                >
                  <div className="relative">
                    <PlayerAvatar name={topAssister.name} imageUrl={topAssister.imageUrl} size="sm" accentColor={userClub.primaryColor} />
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-400 text-slate-950 font-black text-[10px]">
                      👟
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
                      Líder em Assistências (Garçom)
                    </span>
                    <div className="truncate text-sm font-black text-white">{topAssister.name}</div>
                    <div className="text-xs text-sky-200">
                      <strong>{topAssister.seasonAssists} assistências</strong>
                    </div>
                  </div>
                </button>
              )}

              {/* Best Youngster */}
              {bestYoungster && (
                <button
                  onClick={() => onSelectPlayer(bestYoungster)}
                  className="flex items-center gap-3 rounded-xl border border-purple-500/50 bg-purple-500/10 p-3.5 text-left transition hover:bg-purple-500/15"
                >
                  <div className="relative">
                    <PlayerAvatar name={bestYoungster.name} imageUrl={bestYoungster.imageUrl} size="sm" accentColor={userClub.primaryColor} />
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-purple-400 text-slate-950 font-black text-[10px]">
                      ⚡
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">
                      Revelação do Ano (Sub-23)
                    </span>
                    <div className="truncate text-sm font-black text-white">{bestYoungster.name}</div>
                    <div className="text-xs text-purple-200">
                      {bestYoungster.age} anos • Nota: {bestYoungster.seasonAvgRating.toFixed(2)}
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Iron Man & Wall Strip */}
            <div className="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
              {ironMan && (
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <Shield className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Mais Jogos (Homem de Ferro)</div>
                    <div className="text-xs font-black text-white truncate">{ironMan.name} ({ironMan.seasonAppearances} jogos)</div>
                  </div>
                </div>
              )}
              {bestGk && (
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <Award className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Goleiro da Temporada</div>
                    <div className="text-xs font-black text-white truncate">{bestGk.name} ({cleanSheetsCount} clean sheets)</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* XI Ideal do Clube na Temporada */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-h2 text-xl text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                Time Ideal da Temporada (Melhor XI)
              </h2>
              <span className="text-xs text-slate-400">{bestXI.length} Atletas em Destaque</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {bestXI.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPlayer(p)}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-left transition hover:border-emerald-500/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-8 rounded px-1 py-0.5 text-center text-[9px] font-bold ${getRoleBadgeClass(p.roleCategory)}`}>
                      {p.primaryPosition}
                    </span>
                    <PlayerAvatar name={p.name} imageUrl={p.imageUrl} size="xs" accentColor={userClub.primaryColor} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-white">{p.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {p.seasonAppearances}J • {p.seasonGoals}G {p.seasonAssists}A
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-amber-300">★ {p.seasonAvgRating.toFixed(1)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Campaign Records & Cup & Financials (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Home vs Away Balance */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-h2 text-xl text-white mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-sky-400" />
              Desempenho: Casa vs Fora
            </h2>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="text-white flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                    Em Casa ({userClub.stadium})
                  </span>
                  <span className="text-emerald-400 font-black">{homeWins * 3 + homeDraws} Pts</span>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>{homeWins}V - {homeDraws}E - {homeLosses}D</span>
                  <span className="text-slate-400">{homeGf} GP / {homeGa} GC ({homeGf - homeGa >= 0 ? `+${homeGf - homeGa}` : homeGf - homeGa})</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="text-white flex items-center gap-1.5">
                    <ArrowUpRight className="h-3.5 w-3.5 text-sky-400" />
                    Fora de Casa
                  </span>
                  <span className="text-sky-300 font-black">{awayWins * 3 + awayDraws} Pts</span>
                </div>
                <div className="flex justify-between text-xs text-slate-300">
                  <span>{awayWins}V - {awayDraws}E - {awayLosses}D</span>
                  <span className="text-slate-400">{awayGf} GP / {awayGa} GC ({awayGf - awayGa >= 0 ? `+${awayGf - awayGa}` : awayGf - awayGa})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Season Highs & Records */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-h2 text-xl text-white mb-3 flex items-center gap-2">
              <Flame className="h-5 w-5 text-rose-400" />
              Recordes da Campanha
            </h2>

            <div className="space-y-2.5 text-xs">
              {biggestWin && (
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400">Maior Goleada</span>
                    <div className="font-bold text-white">
                      vs {biggestWin.oppClub?.name} ({biggestWin.userGoals} x {biggestWin.oppGoals})
                    </div>
                  </div>
                  <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-slate-950">
                    Rodada {biggestWin.matchweek}
                  </span>
                </div>
              )}

              {highestScoringMatch && (
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Jogo Mais Eletrizante</span>
                    <div className="font-bold text-white">
                      vs {highestScoringMatch.oppClub?.name} ({highestScoringMatch.userGoals} x {highestScoringMatch.oppGoals})
                    </div>
                  </div>
                  <span className="text-slate-400 text-[11px] font-bold">
                    {highestScoringMatch.userGoals + highestScoringMatch.oppGoals} gols
                  </span>
                </div>
              )}

              {heaviestDefeat && (
                <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-rose-400">Derrota Mais Dura</span>
                    <div className="font-bold text-white">
                      vs {heaviestDefeat.oppClub?.name} ({heaviestDefeat.userGoals} x {heaviestDefeat.oppGoals})
                    </div>
                  </div>
                  <span className="rounded bg-rose-500/30 px-2 py-0.5 text-[10px] font-black text-rose-200">
                    Rodada {heaviestDefeat.matchweek}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Sequência de Vitórias</div>
                  <div className="mt-0.5 text-xl font-black text-emerald-400">{longestWinStreak} jogos</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Sequência Invicta</div>
                  <div className="mt-0.5 text-xl font-black text-sky-300">{longestUnbeatenStreak} jogos</div>
                </div>
              </div>
            </div>
          </div>

          {/* FA Cup Performance Card */}
          {faCupProgress && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="font-h2 text-xl text-white mb-2 flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-400" />
                Copa da Inglaterra (Emirates FA Cup)
              </h2>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Fase Alcançada</div>
                  <div className="text-base font-black text-white">
                    {faCupProgress.wonCup ? "🏆 CAMPEÃO DA FA CUP!" : faCupProgress.highestRound}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Premiação Acumulada</div>
                  <div className="text-sm font-black text-emerald-400">+{formatMoney(faCupProgress.prizeMoney)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Financial Balance Summary */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-h2 text-xl text-white mb-3 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              Balanço Financeiro da Temporada
            </h2>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Receita Estimada de Bilheteria</span>
                <span className="font-bold text-white">{formatMoney(totalGateRevenue)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Premiação da Liga ({userRank}º Lugar)</span>
                <span className="font-bold text-emerald-400">+{formatMoney(leaguePrizeEur)}</span>
              </div>
              {totalFaCupPrize > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Premiações da Copa</span>
                  <span className="font-bold text-emerald-400">+{formatMoney(totalFaCupPrize)}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-slate-800 text-emerald-300 font-bold">
                <span>Receita Total Acumulada</span>
                <span>+{formatMoney(estimatedRevenue)}</span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-black">
                <span className="text-slate-200">Orçamento Atual para Reforços</span>
                <span className="text-emerald-300">{formatMoney(userClub.transferBudgetEur)}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={onNavigateToMarket}
                className="flex-1 rounded-lg bg-emerald-500 py-2.5 text-center text-xs font-black text-slate-950 transition hover:bg-emerald-400"
              >
                Abrir Mercado de Transferências →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Advance to Next Season Banner */}
      {onAdvanceToNextSeason && (
        <div className="rounded-2xl border-2 border-emerald-500/60 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-sky-950/70 p-6 flex flex-col md:flex-row items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Virada de Temporada
              </span>
              <span className="text-xs text-slate-400">
                Temporada {seasonNumber ? seasonNumber + 1 : 2}
              </span>
            </div>
            <h3 className="mt-2 text-2xl font-black text-white">
              Pronto para a Temporada {nextSeasonName}?
            </h3>
            <p className="mt-1 text-xs text-slate-300 max-w-xl">
              Ao avançar, o jogo efetiva as promoções e rebaixamentos da liga, credita as premiações e verbas de TV no seu caixa, desenvolve e envelhece os atletas, e sorteia as novas 38 rodadas com a reabertura do mercado de transferências.
            </p>
          </div>
          <button
            onClick={onAdvanceToNextSeason}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300 active:scale-95 shadow-md shadow-emerald-500/20"
          >
            <Sparkles className="h-4 w-4" /> Iniciar Temporada {nextSeasonName} →
          </button>
        </div>
      )}

      {/* Trophy Cabinet & Season History */}
      {seasonHistory && seasonHistory.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-h2 text-xl text-white mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            Galeria de Conquistas & Histórico de Temporadas ({seasonHistory.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {seasonHistory.map((hist, idx) => (
              <div
                key={`${hist.season}-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-300 uppercase tracking-wide">
                    Temporada {hist.season}
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    {hist.division}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-black text-white">
                    {hist.position === 1 ? "🏆 Campeão" : `${hist.position}º Lugar`}
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    {hist.points} pts ({hist.won}V-{hist.drawn}E-{hist.lost}D)
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 space-y-0.5">
                  <div>
                    Campeão da Liga: <span className="font-bold text-slate-200">{hist.championClubName}</span>
                  </div>
                  {hist.faCupChampionName && (
                    <div>
                      Copa da Inglaterra: <span className="font-bold text-amber-300">{hist.faCupChampionName}</span>
                    </div>
                  )}
                  {hist.clubMvpName && (
                    <div>
                      Craque do Clube: <span className="font-bold text-slate-200">{hist.clubMvpName}</span>
                    </div>
                  )}
                  {hist.clubTopScorerName && (
                    <div>
                      Artilheiro do Clube: <span className="font-bold text-slate-200">{hist.clubTopScorerName}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Navigation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="text-xs text-slate-400">
          Você pode rever este dashboard a qualquer momento ou planejar a próxima temporada no Mercado de Transferências.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToLeague}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white"
          >
            Ver Tabela Final da Liga
          </button>
          <button
            onClick={onNavigateToCalendar}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white"
          >
            Ver Calendário
          </button>
        </div>
      </div>
    </div>
  );
};
