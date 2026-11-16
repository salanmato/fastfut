import React, { useMemo, useState } from "react";
import { Search, ShoppingBag, Banknote, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import type { Club, Player, RoleCategory } from "../types/game";
import {
  formatMoney,
  formatWage,
  getOverallColor,
  getRoleBadgeClass,
} from "../utils/format";
import { PlayerAvatar } from "./PlayerAvatar";

interface TransferMarketProps {
  userClub: Club;
  players: Player[];
  onBuyPlayer: (player: Player) => void;
  onSellPlayer: (player: Player) => void;
  onSelectPlayer: (player: Player) => void;
}

export const TransferMarket: React.FC<TransferMarketProps> = ({
  userClub,
  players,
  onBuyPlayer,
  onSellPlayer,
  onSelectPlayer,
}) => {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | RoleCategory>("ALL");
  const [leagueFilter, setLeagueFilter] = useState<string>("ALL");
  const [minOvr, setMinOvr] = useState<number>(75);
  const [maxAge, setMaxAge] = useState<number>(36);
  const [maxPriceM, setMaxPriceM] = useState<number>(250);
  const [visibleCount, setVisibleCount] = useState<number>(40);

  const userSquad = useMemo(
    () =>
      players
        .filter((p) => p.clubId === userClub.id)
        .sort((a, b) => b.overall - a.overall),
    [players, userClub.id]
  );

  const leagues = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      if (p.clubId !== userClub.id) set.add(p.league);
    }
    return ["ALL", ...Array.from(set).sort()];
  }, [players, userClub.id]);

  const marketTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => {
        if (p.clubId === userClub.id) return false;
        if (p.overall < minOvr) return false;
        if (p.age > maxAge) return false;
        if (p.marketValueEur > maxPriceM * 1_000_000) return false;
        if (roleFilter !== "ALL" && p.roleCategory !== roleFilter) return false;
        if (leagueFilter !== "ALL" && p.league !== leagueFilter) return false;
        if (
          q &&
          !p.name.toLowerCase().includes(q) &&
          !p.clubName.toLowerCase().includes(q) &&
          !p.nationality.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.overall - a.overall || b.marketValueEur - a.marketValueEur);
  }, [players, userClub.id, minOvr, maxAge, maxPriceM, roleFilter, leagueFilter, query]);

  return (
    <div className="space-y-5">
      {/* Header Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-white">
            <ShoppingBag className="h-5 w-5 text-emerald-400" /> Mercado de Transferências 26/27
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Explore alvos globais (La Liga, Serie A, Bundesliga, Ligue 1, Championship, MLS e mais) ou negocie atletas da Premier League.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-right">
            <div className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase text-emerald-300">
              <Banknote className="h-3.5 w-3.5" /> Orçamento Disponível
            </div>
            <div className="text-lg font-black text-emerald-400">
              {formatMoney(userClub.transferBudgetEur)}
            </div>
          </div>

          <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              onClick={() => setMode("buy")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                mode === "buy"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" /> Contratar
            </button>
            <button
              onClick={() => setMode("sell")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                mode === "sell"
                  ? "bg-rose-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> Vender ({userSquad.length})
            </button>
          </div>
        </div>
      </div>

      {mode === "buy" ? (
        <>
          {/* Filters */}
          <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisibleCount(40);
                }}
                placeholder="Buscar jogador, clube ou país..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-500/60"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "ALL" | RoleCategory)}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-white outline-none"
            >
              <option value="ALL">Todas Posições</option>
              <option value="GK">Goleiros (GK)</option>
              <option value="DEF">Defensores (DEF)</option>
              <option value="MID">Meio-Campistas (MID)</option>
              <option value="ATT">Atacantes (ATT)</option>
            </select>

            <select
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-white outline-none"
            >
              {leagues.map((lg) => (
                <option key={lg} value={lg}>
                  {lg === "ALL" ? "Todas as Ligas" : lg}
                </option>
              ))}
            </select>

            <div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>OVR Mínimo</span>
                <span className="text-emerald-400">{minOvr}</span>
              </div>
              <input
                type="range"
                min={65}
                max={90}
                value={minOvr}
                onChange={(e) => setMinOvr(Number(e.target.value))}
                className="mt-1 w-full accent-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Idade ≤</span>
                  <span className="text-white">{maxAge}</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={38}
                  value={maxAge}
                  onChange={(e) => setMaxAge(Number(e.target.value))}
                  className="mt-1 w-full accent-emerald-500"
                />
              </div>
              <select
                value={maxPriceM}
                onChange={(e) => setMaxPriceM(Number(e.target.value))}
                className="rounded-xl border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white outline-none"
              >
                <option value={250}>Sem teto €</option>
                <option value={100}>≤ €100M</option>
                <option value={60}>≤ €60M</option>
                <option value={30}>≤ €30M</option>
                <option value={15}>≤ €15M</option>
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400">
              <span>{marketTargets.length} jogadores encontrados</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {marketTargets.slice(0, visibleCount).map((p) => {
                const canAfford = userClub.transferBudgetEur >= p.marketValueEur;
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/30"
                  >
                    <button
                      onClick={() => onSelectPlayer(p)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left group"
                    >
                      <PlayerAvatar name={p.name} imageUrl={p.imageUrl} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-white group-hover:text-emerald-300">
                            {p.name}
                          </span>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${getRoleBadgeClass(
                              p.roleCategory
                            )}`}
                          >
                            {p.primaryPosition}
                          </span>
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {p.clubName} ({p.league}) • {p.nationality} • {p.age} anos
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-3 sm:gap-5">
                      <div className="text-center">
                        <div className="text-[10px] text-slate-500">OVR / POT</div>
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                            p.overall
                          )}`}
                        >
                          {p.overall} / {p.potential}
                        </span>
                      </div>

                      <div className="w-24 text-right">
                        <div className="text-xs font-black text-emerald-400">
                          {formatMoney(p.marketValueEur)}
                        </div>
                        <div className="text-[10px] text-slate-500">{formatWage(p.wageEur)}</div>
                      </div>

                      <button
                        disabled={!canAfford}
                        onClick={() => onBuyPlayer(p)}
                        className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                      >
                        {canAfford ? "Contratar" : "Caro"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {marketTargets.length > visibleCount && (
              <div className="border-t border-slate-800 p-3 text-center">
                <button
                  onClick={() => setVisibleCount((c) => c + 40)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-xs font-bold text-white hover:bg-slate-700"
                >
                  Carregar mais jogadores ({marketTargets.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Sell Mode */
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-xs text-slate-400">
            <span>
              Seu elenco atual: <strong className="text-white">{userSquad.length}</strong> jogadores
              (mínimo permitido: 16)
            </span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {userSquad.map((p) => {
              const sellPrice = Math.round(p.marketValueEur * 0.92);
              const canSell = userSquad.length > 16;
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/30"
                >
                  <button
                    onClick={() => onSelectPlayer(p)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left group"
                  >
                    <PlayerAvatar
                      name={p.name}
                      imageUrl={p.imageUrl}
                      size="sm"
                      accentColor={userClub.primaryColor}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-white group-hover:text-emerald-300">
                          {p.name}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${getRoleBadgeClass(
                            p.roleCategory
                          )}`}
                        >
                          {p.primaryPosition}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.age} anos • {p.seasonAppearances}J {p.seasonGoals}G {p.seasonAssists}A
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-4">
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                        p.overall
                      )}`}
                    >
                      {p.overall}
                    </span>
                    <div className="w-24 text-right">
                      <div className="text-xs font-black text-amber-300">
                        {formatMoney(sellPrice)}
                      </div>
                      <div className="text-[10px] text-slate-500">Oferta (92%)</div>
                    </div>
                    <button
                      disabled={!canSell}
                      onClick={() => onSellPlayer(p)}
                      className="rounded-xl bg-rose-500/90 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      Vender
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
