import type { FifaWindow, Fixture } from "../types/game";

export const SUMMER_WINDOW_START = "2026-08-01";
export const SUMMER_WINDOW_END = "2026-09-01";
export const WINTER_WINDOW_START = "2027-01-01";
export const WINTER_WINDOW_END = "2027-02-02";
export const POST_SEASON_WINDOW_START = "2027-06-01";

export function getSeasonStartYear(dateOrSeason?: string): number {
  if (!dateOrSeason) return 2026;
  if (dateOrSeason.includes("/")) {
    const y = parseInt(dateOrSeason.split("/")[0], 10);
    return isNaN(y) ? 2026 : y;
  }
  const match = dateOrSeason.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    return month >= 7 ? year : year - 1;
  }
  return 2026;
}

export function getSeasonWindowDates(startYear: number) {
  return {
    summerStart: `${startYear}-08-01`,
    summerEnd: `${startYear}-09-01`,
    winterStart: `${startYear + 1}-01-01`,
    winterEnd: `${startYear + 1}-02-02`,
    postSeasonStart: `${startYear + 1}-06-01`,
    autumnGapStart: `${startYear}-09-02`,
    springGapStart: `${startYear + 1}-02-03`,
  };
}

export function getSeasonMonths(startYear: number): SeasonMonth[] {
  const months: SeasonMonth[] = [];
  const list = [
    { m: 8, label: "Agosto", short: "Ago", y: startYear },
    { m: 9, label: "Setembro", short: "Set", y: startYear },
    { m: 10, label: "Outubro", short: "Out", y: startYear },
    { m: 11, label: "Novembro", short: "Nov", y: startYear },
    { m: 12, label: "Dezembro", short: "Dez", y: startYear },
    { m: 1, label: "Janeiro", short: "Jan", y: startYear + 1 },
    { m: 2, label: "Fevereiro", short: "Fev", y: startYear + 1 },
    { m: 3, label: "Março", short: "Mar", y: startYear + 1 },
    { m: 4, label: "Abril", short: "Abr", y: startYear + 1 },
    { m: 5, label: "Maio", short: "Mai", y: startYear + 1 },
    { m: 6, label: "Junho", short: "Jun", y: startYear + 1 },
  ];
  for (const item of list) {
    const key = `${item.y}-${String(item.m).padStart(2, "0")}`;
    const yr2 = String(item.y).slice(-2);
    months.push({
      year: item.y,
      month: item.m,
      key,
      label: `${item.label} ${item.y}`,
      shortLabel: `${item.short} ${yr2}`,
    });
  }
  return months;
}

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
  const startYear = getSeasonStartYear(isoDate);
  const { summerStart, summerEnd, winterStart, winterEnd, postSeasonStart } =
    getSeasonWindowDates(startYear);
  if (seasonFinished || isoDate >= postSeasonStart) return true;
  if (isoDate >= summerStart && isoDate <= summerEnd) return true;
  if (isoDate >= winterStart && isoDate <= winterEnd) return true;
  return false;
}

export function isDeadlineDayDate(isoDate: string): boolean {
  const startYear = getSeasonStartYear(isoDate);
  const { summerEnd, winterEnd } = getSeasonWindowDates(startYear);
  return isoDate === summerEnd || isoDate === winterEnd;
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
  const firstFxDate = fixtures[0]?.date ?? "2026-08-15";
  const startYear = getSeasonStartYear(firstFxDate);
  const { postSeasonStart } = getSeasonWindowDates(startYear);

  if (seasonFinished) return postSeasonStart;
  if (matchweek <= 1) return firstFxDate;

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
  return firstFxDate;
}

function getMondayOnOrAfter(isoDate: string): string {
  const dt = parseIsoUtc(isoDate);
  const offset = (1 - dt.getUTCDay() + 7) % 7;
  return offset === 0 ? isoDate : addDaysIso(isoDate, offset);
}

function getSaturdayOnOrAfter(isoDate: string): string {
  const dt = parseIsoUtc(isoDate);
  const offset = (6 - dt.getUTCDay() + 7) % 7;
  return offset === 0 ? isoDate : addDaysIso(isoDate, offset);
}

function getSaturdayOnOrBefore(isoDate: string): string {
  const dt = parseIsoUtc(isoDate);
  const offset = (dt.getUTCDay() - 6 + 7) % 7;
  return offset === 0 ? isoDate : addDaysIso(isoDate, -offset);
}

export function getFifaWindows(startYear: number): FifaWindow[] {
  const specs: Array<{
    suffix: string;
    anchor: string;
    label: string;
    competition: string;
    processable: boolean;
  }> = [
    {
      suffix: "sep",
      anchor: `${startYear}-09-20`,
      label: "Data FIFA • Setembro",
      competition: "Eliminatórias / Nations League",
      processable: true,
    },
    {
      suffix: "oct",
      anchor: `${startYear}-10-04`,
      label: "Data FIFA • Outubro",
      competition: "Eliminatórias / Nations League",
      processable: true,
    },
    {
      suffix: "nov",
      anchor: `${startYear}-11-08`,
      label: "Data FIFA • Novembro",
      competition: "Eliminatórias / Nations League",
      processable: true,
    },
    {
      suffix: "mar",
      anchor: `${startYear + 1}-03-21`,
      label: "Data FIFA • Março",
      competition: "Amistosos & Eliminatórias",
      processable: true,
    },
    {
      suffix: "jun",
      anchor: `${startYear + 1}-06-01`,
      label: "Data FIFA • Junho",
      competition: "Amistosos (pós-temporada)",
      processable: false,
    },
  ];

  return specs.map((spec) => {
    const startDate = getMondayOnOrAfter(spec.anchor);
    const endDate = addDaysIso(startDate, 8);
    return {
      id: `${startYear}-${spec.suffix}`,
      label: spec.label,
      startDate,
      endDate,
      competition: spec.competition,
      processable: spec.processable,
    };
  });
}

export function isDateInFifaWindow(
  isoDate: string,
  windows: FifaWindow[]
): FifaWindow | undefined {
  return windows.find((w) => isoDate >= w.startDate && isoDate <= w.endDate);
}

export function buildLeagueMatchweekDates(
  startYear: number,
  count = 38
): string[] {
  const windows = getFifaWindows(startYear);
  const firstSat = getSaturdayOnOrAfter(`${startYear}-08-15`);
  const lastSat = getSaturdayOnOrBefore(`${startYear + 1}-05-31`);

  const saturdays: string[] = [];
  for (let cur = firstSat; cur <= lastSat; cur = addDaysIso(cur, 7)) {
    if (!isDateInFifaWindow(cur, windows)) {
      saturdays.push(cur);
    }
  }

  let dates = [...saturdays];
  if (dates.length > count) {
    dates = dates.slice(dates.length - count);
  } else if (dates.length < count) {
    const existing = new Set(dates);
    const preferredAnchors = [
      getSaturdayOnOrBefore(`${startYear}-12-31`),
      getSaturdayOnOrAfter(`${startYear}-12-01`),
      getSaturdayOnOrAfter(`${startYear + 1}-02-01`),
      getSaturdayOnOrAfter(`${startYear + 1}-04-01`),
    ];
    for (const sat of preferredAnchors) {
      if (dates.length >= count) break;
      const wed = addDaysIso(sat, -3);
      if (!existing.has(wed) && !isDateInFifaWindow(wed, windows)) {
        dates.push(wed);
        existing.add(wed);
      }
    }
    for (const sat of saturdays) {
      if (dates.length >= count) break;
      const wed = addDaysIso(sat, -3);
      if (
        wed >= `${startYear}-08-15` &&
        !existing.has(wed) &&
        !isDateInFifaWindow(wed, windows)
      ) {
        dates.push(wed);
        existing.add(wed);
      }
    }
    dates.sort();
  }

  return dates;
}

export function buildCupRoundDates(
  leagueDates: string[],
  windows: FifaWindow[],
  afterMatchweeks: number[] = [9, 15, 20, 26, 31, 35]
): string[] {
  const leagueSet = new Set(leagueDates);
  const usedCupDates = new Set<string>();
  const result: string[] = [];

  for (const mw of afterMatchweeks) {
    const prevDate = leagueDates[Math.min(mw - 1, leagueDates.length - 1)] ?? "2026-11-01";
    const nextDate = leagueDates[Math.min(mw, leagueDates.length - 1)];

    let candidate = addDaysIso(prevDate, 4); // Wednesday after MW
    if (
      isDateInFifaWindow(candidate, windows) ||
      (nextDate && candidate >= nextDate) ||
      leagueSet.has(candidate) ||
      usedCupDates.has(candidate)
    ) {
      candidate = nextDate ? addDaysIso(nextDate, -3) : addDaysIso(prevDate, 3);
    }

    while (
      isDateInFifaWindow(candidate, windows) ||
      leagueSet.has(candidate) ||
      usedCupDates.has(candidate)
    ) {
      candidate = addDaysIso(candidate, 1);
    }

    usedCupDates.add(candidate);
    result.push(candidate);
  }

  return result;
}

export function remapFixtureDates(
  fixtures: Fixture[],
  dates: string[]
): Fixture[] {
  return fixtures.map((fx) => {
    const targetDate = dates[fx.matchweek - 1];
    return targetDate ? { ...fx, date: targetDate } : { ...fx };
  });
}

function clampPct(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

export function getTransferWindowStatus(
  currentDate: string,
  seasonFinished: boolean,
  allowOutsideWindow = false
): TransferWindowStatus {
  const startYear = getSeasonStartYear(currentDate);
  const {
    summerStart,
    summerEnd,
    winterStart,
    winterEnd,
    postSeasonStart,
    autumnGapStart,
    springGapStart,
  } = getSeasonWindowDates(startYear);
  const isDeadlineDay = !seasonFinished && isDeadlineDayDate(currentDate);

  if (seasonFinished || currentDate >= postSeasonStart) {
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
      nextChangeDate: postSeasonStart,
      progressPct: 100,
    };
  }

  if (currentDate >= summerStart && currentDate <= summerEnd) {
    const daysRemaining = Math.max(0, diffDaysIso(currentDate, summerEnd));
    const totalDays = Math.max(1, diffDaysIso(summerStart, summerEnd));
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
        ? `Fecha hoje (${formatDateShortPtBr(summerEnd)}) antes da Rodada 3`
        : `Fecha em ${formatDateShortPtBr(summerEnd)} (faltam ${daysRemaining} dia${
            daysRemaining === 1 ? "" : "s"
          })`,
      daysRemaining,
      nextChangeDate: summerEnd,
      progressPct: clampPct((elapsed / totalDays) * 100),
    };
  }

  if (currentDate > summerEnd && currentDate < winterStart) {
    const daysRemaining = Math.max(1, diffDaysIso(currentDate, winterStart));
    const totalGap = Math.max(1, diffDaysIso(autumnGapStart, winterStart));
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
        winterStart
      )} (faltam ${daysRemaining} dia${daysRemaining === 1 ? "" : "s"} • Rodada 19)`,
      daysRemaining,
      nextChangeDate: winterStart,
      progressPct: clampPct((elapsed / totalGap) * 100),
    };
  }

  if (currentDate >= winterStart && currentDate <= winterEnd) {
    const daysRemaining = Math.max(0, diffDaysIso(currentDate, winterEnd));
    const totalDays = Math.max(1, diffDaysIso(winterStart, winterEnd));
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
        ? `Fecha hoje (${formatDateShortPtBr(winterEnd)}) antes da Rodada 24`
        : `Fecha em ${formatDateShortPtBr(winterEnd)} (faltam ${daysRemaining} dia${
            daysRemaining === 1 ? "" : "s"
          })`,
      daysRemaining,
      nextChangeDate: winterEnd,
      progressPct: clampPct((elapsed / totalDays) * 100),
    };
  }

  // Spring closed
  const daysRemaining = Math.max(1, diffDaysIso(currentDate, postSeasonStart));
  const totalGap = Math.max(1, diffDaysIso(springGapStart, postSeasonStart));
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
      postSeasonStart
    )} (faltam ${daysRemaining} dia${daysRemaining === 1 ? "" : "s"} • Pós-Temporada)`,
    daysRemaining,
    nextChangeDate: postSeasonStart,
    progressPct: clampPct((elapsed / totalGap) * 100),
  };
}
