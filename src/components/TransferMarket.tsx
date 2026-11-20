import React, { useMemo, useState } from "react";
import {
  Search,
  ShoppingBag,
  Banknote,
  ArrowUpRight,
  ArrowDownLeft,
  Star,
  Lock,
  Unlock,
  Flame,
  Calendar as CalendarIcon,
  Globe,
  Mail,
  Sparkles,
  Check,
  XCircle,
  Building,
  Send,
} from "lucide-react";
import type { Club, Player, RoleCategory, TransferOffer, WorldTransfer } from "../types/game";
import type { TransferWindowStatus } from "../utils/calendar";
import { formatDatePtBr } from "../utils/calendar";
import { evaluatePlayerInterest } from "../engine/transferNegotiationEngine";
import {
  formatMoney,
  formatWage,
  getOverallColor,
  getRoleBadgeClass,
} from "../utils/format";
import { PlayerAvatar } from "./PlayerAvatar";

interface TransferMarketProps {
  userClub: Club;
  clubs?: Club[];
  players: Player[];
  windowStatus: TransferWindowStatus;
  currentDate: string;
  shortlistIds: number[];
  transferOffers?: TransferOffer[];
  worldTransfers?: WorldTransfer[];
  onBuyPlayer: (player: Player) => void;
  onStartNegotiation?: (player: Player) => void;
  onToggleTransferListed?: (playerId: number) => void;
  onOfferPlayerToMarket?: (playerId: number) => void;
  onSellPlayer: (player: Player) => void;
  onSelectPlayer: (player: Player) => void;
  onToggleShortlist: (playerId: number) => void;
  onOpenCalendar: () => void;
  onAcceptOffer?: (offerId: string) => void;
  onRejectOffer?: (offerId: string) => void;
  onCounterOffer?: (offerId: string, counterAmountEur: number) => void;
}

export const TransferMarket: React.FC<TransferMarketProps> = ({
  userClub,
  clubs = [],
  players,
  windowStatus,
  currentDate,
  shortlistIds,
  transferOffers = [],
  worldTransfers = [],
  onBuyPlayer,
  onStartNegotiation,
  onToggleTransferListed,
  onOfferPlayerToMarket,
  onSellPlayer,
  onSelectPlayer,
  onToggleShortlist,
  onOpenCalendar,
  onAcceptOffer,
  onRejectOffer,
  onCounterOffer,
}) => {
  const [mode, setMode] = useState<"buy" | "wonderkids" | "offers" | "world" | "shortlist" | "sell">("buy");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | RoleCategory>("ALL");
  const [leagueFilter, setLeagueFilter] = useState<string>("ALL");
  const [minOvr, setMinOvr] = useState<number>(70);
  const [maxAge, setMaxAge] = useState<number>(36);
  const [maxPriceM, setMaxPriceM] = useState<number>(250);
  const [visibleCount, setVisibleCount] = useState<number>(40);

  // Counter offer state for a specific offer
  const [activeCounterOfferId, setActiveCounterOfferId] = useState<string | null>(null);
  const [counterValueM, setCounterValueM] = useState<number>(10);

  const shortlistSet = useMemo(() => new Set(shortlistIds), [shortlistIds]);

  const pendingOffers = useMemo(
    () => transferOffers.filter((o) => o.status === "pending"),
    [transferOffers]
  );

  const resolvedOffers = useMemo(
    () => transferOffers.filter((o) => o.status !== "pending"),
    [transferOffers]
  );

  const userSquad = useMemo(
    () =>
      players
        .filter((p) => p.clubId === userClub.id)
        .sort((a, b) => b.overall - a.overall),
    [players, userClub.id]
  );

  const shortlistedTargets = useMemo(
    () =>
      players
        .filter((p) => p.clubId !== userClub.id && shortlistSet.has(p.id))
        .sort((a, b) => b.overall - a.overall),
    [players, userClub.id, shortlistSet]
  );

  const leagues = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      if (p.clubId !== userClub.id && p.league) set.add(p.league);
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

  const wonderkidTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => {
        if (p.clubId === userClub.id) return false;
        if (p.age > 21) return false;
        if (p.potential < 79 && p.potential - p.overall < 5) return false;
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
      .sort((a, b) => b.potential - a.potential || (b.potential - b.overall) - (a.potential - a.overall));
  }, [players, userClub.id, roleFilter, leagueFilter, query]);

  const renderTargetRow = (p: Player) => {
    const isShortlisted = shortlistSet.has(p.id);
    const isLoaned = Boolean(p.loan?.isLoan);
    const sellerClub = clubs.find((c) => c.id === p.clubId);
    const interest = evaluatePlayerInterest(userClub, sellerClub, p, players);
    const canAfford = userClub.transferBudgetEur >= p.marketValueEur;
    const canBuyNow = windowStatus.isOpen && !isLoaned;

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
              {isLoaned && (
                <span className="rounded border border-sky-400/50 bg-sky-400/20 px-1 py-0.2 text-[9px] font-black text-sky-200">
                  EMP
                </span>
              )}

              {/* Feasibility / Interest badge */}
              <span
                title={interest.summary}
                className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                  interest.feasibility === "very_interested"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : interest.feasibility === "open"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                    : interest.feasibility === "hard"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                }`}
              >
                {interest.feasibility === "very_interested"
                  ? "Entusiasmado"
                  : interest.feasibility === "open"
                  ? "Receptivo"
                  : interest.feasibility === "hard"
                  ? "Relutante"
                  : "Inviável"}
              </span>

              {interest.rivalryPenaltyApplied && (
                <span
                  title="Clube Rival Histórico"
                  className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-300 border border-rose-500/40"
                >
                  🔥 Rival
                </span>
              )}
            </div>
            <div className="truncate text-xs text-slate-400">
              {p.clubName} ({p.league}) • {p.nationality} • {p.age} anos
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2.5 sm:gap-4">
          <div className="text-center">
            <div className="text-[10px] text-slate-500">OVR / POT</div>
            <span
              className={`inline-block rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                p.overall
              )}`}
            >
              {p.overall} / {p.potential}★
            </span>
          </div>

          <div className="w-24 text-right">
            <div className="text-xs font-black text-emerald-400">
              {formatMoney(p.marketValueEur)}
            </div>
            <div className="text-[10px] text-slate-500">{formatWage(p.wageEur)}</div>
          </div>

          <button
            onClick={() => onToggleShortlist(p.id)}
            title={isShortlisted ? "Remover dos Alvos" : "Adicionar aos Alvos"}
            className={`rounded-xl border p-2 transition ${
              isShortlisted
                ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-amber-300"
            }`}
          >
            <Star className={`h-4 w-4 ${isShortlisted ? "fill-current" : ""}`} />
          </button>

          {onStartNegotiation ? (
            <button
              disabled={!windowStatus.isOpen}
              onClick={() => onStartNegotiation(p)}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 shadow-sm shadow-emerald-500/20"
            >
              <Building className="h-3.5 w-3.5" />
              <span>{!windowStatus.isOpen ? "🔒 Fechada" : "Negociar"}</span>
            </button>
          ) : (
            <button
              disabled={!canBuyNow}
              onClick={() => onBuyPlayer(p)}
              className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {!windowStatus.isOpen
                ? "🔒 Janela Fechada"
                : canAfford
                ? "Contratar"
                : "Caro"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Transfer Window Status Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${
          windowStatus.isDeadlineDay
            ? "border-amber-400/60 bg-amber-500/15 animate-pulse"
            : windowStatus.isOpen
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-rose-500/40 bg-rose-500/10"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              windowStatus.isDeadlineDay
                ? "bg-amber-400 text-slate-950"
                : windowStatus.isOpen
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-rose-500/20 text-rose-300"
            }`}
          >
            {windowStatus.isDeadlineDay ? (
              <Flame className="h-5 w-5" />
            ) : windowStatus.isOpen ? (
              <Unlock className="h-5 w-5" />
            ) : (
              <Lock className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-white">
                {windowStatus.isDeadlineDay
                  ? "🚨 DEADLINE DAY! Último dia de mercado aberto!"
                  : windowStatus.isOpen
                  ? `🔓 ${windowStatus.headline}`
                  : `🔒 ${windowStatus.headline}`}
              </span>
              <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                {formatDatePtBr(currentDate)}
              </span>
              {pendingOffers.length > 0 && (
                <span className="animate-bounce rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
                  {pendingOffers.length} Proposta(s) Pendente(s)!
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-300">
              {windowStatus.detailText}
              {!windowStatus.isOpen &&
                " • Você ainda pode observar jogadores e salvá-los na aba Alvos."}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenCalendar}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/75 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-900"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-sky-400" /> Ver Calendário
        </button>
      </div>

      {/* Header Summary & Tab Navigation */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-white">
            <ShoppingBag className="h-5 w-5 text-emerald-400" /> Mercado Global de Transferências
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Scout em 13 ligas (6.046 atletas), gestão de propostas recebidas de gigantes da Europa e Arábia, e feed mundial ao vivo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-right">
            <div className="flex items-center justify-end gap-1 text-[10px] font-bold uppercase text-emerald-300">
              <Banknote className="h-3.5 w-3.5" /> Orçamento Disponível
            </div>
            <div className="text-lg font-black text-emerald-400">
              {formatMoney(userClub.transferBudgetEur)}
            </div>
          </div>

          <div className="flex flex-wrap rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              onClick={() => setMode("buy")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "buy"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" /> Scout
            </button>

            <button
              onClick={() => setMode("wonderkids")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "wonderkids"
                  ? "bg-amber-400 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" /> Wonderkids
            </button>

            <button
              onClick={() => setMode("offers")}
              className={`relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "offers"
                  ? "bg-sky-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Mail className="h-3.5 w-3.5" /> Propostas
              {pendingOffers.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                  {pendingOffers.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setMode("world")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "world"
                  ? "bg-indigo-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Globe className="h-3.5 w-3.5" /> Feed Global ({worldTransfers.length})
            </button>

            <button
              onClick={() => setMode("shortlist")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mode === "shortlist"
                  ? "bg-amber-400 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Star className="h-3.5 w-3.5" /> Alvos ({shortlistedTargets.length})
            </button>

            <button
              onClick={() => setMode("sell")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
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

      {/* MODE 1: BUY (Scout) */}
      {mode === "buy" && (
        <>
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
                  {lg === "ALL" ? "Todas as 13 Ligas" : lg}
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
                min={60}
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

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400">
              <span>{marketTargets.length} jogadores encontrados</span>
              <span>Clique na estrela ★ para salvar na Lista de Alvos</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {marketTargets.slice(0, visibleCount).map(renderTargetRow)}
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
      )}

      {/* MODE 2: WONDERKIDS */}
      {mode === "wonderkids" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
              <Sparkles className="h-4 w-4" /> Radar de Jovens Promessas (Wonderkids)
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Jogadores com até 21 anos e potencial explosivo (≥ 80★ ou margem de evolução de +5 OVR). Contrate promessas antes que os gigantes europeus aumentem seus preços!
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 text-xs text-slate-400">
              <span>{wonderkidTargets.length} promessas mundiais encontradas</span>
              <span>Ordenado pelo maior potencial</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {wonderkidTargets.slice(0, visibleCount).map(renderTargetRow)}
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: OFFERS (Received Transfer Proposals) */}
      {mode === "offers" && (
        <div className="space-y-5">
          {/* Pending Offers */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sky-400">
              <Mail className="h-4 w-4" /> Propostas Oficiais Pendentes ({pendingOffers.length})
            </h3>

            {pendingOffers.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center text-xs text-slate-400">
                Nenhuma proposta pendente no momento. Durante as janelas de transferências abertas, clubes da Europa e Arábia Saudita enviarão ofertas por atletas em destaque do seu time!
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pendingOffers.map((offer) => {
                  const profitRatio = ((offer.offeredAmountEur - offer.originalValueEur) / offer.originalValueEur) * 100;
                  const isCountering = activeCounterOfferId === offer.id;

                  return (
                    <div
                      key={offer.id}
                      className="flex flex-col justify-between rounded-2xl border border-sky-500/40 bg-slate-900/90 p-5 shadow-lg"
                    >
                      <div>
                        {/* Header of Offer */}
                        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                          <div>
                            <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-sky-300 border border-sky-500/40">
                              Proposta Oficial
                            </span>
                            <h4 className="mt-1 text-base font-black text-white">{offer.playerName}</h4>
                            <div className="text-xs text-slate-400">
                              {offer.playerPos} • OVR {offer.playerOvr}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-slate-400">Clube Comprador:</div>
                            <div className="text-sm font-black text-emerald-400">{offer.fromClubName}</div>
                            <div className="text-[10px] text-slate-500">{offer.fromClubLeague}</div>
                          </div>
                        </div>

                        {/* Financial details */}
                        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Valor Ofertado</div>
                            <div className="text-lg font-black text-emerald-400">
                              {formatMoney(offer.offeredAmountEur)}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-500">
                              Original: {formatMoney(offer.originalValueEur)}
                              {profitRatio > 0 && (
                                <span className="ml-1 text-emerald-400 font-bold">
                                  (+{Math.round(profitRatio)}%)
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Salário Proposto</div>
                            <div className="text-sm font-black text-white">{formatWage(offer.wageOfferEur)}</div>
                            <div className="text-[10px] text-slate-500">Rodada {offer.matchweekReceived}</div>
                          </div>
                        </div>

                        {/* Buyer note */}
                        {offer.buyerReason && (
                          <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/50 p-2.5 text-xs text-slate-300">
                            💬 <em>"{offer.buyerReason}"</em>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-5 space-y-2 border-t border-slate-800 pt-4">
                        {!isCountering ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => onAcceptOffer?.(offer.id)}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-400 shadow-md"
                            >
                              <Check className="h-4 w-4" /> Aceitar ({formatMoney(offer.offeredAmountEur)})
                            </button>

                            <button
                              onClick={() => {
                                setActiveCounterOfferId(offer.id);
                                setCounterValueM(Math.round((offer.offeredAmountEur * 1.15) / 1_000_000));
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-400/25"
                            >
                              Contraproposta
                            </button>

                            <button
                              onClick={() => onRejectOffer?.(offer.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                            >
                              <XCircle className="h-4 w-4" /> Recusar
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                              <span>Pedida da Contraproposta:</span>
                              <span className="text-sm font-black text-white">€{counterValueM}M</span>
                            </div>
                            <input
                              type="range"
                              min={Math.round(offer.offeredAmountEur / 1_000_000) + 1}
                              max={Math.round((offer.offeredAmountEur * 1.5) / 1_000_000)}
                              value={counterValueM}
                              onChange={(e) => setCounterValueM(Number(e.target.value))}
                              className="w-full accent-amber-400"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                onClick={() => setActiveCounterOfferId(null)}
                                className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-slate-400 hover:text-white"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => {
                                  onCounterOffer?.(offer.id, counterValueM * 1_000_000);
                                  setActiveCounterOfferId(null);
                                }}
                                className="rounded-lg bg-amber-400 px-4 py-1 text-xs font-black text-slate-950 hover:bg-amber-300"
                              >
                                Enviar Pedida (€{counterValueM}M)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resolved Offers History */}
          {resolvedOffers.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Histórico de Propostas Anteriores ({resolvedOffers.length})
              </h3>
              <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/60">
                {resolvedOffers.slice(0, 10).map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <span className="font-bold text-white">{o.playerName}</span> • Proposta do{" "}
                      <span className="text-slate-300">{o.fromClubName}</span> ({formatMoney(o.offeredAmountEur)})
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                        o.status === "accepted"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : o.status === "countered"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      }`}
                    >
                      {o.status === "accepted"
                        ? "Aceita"
                        : o.status === "countered"
                        ? "Contraproposta Recusada"
                        : "Recusada"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 4: WORLD TRANSFERS FEED */}
      {mode === "world" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-300">
              <Globe className="h-4 w-4" /> Feed de Transferências Mundiais (IA ao Vivo)
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Acompanhe as contratações e movimentações financeiras entre os outros 228 clubes do mundo durante a temporada.
            </p>
          </div>

          {worldTransfers.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center text-xs text-slate-400">
              Nenhuma transferência registrada ainda. Conforme as rodadas avançam com a janela aberta, os outros clubes negociarão jogadores entre si!
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
              <div className="divide-y divide-slate-800/60">
                {worldTransfers.map((wt) => (
                  <div
                    key={wt.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-800/30"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-black text-indigo-300 border border-indigo-500/30">
                          {wt.date}
                        </span>
                        <span className="text-sm font-bold text-white">{wt.playerName}</span>
                        <span className="text-xs text-slate-400">
                          ({wt.playerPos} • OVR {wt.playerOvr})
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-300">
                        <span className="text-slate-400">{wt.fromClubName}</span>{" "}
                        <span className="text-emerald-400 font-bold">➔</span>{" "}
                        <strong className="text-white">{wt.toClubName}</strong> ({wt.toClubLeague})
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-400">{formatMoney(wt.feeEur)}</div>
                      <div className="text-[10px] text-slate-500">Valor Pago</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 5: SHORTLIST */}
      {mode === "shortlist" && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-xs text-slate-400">
            <span>
              Lista de Alvos & Observação:{" "}
              <strong className="text-amber-300">{shortlistedTargets.length}</strong> atleta(s)
            </span>
            <span>Monitore jogadores para a próxima janela</span>
          </div>
          {shortlistedTargets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum jogador marcado como alvo ainda. Clique no ícone{" "}
              <Star className="inline h-3.5 w-3.5 text-amber-400" /> ao lado de um jogador na aba
              Contratar ou no perfil dele para adicioná-lo aqui.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {shortlistedTargets.map(renderTargetRow)}
            </div>
          )}
        </div>
      )}

      {/* MODE 6: SELL */}
      {mode === "sell" && (
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
              const isLoaned = Boolean(p.loan?.isLoan);
              const canSell = windowStatus.isOpen && userSquad.length > 16 && !isLoaned;
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
                        {p.squadCategory === "youth" && (
                          <span className="rounded border border-purple-500/40 bg-purple-500/20 px-1.5 py-0.2 text-[9px] font-bold text-purple-300">
                            SUB-20
                          </span>
                        )}
                        {isLoaned && (
                          <span
                            title={`Emprestado pelo ${p.loan?.parentClubName}`}
                            className="rounded border border-sky-400/50 bg-sky-400/20 px-1.5 py-0.2 text-[9px] font-black text-sky-200"
                          >
                            EMPRÉSTIMO
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.age} anos • {p.seasonAppearances}J {p.seasonGoals}G {p.seasonAssists}A
                        {isLoaned && ` • Pertence ao ${p.loan?.parentClubName}`}
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                        p.overall
                      )}`}
                    >
                      {p.overall}
                    </span>

                    {/* Transfer Listed Status Badge */}
                    {p.isTransferListed ? (
                      <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300 border border-amber-400/40">
                        📦 Listado
                      </span>
                    ) : (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        Elenco
                      </span>
                    )}

                    <div className="w-20 text-right sm:w-24">
                      <div className="text-xs font-black text-amber-300">
                        {formatMoney(sellPrice)}
                      </div>
                      <div className="text-[10px] text-slate-500">Valor (92%)</div>
                    </div>

                    {/* Toggle Transfer List Button */}
                    {onToggleTransferListed && !isLoaned && (
                      <button
                        onClick={() => onToggleTransferListed(p.id)}
                        title={
                          p.isTransferListed
                            ? "Retirar atleta da lista de transferências"
                            : "Colocar na lista de transferências para atrair propostas da IA"
                        }
                        className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                          p.isTransferListed
                            ? "border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                            : "border-amber-400/50 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                        }`}
                      >
                        {p.isTransferListed ? "Deslistar" : "Listar"}
                      </button>
                    )}

                    {/* Offer to Market Button */}
                    {onOfferPlayerToMarket && windowStatus.isOpen && !isLoaned && (
                      <button
                        onClick={() => onOfferPlayerToMarket(p.id)}
                        title="Oferecer ao mercado global: agentes buscam propostas de compra oficiais"
                        className="inline-flex items-center gap-1 rounded-xl border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-1.5 text-xs font-bold text-indigo-200 transition hover:bg-indigo-500/30"
                      >
                        <Send className="h-3 w-3" />
                        <span>Oferecer</span>
                      </button>
                    )}

                    {/* Quick sell button */}
                    <button
                      disabled={!canSell}
                      onClick={() => onSellPlayer(p)}
                      title="Venda rápida direta com 8% de deságio"
                      className="rounded-xl bg-rose-500/80 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      {isLoaned
                        ? "🔒 Emprestado"
                        : !windowStatus.isOpen
                        ? "🔒 Fechada"
                        : "Venda Rápida"}
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
