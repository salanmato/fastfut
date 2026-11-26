import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  FastForward,
  Lock,
  Unlock,
  Flame,
  Play,
  ShoppingBag,
  ChevronRight,
  Clock,
  Trophy,
  Flag,
} from "lucide-react";
import type {
  Club,
  FACupRound,
  FACupState,
  FifaWindow,
  Fixture,
  InternationalBreakReport,
} from "../types/game";
import {
  diffDaysIso,
  formatDateLongPtBr,
  formatDatePtBr,
  formatDateShortPtBr,
  getNextMatchFixture,
  getSeasonMonths,
  getSeasonStartYear,
  getSeasonWindowDates,
  isDateInFifaWindow,
  isDateInTransferWindow,
  type TransferWindowStatus,
} from "../utils/calendar";
import { getPendingCupRound } from "../engine/faCup";
import { ClubBadge } from "./ClubBadge";

interface CalendarHubProps {
  userClub: Club;
  clubs: Club[];
  fixtures: Fixture[];
  currentMatchweek: number;
  seasonFinished: boolean;
  currentSeason?: string;
  currentDate: string;
  windowStatus: TransferWindowStatus;
  faCup?: FACupState;
  cupShortName?: string;
  fifaWindows: FifaWindow[];
  internationalBreaks?: InternationalBreakReport[];
  projectedUserCallupsCount: number;
  onAdvanceDays: (days: number) => void;
  onAdvanceToMatchday: () => void;
  onOpenMarket: () => void;
  onOpenCup: () => void;
  onOpenNationalTeams?: () => void;
  onStartMatchday: () => void;
}

const WEEKDAYS_HEADER = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export const CalendarHub: React.FC<CalendarHubProps> = ({
  userClub,
  clubs,
  fixtures,
  currentMatchweek,
  seasonFinished,
  currentSeason = "2026/27",
  currentDate,
  windowStatus,
  faCup,
  cupShortName = "Copa",
  fifaWindows,
  internationalBreaks = [],
  projectedUserCallupsCount,
  onAdvanceDays,
  onAdvanceToMatchday,
  onOpenMarket,
  onOpenCup,
  onOpenNationalTeams,
  onStartMatchday,
}) => {
  const seasonStartYear = useMemo(
    () => getSeasonStartYear(currentSeason || currentDate),
    [currentSeason, currentDate]
  );
  const seasonMonths = useMemo(() => getSeasonMonths(seasonStartYear), [seasonStartYear]);
  const windowDates = useMemo(() => getSeasonWindowDates(seasonStartYear), [seasonStartYear]);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const ym = currentDate.slice(0, 7);
    return seasonMonths.some((m) => m.key === ym) ? ym : seasonMonths[0]?.key ?? "2026-08";
  });

  useEffect(() => {
    const ym = currentDate.slice(0, 7);
    if (seasonMonths.some((m) => m.key === ym)) {
      setSelectedMonthKey(ym);
    }
  }, [currentDate, seasonMonths]);

  const clubMap = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  const nextUserFixture = useMemo(
    () => getNextMatchFixture(fixtures, currentMatchweek, userClub.id),
    [fixtures, currentMatchweek, userClub.id]
  );

  const userFixtureByDate = useMemo(() => {
    const map = new Map<string, Fixture>();
    for (const fx of fixtures) {
      if (fx.homeClubId === userClub.id || fx.awayClubId === userClub.id) {
        map.set(fx.date, fx);
      }
    }
    return map;
  }, [fixtures, userClub.id]);

  const cupRoundByDate = useMemo(() => {
    const map = new Map<string, FACupRound>();
    for (const r of faCup?.rounds ?? []) {
      map.set(r.date, r);
    }
    return map;
  }, [faCup]);

  const breakReportByWindowId = useMemo(
    () => new Map(internationalBreaks.map((b) => [b.windowId, b])),
    [internationalBreaks]
  );

  const pendingCupRound = useMemo(() => getPendingCupRound(faCup), [faCup]);
  const nextUserCupTie = useMemo(() => {
    if (!pendingCupRound) return undefined;
    const tie = pendingCupRound.ties.find(
      (t) => !t.played && (t.homeClubId === userClub.id || t.awayClubId === userClub.id)
    );
    if (!tie) return undefined;
    const oppId = tie.homeClubId === userClub.id ? tie.awayClubId : tie.homeClubId;
    return {
      round: pendingCupRound,
      tie,
      isHome: tie.homeClubId === userClub.id,
      opponent: clubMap.get(oppId),
    };
  }, [pendingCupRound, userClub.id, clubMap]);

  // Earliest competitive event for the user (Cup or League)
  const isCupFirst =
    Boolean(nextUserCupTie) &&
    (!nextUserFixture || nextUserCupTie!.round.date <= nextUserFixture.date);
  const nextEventDate = isCupFirst
    ? nextUserCupTie!.round.date
    : nextUserFixture?.date;

  const isOnOrAfterEventDate =
    !seasonFinished && nextEventDate ? currentDate >= nextEventDate : false;
  const daysToNextMatch =
    !seasonFinished && nextEventDate
      ? Math.max(0, diffDaysIso(currentDate, nextEventDate))
      : 0;
  const nextOpponent = isCupFirst
    ? nextUserCupTie!.opponent
    : nextUserFixture
    ? clubMap.get(
        nextUserFixture.homeClubId === userClub.id
          ? nextUserFixture.awayClubId
          : nextUserFixture.homeClubId
      )
    : undefined;

  const canAdvanceOneDay =
    !seasonFinished && Boolean(nextEventDate) && currentDate < nextEventDate!;

  const selectedMonth =
    seasonMonths.find((m) => m.key === selectedMonthKey) ?? seasonMonths[0];

  const calendarCells = useMemo(() => {
    const { year, month } = selectedMonth;
    const firstUtc = new Date(Date.UTC(year, month - 1, 1));
    const leadingEmpty = (firstUtc.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const cells: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < leadingEmpty; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ iso, day: d });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [selectedMonth]);

  // Unified Agenda: next 8 chronological commitments across League, Cup, FIFA & Windows
  const upcomingAgenda = useMemo(() => {
    const events: Array<{
      id: string;
      date: string;
      kind: "league" | "cup" | "fifa" | "window";
      title: string;
      subtitle: string;
      onClick?: () => void;
    }> = [];

    for (const fx of fixtures) {
      if (fx.played) continue;
      if (fx.homeClubId !== userClub.id && fx.awayClubId !== userClub.id) continue;
      if (fx.date < currentDate) continue;
      const isHome = fx.homeClubId === userClub.id;
      const opp = clubMap.get(isHome ? fx.awayClubId : fx.homeClubId);
      events.push({
        id: `lg-${fx.id}`,
        date: fx.date,
        kind: "league",
        title: `Liga • Rodada ${fx.matchweek}`,
        subtitle: `${isHome ? "vs" : "@"} ${opp?.name ?? "Adversário"} (${isHome ? "Casa" : "Fora"})`,
      });
    }

    for (const r of faCup?.rounds ?? []) {
      if (r.completed || r.date < currentDate) continue;
      const tie = r.ties.find(
        (t) => t.homeClubId === userClub.id || t.awayClubId === userClub.id
      );
      const opp = tie
        ? clubMap.get(tie.homeClubId === userClub.id ? tie.awayClubId : tie.homeClubId)
        : undefined;
      events.push({
        id: `cup-${r.index}`,
        date: r.date,
        kind: "cup",
        title: `${cupShortName} • ${r.shortName}`,
        subtitle: tie
          ? `${tie.homeClubId === userClub.id ? "vs" : "@"} ${opp?.name ?? "Adversário"}`
          : `${r.ties.length > 0 ? `${r.ties.length} confrontos` : "Fase eliminatória"}`,
        onClick: onOpenCup,
      });
    }

    for (const w of fifaWindows) {
      if (w.endDate < currentDate) continue;
      const rep = breakReportByWindowId.get(w.id);
      events.push({
        id: `fifa-${w.id}`,
        date: w.startDate,
        kind: "fifa",
        title: w.label,
        subtitle: `${formatDateShortPtBr(w.startDate)}–${formatDateShortPtBr(w.endDate)} • ${
          rep
            ? `${rep.userCallups.length} convocados`
            : w.processable
            ? `Previsão: ${projectedUserCallupsCount} convocados`
            : w.competition
        }`,
        onClick: onOpenNationalTeams,
      });
    }

    const windowMilestones = [
      { id: "sum-dl", date: windowDates.summerEnd, title: "Deadline Day (Verão)", subtitle: "Encerramento da janela de verão" },
      { id: "win-op", date: windowDates.winterStart, title: "Abertura Janela de Inverno", subtitle: "Mercado reabre para reforços" },
      { id: "win-dl", date: windowDates.winterEnd, title: "Deadline Day (Inverno)", subtitle: "Encerramento da janela de inverno" },
      { id: "post-op", date: windowDates.postSeasonStart, title: "Janela Pós-Temporada", subtitle: "Abertura de reformulação do elenco" },
    ];
    for (const wm of windowMilestones) {
      if (wm.date >= currentDate) {
        events.push({
          id: wm.id,
          date: wm.date,
          kind: "window",
          title: wm.title,
          subtitle: wm.subtitle,
          onClick: onOpenMarket,
        });
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    return events.slice(0, 8);
  }, [
    fixtures,
    userClub.id,
    currentDate,
    clubMap,
    faCup,
    cupShortName,
    fifaWindows,
    breakReportByWindowId,
    projectedUserCallupsCount,
    windowDates,
    onOpenCup,
    onOpenNationalTeams,
    onOpenMarket,
  ]);

  const windowCards = [
    {
      id: "summer",
      title: "Janela de Verão",
      period: `${formatDateShortPtBr(windowDates.summerStart)} – ${formatDateShortPtBr(
        windowDates.summerEnd
      )}`,
      scope: `Pré-temporada e início da liga • Deadline Day ${formatDateShortPtBr(windowDates.summerEnd)}`,
      active: windowStatus.phaseId === "summer_open",
      passed: currentDate > windowDates.summerEnd && !seasonFinished,
      badge:
        windowStatus.phaseId === "summer_open"
          ? windowStatus.isDeadlineDay
            ? "HOJE: DEADLINE DAY"
            : `ABERTA • ${windowStatus.daysRemaining}d restantes`
          : currentDate > windowDates.summerEnd
          ? "ENCERRADA"
          : "PROGRAMADA",
    },
    {
      id: "winter",
      title: "Janela de Inverno",
      period: `${formatDateShortPtBr(windowDates.winterStart)} – ${formatDateShortPtBr(
        windowDates.winterEnd
      )}`,
      scope: `Meio de temporada • Deadline Day ${formatDateShortPtBr(windowDates.winterEnd)}`,
      active: windowStatus.phaseId === "winter_open",
      passed: currentDate > windowDates.winterEnd && !seasonFinished,
      badge:
        windowStatus.phaseId === "winter_open"
          ? windowStatus.isDeadlineDay
            ? "HOJE: DEADLINE DAY"
            : `ABERTA • ${windowStatus.daysRemaining}d restantes`
          : currentDate > windowDates.winterEnd
          ? "ENCERRADA"
          : `EM ${Math.max(1, diffDaysIso(currentDate, windowDates.winterStart))}d`,
    },
    {
      id: "post",
      title: "Janela Pós-Temporada",
      period: `A partir de ${formatDateShortPtBr(windowDates.postSeasonStart)}`,
      scope: "Após a Rodada 38 • Reformulação livre",
      active: windowStatus.phaseId === "post_season_open",
      passed: false,
      badge:
        windowStatus.phaseId === "post_season_open"
          ? "ABERTA"
          : `EM ${Math.max(1, diffDaysIso(currentDate, windowDates.postSeasonStart))}d`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header: Current Date & Progression */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                <CalendarIcon className="h-3.5 w-3.5" /> Calendário Unificado {currentSeason}
              </span>
              <span className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-200">
                {seasonFinished ? "Temporada Concluída" : `Rodada ${currentMatchweek} de 38`}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-black ${
                  windowStatus.isDeadlineDay
                    ? "border-amber-400/60 bg-amber-500/20 text-amber-300"
                    : windowStatus.isOpen
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                }`}
              >
                {windowStatus.isDeadlineDay ? (
                  <Flame className="h-3.5 w-3.5" />
                ) : windowStatus.isOpen ? (
                  <Unlock className="h-3.5 w-3.5" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                {windowStatus.headline}
              </span>
            </div>

            <h2 className="text-2xl font-black text-white">
              {formatDateLongPtBr(currentDate)}
            </h2>

            <p className="text-xs text-slate-400">
              {windowStatus.detailText}
              {nextEventDate && nextOpponent && !seasonFinished && (
                <>
                  {" "}
                  • Próximo compromisso ({isCupFirst ? `${cupShortName} • ${nextUserCupTie!.round.shortName}` : `Liga R${currentMatchweek}`}):{" "}
                  <strong className="text-slate-200">
                    {(isCupFirst ? nextUserCupTie!.isHome : nextUserFixture?.homeClubId === userClub.id)
                      ? "vs"
                      : "@"}{" "}
                    {nextOpponent.name}
                  </strong>{" "}
                  em {formatDatePtBr(nextEventDate)} (
                  {daysToNextMatch === 0
                    ? "Hoje!"
                    : `faltam ${daysToNextMatch} dia${daysToNextMatch === 1 ? "" : "s"}`}
                  )
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!seasonFinished && (
              <>
                <button
                  disabled={!canAdvanceOneDay}
                  onClick={() => onAdvanceDays(1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Clock className="h-3.5 w-3.5 text-sky-400" /> Avançar +1 Dia
                </button>

                {isOnOrAfterEventDate ? (
                  <button
                    onClick={isCupFirst ? onOpenCup : onStartMatchday}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-amber-300"
                  >
                    {isCupFirst ? (
                      <>
                        <Trophy className="h-3.5 w-3.5" /> Jogar {cupShortName}
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" /> Ir para Dia de Jogo
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={onAdvanceToMatchday}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-400"
                  >
                    <FastForward className="h-3.5 w-3.5" /> Avançar até o Jogo
                  </button>
                )}
              </>
            )}

            <button
              onClick={onOpenMarket}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <ShoppingBag className="h-3.5 w-3.5" /> Ir ao Mercado
            </button>
          </div>
        </div>
      </div>

      {/* Transfer Window Phases */}
      <div className="grid gap-4 md:grid-cols-3">
        {windowCards.map((card) => (
          <div
            key={card.id}
            className={`rounded-2xl border p-4 transition ${
              card.active
                ? windowStatus.isDeadlineDay
                  ? "border-amber-400/60 bg-amber-500/10"
                  : "border-emerald-500/50 bg-emerald-500/10"
                : card.passed
                ? "border-slate-800/80 bg-slate-900/45 opacity-70"
                : "border-slate-800 bg-slate-900/75"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black text-white">{card.title}</span>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                  card.active
                    ? windowStatus.isDeadlineDay
                      ? "bg-amber-400 text-slate-950"
                      : "bg-emerald-500 text-slate-950"
                    : card.passed
                    ? "bg-slate-800 text-slate-400"
                    : "bg-slate-800 text-sky-300"
                }`}
              >
                {card.badge}
              </span>
            </div>
            <div className="mt-1.5 text-xs font-bold text-slate-200">{card.period}</div>
            <div className="mt-1 text-[11px] text-slate-400">{card.scope}</div>

            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
              <span className="text-[11px] text-slate-400">
                {card.active
                  ? "Negociações liberadas agora"
                  : card.passed
                  ? "Período finalizado"
                  : "Planeje seus alvos com antecedência"}
              </span>
              <button
                onClick={onOpenMarket}
                className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-300 hover:underline"
              >
                Mercado <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Unified Next Commitments Agenda */}
      {upcomingAgenda.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Próximos Compromissos Unificados (Liga, Copa & Data FIFA)
            </h3>
            {onOpenNationalTeams && (
              <button
                onClick={onOpenNationalTeams}
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-300 hover:underline"
              >
                <Flag className="h-3 w-3" /> Ver Convocações das Seleções →
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingAgenda.map((ev) => {
              const badgeCls =
                ev.kind === "cup"
                  ? "border-amber-400/50 bg-amber-500/10 text-amber-300"
                  : ev.kind === "fifa"
                  ? "border-indigo-400/50 bg-indigo-500/10 text-indigo-300"
                  : ev.kind === "window"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-950/70 text-slate-200";
              return (
                <div
                  key={ev.id}
                  onClick={ev.onClick}
                  className={`rounded-xl border p-3 transition ${badgeCls} ${
                    ev.onClick ? "cursor-pointer hover:brightness-110" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] font-black uppercase">
                    <span>{ev.title}</span>
                    <span className="text-slate-400">{formatDateShortPtBr(ev.date)}</span>
                  </div>
                  <div className="mt-1 truncate text-xs font-bold text-white">
                    {ev.subtitle}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Calendar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-black text-white">{selectedMonth.label}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-700 ring-1 ring-white/20" />
                Liga
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/40 ring-1 ring-amber-400" />
                {cupShortName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500/40 ring-1 ring-indigo-400" />
                Data FIFA
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40 ring-1 ring-emerald-400/60" />
                Mercado Aberto
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                Data Atual ({formatDatePtBr(currentDate)})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {seasonMonths.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMonthKey(m.key)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                  selectedMonth.key === m.key
                    ? "bg-emerald-500 text-slate-950"
                    : m.key === currentDate.slice(0, 7)
                    ? "border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                    : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                {m.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Grid Header */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase text-slate-500 mb-1.5">
          {WEEKDAYS_HEADER.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Cells */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarCells.map((cell, idx) => {
            if (!cell) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[86px] rounded-xl border border-slate-800/30 bg-slate-950/25"
                />
              );
            }

            const { iso, day } = cell;
            const isToday = iso === currentDate;
            const isPast = iso < currentDate;
            const windowOpenOnDay = isDateInTransferWindow(iso, false);
            const isSummerDeadline = iso === windowDates.summerEnd;
            const isWinterDeadline = iso === windowDates.winterEnd;
            const isWinterOpen = iso === windowDates.winterStart;
            const isSummerOpen = iso === windowDates.summerStart;
            const isPostOpen = iso === windowDates.postSeasonStart;
            const fifaOnDay = isDateInFifaWindow(iso, fifaWindows);
            const isFifaStart = fifaOnDay?.startDate === iso;
            const fifaReport = fifaOnDay ? breakReportByWindowId.get(fifaOnDay.id) : undefined;

            const fx = userFixtureByDate.get(iso);
            const isHome = fx ? fx.homeClubId === userClub.id : false;
            const opponent = fx
              ? clubMap.get(isHome ? fx.awayClubId : fx.homeClubId)
              : undefined;

            const cupRoundOnDay = cupRoundByDate.get(iso);
            const userCupTie = cupRoundOnDay?.ties.find(
              (t) => t.homeClubId === userClub.id || t.awayClubId === userClub.id
            );
            const isCupHome = userCupTie ? userCupTie.homeClubId === userClub.id : false;
            const cupOpponent = userCupTie
              ? clubMap.get(isCupHome ? userCupTie.awayClubId : userCupTie.homeClubId)
              : undefined;

            return (
              <div
                key={iso}
                className={`relative flex min-h-[88px] flex-col justify-between rounded-xl border p-2 transition ${
                  isToday
                    ? "border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/50"
                    : isSummerDeadline || isWinterDeadline
                    ? "border-amber-400/60 bg-amber-500/15"
                    : userCupTie
                    ? "border-amber-400/55 bg-amber-500/10"
                    : fifaOnDay
                    ? "border-indigo-500/45 bg-indigo-500/15"
                    : windowOpenOnDay
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-slate-800/80 bg-slate-950/60"
                } ${isPast && !isToday ? "opacity-65" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`text-xs font-black ${
                      isToday
                        ? "text-sky-300"
                        : fifaOnDay
                        ? "text-indigo-200"
                        : windowOpenOnDay
                        ? "text-emerald-200"
                        : "text-slate-300"
                    }`}
                  >
                    {day}
                  </span>

                  {isToday && (
                    <span className="rounded bg-sky-400 px-1 py-0.5 text-[9px] font-black uppercase text-slate-950">
                      HOJE
                    </span>
                  )}

                  {!isToday && (isSummerDeadline || isWinterDeadline) && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-400 px-1 py-0.5 text-[9px] font-black text-slate-950">
                      <Flame className="h-2.5 w-2.5" />
                      <span>Deadline</span>
                    </span>
                  )}

                  {!isToday && (isSummerOpen || isWinterOpen || isPostOpen) && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500 px-1 py-0.5 text-[9px] font-black text-slate-950">
                      <Unlock className="h-2.5 w-2.5" />
                      <span>Abre</span>
                    </span>
                  )}
                </div>

                {isFifaStart && fifaOnDay && (
                  <button
                    type="button"
                    onClick={onOpenNationalTeams}
                    className="mt-1 rounded border border-indigo-400/40 bg-indigo-950/80 px-1.5 py-1 text-left transition hover:border-indigo-300"
                  >
                    <div className="text-[9px] font-black text-indigo-200">
                      🌍 Data FIFA
                    </div>
                    <div className="text-[9px] text-indigo-300/90">
                      {fifaReport
                        ? `Convocados: ${fifaReport.userCallups.length}`
                        : fifaOnDay.processable
                        ? `Previsão: ${projectedUserCallupsCount}`
                        : "Pós-temp."}
                    </div>
                  </button>
                )}

                {userCupTie && cupRoundOnDay && cupOpponent ? (
                  <button
                    type="button"
                    onClick={onOpenCup}
                    className="mt-1 rounded-lg border border-amber-400/50 bg-slate-900/95 p-1.5 text-left transition hover:border-amber-300"
                  >
                    <div className="mb-0.5 text-[8px] font-black uppercase text-amber-300 truncate">
                      🏆 {cupShortName} • {cupRoundOnDay.shortName}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <ClubBadge club={cupOpponent} size="sm" />
                        <span className="truncate text-[10px] font-black text-white">
                          {cupOpponent.shortName}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1 text-[9px] font-black ${
                          isCupHome
                            ? "bg-amber-400/20 text-amber-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {isCupHome ? "C" : "F"}
                      </span>
                    </div>
                    {userCupTie.played && (
                      <div className="mt-0.5 text-[9px] font-black text-white">
                        {userCupTie.homeGoals}–{userCupTie.awayGoals}
                        {userCupTie.homePenalties !== null &&
                          userCupTie.homePenalties !== undefined &&
                          ` (${userCupTie.homePenalties}–${userCupTie.awayPenalties} pên.)`}
                      </div>
                    )}
                  </button>
                ) : cupRoundOnDay ? (
                  <button
                    type="button"
                    onClick={onOpenCup}
                    className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-left text-[9px] font-bold text-amber-300 hover:border-amber-400"
                  >
                    🏆 {cupShortName} ({cupRoundOnDay.shortName})
                  </button>
                ) : fx && opponent ? (
                  <div className="mt-1 rounded-lg border border-white/10 bg-slate-900/90 p-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <ClubBadge club={opponent} size="sm" />
                        <span className="truncate text-[10px] font-black text-white">
                          {opponent.shortName}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1 text-[9px] font-black ${
                          isHome
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {isHome ? "C" : "F"}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-400">
                      <span>R{fx.matchweek}</span>
                      {fx.played ? (
                        <span className="font-black text-white">
                          {fx.homeGoals}–{fx.awayGoals}
                        </span>
                      ) : (
                        <span>{fx.kickoffTimeUk}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  !isFifaStart &&
                  (fifaOnDay ? (
                    <div className="text-[9px] font-semibold text-indigo-300/80">
                      Pausa FIFA
                    </div>
                  ) : (
                    windowOpenOnDay &&
                    !isSummerDeadline &&
                    !isWinterDeadline && (
                      <div className="text-[9px] font-semibold text-emerald-300/70">
                        Janela aberta
                      </div>
                    )
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
