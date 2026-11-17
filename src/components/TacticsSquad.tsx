import React, { useMemo, useState } from "react";
import { ArrowLeftRight, Sparkles, Info, Shield, Zap, Compass, Shirt } from "lucide-react";
import type {
  Club,
  Formation,
  Mentality,
  PassingStyle,
  Player,
  Pressing,
  Tactics,
} from "../types/game";
import { autoPickLineup, computeTeamPower } from "../engine/matchEngine";
import {
  getFormationSlots,
  getOverallColor,
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
  onChangeTactics: (next: Tactics) => void;
  onSelectPlayer: (player: Player) => void;
  onChangeShirtNumber?: (playerId: number, newNumber: number) => void;
  onAutoAssignShirtNumbers?: () => void;
}

const FORMATIONS: Formation[] = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "5-3-2"];

export const TacticsSquad: React.FC<TacticsSquadProps> = ({
  club,
  players,
  tactics,
  onChangeTactics,
  onSelectPlayer,
  onChangeShirtNumber,
  onAutoAssignShirtNumbers,
}) => {
  const [swapId, setSwapId] = useState<number | null>(null);
  const [injuryWarning, setInjuryWarning] = useState<string | null>(null);

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const slots = getFormationSlots(tactics.formation);

  const starters = tactics.starters
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p));
  const bench = tactics.bench
    .map((id) => playerMap.get(id))
    .filter((p): p is Player => Boolean(p));
  const reserves = players
    .filter((p) => !tactics.starters.includes(p.id) && !tactics.bench.includes(p.id))
    .sort((a, b) => b.overall - a.overall);

  const power = computeTeamPower(starters, tactics, true, club.capacity);

  const handleFormationChange = (formation: Formation) => {
    // Keep existing starters/bench if length valid, or re-fit automatically? Re-auto-picking or keeping order:
    // Let's offer smart auto-fit when changing formation so GK stays in slot 0 and roles align nicely!
    const picked = autoPickLineup(players, formation);
    setSwapId(null);
    onChangeTactics({
      ...tactics,
      formation,
      starters: picked.starters,
      bench: picked.bench,
    });
  };

  const handleAutoPick = () => {
    const picked = autoPickLineup(players, tactics.formation);
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
                {injLeft > 0 && (
                  <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                    DM {injLeft}j
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400">
                {injLeft > 0
                  ? `${p.injuryType ?? "Lesionado"} • ${injLeft} rod.`
                  : `${p.primaryPosition} • ${p.age}a • ${p.seasonGoals}G ${p.seasonAssists}A`}
              </div>
            </div>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="hidden sm:block w-12">
            <div className="text-right text-[10px] text-slate-400">{Math.round(p.stamina)}%</div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full ${getStaminaColor(p.stamina)}`}
                style={{ width: `${Math.round(p.stamina)}%` }}
              />
            </div>
          </div>

          <span
            className={`rounded-md border px-1.5 py-0.5 text-xs font-black ${getOverallColor(
              p.overall
            )}`}
          >
            {p.overall}
          </span>

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
        <div className="space-y-4 xl:col-span-5">
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
          </div>

          {/* 2D Football Pitch */}
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border-2 border-emerald-700 bg-[#065f46] select-none">
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
              const surname = p.name.split(" ").slice(-1)[0];

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
                      <span className="max-w-[68px] truncate">{surname}</span>
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
        <div className="space-y-5 xl:col-span-7">
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
        </div>
      </div>
    </div>
  );
};
