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
} from "lucide-react";
import type { Club, Fixture } from "../types/game";
import {
  POST_SEASON_WINDOW_START,
  SEASON_MONTHS,
  SUMMER_WINDOW_END,
  SUMMER_WINDOW_START,
  WINTER_WINDOW_END,
  WINTER_WINDOW_START,
  diffDaysIso,
  formatDateLongPtBr,
  formatDatePtBr,
  formatDateShortPtBr,
  getNextMatchFixture,
  isDateInTransferWindow,
  type TransferWindowStatus,
} from "../utils/calendar";
import { ClubBadge } from "./ClubBadge";

interface CalendarHubProps {
  userClub: Club;
  clubs: Club[];
  fixtures: Fixture[];
  currentMatchweek: number;
  seasonFinished: boolean;
  currentDate: string;
  windowStatus: TransferWindowStatus;
  onAdvanceDays: (days: number) => void;
  onAdvanceToMatchday: () => void;
  onOpenMarket: () => void;
  onStartMatchday: () => void;
}

const WEEKDAYS_HEADER = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export const CalendarHub: React.FC<CalendarHubProps> = ({
  userClub,
  clubs,
  fixtures,
  currentMatchweek,
  seasonFinished,
  currentDate,
  windowStatus,
  onAdvanceDays,
  onAdvanceToMatchday,
  onOpenMarket,
  onStartMatchday,
}) => {
  const initialMonthKey = useMemo(() => {
    const ym = currentDate.slice(0, 7);
    return SEASON_MONTHS.some((m) => m.key === ym) ? ym : "2026-08";
  }, [currentDate]);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(initialMonthKey);

  useEffect(() => {
    const ym = currentDate.slice(0, 7);
    if (SEASON_MONTHS.some((m) => m.key === ym)) {
      setSelectedMonthKey(ym);
    }
  }, [currentDate]);

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

  const selectedMonth =
    SEASON_MONTHS.find((m) => m.key === selectedMonthKey) ?? SEASON_MONTHS[0];

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

  const isOnOrAfterMatchDate =
    !seasonFinished && nextUserFixture ? currentDate >= nextUserFixture.date : false;
  const daysToNextMatch =
    !seasonFinished && nextUserFixture
      ? Math.max(0, diffDaysIso(currentDate, nextUserFixture.date))
      : 0;
  const nextOpponent = nextUserFixture
    ? clubMap.get(
        nextUserFixture.homeClubId === userClub.id
          ? nextUserFixture.awayClubId
          : nextUserFixture.homeClubId
      )
    : undefined;

  const canAdvanceOneDay =
    !seasonFinished && Boolean(nextUserFixture) && currentDate < nextUserFixture!.date;

  const windowCards = [
    {
      id: "summer",
      title: "Janela de Verão",
      period: `${formatDateShortPtBr(SUMMER_WINDOW_START)} – ${formatDateShortPtBr(
        SUMMER_WINDOW_END
      )}`,
      scope: "Pré-temporada e Rodadas 1–2 • Deadline Day 01/09",
      active: windowStatus.phaseId === "summer_open",
      passed: currentDate > SUMMER_WINDOW_END && !seasonFinished,
      badge:
        windowStatus.phaseId === "summer_open"
          ? windowStatus.isDeadlineDay
            ? "HOJE: DEADLINE DAY"
            : `ABERTA • ${windowStatus.daysRemaining}d restantes`
          : currentDate > SUMMER_WINDOW_END
          ? "ENCERRADA"
          : "PROGRAMADA",
    },
    {
      id: "winter",
      title: "Janela de Inverno",
      period: `${formatDateShortPtBr(WINTER_WINDOW_START)} – ${formatDateShortPtBr(
        WINTER_WINDOW_END
      )}`,
      scope: "Rodadas 19–23 • Deadline Day 02/02",
      active: windowStatus.phaseId === "winter_open",
      passed: currentDate > WINTER_WINDOW_END && !seasonFinished,
      badge:
        windowStatus.phaseId === "winter_open"
          ? windowStatus.isDeadlineDay
            ? "HOJE: DEADLINE DAY"
            : `ABERTA • ${windowStatus.daysRemaining}d restantes`
          : currentDate > WINTER_WINDOW_END
          ? "ENCERRADA"
          : `EM ${Math.max(1, diffDaysIso(currentDate, WINTER_WINDOW_START))}d`,
    },
    {
      id: "post",
      title: "Janela Pós-Temporada",
      period: `A partir de ${formatDateShortPtBr(POST_SEASON_WINDOW_START)}`,
      scope: "Após a Rodada 38 • Reformulação livre",
      active: windowStatus.phaseId === "post_season_open",
      passed: false,
      badge:
        windowStatus.phaseId === "post_season_open"
          ? "ABERTA"
          : `EM ${Math.max(1, diffDaysIso(currentDate, POST_SEASON_WINDOW_START))}d`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header: Current Date & Progression */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                <CalendarIcon className="h-3.5 w-3.5" /> Calendário 2026/27
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
              {nextUserFixture && nextOpponent && !seasonFinished && (
                <>
                  {" "}
                  • Próximo jogo:{" "}
                  <strong className="text-slate-200">
                    {nextUserFixture.homeClubId === userClub.id ? "vs" : "@"} {nextOpponent.name}
                  </strong>{" "}
                  em {formatDatePtBr(nextUserFixture.date)} (
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

                {isOnOrAfterMatchDate ? (
                  <button
                    onClick={onStartMatchday}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg transition hover:bg-amber-300"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" /> Ir para Dia de Jogo
                  </button>
                ) : (
                  <button
                    onClick={onAdvanceToMatchday}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg transition hover:bg-emerald-400"
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

      {/* Monthly Calendar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-black text-white">{selectedMonth.label}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40 ring-1 ring-emerald-400/60" />
                Mercado Aberto
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/40 ring-1 ring-amber-400" />
                Deadline Day
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                Data Atual ({formatDatePtBr(currentDate)})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {SEASON_MONTHS.map((m) => (
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
                  className="min-h-[82px] rounded-xl border border-slate-800/30 bg-slate-950/25"
                />
              );
            }

            const { iso, day } = cell;
            const isToday = iso === currentDate;
            const isPast = iso < currentDate;
            const windowOpenOnDay = isDateInTransferWindow(iso, false);
            const isSummerDeadline = iso === SUMMER_WINDOW_END;
            const isWinterDeadline = iso === WINTER_WINDOW_END;
            const isWinterOpen = iso === WINTER_WINDOW_START;
            const isSummerOpen = iso === SUMMER_WINDOW_START;
            const isPostOpen = iso === POST_SEASON_WINDOW_START;
            const fx = userFixtureByDate.get(iso);

            const isHome = fx ? fx.homeClubId === userClub.id : false;
            const opponent = fx
              ? clubMap.get(isHome ? fx.awayClubId : fx.homeClubId)
              : undefined;

            return (
              <div
                key={iso}
                className={`relative flex min-h-[86px] flex-col justify-between rounded-xl border p-2 transition ${
                  isToday
                    ? "border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/50"
                    : isSummerDeadline || isWinterDeadline
                    ? "border-amber-400/60 bg-amber-500/15"
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
                    <span className="rounded bg-amber-400 px-1 py-0.5 text-[9px] font-black text-slate-950">
                      🚨 Deadline
                    </span>
                  )}

                  {!isToday && (isSummerOpen || isWinterOpen || isPostOpen) && (
                    <span className="rounded bg-emerald-500 px-1 py-0.5 text-[9px] font-black text-slate-950">
                      🔓 Abre
                    </span>
                  )}
                </div>

                {fx && opponent ? (
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
                  windowOpenOnDay &&
                  !isSummerDeadline &&
                  !isWinterDeadline && (
                    <div className="text-[9px] font-semibold text-emerald-300/70">
                      Janela aberta
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
