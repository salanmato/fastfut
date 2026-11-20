import React, { useMemo, useState } from "react";
import { Search, Trophy, MapPin, Banknote, Users, Sparkles, ArrowLeft } from "lucide-react";
import type { Club, Player } from "../types/game";
import { formatMoney, getOverallColor } from "../utils/format";
import { getClubVisuals, getKitThemePalette } from "../utils/clubVisuals";
import { ClubBadge } from "./ClubBadge";
import { ClubKit } from "./ClubKit";

interface ClubSelectionProps {
  clubs: Club[];
  players: Player[];
  onSelectClub: (clubId: number, managerName: string, kitTheme: "home" | "away") => void;
  onBackToMenu?: () => void;
}

const LEAGUE_TABS: Array<{ id: string; label: string; flag: string }> = [
  { id: "ALL", label: "Todas as Ligas", flag: "🌍" },
  { id: "Premier League", label: "Premier League", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "LALIGA EA SPORTS", label: "LaLiga", flag: "🇪🇸" },
  { id: "Serie A Enilive", label: "Serie A", flag: "🇮🇹" },
  { id: "Bundesliga", label: "Bundesliga", flag: "🇩🇪" },
  { id: "Ligue 1 McDonald's", label: "Ligue 1", flag: "🇫🇷" },
  { id: "Brasileirão Série A", label: "Brasileirão", flag: "🇧🇷" },
  { id: "ROSHN Saudi League", label: "Saudi Pro", flag: "🇸🇦" },
  { id: "EFL Championship", label: "Championship", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "EFL League One", label: "League One", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "EFL League Two", label: "League Two", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "Liga Portugal", label: "Liga Portugal", flag: "🇵🇹" },
  { id: "Eredivisie", label: "Eredivisie", flag: "🇳🇱" },
  { id: "Major League Soccer", label: "MLS", flag: "🇺🇸" },
];

export const ClubSelection: React.FC<ClubSelectionProps> = ({
  clubs,
  players,
  onSelectClub,
  onBackToMenu,
}) => {
  const [managerName, setManagerName] = useState("Alan Matos");
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<number>(clubs[0]?.id ?? 1);
  const [previewKit, setPreviewKit] = useState<"home" | "away">("home");

  const sortedClubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...clubs]
      .filter((c) => {
        if (divisionFilter !== "ALL") {
          const l = c.league ?? c.division ?? "Premier League";
          if (l !== divisionFilter) return false;
        }
        return (
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q) ||
          (c.country ?? "").toLowerCase().includes(q) ||
          (c.manager ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1) || b.avgOverall - a.avgOverall);
  }, [clubs, search, divisionFilter]);

  const selectedClub = clubs.find((c) => c.id === selectedId) ?? clubs[0];
  const palette = selectedClub ? getKitThemePalette(selectedClub, previewKit) : null;

  const selectedSquad = useMemo(
    () =>
      players
        .filter((p) => p.clubId === selectedClub?.id)
        .sort((a, b) => b.overall - a.overall),
    [players, selectedClub]
  );

  return (
    <div
      className="club-theme-root min-h-screen text-slate-100"
      style={{ ...(palette?.pageBackgroundStyle ?? {}), ...(palette?.cssVars ?? {}) }}
    >
      {/* Top Hero */}
      <div
        className="border-b-2 border-slate-800"
        style={palette?.headerStyle}
      >
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {onBackToMenu && (
                  <button
                    onClick={onBackToMenu}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Menu Principal
                  </button>
                )}
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <Trophy className="h-3.5 w-3.5" /> Database Unificada • {clubs.length} Clubes • 13 Ligas • 10 Países
                </div>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Football Manager <span className="text-emerald-400">26/27</span>
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
                Escolha seu clube em qualquer uma das 13 ligas sincronizadas na database única (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Brasileirão, Saudi Pro, MLS e mais).
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Seu Nome de Técnico
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Nome do Manager"
                  className="mt-0.5 w-48 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-600"
                />
              </div>
              <button
                onClick={() =>
                  onSelectClub(selectedClub.id, managerName.trim() || "Manager", previewKit)
                }
                style={
                  palette
                    ? { backgroundColor: palette.accentPrimary, color: palette.accentText }
                    : undefined
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-black transition hover:brightness-110"
              >
                <Sparkles className="h-4 w-4" /> Assumir {selectedClub?.shortName}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        {/* Club List */}
        <div className="space-y-4 lg:col-span-7">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar clube ou cidade (ex: Arsenal, Wrexham, Leicester...)"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition focus:border-emerald-500/60"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {LEAGUE_TABS.map((tab) => {
              const count =
                tab.id === "ALL"
                  ? clubs.length
                  : clubs.filter(
                      (c) => (c.league ?? c.division ?? "Premier League") === tab.id
                    ).length;
              if (tab.id !== "ALL" && count === 0) return null;
              return (
                <button
                  key={tab.id}
                  onClick={() => setDivisionFilter(tab.id)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    divisionFilter === tab.id
                      ? "bg-emerald-500 text-slate-950"
                      : "border border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <span>{tab.flag}</span>
                  <span>{tab.label}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {sortedClubs.map((club) => {
              const isSelected = club.id === selectedClub?.id;
              return (
                <button
                  key={club.id}
                  onClick={() => setSelectedId(club.id)}
                  className={`group flex items-center justify-between gap-3 rounded-lg border p-3.5 text-left transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/15"
                      : "border-slate-800 bg-slate-900 hover:border-slate-700"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ClubBadge club={club} size="md" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">{club.name}</div>
                      <div className="truncate text-xs text-slate-400">
                        {club.stadium} • {formatMoney(club.transferBudgetEur)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-xs font-black ${getOverallColor(
                        Math.round(club.avgOverall)
                      )}`}
                    >
                      {club.avgOverall}
                    </span>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {club.country ? `${club.country} • ` : ""}{club.league ?? club.division}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Club Inspector */}
        {selectedClub && (
          <div className="lg:col-span-5">
            <div className="sticky top-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              {/* Stadium Photo Hero Banner */}
              <div className="relative h-36 w-full overflow-hidden bg-slate-950">
                {getClubVisuals(selectedClub).stadiumImageUrl && (
                  <img
                    src={getClubVisuals(selectedClub).stadiumImageUrl}
                    alt={selectedClub.stadium}
                    className="h-full w-full object-cover opacity-55"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 border-t border-slate-800 bg-slate-950/90 px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <ClubBadge club={selectedClub} size="lg" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-xl font-black text-white">
                          {selectedClub.name}
                        </h2>
                        <span className="shrink-0 rounded bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300 border border-slate-700">
                          Est. {selectedClub.foundedYear}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-300">
                        {selectedClub.manager} ({selectedClub.managerNationality})
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-5">
                {/* Home & Away Kits Theme Selector */}
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Tema do Uniforme 26/27
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Clique na camisa para testar o tema
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPreviewKit("home")}
                      className={`rounded-xl px-2.5 py-1.5 transition ${
                        previewKit === "home"
                          ? "bg-white/10 ring-2 ring-white/60"
                          : "opacity-65 hover:opacity-100"
                      }`}
                    >
                      <ClubKit club={selectedClub} variant="home" size="md" label="Titular" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewKit("away")}
                      className={`rounded-xl px-2.5 py-1.5 transition ${
                        previewKit === "away"
                          ? "bg-white/10 ring-2 ring-white/60"
                          : "opacity-65 hover:opacity-100"
                      }`}
                    >
                      <ClubKit club={selectedClub} variant="away" size="md" label="Reserva" />
                    </button>
                  </div>
                </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Banknote className="h-3.5 w-3.5 text-emerald-400" /> Orçamento de Mercado
                  </div>
                  <div className="mt-1 text-lg font-bold text-emerald-400">
                    {formatMoney(selectedClub.transferBudgetEur)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <MapPin className="h-3.5 w-3.5 text-sky-400" /> Estádio
                  </div>
                  <div className="mt-1 truncate text-sm font-bold text-white">
                    {selectedClub.stadium}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {selectedClub.capacity.toLocaleString("pt-BR")} lugares • {selectedClub.city}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5 text-xs leading-relaxed text-slate-300">
                <span className="font-bold text-emerald-400">Contexto 2025/26: </span>
                {selectedClub.previousSeasonContext}
              </div>

              <div>
                <div className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Principais Estrelas ({selectedSquad.length} atletas)
                  </span>
                  <span>Média Top 16: {selectedClub.avgOverall}</span>
                </div>
                <div className="space-y-2">
                  {selectedSquad.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 rounded bg-slate-800 py-0.5 text-center text-[10px] font-bold text-slate-300">
                          {p.primaryPosition}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-white">{p.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {p.age} anos • {formatMoney(p.marketValueEur)}
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
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() =>
                  onSelectClub(selectedClub.id, managerName.trim() || "Manager", previewKit)
                }
                style={
                  palette
                    ? { backgroundColor: palette.accentPrimary, color: palette.accentText }
                    : undefined
                }
                className="w-full rounded-lg py-3.5 text-sm font-black transition hover:brightness-110"
              >
                Iniciar Carreira no {selectedClub.name}
              </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
