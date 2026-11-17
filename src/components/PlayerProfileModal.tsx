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
} from "lucide-react";
import type { Player } from "../types/game";
import type { TransferWindowStatus } from "../utils/calendar";
import {
  formatMoney,
  formatWage,
  getOverallColor,
  getRoleBadgeClass,
  getStatBarColor,
  getStatTextColor,
} from "../utils/format";
import { PlayerAvatar } from "./PlayerAvatar";

interface PlayerProfileModalProps {
  player: Player | null;
  userClubId: number;
  userBudgetEur: number;
  userSquadSize: number;
  windowStatus?: TransferWindowStatus;
  isShortlisted?: boolean;
  onToggleShortlist?: (playerId: number) => void;
  onClose: () => void;
  onBuyPlayer?: (player: Player) => void;
  onSellPlayer?: (player: Player) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  userClubId,
  userBudgetEur,
  userSquadSize,
  windowStatus,
  isShortlisted = false,
  onToggleShortlist,
  onClose,
  onBuyPlayer,
  onSellPlayer,
}) => {
  if (!player) return null;

  const isOwned = player.clubId === userClubId;
  const canBuy = !isOwned && Boolean(onBuyPlayer);
  const canSell = isOwned && Boolean(onSellPlayer);
  const canAfford = userBudgetEur >= player.marketValueEur;
  const windowClosed = Boolean(windowStatus && !windowStatus.isOpen);

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
              <div className="flex flex-wrap items-center justify-between gap-3">
                {canBuy && (
                  <>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Contratar {player.name} por {formatMoney(player.marketValueEur)}
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
                    </div>
                  </>
                )}
                {canSell && (
                  <>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Vender {player.name} por {formatMoney(Math.round(player.marketValueEur * 0.92))}
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
                      className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {windowClosed
                        ? "🔒 Janela Fechada"
                        : userSquadSize <= 16
                        ? "Elenco no Mínimo (16)"
                        : "Aceitar Proposta e Vender"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
