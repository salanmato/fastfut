import React from "react";
import {
  Play,
  Trophy,
  Newspaper,
  TrendingUp,
  Tv,
  Calendar,
  MapPin,
  ShieldAlert,
  ArrowRight,
  HeartPulse,
  Lock,
  Unlock,
  Flame,
  BarChart3,
} from "lucide-react";
import type {
  Club,
  FACupState,
  Fixture,
  NewsItem,
  Player,
  Referee,
  StadiumConfig,
  StandingRow,
  Tactics,
} from "../types/game";
import type { TransferWindowStatus } from "../utils/calendar";
import { formatDateLongPtBr } from "../utils/calendar";
import { computeMatchStadiumMetrics, computeTeamPower } from "../engine/matchEngine";
import { formatMoney, formatWage, getOverallColor } from "../utils/format";
import { getClubVisuals } from "../utils/clubVisuals";
import { ClubBadge } from "./ClubBadge";
import { ClubKit } from "./ClubKit";
import { PlayerAvatar } from "./PlayerAvatar";

interface DashboardProps {
  userClub: Club;
  managerName: string;
  currentMatchweek: number;
  seasonFinished: boolean;
  currentSeason?: string;
  currentDate: string;
  windowStatus: TransferWindowStatus;
  faCup?: FACupState;
  clubs: Club[];
  players: Player[];
  fixtures: Fixture[];
  referees: Referee[];
  standings: StandingRow[];
  tacticsByClub: Record<number, Tactics>;
  stadiumByClub: Record<number, StadiumConfig>;
  userKitVariant?: "home" | "away";
  news: NewsItem[];
  onStartMatchday: () => void;
  onNavigate: (
    tab:
      | "tactics"
      | "league"
      | "market"
      | "stadium"
      | "calendar"
      | "facup"
      | "season_review"
      | "squad_analysis"
  ) => void;
  onSelectPlayer: (player: Player) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  userClub,
  managerName,
  currentMatchweek,
  seasonFinished,
  currentSeason = "2026/27",
  currentDate,
  windowStatus,
  faCup,
  clubs,
  players,
  fixtures,
  referees,
  standings,
  tacticsByClub,
  stadiumByClub,
  userKitVariant = "home",
  news,
  onStartMatchday,
  onNavigate,
  onSelectPlayer,
}) => {
  const userDivision = userClub.division ?? "Premier League";
  const currentCupRound = faCup ? faCup.rounds[faCup.currentRoundIndex] : undefined;
  const clubMap = new Map(clubs.map((c) => [c.id, c]));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const userStanding = standings.find((s) => s.club.id === userClub.id);
  const champion = standings[0];

  const nextFixture = fixtures.find(
    (f) =>
      f.matchweek === currentMatchweek &&
      !f.played &&
      (f.homeClubId === userClub.id || f.awayClubId === userClub.id)
  );

  const homeClub = nextFixture ? clubMap.get(nextFixture.homeClubId) : undefined;
  const awayClub = nextFixture ? clubMap.get(nextFixture.awayClubId) : undefined;
  const referee = nextFixture
    ? referees.find((r) => r.id === nextFixture.refereeId)
    : undefined;

  const getStarters = (clubId: number) =>
    (tacticsByClub[clubId]?.starters ?? [])
      .map((id) => playerMap.get(id))
      .filter((p): p is Player => Boolean(p));

  const nextStadiumMetrics =
    homeClub && awayClub
      ? computeMatchStadiumMetrics(homeClub, awayClub, stadiumByClub[homeClub.id])
      : null;

  const homePower =
    homeClub && awayClub
      ? computeTeamPower(
          getStarters(homeClub.id),
          tacticsByClub[homeClub.id],
          true,
          homeClub.capacity,
          0,
          undefined,
          stadiumByClub[homeClub.id],
          nextStadiumMetrics?.attendance
        )
      : null;
  const awayPower =
    homeClub && awayClub
      ? computeTeamPower(
          getStarters(awayClub.id),
          tacticsByClub[awayClub.id],
          false,
          homeClub.capacity
        )
      : null;

  const userSquad = players
    .filter((p) => p.clubId === userClub.id)
    .sort((a, b) => b.overall - a.overall);
  const weeklyWageTotal = userSquad.reduce((s, p) => s + p.wageEur, 0);
  const topClubScorer = [...userSquad].sort(
    (a, b) => b.seasonGoals - a.seasonGoals || b.overall - a.overall
  )[0];
  const topClubAssister = [...userSquad].sort(
    (a, b) => b.seasonAssists - a.seasonAssists || b.overall - a.overall
  )[0];
  const injuredSquad = userSquad.filter((p) => (p.injuryMatchesLeft ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Calendar & Transfer Window Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-black text-white">
              {formatDateLongPtBr(currentDate)}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span
                className={`inline-flex items-center gap-1 font-bold ${
                  windowStatus.isDeadlineDay
                    ? "text-amber-300"
                    : windowStatus.isOpen
                    ? "text-emerald-400"
                    : "text-rose-300"
                }`}
              >
                {windowStatus.isDeadlineDay ? (
                  <Flame className="h-3 w-3" />
                ) : windowStatus.isOpen ? (
                  <Unlock className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                {windowStatus.headline}
              </span>
              <span>•</span>
              <span>{windowStatus.detailText}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {faCup && (
            <button
              onClick={() => onNavigate("facup")}
              className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
            >
              🏆 FA Cup{currentCupRound ? ` (${currentCupRound.shortName})` : ""}
            </button>
          )}
          <button
            onClick={() => onNavigate("calendar")}
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-sky-500/50 hover:text-white"
          >
            Abrir Calendário
          </button>
          <button
            onClick={() => onNavigate("market")}
            className={`rounded-xl px-3.5 py-2 text-xs font-black transition ${
              windowStatus.isOpen
                ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                : "border border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
            }`}
          >
            {windowStatus.isOpen ? "Ir ao Mercado" : "Observar Alvos"}
          </button>
        </div>
      </div>

      {/* Top Banner: Next Match or Season Complete */}
      {seasonFinished ? (
        <div className="rounded-2xl border border-slate-800 border-l-4 border-l-amber-400 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Trophy className="h-8 w-8" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Temporada {currentSeason} Encerrada
                </div>
                <h2 className="text-2xl font-black text-white">
                  {champion?.club.id === userClub.id
                    ? `CAMPEÃO DA ${userDivision.toUpperCase()}! Parabéns, ${managerName}!`
                    : `${champion?.club.name} conquistou o título • Você terminou em ${userStanding?.position}º lugar`}
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  Campanha do {userClub.name}: {userStanding?.points} pts ({userStanding?.won}V-
                  {userStanding?.drawn}E-{userStanding?.lost}D) • Saldo{" "}
                  {userStanding && userStanding.goalDifference >= 0
                    ? `+${userStanding.goalDifference}`
                    : userStanding?.goalDifference}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigate("season_review")}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300"
              >
                <Trophy className="h-4 w-4 fill-current" /> Dashboard da Temporada <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => onNavigate("league")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
              >
                Ver Classificação
              </button>
            </div>
          </div>
        </div>
      ) : (
        nextFixture &&
        homeClub &&
        awayClub &&
        homePower &&
        awayPower && (
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {getClubVisuals(homeClub).stadiumImageUrl && (
              <img
                src={getClubVisuals(homeClub).stadiumImageUrl}
                alt={homeClub.stadium}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-slate-950/80" />

            <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950/60 px-5 py-3 text-xs text-slate-300">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-md bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-300">
                  Rodada {currentMatchweek} de 38
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> {nextFixture.date} •{" "}
                  {nextFixture.kickoffTimeUk} (UK)
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" /> {homeClub.stadium} (
                  {nextStadiumMetrics
                    ? `${nextStadiumMetrics.attendance.toLocaleString("pt-BR")} esp.`
                    : homeClub.capacity.toLocaleString("pt-BR")}
                  )
                </span>
                {nextStadiumMetrics && homeClub.id === userClub.id && (
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                    Bilheteria Est.: {formatMoney(nextStadiumMetrics.gateRevenueEur)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-slate-300">
                  <Tv className="h-3.5 w-3.5 text-sky-400" /> {nextFixture.tvBroadcaster}
                </span>
                {referee && (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Árb: {referee.name} (
                    {referee.avgCardsPerGame} cartões/j)
                  </span>
                )}
              </div>
            </div>

            <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center">
              {/* Matchup */}
              <div className="flex items-center justify-between gap-4 lg:col-span-7">
                <div className="flex flex-1 flex-col items-center text-center sm:flex-row sm:text-left sm:gap-3">
                  <ClubBadge club={homeClub} size="lg" />
                  <div className="hidden sm:block">
                    <ClubKit
                      club={homeClub}
                      variant={homeClub.id === userClub.id ? userKitVariant : "home"}
                      size="sm"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Mandante
                    </div>
                    <h2 className="text-xl text-white sm:text-2xl">
                      {homeClub.name}
                    </h2>
                    <div className="text-xs text-slate-400">
                      {standings.find((s) => s.club.id === homeClub.id)?.position}º • OVR{" "}
                      {homePower.overall}
                    </div>
                  </div>
                </div>

                <div className="px-2 text-center">
                  <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 py-1.5 text-xs font-black tracking-widest text-slate-300">
                    VS
                  </div>
                </div>

                <div className="flex flex-1 flex-col-reverse items-center text-center sm:flex-row sm:justify-end sm:text-right sm:gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Visitante
                    </div>
                    <h2 className="text-xl text-white sm:text-2xl">
                      {awayClub.name}
                    </h2>
                    <div className="text-xs text-slate-400">
                      {standings.find((s) => s.club.id === awayClub.id)?.position}º • OVR{" "}
                      {awayPower.overall}
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <ClubKit
                      club={awayClub}
                      variant={awayClub.id === userClub.id ? userKitVariant : "away"}
                      size="sm"
                    />
                  </div>
                  <ClubBadge club={awayClub} size="lg" />
                </div>
              </div>

              {/* Sector Comparison & CTA */}
              <div className="space-y-3 lg:col-span-5 lg:border-l lg:border-slate-800 lg:pl-6">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    ["ATA", homePower.attack, awayPower.attack],
                    ["MEI", homePower.midfield, awayPower.midfield],
                    ["DEF", homePower.defense, awayPower.defense],
                  ].map(([label, hVal, aVal]) => (
                    <div
                      key={label as string}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-2 py-2"
                    >
                      <div className="text-[10px] font-bold text-slate-500">{label}</div>
                      <div className="mt-0.5 flex items-center justify-center gap-1.5 font-bold">
                        <span
                          className={
                            (hVal as number) >= (aVal as number)
                              ? "text-emerald-400"
                              : "text-slate-300"
                          }
                        >
                          {hVal}
                        </span>
                        <span className="text-slate-600">/</span>
                        <span
                          className={
                            (aVal as number) > (hVal as number)
                              ? "text-emerald-400"
                              : "text-slate-300"
                          }
                        >
                          {aVal}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => onNavigate("tactics")}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                  >
                    Ajustar Tática
                  </button>
                  <button
                    onClick={onStartMatchday}
                    className="flex-[1.6] inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
                  >
                    <Play className="h-4 w-4 fill-current" /> Jogar Rodada {currentMatchweek}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Mini Standings */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg text-white">
              <Trophy className="h-4 w-4 text-emerald-400" /> {userDivision} 26/27
            </h2>
            <button
              onClick={() => onNavigate("league")}
              className="text-xs font-semibold text-emerald-400 hover:underline"
            >
              Ver completa →
            </button>
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-12 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">
              <span className="col-span-1">#</span>
              <span className="col-span-6">Clube</span>
              <span className="col-span-1 text-center">J</span>
              <span className="col-span-2 text-center">SG</span>
              <span className="col-span-2 text-right">Pts</span>
            </div>
            {standings.slice(0, 10).map((row) => {
              const isUser = row.club.id === userClub.id;
              return (
                <div
                  key={row.club.id}
                  className={`grid grid-cols-12 items-center rounded-lg px-2 py-1.5 text-xs ${
                    isUser
                      ? "bg-emerald-500/15 font-bold text-emerald-300 ring-1 ring-emerald-500/30"
                      : "text-slate-300 hover:bg-slate-800/40"
                  }`}
                >
                  <span className="col-span-1 font-semibold text-slate-400">
                    {row.position}
                  </span>
                  <div className="col-span-6 flex items-center gap-2 truncate">
                    <ClubBadge club={row.club} size="sm" />
                    <span className="truncate">{row.club.name}</span>
                  </div>
                  <span className="col-span-1 text-center text-slate-400">{row.played}</span>
                  <span className="col-span-2 text-center text-slate-400">
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </span>
                  <span className="col-span-2 text-right font-black text-white">
                    {row.points}
                  </span>
                </div>
              );
            })}
            {userStanding && userStanding.position > 10 && (
              <>
                <div className="py-1 text-center text-[10px] text-slate-600">• • •</div>
                <div className="grid grid-cols-12 items-center rounded-lg bg-emerald-500/15 px-2 py-1.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                  <span className="col-span-1">{userStanding.position}</span>
                  <div className="col-span-6 flex items-center gap-2 truncate">
                    <ClubBadge club={userStanding.club} size="sm" />
                    <span className="truncate">{userStanding.club.name}</span>
                  </div>
                  <span className="col-span-1 text-center">{userStanding.played}</span>
                  <span className="col-span-2 text-center">
                    {userStanding.goalDifference > 0
                      ? `+${userStanding.goalDifference}`
                      : userStanding.goalDifference}
                  </span>
                  <span className="col-span-2 text-right font-black text-white">
                    {userStanding.points}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Middle: Club Overview & Finances */}
        <div className="space-y-6 lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs text-slate-400">Posição Atual</div>
              <div className="mt-1 text-2xl font-black text-white">
                {userStanding?.position ?? "-"}º
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {userStanding?.points ?? 0} pts ({userStanding?.won ?? 0}V{" "}
                {userStanding?.drawn ?? 0}E {userStanding?.lost ?? 0}D)
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs text-slate-400">Caixa do Clube</div>
              <div className="mt-1 text-2xl font-black text-emerald-400">
                {formatMoney(userClub.transferBudgetEur)}
              </div>
              <button
                onClick={() => onNavigate("market")}
                className="mt-1 text-xs font-semibold text-emerald-300 hover:underline"
              >
                Ir ao Mercado →
              </button>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs text-slate-400">Folha ({userSquad.length} atletas)</div>
              <div className="mt-1 text-2xl font-black text-sky-400">
                {formatWage(weeklyWageTotal)}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Teto: {formatWage(userClub.wageBudgetWeeklyEur)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="truncate text-xs text-slate-400">{userClub.stadium}</div>
              <div className="mt-1 text-xl font-black text-amber-300">
                {userClub.capacity.toLocaleString("pt-BR")}
              </div>
              <button
                onClick={() => onNavigate("stadium")}
                className="mt-1 text-xs font-semibold text-amber-300 hover:underline"
              >
                Gerir Estádio →
              </button>
            </div>
          </div>

          {/* Key Players */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg text-white font-bold">
                <TrendingUp className="h-4 w-4 text-sky-400" /> Destaques do Elenco
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onNavigate("squad_analysis")}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 transition hover:underline"
                >
                  <BarChart3 className="h-3.5 w-3.5" /> Análise de Desempenho →
                </button>
                <button
                  onClick={() => onNavigate("tactics")}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition hover:underline"
                >
                  Gerenciar elenco →
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {userSquad.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPlayer(p)}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition hover:border-slate-700 hover:bg-slate-950"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar
                      name={p.name}
                      imageUrl={p.imageUrl}
                      accentColor={userClub.primaryColor}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">{p.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <span className="font-semibold text-slate-300">{p.primaryPosition}</span>
                        <span>•</span>
                        <span>{p.seasonGoals}G {p.seasonAssists}A</span>
                        <span>•</span>
                        <span
                          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[10px] font-black ${
                            p.seasonAppearances > 0
                              ? p.seasonAvgRating >= 7.5
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : p.seasonAvgRating >= 7.0
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                                : p.seasonAvgRating >= 6.5
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          ⭐ {p.seasonAppearances > 0 ? p.seasonAvgRating.toFixed(1) : "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-xs font-black ${getOverallColor(
                      p.overall
                    )}`}
                  >
                    {p.overall}
                  </span>
                </button>
              ))}
            </div>
            {((topClubScorer && topClubScorer.seasonGoals > 0) ||
              (topClubAssister && topClubAssister.seasonAssists > 0)) && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {topClubScorer && topClubScorer.seasonGoals > 0 && (
                  <button
                    onClick={() => onSelectPlayer(topClubScorer)}
                    className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-left text-xs text-emerald-200 transition hover:bg-emerald-500/15"
                  >
                    <span className="truncate">
                      ⚽ Artilheiro: <strong className="text-white">{topClubScorer.name}</strong>
                    </span>
                    <span className="shrink-0 font-black text-emerald-300">
                      {topClubScorer.seasonGoals} {topClubScorer.seasonGoals === 1 ? "gol" : "gols"}
                    </span>
                  </button>
                )}
                {topClubAssister && topClubAssister.seasonAssists > 0 && (
                  <button
                    onClick={() => onSelectPlayer(topClubAssister)}
                    className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2 text-left text-xs text-sky-200 transition hover:bg-sky-500/15"
                  >
                    <span className="truncate">
                      👟 Assistências: <strong className="text-white">{topClubAssister.name}</strong>
                    </span>
                    <span className="shrink-0 font-black text-sky-300">
                      {topClubAssister.seasonAssists} {topClubAssister.seasonAssists === 1 ? "assist." : "assist."}
                    </span>
                  </button>
                )}
              </div>
            )}
            {injuredSquad.length > 0 && (
              <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
                <div className="mb-1.5 flex items-center gap-1.5 font-bold text-rose-300">
                  <HeartPulse className="h-3.5 w-3.5" /> Departamento Médico ({injuredSquad.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {injuredSquad.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onSelectPlayer(p)}
                      className="rounded-lg border border-rose-500/30 bg-slate-950/70 px-2.5 py-1 text-[11px] text-rose-200 hover:border-rose-400"
                    >
                      <strong className="text-white">{p.name}</strong> ({p.injuryType} •{" "}
                      {p.injuryMatchesLeft} rod.)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* News Feed */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg text-white">
              <Newspaper className="h-4 w-4 text-amber-400" /> Central de Notícias da Liga
            </h2>
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {news.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{item.title}</span>
                    <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                      Rod. {item.matchweek}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
