import React, { useState } from "react";
import {
  X,
  Check,
  AlertCircle,
  ArrowRight,
  Coins,
  Shield,
  Award,
  Sparkles,
  Flame,
  Percent,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Building,
} from "lucide-react";
import type { Club, Player, SquadRole } from "../types/game";
import {
  calculateClubPrestige,
  evaluateClubValuation,
  evaluateClubFeeOffer,
  evaluatePlayerInterest,
  evaluateContractOffer,
} from "../engine/transferNegotiationEngine";
import { formatMoney, formatWage } from "../utils/format";
import { PlayerAvatar } from "./PlayerAvatar";

interface TransferNegotiationModalProps {
  player: Player | null;
  userClub: Club;
  sellerClub: Club | null | undefined;
  userBudgetEur: number;
  onClose: () => void;
  onCompleteTransfer: (
    player: Player,
    finalFeeEur: number,
    wageEur: number,
    squadRole: SquadRole,
    sellOnPct: number
  ) => void;
}

export const TransferNegotiationModal: React.FC<TransferNegotiationModalProps> = ({
  player,
  userClub,
  sellerClub,
  userBudgetEur,
  onClose,
  onCompleteTransfer,
}) => {
  if (!player) return null;

  // Initial evaluations
  const clubValuation = evaluateClubValuation(sellerClub, userClub, player);
  const playerInterest = evaluatePlayerInterest(userClub, sellerClub, player);
  const userPrestige = calculateClubPrestige(userClub);
  const sellerPrestige = sellerClub ? calculateClubPrestige(sellerClub) : 40;

  // Step state: 1 = Club Fee Negotiation, 2 = Player Contract Negotiation, 3 = Transfer Completed
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Club offer state
  const [offeredFeeEur, setOfferedFeeEur] = useState<number>(
    Math.min(userBudgetEur, clubValuation.askingPriceEur)
  );
  const [sellOnPct, setSellOnPct] = useState<number>(0);
  const [clubResponse, setClubResponse] = useState<{
    status: "idle" | "accepted" | "countered" | "rejected";
    counterFeeEur?: number;
    message: string;
  }>({
    status: "idle",
    message: "",
  });

  // Step 2: Player contract state
  const [offeredWageEur, setOfferedWageEur] = useState<number>(
    playerInterest.minAcceptableWageEur
  );
  const [contractYears, setContractYears] = useState<number>(3);
  const [offeredRole, setOfferedRole] = useState<SquadRole>(playerInterest.expectedRole);
  const [signingBonusEur, setSigningBonusEur] = useState<number>(0);
  const [playerResponse, setPlayerResponse] = useState<{
    status: "idle" | "accepted" | "rejected";
    finalScore?: number;
    message: string;
  }>({
    status: "idle",
    message: "",
  });

  // Handlers for Step 1
  const handleSendClubOffer = () => {
    if (!sellerClub) {
      // Free agent or no club
      setClubResponse({
        status: "accepted",
        message: "Atleta livre no mercado! Avançando direto para os termos contratuais.",
      });
      setStep(2);
      return;
    }

    if (offeredFeeEur > userBudgetEur) {
      setClubResponse({
        status: "rejected",
        message: "Você não possui orçamento de transferências suficiente para esta proposta.",
      });
      return;
    }

    const evalResult = evaluateClubFeeOffer(
      sellerClub,
      userClub,
      player,
      offeredFeeEur,
      sellOnPct
    );

    if (evalResult.accepted) {
      setClubResponse({
        status: "accepted",
        message: evalResult.reason,
      });
    } else if (evalResult.counterFeeEur) {
      setClubResponse({
        status: "countered",
        counterFeeEur: evalResult.counterFeeEur,
        message: evalResult.reason,
      });
    } else {
      setClubResponse({
        status: "rejected",
        message: evalResult.reason,
      });
    }
  };

  const handleAcceptClubCounter = () => {
    if (!clubResponse.counterFeeEur) return;
    if (clubResponse.counterFeeEur > userBudgetEur) {
      setClubResponse({
        ...clubResponse,
        message: "Seu orçamento não cobre a contraproposta do clube vendedor.",
      });
      return;
    }
    setOfferedFeeEur(clubResponse.counterFeeEur);
    setClubResponse({
      status: "accepted",
      message: `Você aceitou a contraproposta de ${formatMoney(
        clubResponse.counterFeeEur
      )}. O clube adversário liberou o atleta para negociar termos contratuais!`,
    });
  };

  // Handlers for Step 2
  const handleSendContractOffer = () => {
    const totalCashNeeded = offeredFeeEur + signingBonusEur;
    if (totalCashNeeded > userBudgetEur) {
      setPlayerResponse({
        status: "rejected",
        message: "Seu orçamento total é insuficiente para cobrir a taxa + luvas de assinatura.",
      });
      return;
    }

    const result = evaluateContractOffer(
      userClub,
      player,
      playerInterest,
      offeredWageEur,
      contractYears,
      offeredRole,
      signingBonusEur
    );

    if (result.accepted) {
      setPlayerResponse({
        status: "accepted",
        finalScore: result.finalScore,
        message: result.reason,
      });
      setStep(3);
    } else {
      setPlayerResponse({
        status: "rejected",
        finalScore: result.finalScore,
        message: result.reason,
      });
    }
  };

  const handleFinalize = () => {
    onCompleteTransfer(
      player,
      offeredFeeEur + signingBonusEur,
      offeredWageEur,
      offeredRole,
      sellOnPct
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <PlayerAvatar
              name={player.name}
              imageUrl={player.imageUrl}
              size="md"
              accentColor={userClub.primaryColor}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">{player.name}</h2>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-300 border border-emerald-500/40">
                  OVR {player.overall}
                </span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">
                  {player.primaryPosition}
                </span>
                {clubValuation.isRival && (
                  <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-rose-300 border border-rose-500/40">
                    <Flame className="h-3 w-3" /> Rival Histórico
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                {player.age} anos • {player.nationality} • Clube atual:{" "}
                <strong className="text-slate-200">{player.clubName || "Livre"}</strong>
                {sellerClub && ` (${sellerClub.league ?? sellerClub.division} • Prestígio ${sellerPrestige})`}
                {" • "}
                <span>Seu prestígio: <strong className="text-emerald-400">{userPrestige}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Seu Orçamento Disponível
              </div>
              <div className="text-sm font-black text-emerald-400">
                {formatMoney(userBudgetEur)}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:border-slate-700 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* STEP PROGRESS BAR */}
        <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/40 text-xs">
          <button
            onClick={() => step !== 3 && setStep(1)}
            disabled={step === 3}
            className={`flex items-center justify-center gap-2 py-3 font-bold transition ${
              step === 1
                ? "border-b-2 border-emerald-500 bg-emerald-500/10 text-emerald-300"
                : clubResponse.status === "accepted"
                ? "text-emerald-400 hover:text-emerald-300"
                : "text-slate-500"
            }`}
          >
            <Building className="h-4 w-4" />
            <span>1. Acordo entre Clubes</span>
            {clubResponse.status === "accepted" && <Check className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={() => clubResponse.status === "accepted" && setStep(2)}
            disabled={clubResponse.status !== "accepted"}
            className={`flex items-center justify-center gap-2 py-3 font-bold transition ${
              step === 2 || step === 3
                ? "border-b-2 border-emerald-500 bg-emerald-500/10 text-emerald-300"
                : "cursor-not-allowed text-slate-600"
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>2. Contrato com o Atleta</span>
            {step === 3 && <Check className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ================= STEP 1: CLUB FEE ================= */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Context Cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Valor de Mercado
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {formatMoney(player.marketValueEur)}
                  </div>
                  <div className="text-[10px] text-slate-400">Avaliação oficial Transfermarkt</div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Pedida Estimada do Clube
                  </div>
                  <div className="mt-1 text-lg font-black text-amber-300">
                    {formatMoney(clubValuation.askingPriceEur)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Mínimo aceitável: ~{formatMoney(clubValuation.minimumAcceptableEur)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Postura da Diretoria
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-200">
                    {clubValuation.statusText}
                  </div>
                  {clubValuation.isRival && (
                    <div className="mt-1 text-[10px] font-bold text-rose-400">
                      ⚠️ {clubValuation.rivalryReason}
                    </div>
                  )}
                </div>
              </div>

              {/* Offer Form */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Sua Oferta de Transferência
                  </h3>
                  <span className="text-xs font-semibold text-slate-400">
                    Orçamento Restante pós-oferta:{" "}
                    <strong
                      className={
                        userBudgetEur - offeredFeeEur >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {formatMoney(Math.max(0, userBudgetEur - offeredFeeEur))}
                    </strong>
                  </span>
                </div>

                {/* Amount Slider & Input */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Compensação Financeira à Vista:
                    </label>
                    <span className="text-xl font-black text-emerald-400">
                      {formatMoney(offeredFeeEur)}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={Math.round(player.marketValueEur * 0.5)}
                    max={Math.max(userBudgetEur, clubValuation.askingPriceEur * 1.5)}
                    step={250_000}
                    value={offeredFeeEur}
                    onChange={(e) => {
                      setOfferedFeeEur(Number(e.target.value));
                      if (clubResponse.status !== "idle") {
                        setClubResponse({ status: "idle", message: "" });
                      }
                    }}
                    className="w-full accent-emerald-500"
                  />

                  {/* Preset quick buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setOfferedFeeEur(player.marketValueEur)}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white"
                    >
                      Valor de Mercado ({formatMoney(player.marketValueEur)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfferedFeeEur(clubValuation.askingPriceEur)}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:text-white"
                    >
                      Pedida da IA ({formatMoney(clubValuation.askingPriceEur)})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOfferedFeeEur(
                          Math.min(userBudgetEur, Math.round(clubValuation.askingPriceEur * 1.15))
                        )
                      }
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white"
                    >
                      +15% Oferta Forte
                    </button>
                    {userBudgetEur < clubValuation.askingPriceEur && (
                      <button
                        type="button"
                        onClick={() => setOfferedFeeEur(userBudgetEur)}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300"
                      >
                        Tudo que Tenho ({formatMoney(userBudgetEur)})
                      </button>
                    )}
                  </div>
                </div>

                {/* Sell-on Clause selector */}
                <div className="border-t border-slate-800/80 pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Percent className="h-4 w-4 text-indigo-400" />
                      <label className="text-xs font-bold text-slate-300">
                        Cláusula de Percentual de Venda Futura (Sell-On):
                      </label>
                    </div>
                    <span className="text-xs font-black text-indigo-300">{sellOnPct}%</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Incluir uma porcentagem de venda futura convence o clube vendedor a aceitar um
                    valor à vista menor.
                  </p>
                  <div className="flex gap-2">
                    {[0, 10, 15, 20, 25].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setSellOnPct(pct);
                          if (clubResponse.status !== "idle") {
                            setClubResponse({ status: "idle", message: "" });
                          }
                        }}
                        className={`rounded-xl border px-3 py-1 text-xs font-bold transition ${
                          sellOnPct === pct
                            ? "border-indigo-500 bg-indigo-500/20 text-indigo-200"
                            : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Club Response Banner */}
                {clubResponse.status !== "idle" && (
                  <div
                    className={`rounded-2xl border p-4 ${
                      clubResponse.status === "accepted"
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : clubResponse.status === "countered"
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-rose-500/50 bg-rose-500/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {clubResponse.status === "accepted" ? (
                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                      ) : clubResponse.status === "countered" ? (
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                      )}
                      <div className="space-y-2">
                        <div
                          className={`text-xs font-bold leading-relaxed ${
                            clubResponse.status === "accepted"
                              ? "text-emerald-300"
                              : clubResponse.status === "countered"
                              ? "text-amber-200"
                              : "text-rose-300"
                          }`}
                        >
                          {clubResponse.message}
                        </div>

                        {clubResponse.status === "countered" && clubResponse.counterFeeEur && (
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleAcceptClubCounter}
                              disabled={clubResponse.counterFeeEur > userBudgetEur}
                              className="rounded-xl bg-amber-400 px-4 py-1.5 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
                            >
                              Aceitar Pedida de {formatMoney(clubResponse.counterFeeEur)}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  {clubResponse.status === "accepted" ? (
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-xs font-black text-slate-950 transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                    >
                      <span>Avançar para Negociação com o Atleta</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendClubOffer}
                      disabled={offeredFeeEur > userBudgetEur}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-xs font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      <Building className="h-4 w-4" />
                      <span>Formalizar Proposta à Diretoria</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: PLAYER CONTRACT ================= */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Interest Gauge & Breakdown */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                      Termômetro de Interesse do Atleta
                    </h3>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
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
                      : "Inviável / Resistente"}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-400">Índice Inicial de Aceitação</span>
                    <span
                      className={
                        playerInterest.interestScore >= 70
                          ? "text-emerald-400"
                          : playerInterest.interestScore >= 50
                          ? "text-sky-400"
                          : playerInterest.interestScore >= 30
                          ? "text-amber-400"
                          : "text-rose-400"
                      }
                    >
                      {playerInterest.interestScore}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-all duration-500 ${
                        playerInterest.interestScore >= 70
                          ? "bg-emerald-500"
                          : playerInterest.interestScore >= 50
                          ? "bg-sky-500"
                          : playerInterest.interestScore >= 30
                          ? "bg-amber-400"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${playerInterest.interestScore}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {playerInterest.summary}
                </p>

                {/* Positive & Negative Factors list */}
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-emerald-400">
                      <ThumbsUp className="h-3.5 w-3.5" /> Fatores Positivos (Ajudam)
                    </div>
                    {playerInterest.positiveFactors.length === 0 ? (
                      <div className="text-[11px] text-slate-500">Nenhum fator favorável forte.</div>
                    ) : (
                      <ul className="space-y-1 text-xs text-slate-300">
                        {playerInterest.positiveFactors.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-400 font-bold">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-rose-400">
                      <ThumbsDown className="h-3.5 w-3.5" /> Fatores Negativos (Dificultam)
                    </div>
                    {playerInterest.negativeFactors.length === 0 ? (
                      <div className="text-[11px] text-slate-500">Sem grandes resistências.</div>
                    ) : (
                      <ul className="space-y-1 text-xs text-slate-300">
                        {playerInterest.negativeFactors.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-rose-400 font-bold">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Contract Terms Form */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 space-y-5">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Termos Contratuais Propostos
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Wage slider */}
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300">
                        Salário Semanal (€/sem):
                      </label>
                      <span className="text-base font-black text-emerald-400">
                        {formatWage(offeredWageEur)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={Math.round(player.wageEur * 0.8)}
                      max={Math.max(playerInterest.minAcceptableWageEur * 2, player.wageEur * 3)}
                      step={500}
                      value={offeredWageEur}
                      onChange={(e) => {
                        setOfferedWageEur(Number(e.target.value));
                        if (playerResponse.status !== "idle") {
                          setPlayerResponse({ status: "idle", message: "" });
                        }
                      }}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Atual: {formatWage(player.wageEur)}</span>
                      <span className="text-amber-400 font-semibold">
                        Mínimo Esperado: {formatWage(playerInterest.minAcceptableWageEur)}
                      </span>
                    </div>
                  </div>

                  {/* Contract length */}
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <label className="text-xs font-bold text-slate-300">
                      Duração do Contrato:
                    </label>
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      {[1, 2, 3, 4, 5].map((yrs) => (
                        <button
                          key={yrs}
                          type="button"
                          onClick={() => setContractYears(yrs)}
                          className={`rounded-lg py-2 text-xs font-bold transition ${
                            contractYears === yrs
                              ? "bg-emerald-500 text-slate-950"
                              : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                          }`}
                        >
                          {yrs} {yrs === 1 ? "ano" : "anos"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Squad Role Promise */}
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <label className="text-xs font-bold text-slate-300">
                      Papel no Elenco Prometido:
                    </label>
                    <select
                      value={offeredRole}
                      onChange={(e) => {
                        setOfferedRole(e.target.value as SquadRole);
                        if (playerResponse.status !== "idle") {
                          setPlayerResponse({ status: "idle", message: "" });
                        }
                      }}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-white outline-none"
                    >
                      <option value="key_player">🌟 Estrela Principal (Titular Indispensável)</option>
                      <option value="important">⚽ Titular Importante (Primeiro Time)</option>
                      <option value="rotation">🔄 Rotação de Elenco (Entra no Rodízio)</option>
                      <option value="prospect">🌱 Jovem Promessa (Em Desenvolvimento)</option>
                    </select>
                    <div className="text-[10px] text-slate-400">
                      Expectativa do jogador:{" "}
                      <strong className="text-amber-300">
                        {playerInterest.expectedRole === "key_player"
                          ? "Estrela Principal"
                          : playerInterest.expectedRole === "important"
                          ? "Titular Importante"
                          : playerInterest.expectedRole === "rotation"
                          ? "Rotação"
                          : "Jovem Promessa"}
                      </strong>
                    </div>
                  </div>

                  {/* Signing Bonus (Luvas) */}
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Coins className="h-4 w-4 text-amber-400" />
                        <label className="text-xs font-bold text-slate-300">
                          Bônus de Assinatura (Luvas):
                        </label>
                      </div>
                      <span className="text-xs font-black text-amber-300">
                        {formatMoney(signingBonusEur)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[0, 500_000, 1_000_000, 2_000_000, 3_000_000].map((bonus) => (
                        <button
                          key={bonus}
                          type="button"
                          onClick={() => setSigningBonusEur(bonus)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                            signingBonusEur === bonus
                              ? "bg-amber-400 text-slate-950"
                              : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                          }`}
                        >
                          {bonus === 0 ? "Sem Luvas" : formatMoney(bonus)}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Oferecer luvas ajuda a convencer atletas relutantes ou disputados.
                    </div>
                  </div>
                </div>

                {/* Player Refusal message */}
                {playerResponse.status === "rejected" && (
                  <div className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                      <div className="text-xs font-bold text-rose-300 leading-relaxed">
                        {playerResponse.message}
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Contract Action */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white"
                  >
                    ← Voltar ao Acordo com o Clube
                  </button>

                  <button
                    type="button"
                    onClick={handleSendContractOffer}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-xs font-black text-slate-950 transition hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                  >
                    <Award className="h-4 w-4" />
                    <span>Apresentar Proposta ao Atleta</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: SUCCESS / DEAL COMPLETE ================= */}
          {step === 3 && (
            <div className="space-y-6 py-4 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/20">
                <Sparkles className="h-10 w-10 animate-bounce" />
              </div>

              <div className="space-y-2">
                <span className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-black uppercase text-emerald-300 border border-emerald-500/40">
                  Transferência Concluída!
                </span>
                <h2 className="text-2xl font-black text-white">
                  {player.name} é do {userClub.name}!
                </h2>
                <p className="mx-auto max-w-lg text-xs text-slate-300 leading-relaxed">
                  {playerResponse.message}
                </p>
              </div>

              {/* Deal Summary Box */}
              <div className="mx-auto grid max-w-xl gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left sm:grid-cols-2 text-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Taxa de Transferência
                  </div>
                  <div className="text-sm font-black text-emerald-400">
                    {formatMoney(offeredFeeEur + signingBonusEur)}
                  </div>
                  {sellOnPct > 0 && (
                    <div className="text-[10px] text-indigo-300">
                      + {sellOnPct}% de futura venda para o {sellerClub?.name}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Contrato & Salário
                  </div>
                  <div className="text-sm font-black text-white">
                    {formatWage(offeredWageEur)} ({contractYears} anos)
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Papel:{" "}
                    {offeredRole === "key_player"
                      ? "Estrela Principal"
                      : offeredRole === "important"
                      ? "Titular Importante"
                      : "Rotação"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinalize}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-8 py-3.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400 shadow-xl shadow-emerald-500/25"
              >
                <span>Receber Atleta no Elenco e Concluir</span>
                <Check className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
