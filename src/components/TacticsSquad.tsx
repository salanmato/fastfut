import React, { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Sparkles,
  Info,
  Shield,
  Zap,
  Compass,
  Shirt,
  GraduationCap,
  ChevronRight,
  Flame,
  Link2,
} from "lucide-react";
import type {
  Club,
  ClubSynergyTracker,
  Formation,
  Mentality,
  PassingStyle,
  Player,
  Pressing,
  Tactics,
} from "../types/game";
import { autoPickLineup, computeTeamPower, evaluateTacticalFit } from "../engine/matchEngine";
import {
  calculateTeamSynergy,
  getOrCreateClubSynergyTracker,
} from "../engine/synergyEngine";
import {
  getFormationSlots,
  getOverallColor,
  getPlayerDisplayName,
  getRoleBadgeClass,
  getStaminaColor,
} from "../utils/format";
import { evaluateShirtNumberAffinity } from "../utils/shirtNumbers";
import { PlayerAvatar } from "./PlayerAvatar";

const SHIRT_NUMBERS_1_TO_99 = Array.from({ length: 99 }, (_, i) => i + 1);

interface TacticsSquadProps {
  club: Club;
  players: Player[];
  tactics: Tactics;
  synergyTracker?: ClubSynergyTracker;
  onChangeTactics: (next: Tactics) => void;
  onSelectPlayer: (player: Player) => void;
  onChangeShirtNumber?: (playerId: number, newNumber: number) => void;
  onAutoAssignShirtNumbers?: () => void;
  onNavigateToAcademy?: () => void;
}

const FORMATIONS: Formation[] = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "5-3-2"];

export const TacticsSquad: React.FC<TacticsSquadProps> = ({
  club,
  players,
  tactics,
  synergyTracker,
  onChangeTactics,
  onSelectPlayer,
  onChangeShirtNumber,
  onAutoAssignShirtNumbers,
  onNavigateToAcademy,
}) => {
  const [swapId, setSwapId] = useState<number | null>(null);
  const [injuryWarning, setInjuryWarning] = useState<string | null>(null);

  const firstTeamPlayers = useMemo(
    () => players.filter((p) => p.squadCategory !== "youth"),
    [players]
  );
  const youthCount = useMemo(
    () => players.filter((p) => p.squadCategory === "youth").length,
    [players]
  );

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const slots = getFormationSlots(tactics.formation);

  const starters = tactics.starters
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p));
  const bench = tactics.bench
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p));
  const reserves = firstTeamPlayers
    .filter((p) => !tactics.starters.includes(p.id) && !tactics.bench.includes(p.id))
    .sort((a, b) => b.overall - a.overall);

  const tracker = useMemo(
    () =>
      synergyTracker ??
      getOrCreateClubSynergyTracker(
        {
          clubs: [club],
          players,
          currentMatchweek: 1,
          tacticsByClub: { [club.id]: tactics },
        },
        club.id
      ),
    [synergyTracker, club, players, tactics]
  );

  const synergy = useMemo(
    () => calculateTeamSynergy(starters, tactics, tracker),
    [starters, tactics, tracker]
  );

  const tacticalFit = useMemo(
    () => evaluateTacticalFit(starters, tactics),
    [starters, tactics]
  );

  const power = computeTeamPower(
    starters,
    tactics,
    true,
    club.capacity,
    0,
    undefined,
    undefined,
    undefined,
    synergy
  );

  const handleFormationChange = (formation: Formation) => {
    const picked = autoPickLineup(firstTeamPlayers, formation);
    setSwapId(null);
    onChangeTactics({
      ...tactics,
      formation,
      starters: picked.starters,
      bench: picked.bench,
    });
  };

  const handleAutoPick = () => {
    const picked = autoPickLineup(firstTeamPlayers, tactics.formation);
    setSwapId(null);
    onChangeTactics({
      ...tactics,
      starters: picked.starters,
      bench: picked.bench,
    });
  };

  const handleSwapClick = (clickedId: number) => {
    setInjuryWarning(null);
    if (swapId === null) {
      setSwapId(clickedId);
      return;
    }
    if (swapId === clickedId) {
      setSwapId(null);
      return;
    }

    const nextStarters = [...tactics.starters];
    const nextBench = [...tactics.bench];

    const idxAStart = nextStarters.indexOf(swapId);
    const idxABench = nextBench.indexOf(swapId);
    const idxBStart = nextStarters.indexOf(clickedId);
    const idxBBench = nextBench.indexOf(clickedId);

    const playerA = playerMap.get(swapId);
    const playerB = playerMap.get(clickedId);
    const aInjured = (playerA?.injuryMatchesLeft ?? 0) > 0;
    const bInjured = (playerB?.injuryMatchesLeft ?? 0) > 0;

    if ((idxAStart >= 0 && bInjured) || (idxBStart >= 0 && aInjured)) {
      const injPlayer = bInjured ? playerB : playerA;
      setInjuryWarning(
        `${injPlayer?.name} está no Departamento Médico (${injPlayer?.injuryType} — ${injPlayer?.injuryMatchesLeft} rod.) e não pode ser escalado como titular.`
      );
      setSwapId(null);
      return;
    }

    // Put clickedId where swapId was, and swapId where clickedId was
    if (idxAStart >= 0) nextStarters[idxAStart] = clickedId;
    else if (idxABench >= 0) nextBench[idxABench] = clickedId;

    if (idxBStart >= 0) nextStarters[idxBStart] = swapId;
    else if (idxBBench >= 0) nextBench[idxBBench] = swapId;

    setSwapId(null);
    onChangeTactics({
      ...tactics,
      starters: nextStarters,
      bench: nextBench,
    });
  };

  const swapPlayer = swapId !== null ? playerMap.get(swapId) : undefined;

  const renderRow = (p: Player, slotLabel: string, indexLabel: string) => {
    const isSelectedForSwap = swapId === p.id;
    const injLeft = p.injuryMatchesLeft ?? 0;
    const staminaPct = Math.round(p.stamina);
    const affinity = evaluateShirtNumberAffinity(p);
    const affinityTitle = `${affinity.label} (${affinity.bonusPctText}) • Já usou: #${affinity.historyNumbers.join(", #")} • Função (${p.primaryPosition}): #${affinity.roleNumbers.join(", #")}`;
    return (
      <div
        key={p.id}
        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition ${
          isSelectedForSwap
            ? "border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/50"
            : injLeft > 0
            ? "border-rose-500/40 bg-rose-950/20"
            : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden sm:inline-block w-9 shrink-0 text-center text-[10px] font-bold text-slate-400">
            {indexLabel}
          </span>
          {onChangeShirtNumber ? (
            <select
              value={p.shirtNumber ?? 1}
              title={affinityTitle}
              onChange={(e) => onChangeShirtNumber(p.id, Number(e.target.value))}
              className={`w-14 shrink-0 rounded border px-1 py-0.5 text-center text-[11px] font-black outline-none ${
                affinity.tier === "perfect"
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                  : affinity.tier === "good"
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                  : affinity.tier === "awkward"
                  ? "border-rose-500/60 bg-rose-500/15 text-rose-300"
                  : "border-slate-700 bg-slate-900 text-slate-200"
              }`}
            >
              {SHIRT_NUMBERS_1_TO_99.map((n) => {
                const isHist = affinity.historyNumbers.includes(n);
                const isRole = affinity.roleNumbers.includes(n);
                const mark = isHist && isRole ? " ★★" : isHist ? " ★" : isRole ? " •" : "";
                return (
                  <option key={n} value={n}>
                    #{n}
                    {mark}
                  </option>
                );
              })}
            </select>
          ) : (
            <span className="w-9 shrink-0 rounded border border-slate-700 bg-slate-900 py-0.5 text-center text-[10px] font-black text-slate-200">
              #{p.shirtNumber ?? "-"}
            </span>
          )}
          <span
            className={`w-10 shrink-0 rounded border py-0.5 text-center text-[10px] font-bold ${getRoleBadgeClass(
              p.roleCategory
            )}`}
          >
            {slotLabel}
          </span>
          <button
            onClick={() => onSelectPlayer(p)}
            className="flex min-w-0 items-center gap-2 text-left group"
          >
            <PlayerAvatar
              name={p.name}
              imageUrl={p.imageUrl}
              size="xs"
              accentColor={club.primaryColor}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-xs font-bold text-white group-hover:text-emerald-300">
                <span className="truncate">{p.name}</span>
                {affinity.tier !== "neutral" && (
                  <span
                    title={affinityTitle}
                    className={`hidden md:inline-block shrink-0 rounded border px-1 py-0.2 text-[9px] font-black ${
                      affinity.tier === "perfect"
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : affinity.tier === "good"
                        ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                        : "border-rose-500/50 bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {affinity.bonusPctText}
                  </span>
                )}
                {p.loan?.isLoan && (
                  <span
                    title={`Emprestado pelo ${p.loan.parentClubName}`}
                    className="shrink-0 rounded border border-sky-400/50 bg-sky-400/20 px-1 py-0.2 text-[8px] font-black text-sky-200"
                  >
                    EMP
                  </span>
                )}
                {injLeft > 0 && (
                  <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                    DM {injLeft}j
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400">
                {injLeft > 0
                  ? `${p.injuryType ?? "Lesionado"} • ${injLeft} rod.`
                  : `${p.primaryPosition} • ${p.seasonGoals}G ${p.seasonAssists}A • ${
                      p.seasonAppearances > 0
                        ? `⭐ ${p.seasonAvgRating.toFixed(1)} (${p.seasonAppearances}j)`
                        : `${p.age}a`
                    }`}
              </div>
            </div>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            title={`Overall ${p.overall} / Energia ${staminaPct}%`}
            className={`rounded-md border px-2 py-0.5 ${getOverallColor(p.overall)}`}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-black">
              <span
                className={`inline-block h-2 w-2 rounded-full ${getStaminaColor(p.stamina)}`}
              />
              <span>
                {p.overall} / {staminaPct}%
              </span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-sm bg-slate-900/70">
              <div
                className={`h-full ${getStaminaColor(p.stamina)}`}
                style={{ width: `${staminaPct}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => handleSwapClick(p.id)}
            title={swapId ? "Confirmar troca" : "Selecionar para trocar"}
            className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
              isSelectedForSwap
                ? "border-amber-400 bg-amber-400 text-slate-950"
                : swapId !== null
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {injuryWarning && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/50 bg-rose-500/15 px-4 py-2.5 text-xs text-rose-200">
          <span>{injuryWarning}</span>
          <button
            onClick={() => setInjuryWarning(null)}
            className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-slate-200 hover:bg-slate-700"
          >
            OK
          </button>
        </div>
      )}
      {swapPlayer && (
        <div className="flex items-center justify-between rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
          <span>
            Selecionado para troca: <strong className="text-white">{swapPlayer.name}</strong> (
            {swapPlayer.primaryPosition}, OVR {swapPlayer.overall}). Clique em outro jogador no
            campo ou na lista para trocar de lugar.
          </span>
          <button
            onClick={() => setSwapId(null)}
            className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-slate-200 hover:bg-slate-700"
          >
            Cancelar
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Left Column: Tactical Instructions + 2D Pitch */}
        <div className="space-y-4 xl:col-span-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <Compass className="h-4 w-4 text-emerald-400" /> Prancheta Tática
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {onAutoAssignShirtNumbers && (
                  <button
                    onClick={onAutoAssignShirtNumbers}
                    title="Distribui automaticamente as camisas ideais conforme função e histórico de cada jogador"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-300 border border-sky-500/35 transition hover:bg-sky-500/25"
                  >
                    <Shirt className="h-3.5 w-3.5" /> Otimizar Camisas
                  </button>
                )}
                <button
                  onClick={handleAutoPick}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Escalar Melhor 11
                </button>
              </div>
            </div>

            {/* Formation selector */}
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Formação
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {FORMATIONS.map((f) => (
                  <button
                    key={f}
                    onClick={() => handleFormationChange(f)}
                    className={`rounded-lg py-1.5 text-xs font-bold transition ${
                      tactics.formation === f
                        ? "bg-emerald-500 text-slate-950"
                        : "border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Mentality / Pressing / Passing */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                  <Shield className="h-3 w-3" /> Mentalidade
                </div>
                <select
                  value={tactics.mentality}
                  onChange={(e) =>
                    onChangeTactics({ ...tactics, mentality: e.target.value as Mentality })
                  }
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white outline-none"
                >
                  <option value="Defensive">Defensiva</option>
                  <option value="Balanced">Equilibrada</option>
                  <option value="Attacking">Ofensiva</option>
                </select>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                  <Zap className="h-3 w-3" /> Pressão
                </div>
                <select
                  value={tactics.pressing}
                  onChange={(e) =>
                    onChangeTactics({ ...tactics, pressing: e.target.value as Pressing })
                  }
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white outline-none"
                >
                  <option value="Low">Baixa</option>
                  <option value="Medium">Média</option>
                  <option value="High">Alta</option>
                </select>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase text-slate-400">
                  Estilo de Passe
                </div>
                <select
                  value={tactics.passingStyle}
                  onChange={(e) =>
                    onChangeTactics({
                      ...tactics,
                      passingStyle: e.target.value as PassingStyle,
                    })
                  }
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white outline-none"
                >
                  <option value="Short">Curto (Posse)</option>
                  <option value="Mixed">Misto</option>
                  <option value="Direct">Direto (Contra-Ataque)</option>
                </select>
              </div>
            </div>

            {/* Skill-Driven Tactical Fit Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[11px] font-bold text-white">
                    {tacticalFit.styleSummary}
                  </span>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-black border ${
                    tacticalFit.overallFit >= 80
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : tacticalFit.overallFit >= 70
                      ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                      : "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  }`}
                >
                  Adequação do Elenco: {tacticalFit.overallFit}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="rounded-lg border border-slate-800/80 bg-slate-900/90 px-2.5 py-1 flex items-center justify-between">
                  <span className="text-slate-400">Mentalidade</span>
                  <strong
                    className={
                      tacticalFit.mentalityFit >= 78
                        ? "text-emerald-300"
                        : tacticalFit.mentalityFit >= 68
                        ? "text-sky-300"
                        : "text-amber-300"
                    }
                  >
                    {tacticalFit.mentalityFit}%
                  </strong>
                </div>
                <div className="rounded-lg border border-slate-800/80 bg-slate-900/90 px-2.5 py-1 flex items-center justify-between">
                  <span className="text-slate-400">Pressão</span>
                  <strong
                    className={
                      tacticalFit.pressingFit >= 78
                        ? "text-emerald-300"
                        : tacticalFit.pressingFit >= 68
                        ? "text-sky-300"
                        : "text-amber-300"
                    }
                  >
                    {tacticalFit.pressingFit}%
                  </strong>
                </div>
                <div className="rounded-lg border border-slate-800/80 bg-slate-900/90 px-2.5 py-1 flex items-center justify-between">
                  <span className="text-slate-400">Passe</span>
                  <strong
                    className={
                      tacticalFit.passingFit >= 78
                        ? "text-emerald-300"
                        : tacticalFit.passingFit >= 68
                        ? "text-sky-300"
                        : "text-amber-300"
                    }
                  >
                    {tacticalFit.passingFit}%
                  </strong>
                </div>
              </div>

              {(tacticalFit.keyStrengths.length > 0 || tacticalFit.keyWeaknesses.length > 0) && (
                <div className="space-y-0.5 text-[10px]">
                  {tacticalFit.keyStrengths.slice(0, 2).map((s) => (
                    <div key={s} className="text-emerald-300 font-semibold">
                      ✓ {s}
                    </div>
                  ))}
                  {tacticalFit.keyWeaknesses.slice(0, 1).map((w) => (
                    <div key={w} className="text-amber-300 font-semibold">
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Power bars */}
            <div className="grid grid-cols-4 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-center">
              {[
                ["ATA", power.attack],
                ["MEI", power.midfield],
                ["DEF", power.defense],
                ["GOL", power.goalkeeper],
              ].map(([lbl, val]) => (
                <div key={lbl as string}>
                  <div className="text-[10px] font-bold text-slate-500">{lbl}</div>
                  <div className="text-sm font-black text-emerald-400">{val}</div>
                </div>
              ))}
            </div>

            {/* Team Synergy & Chemistry Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Entrosamento da Equipe
                  </span>
                  <span className={`text-xs font-black ${synergy.tierColor}`}>
                    {synergy.tierLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-white">{synergy.overallScore}%</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                      synergy.overallMultiplier >= 1
                        ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                        : "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40"
                    }`}
                  >
                    {synergy.bonusPercentFormatted} Força Tática
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
                <div
                  className={`h-full transition-all duration-500 ${
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
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800/80">
                  <div className="text-[10px] font-bold text-slate-400">Jogos Juntos</div>
                  <div className="text-xs font-black text-white">
                    {synergy.sharedMatchesFactor.avgSharedMatches} jgs
                  </div>
                  <div className="text-[9px] text-emerald-400 font-semibold truncate">
                    {synergy.sharedMatchesFactor.label}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800/80">
                  <div className="text-[10px] font-bold text-slate-400">Familiaridade</div>
                  <div className="text-xs font-black text-white">
                    {synergy.tacticalFamiliarityFactor.consecutiveMatches} rodadas
                  </div>
                  <div className="text-[9px] text-sky-400 font-semibold truncate">
                    {synergy.tacticalFamiliarityFactor.label}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800/80">
                  <div className="text-[10px] font-bold text-slate-400">Química Cultural</div>
                  <div className="text-xs font-black text-white">
                    {synergy.culturalChemistryFactor.compatriotPairsCount} conexões
                  </div>
                  <div className="text-[9px] text-indigo-400 font-semibold truncate">
                    {synergy.culturalChemistryFactor.label}
                  </div>
                </div>
              </div>

              {/* Sector Synergy Pills */}
              <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-slate-800/80 text-[11px]">
                <span className="text-slate-400 font-semibold">Setores:</span>
                <span className="text-slate-300">
                  Defesa: <strong className="text-emerald-400">{synergy.sectors.defense.score}%</strong>
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300">
                  Meio: <strong className="text-emerald-400">{synergy.sectors.midfield.score}%</strong>
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-300">
                  Ataque: <strong className="text-emerald-400">{synergy.sectors.attack.score}%</strong>
                </span>
              </div>

              {/* Top Key Partnerships in this lineup */}
              {synergy.topPartnerships.length > 0 && (
                <div className="pt-1.5 border-t border-slate-800/80">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Link2 className="h-3 w-3 text-amber-400" />
                    <span>Principais Parcerias no 11 Titular</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {synergy.topPartnerships.slice(0, 3).map((pair, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${pair.strengthColor}`}
                        title={`${pair.nameA} e ${pair.nameB} disputaram ${pair.sharedMatches} jogos juntos (${pair.strengthLabel})`}
                      >
                        <span className="text-white font-bold">
                          {getPlayerDisplayName(pair.nameA)} & {getPlayerDisplayName(pair.nameB)}
                        </span>
                        <span className="opacity-80">({pair.sharedMatches}j)</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2D Football Pitch */}
          <div className="relative aspect-[4/5] sm:aspect-[3/4] w-full overflow-hidden rounded-2xl border-2 border-emerald-700 bg-[#065f46] select-none shadow-xl">
            {/* Pitch markings */}
            <div className="pointer-events-none absolute inset-4 rounded-lg border border-white/15">
              {/* Halfway line */}
              <div className="absolute left-0 right-0 top-1/2 border-t border-white/15" />
              <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
              {/* Top penalty box */}
              <div className="absolute left-1/2 top-0 h-16 w-44 -translate-x-1/2 border-b border-x border-white/15" />
              {/* Bottom penalty box */}
              <div className="absolute bottom-0 left-1/2 h-16 w-44 -translate-x-1/2 border-t border-x border-white/15" />
            </div>

            {/* 11 Players */}
            {slots.map((slot, i) => {
              const p = starters[i];
              if (!p) return null;
              const isSelected = swapId === p.id;
              const surname = getPlayerDisplayName(p.name);

              return (
                <div
                  key={slot.slotIndex}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                >
                  <button
                    onClick={() => handleSwapClick(p.id)}
                    className={`group relative flex flex-col items-center transition-transform hover:scale-105 ${
                      isSelected ? "scale-110" : ""
                    }`}
                  >
                    <div
                      className={`relative rounded-full p-0.5 ${
                        isSelected
                          ? "ring-2 ring-amber-400"
                          : "ring-1 ring-white/25"
                      }`}
                    >
                      <PlayerAvatar
                        name={p.name}
                        imageUrl={p.imageUrl}
                        size="sm"
                        accentColor={club.primaryColor}
                      />
                      <span className="absolute -right-1.5 -top-1 rounded-full bg-slate-950 px-1.5 py-0.2 text-[9px] font-black text-emerald-300 ring-1 ring-emerald-500/40">
                        {p.overall}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-white border border-slate-800">
                      {p.shirtNumber && (
                        <span className="text-amber-300">#{p.shirtNumber}</span>
                      )}
                      <span className="text-emerald-400">{slot.label}</span>
                      <span className="max-w-[84px] truncate">{surname}</span>
                    </div>
                    <div className="mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-slate-900/90">
                      <div
                        className={`h-full ${getStaminaColor(p.stamina)}`}
                        style={{ width: `${Math.round(p.stamina)}%` }}
                      />
                    </div>
                  </button>
                  <button
                    onClick={() => onSelectPlayer(p)}
                    title="Ver perfil"
                    className="mt-0.5 rounded-full bg-slate-950/70 p-0.5 text-slate-400 hover:text-white"
                  >
                    <Info className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Starters / Bench / Reserves List */}
        <div className="space-y-5 xl:col-span-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-emerald-400">
              Titulares ({starters.length})
            </h3>
            <div className="space-y-1.5">
              {starters.map((p, i) =>
                renderRow(p, slots[i]?.label ?? p.primaryPosition, `TIT ${i + 1}`)
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-sky-400">
              Banco de Reservas ({bench.length})
            </h3>
            <div className="space-y-1.5">
              {bench.map((p, i) => renderRow(p, p.primaryPosition, `RES ${i + 1}`))}
            </div>
          </div>

          {reserves.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Não Relacionados ({reserves.length})
              </h3>
              <div className="space-y-1.5">
                {reserves.map((p) => renderRow(p, p.primaryPosition, "SUP"))}
              </div>
            </div>
          )}

          {youthCount > 0 && onNavigateToAcademy && (
            <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">
                    Categorias de Base ({youthCount} atletas no Sub-20)
                  </div>
                  <div className="text-xs text-slate-300">
                    Promova jovens talentos, desenvolva promessas e controle empréstimos.
                  </div>
                </div>
              </div>
              <button
                onClick={onNavigateToAcademy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Ver Base Sub-20 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
