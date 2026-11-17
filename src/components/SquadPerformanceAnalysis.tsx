import React, { useMemo, useState } from "react";
import {
  Star,
  Search,
  ArrowUpDown,
  ArrowRight,
} from "lucide-react";
import type { Club, Fixture, Player, Tactics } from "../types/game";
import { getOverallColor, getRoleBadgeClass, getStaminaColor } from "../utils/format";
import { PlayerAvatar } from "./PlayerAvatar";
import { ClubBadge } from "./ClubBadge";

interface SquadPerformanceAnalysisProps {
  userClub: Club;
  players: Player[];
  fixtures: Fixture[];
  tactics: Tactics;
  currentMatchweek: number;
  currentSeason?: string;
  onSelectPlayer: (p: Player) => void;
  onNavigateToTactics: () => void;
}

type SectorFilter = "ALL" | "GK" | "DEF" | "MID" | "ATT";
type SortField =
  | "rating"
  | "goals"
  | "assists"
  | "ga"
  | "apps"
  | "cards"
  | "overall"
  | "stamina";

export const SquadPerformanceAnalysis: React.FC<SquadPerformanceAnalysisProps> = ({
  userClub,
  players,
  tactics,
  currentMatchweek,
  currentSeason = "2026/27",
  onSelectPlayer,
  onNavigateToTactics,
}) => {
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>("ALL");
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // User squad only
  const squad = useMemo(
    () => players.filter((p) => p.clubId === userClub.id),
    [players, userClub.id]
  );

  const startersSet = useMemo(() => new Set(tactics.starters), [tactics.starters]);
  const benchSet = useMemo(() => new Set(tactics.bench), [tactics.bench]);

  // Aggregate metrics
  const playersWithApps = useMemo(
    () => squad.filter((p) => p.seasonAppearances > 0),
    [squad]
  );

  const squadAvgRating = useMemo(() => {
    if (playersWithApps.length === 0) return 0;
    const sum = playersWithApps.reduce((acc, p) => acc + p.seasonAvgRating, 0);
    return sum / playersWithApps.length;
  }, [playersWithApps]);

  const totalGoals = useMemo(
    () => squad.reduce((acc, p) => acc + p.seasonGoals, 0),
    [squad]
  );
  const totalAssists = useMemo(
    () => squad.reduce((acc, p) => acc + p.seasonAssists, 0),
    [squad]
  );
  const totalYellows = useMemo(
    () => squad.reduce((acc, p) => acc + p.seasonYellowCards, 0),
    [squad]
  );
  const totalReds = useMemo(
    () => squad.reduce((acc, p) => acc + p.seasonRedCards, 0),
    [squad]
  );

  // Top performers
  const topRated = useMemo(
    () =>
      [...playersWithApps].sort(
        (a, b) =>
          b.seasonAvgRating - a.seasonAvgRating ||
          b.seasonAppearances - a.seasonAppearances
      )[0],
    [playersWithApps]
  );

  const topScorer = useMemo(
    () => [...squad].sort((a, b) => b.seasonGoals - a.seasonGoals)[0],
    [squad]
  );

  const topAssister = useMemo(
    () => [...squad].sort((a, b) => b.seasonAssists - a.seasonAssists)[0],
    [squad]
  );

  // Filter & Sort
  const filteredSquad = useMemo(() => {
    return squad.filter((p) => {
      // Sector filter
      if (sectorFilter === "GK" && p.roleCategory !== "GK") return false;
      if (sectorFilter === "DEF" && p.roleCategory !== "DEF") return false;
      if (sectorFilter === "MID" && p.roleCategory !== "MID") return false;
      if (sectorFilter === "ATT" && p.roleCategory !== "ATT") return false;

      // Search term
      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesPos = p.primaryPosition.toLowerCase().includes(query);
        const matchesNumber = p.shirtNumber?.toString() === query;
        if (!matchesName && !matchesPos && !matchesNumber) return false;
      }
      return true;
    });
  }, [squad, sectorFilter, searchTerm]);

  const sortedSquad = useMemo(() => {
    return [...filteredSquad].sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortField) {
        case "rating":
          valA = a.seasonAppearances > 0 ? a.seasonAvgRating : 0;
          valB = b.seasonAppearances > 0 ? b.seasonAvgRating : 0;
          break;
        case "goals":
          valA = a.seasonGoals;
          valB = b.seasonGoals;
          break;
        case "assists":
          valA = a.seasonAssists;
          valB = b.seasonAssists;
          break;
        case "ga":
          valA = a.seasonGoals + a.seasonAssists;
          valB = b.seasonGoals + b.seasonAssists;
          break;
        case "apps":
          valA = a.seasonAppearances;
          valB = b.seasonAppearances;
          break;
        case "cards":
          valA = a.seasonYellowCards + a.seasonRedCards * 3;
          valB = b.seasonYellowCards + b.seasonRedCards * 3;
          break;
        case "overall":
          valA = a.overall;
          valB = b.overall;
          break;
        case "stamina":
          valA = a.stamina;
          valB = b.stamina;
          break;
      }

      if (valA === valB) {
        return b.overall - a.overall;
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [filteredSquad, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getRatingBadge = (rating: number, apps: number) => {
    if (apps === 0 || rating === 0) {
      return (
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-500">
          -
        </span>
      );
    }
    if (rating >= 7.5) {
      return (
        <span className="rounded bg-emerald-500/25 border border-emerald-500/50 px-2 py-0.5 text-xs font-black text-emerald-300">
          ⭐ {rating.toFixed(1)}
        </span>
      );
    }
    if (rating >= 7.0) {
      return (
        <span className="rounded bg-sky-500/25 border border-sky-500/50 px-2 py-0.5 text-xs font-black text-sky-300">
          ⭐ {rating.toFixed(1)}
        </span>
      );
    }
    if (rating >= 6.5) {
      return (
        <span className="rounded bg-amber-500/25 border border-amber-500/50 px-2 py-0.5 text-xs font-black text-amber-300">
          ⭐ {rating.toFixed(1)}
        </span>
      );
    }
    return (
      <span className="rounded bg-rose-500/25 border border-rose-500/50 px-2 py-0.5 text-xs font-black text-rose-300">
        ⭐ {rating.toFixed(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 p-2">
            <ClubBadge club={userClub} size="md" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider">
                Temporada {currentSeason}
              </span>
              <span className="text-xs text-slate-400">
                Rodada {currentMatchweek} de 38 • {squad.length} Atletas no Elenco
              </span>
            </div>
            <h1 className="mt-1 font-h1 text-2xl md:text-3xl text-white">
              Análise de Desempenho do Elenco
            </h1>
            <p className="text-xs text-slate-300">
              Estatísticas individuais detalhadas, notas médias por partida, artilharia e rendimento físico.
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToTactics}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white border border-slate-700 hover:bg-slate-700 transition"
        >
          Ajustar Tática & Escalação <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Aggregate Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Nota Média do Elenco
          </div>
          <div className="mt-1 text-2xl font-black text-amber-300 flex items-center gap-1.5">
            <Star className="h-5 w-5 fill-current" />
            {squadAvgRating > 0 ? squadAvgRating.toFixed(2) : "-"}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {playersWithApps.length} atletas avaliados
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Gols do Elenco
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-400">
            {totalGoals} ⚽
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
            {topScorer && topScorer.seasonGoals > 0
              ? `Líder: ${topScorer.name} (${topScorer.seasonGoals})`
              : "Nenhum gol marcado"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Assistências
          </div>
          <div className="mt-1 text-2xl font-black text-sky-300">
            {totalAssists} 👟
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
            {topAssister && topAssister.seasonAssists > 0
              ? `Líder: ${topAssister.name} (${topAssister.seasonAssists})`
              : "Nenhuma assistência"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Craque do Time (MVP)
          </div>
          <div className="mt-1 text-base font-black text-white truncate">
            {topRated ? topRated.name : "-"}
          </div>
          <div className="text-[11px] font-bold text-amber-300 mt-0.5">
            {topRated && topRated.seasonAppearances > 0
              ? `⭐ ${topRated.seasonAvgRating.toFixed(1)} (${topRated.seasonAppearances} jogos)`
              : "Sem partidas suficientes"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Disciplina
          </div>
          <div className="mt-1 text-2xl font-black text-white flex items-center gap-3">
            <span className="text-amber-400">{totalYellows} 🟨</span>
            <span className="text-rose-400">{totalReds} 🟥</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Total de infrações
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        {/* Sector Tabs */}
        <div className="flex flex-wrap gap-1">
          {(
            [
              { id: "ALL" as const, label: "Todos" },
              { id: "GK" as const, label: "Goleiros" },
              { id: "DEF" as const, label: "Defesa" },
              { id: "MID" as const, label: "Meio-Campo" },
              { id: "ATT" as const, label: "Ataque" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setSectorFilter(t.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                sectorFilter === t.id
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, posição ou camisa..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Main Performance Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3.5 pl-4 pr-2">#</th>
                <th className="py-3.5 px-3">Jogador</th>
                <th
                  onClick={() => handleSort("overall")}
                  className="py-3.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    OVR
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("stamina")}
                  className="py-3.5 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Energia
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3.5 px-3">Status</th>
                <th
                  onClick={() => handleSort("apps")}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-center gap-1">
                    Jogos
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("goals")}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-center gap-1">
                    ⚽ Gols
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("assists")}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-center gap-1">
                    👟 Assist
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("ga")}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-center gap-1">
                    G+A
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("cards")}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-center gap-1">
                    Cartões
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("rating")}
                  className="py-3.5 pr-4 pl-3 text-right cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1 text-amber-300">
                    ⭐ Nota Média
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedSquad.map((p, idx) => {
                const isStarter = startersSet.has(p.id);
                const isBench = benchSet.has(p.id);
                const isInjured = (p.injuryMatchesLeft ?? 0) > 0;
                const ga = p.seasonGoals + p.seasonAssists;

                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPlayer(p)}
                    className="cursor-pointer transition hover:bg-slate-800/50 group"
                  >
                    <td className="py-3 pl-4 pr-2 text-slate-500 font-mono text-[11px]">
                      {p.shirtNumber ?? idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar
                          name={p.name}
                          imageUrl={p.imageUrl}
                          size="sm"
                          accentColor={userClub.primaryColor}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-white group-hover:text-emerald-300 truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            <span className={getRoleBadgeClass(p.roleCategory)}>
                              {p.primaryPosition}
                            </span>{" "}
                            • {p.age} anos • {p.nationality}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-xs font-black ${getOverallColor(
                          p.overall
                        )}`}
                      >
                        {p.overall}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${getStaminaColor(
                            p.stamina
                          )}`}
                        />
                        <span className="font-mono text-xs text-slate-300">
                          {p.stamina}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {isInjured ? (
                        <span className="rounded bg-rose-600/30 border border-rose-500/50 px-2 py-0.5 text-[10px] font-black text-rose-300">
                          DM ({p.injuryMatchesLeft}j)
                        </span>
                      ) : isStarter ? (
                        <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          Titular
                        </span>
                      ) : isBench ? (
                        <span className="rounded bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                          Banco
                        </span>
                      ) : (
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                          Reserva
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-white">
                      {p.seasonAppearances}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-400">
                      {p.seasonGoals > 0 ? p.seasonGoals : "-"}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-sky-300">
                      {p.seasonAssists > 0 ? p.seasonAssists : "-"}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-200">
                      {ga > 0 ? ga : "-"}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-300">
                      {p.seasonYellowCards > 0 || p.seasonRedCards > 0 ? (
                        <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold">
                          {p.seasonYellowCards > 0 && (
                            <span className="text-amber-400">
                              {p.seasonYellowCards}🟨
                            </span>
                          )}
                          {p.seasonRedCards > 0 && (
                            <span className="text-rose-400">
                              {p.seasonRedCards}🟥
                            </span>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 pr-4 pl-3 text-right">
                      {getRatingBadge(p.seasonAvgRating, p.seasonAppearances)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
