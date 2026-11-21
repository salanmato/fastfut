import React, { useMemo, useState } from "react";
import {
  Star,
  Search,
  ArrowUpDown,
  ArrowRight,
  Award,
  Footprints,
  Flame,
  Link2,
  Users,
  Compass,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import type { Club, ClubSynergyTracker, Fixture, Player, Tactics } from "../types/game";
import {
  getOverallColor,
  getPlayerDisplayName,
  getRoleBadgeClass,
  getStaminaColor,
} from "../utils/format";
import {
  calculateTeamSynergy,
  getOrCreateClubSynergyTracker,
  getPartnershipStrength,
} from "../engine/synergyEngine";
import { PlayerAvatar } from "./PlayerAvatar";
import { ClubBadge } from "./ClubBadge";

interface SquadPerformanceAnalysisProps {
  userClub: Club;
  players: Player[];
  fixtures: Fixture[];
  tactics: Tactics;
  synergyTracker?: ClubSynergyTracker;
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
  synergyTracker,
  currentMatchweek,
  currentSeason = "2026/27",
  onSelectPlayer,
  onNavigateToTactics,
}) => {
  const [mainTab, setMainTab] = useState<"performance" | "synergy">("performance");
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>("ALL");
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // User squad only
  const squad = useMemo(
    () => players.filter((p) => p.clubId === userClub.id),
    [players, userClub.id]
  );

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const starters = useMemo(
    () => tactics.starters.map((id) => playerMap.get(id)).filter(Boolean) as Player[],
    [tactics.starters, playerMap]
  );

  const tracker = useMemo(
    () =>
      synergyTracker ??
      getOrCreateClubSynergyTracker(
        {
          clubs: [userClub],
          players,
          currentMatchweek,
          tacticsByClub: { [userClub.id]: tactics },
        },
        userClub.id
      ),
    [synergyTracker, userClub, players, currentMatchweek, tactics]
  );

  const synergy = useMemo(
    () => calculateTeamSynergy(starters, tactics, tracker),
    [starters, tactics, tracker]
  );

  const allSquadPartnerships = useMemo(() => {
    const pairs: Array<{
      pA: Player;
      pB: Player;
      sharedMatches: number;
      strengthInfo: ReturnType<typeof getPartnershipStrength>;
      sector: string;
      isCompatriot: boolean;
    }> = [];

    for (let i = 0; i < squad.length; i++) {
      for (let j = i + 1; j < squad.length; j++) {
        const pA = squad[i];
        const pB = squad[j];
        const key = `${Math.min(pA.id, pB.id)}-${Math.max(pA.id, pB.id)}`;
        const sharedMatches = tracker.pairMatches[key] || 0;
        if (sharedMatches > 0) {
          const strengthInfo = getPartnershipStrength(sharedMatches);
          const isCompatriot = pA.nationality.toLowerCase() === pB.nationality.toLowerCase();
          let sector = "Geral";
          if (pA.roleCategory === "DEF" && pB.roleCategory === "DEF") sector = "Zaga";
          else if (pA.roleCategory === "MID" && pB.roleCategory === "MID") sector = "Meio-Campo";
          else if (pA.roleCategory === "ATT" && pB.roleCategory === "ATT") sector = "Ataque";
          else if (
            (pA.roleCategory === "GK" && pB.roleCategory === "DEF") ||
            (pA.roleCategory === "DEF" && pB.roleCategory === "GK")
          )
            sector = "Defesa/Goleiro";

          pairs.push({ pA, pB, sharedMatches, strengthInfo, sector, isCompatriot });
        }
      }
    }

    return pairs.sort((a, b) => b.sharedMatches - a.sharedMatches);
  }, [squad, tracker]);

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

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setMainTab("performance")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            mainTab === "performance"
              ? "bg-emerald-500 text-slate-950 font-black shadow-md"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <BarChart3 className="h-4 w-4" /> Desempenho & Estatísticas
        </button>
        <button
          onClick={() => setMainTab("synergy")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            mainTab === "synergy"
              ? "bg-emerald-500 text-slate-950 font-black shadow-md"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Flame className="h-4 w-4 text-amber-400" /> Sinergia & Entrosamento ({synergy.overallScore}%)
        </button>
      </div>

      {mainTab === "synergy" ? (
        /* SYNERGY & COHESION HUB */
        <div className="space-y-6">
          {/* Main Synergy Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/40 p-1.5 text-amber-400">
                    <Flame className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Coesão & Química do Elenco
                    </div>
                    <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2 mt-0.5">
                      <span>{synergy.tierLabel}</span>
                      <span className={`text-base font-bold ${synergy.tierColor}`}>
                        ({synergy.overallScore}%)
                      </span>
                    </h2>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  Quanto mais partidas os jogadores disputam juntos, mais automática e eficiente se torna a troca de passes, a cobertura defensiva e o aproveitamento no ataque.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Bônus Tático Coletivo
                  </div>
                  <div
                    className={`text-2xl font-black ${
                      synergy.overallMultiplier >= 1 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {synergy.bonusPercentFormatted}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Progress Bar */}
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
              <div
                className={`h-full transition-all duration-700 ${
                  synergy.overallScore >= 80
                    ? "bg-gradient-to-r from-emerald-500 to-amber-400"
                    : synergy.overallScore >= 60
                    ? "bg-emerald-500"
                    : synergy.overallScore >= 45
                    ? "bg-sky-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${synergy.overallScore}%` }}
              />
            </div>

            {/* 3 Pillars Breakdown */}
            <div className="grid gap-4 md:grid-cols-3 pt-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-400 uppercase text-[10px] flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-emerald-400" /> Tempo Juntos
                  </span>
                  <span className="font-black text-emerald-400">{synergy.sharedMatchesFactor.score}%</span>
                </div>
                <div className="text-lg font-black text-white">
                  {synergy.sharedMatchesFactor.avgSharedMatches} jgs médios
                </div>
                <p className="text-[11px] text-slate-300">{synergy.sharedMatchesFactor.description}</p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-400 uppercase text-[10px] flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-sky-400" /> Familiaridade Tática
                  </span>
                  <span className="font-black text-sky-400">{synergy.tacticalFamiliarityFactor.score}%</span>
                </div>
                <div className="text-lg font-black text-white">
                  {synergy.tacticalFamiliarityFactor.consecutiveMatches} rodadas ({tactics.formation})
                </div>
                <p className="text-[11px] text-slate-300">{synergy.tacticalFamiliarityFactor.description}</p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-400 uppercase text-[10px] flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-indigo-400" /> Química Cultural
                  </span>
                  <span className="font-black text-indigo-400">{synergy.culturalChemistryFactor.score}%</span>
                </div>
                <div className="text-lg font-black text-white">
                  {synergy.culturalChemistryFactor.compatriotPairsCount} conexões de idioma
                </div>
                <p className="text-[11px] text-slate-300">{synergy.culturalChemistryFactor.description}</p>
              </div>
            </div>
          </div>

          {/* Sector Cohesion Breakdown */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Setor Defensivo
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-black text-emerald-400">
                  {synergy.sectors.defense.score}% • {synergy.sectors.defense.label}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${synergy.sectors.defense.score}%` }}
                />
              </div>
              <p className="text-xs text-slate-300">{synergy.sectors.defense.description}</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Meio-Campo & Criação
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-black text-sky-400">
                  {synergy.sectors.midfield.score}% • {synergy.sectors.midfield.label}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                <div
                  className="h-full bg-sky-500"
                  style={{ width: `${synergy.sectors.midfield.score}%` }}
                />
              </div>
              <p className="text-xs text-slate-300">{synergy.sectors.midfield.description}</p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Ataque & Finalização
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-black text-amber-400">
                  {synergy.sectors.attack.score}% • {synergy.sectors.attack.label}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${synergy.sectors.attack.score}%` }}
                />
              </div>
              <p className="text-xs text-slate-300">{synergy.sectors.attack.description}</p>
            </div>
          </div>

          {/* All Squad Partnerships Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-amber-400" />
                  <span>Ranking de Parcerias do Elenco (Jogos Juntos)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Duplas com maior tempo de convivência e entrosamento dentro de campo.
                </p>
              </div>
              <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-300">
                {allSquadPartnerships.length} duplas consolidadas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Parceria (Atletas)</th>
                    <th className="py-2.5 px-3 text-center">Setor</th>
                    <th className="py-2.5 px-3 text-center">Partidas Juntos</th>
                    <th className="py-2.5 px-3 text-center">Nível de Entrosamento</th>
                    <th className="py-2.5 pr-3 text-right">Afinidade Cultural</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allSquadPartnerships.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Nenhuma parceria com jogos registrados ainda. Conforme as rodadas forem disputadas, o entrosamento aparecerá aqui!
                      </td>
                    </tr>
                  ) : (
                    allSquadPartnerships.slice(0, 25).map((pair, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2 font-bold text-white">
                            <span>{getPlayerDisplayName(pair.pA.name)}</span>
                            <span className="text-slate-500 text-[10px]">({pair.pA.primaryPosition})</span>
                            <span className="text-amber-400 text-xs">&</span>
                            <span>{getPlayerDisplayName(pair.pB.name)}</span>
                            <span className="text-slate-500 text-[10px]">({pair.pB.primaryPosition})</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                            {pair.sector}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-emerald-400">
                          {pair.sharedMatches} jogos
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold border ${pair.strengthInfo.strengthColor}`}
                          >
                            {pair.strengthInfo.strengthLabel}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          {pair.isCompatriot ? (
                            <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              Compatriotas ({pair.pA.nationality})
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">Multinacional</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Technical Staff Guidelines */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-xs text-slate-200">
            <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Diretrizes da Comissão Técnica para o Entrosamento</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300">
              <li>
                <strong>Manter o time titular:</strong> Jogadores que acumulam mais de 8 a 12 partidas juntos ganham bônus expressivo de velocidade em tomadas de decisão.
              </li>
              <li>
                <strong>Rodízio com critério:</strong> Trocar 5 ou mais titulares de uma só vez reduz temporariamente o entrosamento do setor afetado.
              </li>
              <li>
                <strong>Estabilidade tática:</strong> Trocar de formação com frequência reinicia a familiaridade tática. Tente manter a mesma formação por pelo menos 4 a 6 jogos consecutivos.
              </li>
              <li>
                <strong>Integração de reforços:</strong> Jogadores recém-contratados precisam de alguns jogos como titular ou entrando no 2º tempo para construir conexões com os companheiros.
              </li>
            </ul>
          </div>
        </div>
      ) : (
        /* INDIVIDUAL PERFORMANCE VIEW (EXISTING STRIP & TABLE) */
        <>
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
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-black text-emerald-400">
            <span>{totalGoals}</span>
            <Award className="h-5 w-5 text-emerald-400" />
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
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-black text-sky-300">
            <span>{totalAssists}</span>
            <Footprints className="h-5 w-5 text-sky-300" />
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
          <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300 mt-0.5">
            <Star className="h-3 w-3 fill-amber-300" />
            <span>
              {topRated && topRated.seasonAppearances > 0
                ? `${topRated.seasonAvgRating.toFixed(1)} (${topRated.seasonAppearances} jogos)`
                : "Sem partidas suficientes"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Disciplina
          </div>
          <div className="mt-1 text-2xl font-black text-white flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-amber-400">
              {totalYellows}
              <span className="inline-block h-4 w-3 rounded-[1px] bg-amber-400 border border-amber-600 shadow-sm" />
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              {totalReds}
              <span className="inline-block h-4 w-3 rounded-[1px] bg-rose-600 border border-rose-300 shadow-sm" />
            </span>
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
                    <Award className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Gols</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("assists")}
                  className="py-3.5 px-3 text-center cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-center gap-1">
                    <Footprints className="h-3.5 w-3.5 text-sky-400" />
                    <span>Assist</span>
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
                    <Star className="h-3 w-3 fill-amber-300" />
                    <span>Nota Média</span>
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
                        <div className="flex items-center justify-center gap-2 text-[11px] font-bold">
                          {p.seasonYellowCards > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <span>{p.seasonYellowCards}</span>
                              <span className="inline-block h-3 w-2 rounded-[1px] bg-amber-400 border border-amber-600 shadow-sm" />
                            </span>
                          )}
                          {p.seasonRedCards > 0 && (
                            <span className="inline-flex items-center gap-1 text-rose-400">
                              <span>{p.seasonRedCards}</span>
                              <span className="inline-block h-3 w-2 rounded-[1px] bg-rose-600 border border-rose-300 shadow-sm" />
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
        </>
      )}
    </div>
  );
};
