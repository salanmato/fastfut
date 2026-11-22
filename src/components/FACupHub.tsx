import React, { useEffect, useMemo, useState } from "react";
import {
  Trophy,
  Play,
  Flame,
  Coins,
  CheckCircle2,
  ShieldAlert,
  Crown,
  Calendar,
} from "lucide-react";
import type { Club, FACupState } from "../types/game";
import { formatMoney } from "../utils/format";
import { formatDatePtBr } from "../utils/calendar";
import { getCupInfo } from "../engine/faCup";
import { ClubBadge } from "./ClubBadge";

interface FACupHubProps {
  faCup: FACupState;
  clubs: Club[];
  userClubId: number;
  currentMatchweek: number;
  onSimulateCurrentRound: () => void;
}

function getDivCode(club?: Club): string {
  const tier = club?.tier ?? 1;
  if (tier === 1) return "PL";
  if (tier === 2) return "CH";
  if (tier === 3) return "L1";
  return "L2";
}

function getDivPillClass(tier = 1): string {
  if (tier === 1) return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  if (tier === 2) return "border-sky-500/40 bg-sky-500/15 text-sky-300";
  if (tier === 3) return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  return "border-rose-500/40 bg-rose-500/15 text-rose-300";
}

export const FACupHub: React.FC<FACupHubProps> = ({
  faCup,
  clubs,
  userClubId,
  currentMatchweek,
  onSimulateCurrentRound,
}) => {
  const [selectedRoundIdx, setSelectedRoundIdx] = useState<number>(faCup.currentRoundIndex);
  const [filterMode, setFilterMode] = useState<"all" | "user" | "upsets">("all");

  useEffect(() => {
    setSelectedRoundIdx(faCup.currentRoundIndex);
  }, [faCup.currentRoundIndex]);

  const clubMap = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const userClub = clubMap.get(userClubId);
  const cupInfo = useMemo(() => getCupInfo(userClub), [userClub]);
  const currentRound = faCup.rounds[faCup.currentRoundIndex];
  const viewedRound = faCup.rounds[selectedRoundIdx] ?? currentRound;
  const champion = faCup.championClubId ? clubMap.get(faCup.championClubId) : undefined;

  // Determine user club status in FA Cup
  const userStatus = useMemo(() => {
    if (faCup.championClubId === userClubId) {
      return {
        label: "Campeão em Wembley!",
        tone: "text-amber-300 border-amber-400/50 bg-amber-500/15",
      };
    }
    for (const r of faCup.rounds) {
      const tie = r.ties.find(
        (t) => t.homeClubId === userClubId || t.awayClubId === userClubId
      );
      if (!tie) continue;
      if (!tie.played) {
        const oppId = tie.homeClubId === userClubId ? tie.awayClubId : tie.homeClubId;
        const opp = clubMap.get(oppId);
        return {
          label: `Na disputa (${r.shortName}) vs ${opp?.shortName ?? "Adversário"}`,
          tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/15",
        };
      }
      if (tie.winnerClubId && tie.winnerClubId !== userClubId) {
        return {
          label: `Eliminado na ${r.shortName}`,
          tone: "text-rose-300 border-rose-500/40 bg-rose-500/15",
        };
      }
    }
    return {
      label: "Classificado",
      tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/15",
    };
  }, [faCup, userClubId, clubMap]);

  const visibleTies = useMemo(() => {
    if (!viewedRound) return [];
    return viewedRound.ties.filter((tie) => {
      if (filterMode === "user") {
        return tie.homeClubId === userClubId || tie.awayClubId === userClubId;
      }
      if (filterMode === "upsets") {
        if (!tie.played || !tie.winnerClubId) return false;
        const winner = clubMap.get(tie.winnerClubId);
        const loserId =
          tie.winnerClubId === tie.homeClubId ? tie.awayClubId : tie.homeClubId;
        const loser = clubMap.get(loserId);
        return (winner?.tier ?? 1) > (loser?.tier ?? 1);
      }
      return true;
    });
  }, [viewedRound, filterMode, userClubId, clubMap]);

  const canSimulateCurrent =
    Boolean(currentRound) && !currentRound.completed && faCup.championClubId === null;
  const isDueBySchedule =
    Boolean(currentRound) && currentMatchweek >= currentRound.triggerMatchweek;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="rounded-lg border border-slate-800 border-l-4 border-l-amber-400 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded bg-amber-400/15 border border-amber-400/40 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                <Trophy className="h-3.5 w-3.5" /> {cupInfo.shortName} {faCup.season}
              </span>
              <span
                className={`rounded border px-2.5 py-0.5 text-[11px] font-bold ${userStatus.tone}`}
              >
                {userClub?.shortName}: {userStatus.label}
              </span>
            </div>

            <h2 className="text-2xl text-white">
              {cupInfo.name}
            </h2>

            <p className="text-xs text-slate-400">
              {cupInfo.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {champion ? (
              <div className="flex items-center gap-3 rounded-lg border border-amber-400/50 bg-amber-500/15 px-4 py-2.5">
                <ClubBadge club={champion} size="md" />
                <div>
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-300">
                    <Crown className="h-3 w-3" /> Campeão 2026/27
                  </div>
                  <div className="text-sm font-black text-white">{champion.name}</div>
                </div>
              </div>
            ) : (
              canSimulateCurrent && (
                <button
                  onClick={onSimulateCurrentRound}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-xs font-black transition ${
                    isDueBySchedule
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  }`}
                >
                  <Play className="h-4 w-4 fill-current" />
                  Simular {currentRound.shortName} ({currentRound.ties.length} jogos)
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Round Navigation + Prize Strip */}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {faCup.rounds.map((r) => {
          const isSelected = r.index === selectedRoundIdx;
          const isActiveCurrent = r.index === faCup.currentRoundIndex && !r.completed;
          return (
            <button
              key={r.index}
              onClick={() => setSelectedRoundIdx(r.index)}
              className={`rounded-lg border p-3 text-left transition ${
                isSelected
                  ? "border-amber-400 bg-amber-500/15"
                  : r.completed
                  ? "border-emerald-500/30 bg-slate-900 hover:border-slate-700"
                  : "border-slate-800 bg-slate-900 opacity-75 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-black text-white">{r.shortName}</span>
                {r.completed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : isActiveCurrent ? (
                  <Flame className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <span className="text-[10px] text-slate-500">R{r.triggerMatchweek}</span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>{formatDatePtBr(r.date)}</span>
                <span className="font-bold text-emerald-300">+{formatMoney(r.prizeEur)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Viewed Round Details & Ties */}
      {viewedRound && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
            <div>
              <h3 className="text-sm font-black text-white">{viewedRound.name}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-sky-400" />
                  Rodada sugerida: R{viewedRound.triggerMatchweek} ({formatDatePtBr(viewedRound.date)})
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                  <Coins className="h-3 w-3" /> Prêmio por vitória: {formatMoney(viewedRound.prizeEur)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {(
                [
                  ["all", `Todos (${viewedRound.ties.length})`],
                  ["user", "Meu Clube"],
                  ["upsets", "Zebras"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilterMode(key)}
                  className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                    filterMode === key
                      ? "bg-amber-400 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {viewedRound.ties.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Os confrontos desta fase serão definidos assim que a fase anterior for concluída.
            </div>
          ) : visibleTies.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum confronto encontrado para este filtro nesta fase.
            </div>
          ) : (
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {visibleTies.map((tie) => {
                const h = clubMap.get(tie.homeClubId);
                const a = clubMap.get(tie.awayClubId);
                if (!h || !a) return null;

                const involvesUser = h.id === userClubId || a.id === userClubId;
                const winner = tie.winnerClubId ? clubMap.get(tie.winnerClubId) : undefined;
                const loser =
                  tie.winnerClubId && tie.winnerClubId === h.id
                    ? a
                    : tie.winnerClubId === a.id
                    ? h
                    : undefined;
                const isUpset =
                  Boolean(winner && loser) && (winner?.tier ?? 1) > (loser?.tier ?? 1);

                return (
                  <div
                    key={tie.id}
                    className={`rounded-lg border p-3.5 ${
                      involvesUser
                        ? "border-amber-400/60 bg-amber-500/10"
                        : isUpset
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/60"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-400">
                        {viewedRound.index >= 4 ? "Estádio de Wembley" : h.stadium}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {involvesUser && (
                          <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                            SEU JOGO
                          </span>
                        )}
                        {isUpset && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                            <ShieldAlert className="h-2.5 w-2.5" /> ZEBRA
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <ClubBadge club={h} size="sm" />
                        <div className="min-w-0">
                          <div
                            className={`truncate font-bold ${
                              tie.winnerClubId === h.id ? "text-emerald-300" : "text-white"
                            }`}
                          >
                            {h.name}
                          </div>
                          <span
                            className={`inline-block rounded border px-1 text-[9px] font-bold ${getDivPillClass(
                              h.tier
                            )}`}
                          >
                            {getDivCode(h)}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-center">
                        <div className="rounded border border-slate-700 bg-slate-900 px-3 py-1 font-black text-white">
                          {tie.played ? `${tie.homeGoals} - ${tie.awayGoals}` : "vs"}
                        </div>
                        {tie.played &&
                          tie.homePenalties !== null &&
                          tie.homePenalties !== undefined && (
                            <div className="mt-0.5 text-[9px] font-bold text-amber-300">
                              ({tie.homePenalties}–{tie.awayPenalties} pên.)
                            </div>
                          )}
                      </div>

                      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                        <div className="min-w-0">
                          <div
                            className={`truncate font-bold ${
                              tie.winnerClubId === a.id ? "text-emerald-300" : "text-white"
                            }`}
                          >
                            {a.name}
                          </div>
                          <span
                            className={`inline-block rounded border px-1 text-[9px] font-bold ${getDivPillClass(
                              a.tier
                            )}`}
                          >
                            {getDivCode(a)}
                          </span>
                        </div>
                        <ClubBadge club={a} size="sm" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
