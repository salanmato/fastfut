import React from "react";
import {
  X,
  Sparkles,
  Shield,
  Footprints,
  Banknote,
  Calendar,
  HeartPulse,
  Star,
  Shirt,
  Send,
  Building,
} from "lucide-react";
import type { Club, Player } from "../types/game";
import type { TransferWindowStatus } from "../utils/calendar";
import { evaluateShirtNumberAffinity } from "../utils/shirtNumbers";
import {
  evaluatePlayerInterest,
  areRivals,
} from "../engine/transferNegotiationEngine";
import {
  formatMoney,
  formatWage,
  getOverallColor,
  getRoleBadgeClass,
  getStatBarColor,
  getStatTextColor,
} from "../utils/format";
import { PlayerAvatar } from "./PlayerAvatar";

const MODAL_SHIRT_NUMBERS = Array.from({ length: 99 }, (_, i) => i + 1);

interface PlayerProfileModalProps {
  player: Player | null;
  userClubId: number;
  userBudgetEur: number;
  userSquadSize: number;
  userClub?: Club;
  sellerClub?: Club;
  windowStatus?: TransferWindowStatus;
  isShortlisted?: boolean;
  onToggleShortlist?: (playerId: number) => void;
  onChangeShirtNumber?: (playerId: number, newNumber: number) => void;
  onClose: () => void;
  onBuyPlayer?: (player: Player) => void;
  onStartNegotiation?: (player: Player) => void;
  onToggleTransferListed?: (playerId: number) => void;
  onOfferPlayerToMarket?: (playerId: number) => void;
  onSellPlayer?: (player: Player) => void;
  onPromoteYouth?: (playerId: number) => void;
  onDemoteToYouth?: (playerId: number) => void;
  onExerciseBuyOption?: (playerId: number) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  userClubId,
  userBudgetEur,
  userSquadSize,
  userClub,
  sellerClub,
  windowStatus,
  isShortlisted = false,
  onToggleShortlist,
  onChangeShirtNumber,
  onClose,
  onBuyPlayer,
  onStartNegotiation,
  onToggleTransferListed,
  onOfferPlayerToMarket,
  onSellPlayer,
  onPromoteYouth,
  onDemoteToYouth,
  onExerciseBuyOption,
}) => {
  if (!player) return null;

  const isOwned = player.clubId === userClubId;
  const isLoaned = Boolean(player.loan?.isLoan);
  const canBuy = !isOwned && (Boolean(onBuyPlayer) || Boolean(onStartNegotiation));
  const canSell = isOwned && Boolean(onSellPlayer) && !isLoaned;
  const canAfford = userBudgetEur >= player.marketValueEur;
  const canAffordBuyOption =
    Boolean(player.loan?.buyOptionFeeEur && userBudgetEur >= player.loan.buyOptionFeeEur);
  const windowClosed = Boolean(windowStatus && !windowStatus.isOpen);
  const shirtAffinity = evaluateShirtNumberAffinity(player);

  const playerInterest = userClub
    ? evaluatePlayerInterest(userClub, sellerClub, player)
    : null;
  const rivalryInfo = userClub ? areRivals(userClub, sellerClub) : { isRival: false };

  const statGroups: Array<{ title: string; items: Array<[string, number]> }> = [
    {
      title: "Ataque & Finalização",
      items: [
        ["Finalização", player.stats.finishing],
        ["Posicionamento", player.stats.positioning],
        ["Força do Chute", player.stats.shotPower],
        ["Chutes de Longe", player.stats.longShots],
        ["Cabeceio", player.stats.headingAccuracy],
      ],
    },
    {
      title: "Criação & Técnica",
      items: [
        ["Visão de Jogo", player.stats.vision],
        ["Passe Curto", player.stats.shortPassing],
        ["Passe Longo", player.stats.longPassing],
        ["Cruzamento", player.stats.crossing],
        ["Controle de Bola", player.stats.ballControl],
        ["Drible", player.stats.dribbling],
      ],
    },
    {
      title: "Defesa & Tática",
      items: [
        ["Noção Defensiva", player.stats.defensiveAwareness],
        ["Interceptação", player.stats.interceptions],
        ["Desarme em Pé", player.stats.standingTackle],
        ["Carrinho", player.stats.slidingTackle],
        ["Compostura", player.stats.composure],
      ],
    },
    {
      title: "Físico & Mental",
      items: [
        ["Aceleração", player.stats.acceleration],
        ["Velocidade Final", player.stats.sprintSpeed],
        ["Agilidade", player.stats.agility],
        ["Reações", player.stats.reactions],
        ["Fôlego", player.stats.stamina],
        ["Força Física", player.stats.strength],
        ["Impulsão", player.stats.jumping],
        ["Agressividade", player.stats.aggression],
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-4">
            <PlayerAvatar name={player.name} imageUrl={player.imageUrl} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-bold ${getRoleBadgeClass(
                    player.roleCategory
                  )}`}
                >
                  {player.positions.join(" / ")}
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-black ${getOverallColor(
                    player.overall
                  )}`}
                >
                  OVR {player.overall}
                </span>
                <span className="rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                  POT {player.potential}
                </span>
                {player.squadCategory === "youth" ? (
                  <span className="rounded-md border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-xs font-bold text-purple-300">
                    Base Sub-20
                  </span>
                ) : (
                  <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">
                    Elenco Principal
                  </span>
                )}
                {player.loan?.isLoan && (
                  <span className="rounded-md border border-sky-400/50 bg-sky-400/20 px-2 py-0.5 text-xs font-black text-sky-200">
                    EMPRÉSTIMO
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 text-2xl font-bold text-white">{player.fullName}</h2>
              <p className="text-sm text-slate-400">
                {player.clubName} • {player.league} • {player.nationality} • {player.age} anos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 p-5">
          {(player.injuryMatchesLeft ?? 0) > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-3 text-xs text-rose-200">
              <HeartPulse className="h-5 w-5 shrink-0 text-rose-400" />
              <div>
                <strong className="text-white">Departamento Médico:</strong>{" "}
                {player.injuryType ?? "Lesão muscular"} • Retorno estimado em{" "}
                <strong className="text-white">{player.injuryMatchesLeft}</strong> rodada(s).
              </div>
            </div>
          )}

          {player.loan?.isLoan && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-950/40 p-4 text-xs">
              <div>
                <span className="rounded bg-sky-500 px-2 py-0.5 text-[10px] font-black text-slate-950">
                  CONTRATO DE EMPRÉSTIMO
                </span>
                <div className="mt-1 text-slate-200">
                  Vinculado ao <strong>{player.loan.parentClubName}</strong> ({player.loan.parentClubLeague ?? "Origem"}).
                  Término do empréstimo: fim da temporada <strong>{player.loan.loanEndSeason}</strong>.
                </div>
              </div>
              {player.loan.buyOptionFeeEur && (
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Opção de Compra</div>
                  <div className="text-sm font-black text-amber-300">
                    {formatMoney(player.loan.buyOptionFeeEur)}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Quick Bio & Finance */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Banknote className="h-3.5 w-3.5 text-emerald-400" /> Valor de Mercado
              </div>
              <div className="mt-1 text-lg font-bold text-emerald-400">
                {formatMoney(player.marketValueEur)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-sky-400" /> Salário / Contrato
              </div>
              <div className="mt-1 text-sm font-bold text-white">{formatWage(player.wageEur)}</div>
              <div className="text-[11px] text-slate-500">Até {player.contractUntil}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Footprints className="h-3.5 w-3.5 text-amber-400" /> Perfil Físico
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {player.heightCm} cm • {player.weightKg} kg
              </div>
              <div className="text-[11px] text-slate-400">
                Pé: {player.preferredFoot} • WF {player.weakFoot}★ • SM {player.skillMoves}★
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Shield className="h-3.5 w-3.5 text-rose-400" /> Temporada 26/27
              </div>
              <div className="mt-1 text-sm font-bold text-white">
                {player.seasonAppearances}J • {player.seasonGoals}G • {player.seasonAssists}A
              </div>
              <div className="text-[11px] text-slate-400">
                Energia {Math.round(player.stamina)}% • Moral {player.morale}%
              </div>
            </div>
          </div>

          {/* Shirt Number & Performance Affinity */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 font-black text-white">
                  #{player.shirtNumber ?? "-"}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Shirt className="h-3.5 w-3.5 text-amber-400" /> Numeração & Afinidade em Campo
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {shirtAffinity.label}{" "}
                    <span
                      className={`font-black ${
                        shirtAffinity.tier === "perfect"
                          ? "text-emerald-400"
                          : shirtAffinity.tier === "good"
                          ? "text-sky-400"
                          : shirtAffinity.tier === "awkward"
                          ? "text-rose-400"
                          : "text-slate-300"
                      }`}
                    >
                      ({shirtAffinity.bonusPctText} de rendimento)
                    </span>
                  </div>
                </div>
              </div>

              {isOwned && onChangeShirtNumber && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400">Alterar:</span>
                  <select
                    value={player.shirtNumber ?? 1}
                    onChange={(e) => onChangeShirtNumber(player.id, Number(e.target.value))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-black text-white outline-none"
                  >
                    {MODAL_SHIRT_NUMBERS.map((n) => (
                      <option key={n} value={n}>
                        Camisa #{n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <div className="mb-1.5 text-[11px] font-bold text-slate-400">
                  Números que já usou (Histórico):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {shirtAffinity.historyNumbers.map((num) => {
                    const active = player.shirtNumber === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={!isOwned || !onChangeShirtNumber}
                        onClick={() => onChangeShirtNumber?.(player.id, num)}
                        className={`rounded border px-2 py-0.5 text-xs font-black transition ${
                          active
                            ? "border-emerald-400 bg-emerald-500 text-slate-950"
                            : isOwned && onChangeShirtNumber
                            ? "border-amber-400/50 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
                            : "border-slate-700 bg-slate-900 text-slate-300"
                        }`}
                      >
                        #{num}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] font-bold text-slate-400">
                  Números ideais da função ({player.primaryPosition}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {shirtAffinity.roleNumbers.map((num) => {
                    const active = player.shirtNumber === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={!isOwned || !onChangeShirtNumber}
                        onClick={() => onChangeShirtNumber?.(player.id, num)}
                        className={`rounded border px-2 py-0.5 text-xs font-black transition ${
                          active
                            ? "border-emerald-400 bg-emerald-500 text-slate-950"
                            : isOwned && onChangeShirtNumber
                            ? "border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
                            : "border-slate-700 bg-slate-900 text-slate-300"
                        }`}
                      >
                        #{num}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 6 Face Attributes */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              Atributos Principais (EA FC 27)
            </h3>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                ["Ritmo", player.faceStats.pace],
                ["Chute", player.faceStats.shooting],
                ["Passe", player.faceStats.passing],
                ["Drible", player.faceStats.dribbling],
                ["Defesa", player.faceStats.defending],
                ["Físico", player.faceStats.physicality],
              ].map(([label, val]) => (
                <div
                  key={label as string}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-center"
                >
                  <div className="text-[11px] text-slate-400">{label}</div>
                  <div className={`text-xl font-black ${getStatTextColor(val as number)}`}>
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Playstyles & FC IQ */}
          {(player.playstylesPlus.length > 0 || player.playstylesBase.length > 0 || player.fcIqRoles) && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5">
              {player.fcIqRoles && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Funções Táticas (FC IQ):{" "}
                  </span>
                  <span className="text-xs text-slate-200">{player.fcIqRoles}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {player.playstylesPlus.map((ps) => (
                  <span
                    key={ps}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300"
                  >
                    <Sparkles className="h-3 w-3" /> {ps}+
                  </span>
                ))}
                {player.playstylesBase.map((ps) => (
                  <span
                    key={ps}
                    className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300"
                  >
                    {ps}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Attribute Breakdown */}
          <div className="grid gap-4 md:grid-cols-2">
            {statGroups.map((group) => (
              <div
                key={group.title}
                className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5"
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {group.title}
                </h4>
                {group.items.map(([label, val]) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">{label}</span>
                      <span className={`font-bold ${getStatTextColor(val)}`}>{val}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${getStatBarColor(val)}`}
                        style={{ width: `${Math.min(100, val)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Transfer Actions */}
          {(canBuy || canSell) && (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
              {windowClosed && windowStatus && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">
                  🔒 Mercado Fechado ({windowStatus.detailText})
                </div>
              )}

              {/* Buying perspective: show player interest and negotiation CTA */}
              {canBuy && (
                <div className="space-y-3">
                  {playerInterest && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Interesse em atuar no seu clube
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                            playerInterest.feasibility === "very_interested"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : playerInterest.feasibility === "open"
                              ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                              : playerInterest.feasibility === "hard"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          }`}
                        >
                          {playerInterest.feasibility === "very_interested"
                            ? "Muito Entusiasmado"
                            : playerInterest.feasibility === "open"
                            ? "Aberto a Negociar"
                            : playerInterest.feasibility === "hard"
                            ? "Relutante"
                            : "Inviável"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{playerInterest.summary}</p>
                      {rivalryInfo.isRival && (
                        <div className="text-[11px] font-bold text-rose-400">
                          🔥 Rivalidade Histórica ({rivalryInfo.reason})
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Valor de Mercado: {formatMoney(player.marketValueEur)}
                      </div>
                      <div className="text-xs text-slate-400">
                        Seu orçamento disponível: {formatMoney(userBudgetEur)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {onToggleShortlist && (
                        <button
                          onClick={() => onToggleShortlist(player.id)}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                            isShortlisted
                              ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                              : "border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-400/50 hover:text-amber-300"
                          }`}
                        >
                          <Star className={`h-3.5 w-3.5 ${isShortlisted ? "fill-current" : ""}`} />
                          {isShortlisted ? "Nos Alvos ★" : "Adicionar aos Alvos"}
                        </button>
                      )}

                      {onStartNegotiation ? (
                        <button
                          disabled={windowClosed}
                          onClick={() => {
                            onStartNegotiation(player);
                            onClose();
                          }}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 shadow-lg shadow-emerald-500/20"
                        >
                          <Building className="h-4 w-4" />
                          <span>{windowClosed ? "🔒 Janela Fechada" : "Negociar Contratação ➜"}</span>
                        </button>
                      ) : (
                        <button
                          disabled={windowClosed || !canAfford}
                          onClick={() => {
                            onBuyPlayer?.(player);
                            onClose();
                          }}
                          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          {windowClosed
                            ? "🔒 Janela Fechada"
                            : canAfford
                            ? "Fechar Contratação"
                            : "Orçamento Insuficiente"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Selling perspective: transfer list, offer to clubs, or quick-sell */}
              {canSell && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300">Situação no Mercado:</span>
                      {player.isTransferListed ? (
                        <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs font-black uppercase text-amber-300 border border-amber-400/40">
                          📦 Na Lista de Transferências
                        </span>
                      ) : (
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
                          🛡️ No Elenco (Não Listado)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {onToggleTransferListed && (
                        <button
                          onClick={() => onToggleTransferListed(player.id)}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                            player.isTransferListed
                              ? "border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                              : "border-amber-400/50 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                          }`}
                        >
                          {player.isTransferListed
                            ? "Retirar da Lista de Transferências"
                            : "Colocar na Lista de Transferências"}
                        </button>
                      )}

                      {onOfferPlayerToMarket && windowStatus?.isOpen && (
                        <button
                          onClick={() => {
                            onOfferPlayerToMarket(player.id);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/50 bg-indigo-500/20 px-3.5 py-1.5 text-xs font-bold text-indigo-200 transition hover:bg-indigo-500/30"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>Oferecer ao Mercado Global</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Venda Rápida de Emergência por {formatMoney(Math.round(player.marketValueEur * 0.92))}
                      </div>
                      <div className="text-xs text-slate-400">
                        Elenco atual: {userSquadSize} jogadores (mínimo exigido: 16)
                      </div>
                    </div>
                    <button
                      disabled={windowClosed || userSquadSize <= 16}
                      onClick={() => {
                        onSellPlayer?.(player);
                        onClose();
                      }}
                      className="rounded-xl border border-rose-500/50 bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      {windowClosed
                        ? "🔒 Janela Fechada"
                        : userSquadSize <= 16
                        ? "Elenco no Mínimo (16)"
                        : "Venda Rápida (92%)"}
                    </button>
                  </div>
                </div>
              )}

                {isOwned && player.squadCategory === "youth" && onPromoteYouth && (
                  <button
                    onClick={() => {
                      onPromoteYouth(player.id);
                      onClose();
                    }}
                    className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    ⬆️ Subir ao Elenco Principal
                  </button>
                )}

                {isOwned && player.squadCategory !== "youth" && player.age <= 22 && onDemoteToYouth && (
                  <button
                    onClick={() => {
                      onDemoteToYouth(player.id);
                      onClose();
                    }}
                    className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-5 py-2.5 text-sm font-bold text-amber-300 transition hover:bg-amber-400/20"
                  >
                    ⬇️ Mover para a Base Sub-20
                  </button>
                )}

                {isOwned && player.loan?.isLoan && player.loan.buyOptionFeeEur && onExerciseBuyOption && (
                  <button
                    disabled={!canAffordBuyOption}
                    onClick={() => {
                      onExerciseBuyOption(player.id);
                      onClose();
                    }}
                    className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {canAffordBuyOption
                      ? `Exercer Compra Definitiva (${formatMoney(player.loan.buyOptionFeeEur)})`
                      : "Sem Orçamento para Compra"}
                  </button>
                )}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
