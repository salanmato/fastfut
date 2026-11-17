import type { Fixture } from "../types/game";

export const SUMMER_WINDOW_START = "2026-08-01";
export const SUMMER_WINDOW_END = "2026-09-01";
export const WINTER_WINDOW_START = "2027-01-01";
export const WINTER_WINDOW_END = "2027-02-02";
export const POST_SEASON_WINDOW_START = "2027-06-01";

export type TransferWindowPhaseId =
  | "summer_open"
  | "autumn_closed"
  | "winter_open"
  | "spring_closed"
  | "post_season_open";

export interface TransferWindowStatus {
  isOpen: boolean;
  isNaturallyOpen: boolean;
  isDeadlineDay: boolean;
  phaseId: TransferWindowPhaseId;
  windowName: string;
  badgeText: string;
  headline: string;
  detailText: string;
  daysRemaining: number;
  nextChangeDate: string;
  progressPct: number;
}

export interface SeasonMonth {
  year: number;
  month: number; // 1..12
  key: string; // "YYYY-MM"
  label: string;
  shortLabel: string;
}

export const SEASON_MONTHS: SeasonMonth[] = [
  { year: 2026, month: 8, key: "2026-08", label: "Agosto 2026", shortLabel: "Ago 26" },
  { year: 2026, month: 9, key: "2026-09", label: "Setembro 2026", shortLabel: "Set 26" },
  { year: 2026, month: 10, key: "2026-10", label: "Outubro 2026", shortLabel: "Out 26" },
  { year: 2026, month: 11, key: "2026-11", label: "Novembro 2026", shortLabel: "Nov 26" },
  { year: 2026, month: 12, key: "2026-12", label: "Dezembro 2026", shortLabel: "Dez 26" },
  { year: 2027, month: 1, key: "2027-01", label: "Janeiro 2027", shortLabel: "Jan 27" },
  { year: 2027, month: 2, key: "2027-02", label: "Fevereiro 2027", shortLabel: "Fev 27" },
  { year: 2027, month: 3, key: "2027-03", label: "Março 2027", shortLabel: "Mar 27" },
  { year: 2027, month: 4, key: "2027-04", label: "Abril 2027", shortLabel: "Abr 27" },
  { year: 2027, month: 5, key: "2027-05", label: "Maio 2027", shortLabel: "Mai 27" },
  { year: 2027, month: 6, key: "2027-06", label: "Junho 2027", shortLabel: "Jun 27" },
];

const MONTHS_SHORT_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const MONTHS_LONG_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAYS_LONG_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function parseIsoUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y || 2026, (m || 8) - 1, d || 1));
}

function toIsoUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const dt = parseIsoUtc(isoDate);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIsoUtc(dt);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const a = parseIsoUtc(fromIso).getTime();
  const b = parseIsoUtc(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function formatDatePtBr(isoDate: string): string {
  const dt = parseIsoUtc(isoDate);
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const m = MONTHS_SHORT_PT[dt.getUTCMonth()] ?? "Jan";
  const y = dt.getUTCFullYear();
  return `${d} ${m} ${y}`;
}

export function formatDateLongPtBr(isoDate: string): string {
  const dt = parseIsoUtc(isoDate);
  const weekday = WEEKDAYS_LONG_PT[dt.getUTCDay()] ?? "";
  const d = dt.getUTCDate();
  const m = MONTHS_LONG_PT[dt.getUTCMonth()] ?? "";
  const y = dt.getUTCFullYear();
  return `${weekday}, ${d} de ${m} de ${y}`;
}

export function formatDateShortPtBr(isoDate: string): string {
  const dt = parseIsoUtc(isoDate);
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const y = dt.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

export function isDateInTransferWindow(isoDate: string, seasonFinished = false): boolean {
  if (seasonFinished || isoDate >= POST_SEASON_WINDOW_START) return true;
  if (isoDate >= SUMMER_WINDOW_START && isoDate <= SUMMER_WINDOW_END) return true;
  if (isoDate >= WINTER_WINDOW_START && isoDate <= WINTER_WINDOW_END) return true;
  return false;
}

export function isDeadlineDayDate(isoDate: string): boolean {
  return isoDate === SUMMER_WINDOW_END || isoDate === WINTER_WINDOW_END;
}

export function getNextMatchFixture(
  fixtures: Fixture[],
  currentMatchweek: number,
  userClubId: number
): Fixture | undefined {
  return fixtures.find(
    (f) =>
      f.matchweek === currentMatchweek &&
      !f.played &&
      (f.homeClubId === userClubId || f.awayClubId === userClubId)
  );
}

export function getDefaultDateForMatchweek(
  fixtures: Fixture[],
  matchweek: number,
  seasonFinished: boolean,
  userClubId?: number
): string {
  if (seasonFinished) return POST_SEASON_WINDOW_START;
  if (matchweek <= 1) return "2026-08-15";
  if (matchweek === 3) return SUMMER_WINDOW_END;
  if (matchweek === 19) return WINTER_WINDOW_START;
  if (matchweek === 24) return WINTER_WINDOW_END;

  const prevDates = fixtures
    .filter((f) => f.matchweek === matchweek - 1)
    .map((f) => f.date)
    .sort();
  const currUserFx = userClubId
    ? fixtures.find(
        (f) =>
          f.matchweek === matchweek &&
          (f.homeClubId === userClubId || f.awayClubId === userClubId)
      )
    : fixtures.find((f) => f.matchweek === matchweek);

  const prevLastDate = prevDates[prevDates.length - 1];
  if (prevLastDate) {
    const candidate = addDaysIso(prevLastDate, 1);
    if (currUserFx && candidate > currUserFx.date) {
      return currUserFx.date;
    }
    return candidate;
  }

  if (currUserFx) {
    return addDaysIso(currUserFx.date, -2);
  }
  return "2026-08-15";
}

function clampPct(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

export function getTransferWindowStatus(
  currentDate: string,
  seasonFinished: boolean,
  allowOutsideWindow = false
): TransferWindowStatus {
  const isDeadlineDay = !seasonFinished && isDeadlineDayDate(currentDate);

  if (seasonFinished || currentDate >= POST_SEASON_WINDOW_START) {
    return {
      isOpen: true,
      isNaturallyOpen: true,
      isDeadlineDay: false,
      phaseId: "post_season_open",
      windowName: "Janela Pós-Temporada",
      badgeText: "Mercado Aberto",
      headline: "Janela de Pós-Temporada Aberta",
      detailText: "Temporada encerrada — livre para reformular o elenco",
      daysRemaining: 0,
      nextChangeDate: POST_SEASON_WINDOW_START,
      progressPct: 100,
    };
  }

  if (currentDate >= SUMMER_WINDOW_START && currentDate <= SUMMER_WINDOW_END) {
    const daysRemaining = Math.max(0, diffDaysIso(currentDate, SUMMER_WINDOW_END));
    const totalDays = Math.max(1, diffDaysIso(SUMMER_WINDOW_START, SUMMER_WINDOW_END));
    const elapsed = totalDays - daysRemaining;
    const isLastDay = daysRemaining === 0;
    return {
      isOpen: true,
      isNaturallyOpen: true,
      isDeadlineDay: isLastDay,
      phaseId: "summer_open",
      windowName: "Janela de Verão",
      badgeText: isLastDay
        ? "Deadline Day"
        : `Mercado Aberto (${daysRemaining}d)`,
      headline: isLastDay
        ? "DEADLINE DAY! Último dia da Janela de Verão"
        : "Janela de Verão Aberta",
      detailText: isLastDay
        ? `Fecha hoje (${formatDateShortPtBr(SUMMER_WINDOW_END)}) antes da Rodada 3`
        : `Fecha em ${formatDateShortPtBr(SUMMER_WINDOW_END)} (faltam ${daysRemaining} dia${
            daysRemaining === 1 ? "" : "s"
          })`,
      daysRemaining,
      nextChangeDate: SUMMER_WINDOW_END,
      progressPct: clampPct((elapsed / totalDays) * 100),
    };
  }

  if (currentDate > SUMMER_WINDOW_END && currentDate < WINTER_WINDOW_START) {
    const daysRemaining = Math.max(1, diffDaysIso(currentDate, WINTER_WINDOW_START));
    const totalGap = Math.max(1, diffDaysIso("2026-09-02", WINTER_WINDOW_START));
    const elapsed = totalGap - daysRemaining;
    return {
      isOpen: allowOutsideWindow,
      isNaturallyOpen: false,
      isDeadlineDay: false,
      phaseId: "autumn_closed",
      windowName: "Mercado Fechado",
      badgeText: allowOutsideWindow
        ? "Modo Livre (Sandbox)"
        : `Mercado Fechado (${daysRemaining}d)`,
      headline: allowOutsideWindow
        ? "Janela de Verão encerrada (Modo Livre ativo)"
        : "Mercado de Transferências Fechado",
      detailText: `Reabre em ${formatDateShortPtBr(
        WINTER_WINDOW_START
      )} (faltam ${daysRemaining} dia${daysRemaining === 1 ? "" : "s"} • Rodada 19)`,
      daysRemaining,
      nextChangeDate: WINTER_WINDOW_START,
      progressPct: clampPct((elapsed / totalGap) * 100),
    };
  }

  if (currentDate >= WINTER_WINDOW_START && currentDate <= WINTER_WINDOW_END) {
    const daysRemaining = Math.max(0, diffDaysIso(currentDate, WINTER_WINDOW_END));
    const totalDays = Math.max(1, diffDaysIso(WINTER_WINDOW_START, WINTER_WINDOW_END));
    const elapsed = totalDays - daysRemaining;
    const isLastDay = daysRemaining === 0;
    return {
      isOpen: true,
      isNaturallyOpen: true,
      isDeadlineDay: isLastDay,
      phaseId: "winter_open",
      windowName: "Janela de Inverno",
      badgeText: isLastDay
        ? "Deadline Day"
        : `Janela Inverno (${daysRemaining}d)`,
      headline: isLastDay
        ? "DEADLINE DAY! Último dia da Janela de Inverno"
        : "Janela de Inverno Aberta",
      detailText: isLastDay
        ? `Fecha hoje (${formatDateShortPtBr(WINTER_WINDOW_END)}) antes da Rodada 24`
        : `Fecha em ${formatDateShortPtBr(WINTER_WINDOW_END)} (faltam ${daysRemaining} dia${
            daysRemaining === 1 ? "" : "s"
          })`,
      daysRemaining,
      nextChangeDate: WINTER_WINDOW_END,
      progressPct: clampPct((elapsed / totalDays) * 100),
    };
  }

  // Spring closed (2027-02-03 .. 2027-05-31)
  const daysRemaining = Math.max(1, diffDaysIso(currentDate, POST_SEASON_WINDOW_START));
  const totalGap = Math.max(1, diffDaysIso("2027-02-03", POST_SEASON_WINDOW_START));
  const elapsed = totalGap - daysRemaining;
  return {
    isOpen: allowOutsideWindow,
    isNaturallyOpen: false,
    isDeadlineDay,
    phaseId: "spring_closed",
    windowName: "Mercado Fechado",
    badgeText: allowOutsideWindow
      ? "Modo Livre (Sandbox)"
      : `Mercado Fechado (${daysRemaining}d)`,
    headline: allowOutsideWindow
      ? "Janela de Inverno encerrada (Modo Livre ativo)"
      : "Mercado Fechado até o Fim da Temporada",
    detailText: `Reabre em ${formatDateShortPtBr(
      POST_SEASON_WINDOW_START
    )} (faltam ${daysRemaining} dia${daysRemaining === 1 ? "" : "s"} • Pós-Temporada)`,
    daysRemaining,
    nextChangeDate: POST_SEASON_WINDOW_START,
    progressPct: clampPct((elapsed / totalGap) * 100),
  };
}
