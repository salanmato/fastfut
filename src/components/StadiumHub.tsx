import React, { useMemo, useState } from "react";
import {
  Building2,
  MapPin,
  Users,
  Banknote,
  Flame,
  Sparkles,
  Wrench,
  TrendingUp,
  Info,
  ArrowUpDown,
} from "lucide-react";
import type { Club, PitchStyle, StadiumConfig } from "../types/game";
import { computeMatchStadiumMetrics } from "../engine/matchEngine";
import { formatMoney } from "../utils/format";
import { ClubBadge } from "./ClubBadge";

interface StadiumHubProps {
  userClub: Club;
  clubs: Club[];
  stadiumByClub: Record<number, StadiumConfig>;
  onUpdateStadiumConfig: (next: StadiumConfig) => void;
  onExpandCapacity: () => void;
  onUpgradeVip: () => void;
  onUpgradeTurf: () => void;
}

const EXPAND_COST_EUR = 12_000_000;
const VIP_UPGRADE_COST_EUR = 6_000_000;
const TURF_UPGRADE_COST_EUR = 5_000_000;

export const StadiumHub: React.FC<StadiumHubProps> = ({
  userClub,
  clubs,
  stadiumByClub,
  onUpdateStadiumConfig,
  onExpandCapacity,
  onUpgradeVip,
  onUpgradeTurf,
}) => {
  const [sortBy, setSortBy] = useState<"capacity" | "name" | "revenue">("capacity");
  const userConfig = stadiumByClub[userClub.id];

  // Reference average Premier League opponent to preview realistic matchday projections
  const avgOpponent: Club = useMemo(() => {
    const avgOvr =
      clubs.reduce((s, c) => s + c.avgOverall, 0) / Math.max(1, clubs.length);
    return { ...userClub, id: -1, avgOverall: Math.round(avgOvr * 10) / 10 };
  }, [clubs, userClub]);

  const previewMetrics = useMemo(
    () => computeMatchStadiumMetrics(userClub, avgOpponent, userConfig),
    [userClub, avgOpponent, userConfig]
  );

  const sortedClubs = useMemo(() => {
    return [...clubs].sort((a, b) => {
      if (sortBy === "capacity") return b.capacity - a.capacity;
      if (sortBy === "name") return a.stadium.localeCompare(b.stadium);
      const revA = computeMatchStadiumMetrics(a, avgOpponent, stadiumByClub[a.id]).gateRevenueEur;
      const revB = computeMatchStadiumMetrics(b, avgOpponent, stadiumByClub[b.id]).gateRevenueEur;
      return revB - revA;
    });
  }, [clubs, sortBy, avgOpponent, stadiumByClub]);

  const pitchStyles: Array<{
    id: PitchStyle;
    title: string;
    subtitle: string;
    synergy: string;
  }> = [
    {
      id: "Fast",
      title: "Grama Curta & Irrigada",
      subtitle: "Bola corre mais rápido no tapete.",
      synergy: "+2.5% Ataque e Meio ao jogar com Passe Curto em casa",
    },
    {
      id: "Balanced",
      title: "Padrão Premier League",
      subtitle: "Equilíbrio clássico para qualquer estilo.",
      synergy: "Sem modificadores específicos de estilo de passe",
    },
    {
      id: "Heavy",
      title: "Grama Alta & Pesada",
      subtitle: "Trava toques curtos e favorece jogo direto.",
      synergy: "+2.5% Ataque e Defesa ao jogar com Passe Direto em casa",
    },
  ];

  const canExpand = userClub.transferBudgetEur >= EXPAND_COST_EUR;
  const canUpgradeVip =
    userConfig.vipLevel < 5 && userClub.transferBudgetEur >= VIP_UPGRADE_COST_EUR;
  const canUpgradeTurf =
    userConfig.turfLevel < 5 && userClub.transferBudgetEur >= TURF_UPGRADE_COST_EUR;

  return (
    <div className="space-y-6">
      {/* Main Stadium Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 p-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <ClubBadge club={userClub} size="lg" />
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                <Building2 className="h-3.5 w-3.5" /> Casa do {userClub.name}
              </div>
              <h2 className="mt-1.5 text-2xl font-black text-white">{userClub.stadium}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-sky-400" /> {userClub.city}
                </span>
                <span>•</span>
                <span>Clube fundado em {userClub.foundedYear}</span>
                <span>•</span>
                <span className="font-bold text-white">
                  {userClub.capacity.toLocaleString("pt-BR")} lugares (2026/27)
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-right shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Orçamento do Clube
            </div>
            <div className="text-xl font-black text-emerald-400">
              {formatMoney(userClub.transferBudgetEur)}
            </div>
          </div>
        </div>

        {userClub.capacityNote && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <strong className="text-amber-300">Nota Oficial 2026/27: </strong>
              {userClub.capacityNote}
            </div>
          </div>
        )}

        {/* Season Metrics */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Users className="h-3.5 w-3.5 text-sky-400" /> Público Médio
            </div>
            <div className="mt-1 text-xl font-black text-white">
              {userConfig.totalHomeMatches > 0
                ? userConfig.avgAttendance.toLocaleString("pt-BR")
                : previewMetrics.attendance.toLocaleString("pt-BR")}
            </div>
            <div className="text-[11px] text-slate-500">
              {userConfig.totalHomeMatches > 0
                ? `${Math.round(
                    (userConfig.avgAttendance / userClub.capacity) * 100
                  )}% de ocupação`
                : "Previsão por jogo"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Banknote className="h-3.5 w-3.5 text-emerald-400" /> Bilheteria Acumulada
            </div>
            <div className="mt-1 text-xl font-black text-emerald-400">
              {formatMoney(userConfig.totalGateRevenueEur)}
            </div>
            <div className="text-[11px] text-slate-500">
              {userConfig.totalHomeMatches} jogos em casa disputados
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Flame className="h-3.5 w-3.5 text-amber-400" /> Fator Caldeirão
            </div>
            <div className="mt-1 text-xl font-black text-amber-300">
              +{previewMetrics.homeAdvantagePct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500">Força extra como mandante</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <TrendingUp className="h-3.5 w-3.5 text-indigo-400" /> Receita Est. / Jogo
            </div>
            <div className="mt-1 text-xl font-black text-white">
              {formatMoney(previewMetrics.gateRevenueEur)}
            </div>
            <div className="text-[11px] text-slate-500">
              VIP Nível {userConfig.vipLevel} • Gramado Nível {userConfig.turfLevel}
            </div>
          </div>
        </div>
      </div>

      {/* Controls Grid: Ticket Pricing + Pitch Style + Infrastructure Upgrades */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Pricing & Pitch */}
        <div className="space-y-5 lg:col-span-6">
          {/* Ticket Pricing */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Política de Ingressos</h3>
              <span className="rounded-lg bg-emerald-500/15 px-3 py-1 text-sm font-black text-emerald-400">
                €{userConfig.ticketPriceEur} / ingresso
              </span>
            </div>

            <div>
              <input
                type="range"
                min={30}
                max={120}
                step={1}
                value={userConfig.ticketPriceEur}
                onChange={(e) =>
                  onUpdateStadiumConfig({
                    ...userConfig,
                    ticketPriceEur: Number(e.target.value),
                  })
                }
                className="w-full accent-emerald-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>€30 (Popular / Casa Cheia)</span>
                <span>€75 (Equilibrado)</span>
                <span>€120 (Premium)</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center text-xs">
              <div>
                <div className="text-[10px] text-slate-400">Ocupação Est.</div>
                <div className="mt-0.5 font-black text-white">
                  {Math.round(previewMetrics.occupancyRate * 100)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Público Est.</div>
                <div className="mt-0.5 font-black text-sky-400">
                  {previewMetrics.attendance.toLocaleString("pt-BR")}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Renda / Jogo</div>
                <div className="mt-0.5 font-black text-emerald-400">
                  {formatMoney(previewMetrics.gateRevenueEur)}
                </div>
              </div>
            </div>
          </div>

          {/* Pitch Style */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">Preparação Tática do Gramado</h3>
            <div className="space-y-2">
              {pitchStyles.map((ps) => {
                const active = userConfig.pitchStyle === ps.id;
                return (
                  <button
                    key={ps.id}
                    onClick={() =>
                      onUpdateStadiumConfig({ ...userConfig, pitchStyle: ps.id })
                    }
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-emerald-500 bg-emerald-500/12"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{ps.title}</span>
                      {active && (
                        <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-slate-950">
                          ATIVO
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{ps.subtitle}</div>
                    <div className="mt-1 text-[11px] font-semibold text-emerald-300">
                      {ps.synergy}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Infrastructure Upgrades */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4 lg:col-span-6">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <Wrench className="h-4 w-4 text-amber-400" /> Obras e Infraestrutura do Estádio
          </h3>
          <p className="text-xs text-slate-400">
            Invista o orçamento do clube na modernização do {userClub.stadium} para aumentar receitas de bilheteria, potencializar o Fator Caldeirão e reduzir o desgaste físico em casa.
          </p>

          <div className="space-y-3">
            {/* Expand Stands */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="max-w-sm">
                <div className="text-sm font-bold text-white">
                  Expandir Arquibancada (+2.500 lugares)
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  Capacidade atual: {userClub.capacity.toLocaleString("pt-BR")} →{" "}
                  {(userClub.capacity + 2500).toLocaleString("pt-BR")} lugares. Aumenta público, renda e pressão no adversário.
                </div>
              </div>
              <button
                disabled={!canExpand}
                onClick={onExpandCapacity}
                className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {canExpand ? `Investir ${formatMoney(EXPAND_COST_EUR)}` : `Falta verba (${formatMoney(EXPAND_COST_EUR)})`}
              </button>
            </div>

            {/* Upgrade VIP */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="max-w-sm">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    Camarotes & Setor VIP
                  </span>
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    Nível {userConfig.vipLevel} / 5
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  Garante +{formatMoney(350_000)} extras por partida em casa (atual:{" "}
                  {formatMoney(userConfig.vipLevel * 350_000)}/jogo).
                </div>
              </div>
              <button
                disabled={!canUpgradeVip}
                onClick={onUpgradeVip}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {userConfig.vipLevel >= 5
                  ? "Nível Máximo"
                  : canUpgradeVip
                  ? `Evoluir (${formatMoney(VIP_UPGRADE_COST_EUR)})`
                  : `Falta verba (${formatMoney(VIP_UPGRADE_COST_EUR)})`}
              </button>
            </div>

            {/* Upgrade Hybrid Turf */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="max-w-sm">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    Gramado Híbrido & Fisioterapia
                  </span>
                  <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    Nível {userConfig.turfLevel} / 5
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  Reduz a fadiga do seu time em casa (-5% por nível) e soma +0.4% ao Fator Caldeirão.
                </div>
              </div>
              <button
                disabled={!canUpgradeTurf}
                onClick={onUpgradeTurf}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {userConfig.turfLevel >= 5
                  ? "Nível Máximo"
                  : canUpgradeTurf
                  ? `Evoluir (${formatMoney(TURF_UPGRADE_COST_EUR)})`
                  : `Falta verba (${formatMoney(TURF_UPGRADE_COST_EUR)})`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* All 20 PL Stadiums Directory */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-bold text-white">
              Guia de Estádios da Premier League 2026/27
            </h3>
            <p className="text-xs text-slate-400">
              Capacidades oficiais, fator mandante e notas reais de infraestrutura da temporada.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" />
            {(
              [
                ["capacity", "Capacidade"],
                ["revenue", "Renda Est."],
                ["name", "Nome"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                  sortBy === key
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Estádio</th>
                <th className="px-4 py-3">Clube</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3 text-right">Capacidade</th>
                <th className="px-4 py-3 text-right">Caldeirão</th>
                <th className="px-4 py-3 text-right">Renda Est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedClubs.map((c, idx) => {
                const cfg = stadiumByClub[c.id];
                const m = computeMatchStadiumMetrics(c, avgOpponent, cfg);
                const isUser = c.id === userClub.id;
                return (
                  <tr
                    key={c.id}
                    className={
                      isUser
                        ? "bg-emerald-500/12 font-semibold text-white"
                        : "text-slate-300 hover:bg-slate-800/30"
                    }
                  >
                    <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-white">{c.stadium}</div>
                      {c.capacityNote && (
                        <div className="mt-0.5 text-[10px] text-amber-300/90">
                          {c.capacityNote}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ClubBadge club={c} size="sm" />
                        <span>{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{c.city}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-white">
                      {c.capacity.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-300">
                      +{m.homeAdvantagePct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-400">
                      {formatMoney(m.gateRevenueEur)}
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
