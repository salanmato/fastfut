import React, { useMemo, useState } from "react";
import {
  Flag,
  Calendar,
  Users,
  Trophy,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  Club,
  FifaWindow,
  InternationalBreakReport,
  Player,
  RoleCategory,
} from "../types/game";
import type { NationalSquad } from "../engine/nationalTeams";
import { normalizeNation } from "../utils/nations";
import { diffDaysIso, formatDateShortPtBr } from "../utils/calendar";
import { getOverallColor } from "../utils/format";
import { ClubBadge } from "./ClubBadge";

interface NationalTeamsHubProps {
  userClub: Club;
  clubs: Club[];
  players: Player[];
  currentDate: string;
  fifaWindows: FifaWindow[];
  processedWindowIds: string[];
  projectedSquads: Map<string, NationalSquad>;
  internationalBreaks: InternationalBreakReport[];
  onSelectPlayer: (player: Player) => void;
}

const ROLE_GROUPS: Array<{ key: RoleCategory; label: string }> = [
  { key: "GK", label: "Goleiros" },
  { key: "DEF", label: "Defensores" },
  { key: "MID", label: "Meio-campistas" },
  { key: "ATT", label: "Atacantes" },
];

export const NationalTeamsHub: React.FC<NationalTeamsHubProps> = ({
  userClub,
  clubs,
  players,
  currentDate,
  fifaWindows,
  processedWindowIds,
  projectedSquads,
  internationalBreaks,
  onSelectPlayer,
}) => {
  const clubMap = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const processedSet = useMemo(() => new Set(processedWindowIds), [processedWindowIds]);

  const sortedNations = useMemo(
    () =>
      Array.from(projectedSquads.values()).sort(
        (a, b) => b.strength - a.strength || b.eligibleCount - a.eligibleCount
      ),
    [projectedSquads]
  );

  const defaultNationKey = useMemo(() => {
    if (userClub.country) {
      const k = normalizeNation(userClub.country).key;
      if (projectedSquads.has(k)) return k;
    }
    const counts = new Map<string, number>();
    for (const sq of projectedSquads.values()) {
      const c = sq.members.filter((m) => m.player.clubId === userClub.id).length;
      if (c > 0) counts.set(sq.nation.key, c);
    }
    const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ?? sortedNations[0]?.nation.key ?? "brazil";
  }, [userClub, projectedSquads, sortedNations]);

  const [selectedNationKey, setSelectedNationKey] = useState<string>(defaultNationKey);
  const [expandedBreakId, setExpandedBreakId] = useState<string | null>(
    internationalBreaks[0]?.windowId ?? null
  );

  const selectedSquad =
    projectedSquads.get(selectedNationKey) ?? sortedNations[0];

  const userProjections = useMemo(() => {
    const called: Array<{
      player: Player;
      nationFlag: string;
      nationLabel: string;
      nationKey: string;
      role: "starter" | "reserve";
    }> = [];
    const preList: Array<{
      player: Player;
      nationFlag: string;
      nationLabel: string;
      nationKey: string;
    }> = [];

    for (const sq of projectedSquads.values()) {
      for (const m of sq.members) {
        if (m.player.clubId === userClub.id) {
          called.push({
            player: m.player,
            nationFlag: sq.nation.flag,
            nationLabel: sq.nation.labelPt,
            nationKey: sq.nation.key,
            role: m.role,
          });
        }
      }
      for (const m of sq.preList) {
        if (m.player.clubId === userClub.id) {
          preList.push({
            player: m.player,
            nationFlag: sq.nation.flag,
            nationLabel: sq.nation.labelPt,
            nationKey: sq.nation.key,
          });
        }
      }
    }
    called.sort((a, b) => b.player.overall - a.player.overall);
    preList.sort((a, b) => b.player.overall - a.player.overall);
    return { called, preList };
  }, [projectedSquads, userClub.id]);

  // Also check if user players are currently injured on break
  const userInjuredCount = useMemo(
    () =>
      players.filter(
        (p) => p.clubId === userClub.id && p.injuryMatchesLeft && p.injuryMatchesLeft > 0
      ).length,
    [players, userClub.id]
  );

  return (
    <div className="space-y-6">
      {/* Top FIFA Windows Strip */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-white">
              <Flag className="h-5 w-5 text-indigo-400" /> Seleções & Datas FIFA
            </h2>
            <p className="text-xs text-slate-400">
              Convocações automáticas baseadas em Overall, forma recente na temporada e idade. Jogadores convocados ganham moral, perdem energia e podem voltar com desgaste de viagem.
            </p>
          </div>
          {userInjuredCount > 0 && (
            <span className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-300">
              {userInjuredCount} lesionado(s) no DM fora das listas
            </span>
          )}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {fifaWindows.map((w) => {
            const done = processedSet.has(w.id);
            const isPast = currentDate > w.endDate;
            const daysUntil = Math.max(0, diffDaysIso(currentDate, w.startDate));
            return (
              <div
                key={w.id}
                className={`rounded-xl border p-3 ${
                  done
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : !w.processable
                    ? "border-slate-800 bg-slate-950/40 opacity-75"
                    : "border-indigo-500/40 bg-indigo-500/10"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-black text-white">{w.label}</span>
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  {formatDateShortPtBr(w.startDate)} – {formatDateShortPtBr(w.endDate)}
                </div>
                <div className="mt-1 text-[10px] text-slate-400">{w.competition}</div>
                <div className="mt-2">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-black ${
                      done
                        ? "bg-emerald-500/20 text-emerald-300"
                        : !w.processable
                        ? "bg-slate-800 text-slate-400"
                        : isPast
                        ? "bg-slate-800 text-slate-400"
                        : "bg-indigo-500/25 text-indigo-200"
                    }`}
                  >
                    {done
                      ? "Processada"
                      : !w.processable
                      ? "Pós-Temporada"
                      : isPast
                      ? "Encerrada"
                      : daysUntil === 0
                      ? "Hoje!"
                      : `Em ${daysUntil} dia${daysUntil === 1 ? "" : "s"}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Club Call-up Projection */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-black text-white">
            <Users className="h-4 w-4 text-emerald-400" /> Seus Convocáveis para a Próxima Data FIFA ({userProjections.called.length})
          </h3>
          <span className="text-xs text-slate-400">
            Projeção em tempo real baseada no momento atual do elenco
          </span>
        </div>

        {userProjections.called.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
            Nenhum jogador do {userClub.name} está projetado entre os 26 convocados de sua seleção no momento.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {userProjections.called.map((item) => (
              <button
                key={item.player.id}
                onClick={() => {
                  setSelectedNationKey(item.nationKey);
                  onSelectPlayer(item.player);
                }}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-indigo-400/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">
                    {item.nationFlag} {item.player.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {item.nationLabel} • {item.player.primaryPosition}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      item.role === "starter"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-400/40"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {item.role === "starter" ? "Titular" : "Reserva"}
                  </span>
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                      item.player.overall
                    )}`}
                  >
                    {item.player.overall}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {userProjections.preList.length > 0 && (
          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Na Briga (Pré-Lista / Radar das Seleções)
            </div>
            <div className="flex flex-wrap gap-2">
              {userProjections.preList.map((item) => (
                <button
                  key={item.player.id}
                  onClick={() => onSelectPlayer(item.player)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700"
                >
                  <span>{item.nationFlag}</span>
                  <span className="font-semibold text-white">{item.player.name}</span>
                  <span className="text-[10px] text-slate-400">
                    ({item.player.primaryPosition} • {item.player.overall})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Top 20 Ranking + Full 26-Man Selector */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Top 20 Nations Ranking */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-4">
          <h3 className="mb-3 flex items-center gap-2 text-base font-black text-white">
            <Trophy className="h-4 w-4 text-amber-400" /> Ranking Top 20 Seleções
          </h3>
          <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-1">
            {sortedNations.slice(0, 20).map((sq, idx) => {
              const isSelected = selectedSquad?.nation.key === sq.nation.key;
              const userCount = sq.members.filter(
                (m) => m.player.clubId === userClub.id
              ).length;
              return (
                <button
                  key={sq.nation.key}
                  onClick={() => setSelectedNationKey(sq.nation.key)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${
                    isSelected
                      ? "border-indigo-400 bg-indigo-500/15"
                      : "border-slate-800/80 bg-slate-950/50 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 text-[11px] font-black text-slate-500">
                      {idx + 1}º
                    </span>
                    <span className="text-base">{sq.nation.flag}</span>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-white">
                        {sq.nation.labelPt}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {sq.nation.confed} • {sq.members.length} convocados
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {userCount > 0 && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black text-emerald-300">
                        {userCount} seu
                      </span>
                    )}
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-black text-amber-300">
                      {sq.strength.toFixed(1)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Nation Squad Inspector */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{selectedSquad?.nation.flag ?? "🏳️"}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-white">
                    {selectedSquad?.nation.labelPt ?? "Seleção"}
                  </h3>
                  {selectedSquad && (
                    <span className="rounded border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs font-black text-amber-300">
                      Força {selectedSquad.strength.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {selectedSquad?.nation.confed} • {selectedSquad?.members.length ?? 0} convocados ({selectedSquad?.eligibleCount ?? 0} elegíveis na base)
                </p>
              </div>
            </div>

            <select
              value={selectedSquad?.nation.key ?? ""}
              onChange={(e) => setSelectedNationKey(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white outline-none"
            >
              {sortedNations.map((sq) => (
                <option key={sq.nation.key} value={sq.nation.key}>
                  {sq.nation.flag} {sq.nation.labelPt} ({sq.strength.toFixed(1)})
                </option>
              ))}
            </select>
          </div>

          {selectedSquad && (
            <div className="space-y-4">
              {ROLE_GROUPS.map((grp) => {
                const groupMembers = selectedSquad.members.filter(
                  (m) => m.player.roleCategory === grp.key
                );
                if (groupMembers.length === 0) return null;
                return (
                  <div key={grp.key}>
                    <div className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
                      {grp.label} ({groupMembers.length})
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {groupMembers.map((m) => {
                        const club = m.player.clubId
                          ? clubMap.get(m.player.clubId)
                          : undefined;
                        const isUserPlayer = m.player.clubId === userClub.id;
                        return (
                          <button
                            key={m.player.id}
                            onClick={() => onSelectPlayer(m.player)}
                            className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition ${
                              isUserPlayer
                                ? "border-emerald-500/60 bg-emerald-500/10"
                                : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {club && <ClubBadge club={club} size="sm" />}
                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-white">
                                  {m.player.name}
                                  {isUserPlayer && (
                                    <span className="ml-1.5 rounded bg-emerald-500 px-1 py-0.2 text-[9px] font-black text-slate-950">
                                      SEU
                                    </span>
                                  )}
                                </div>
                                <div className="truncate text-[10px] text-slate-400">
                                  {m.player.primaryPosition} • {club?.shortName ?? m.player.clubName} • {m.player.age} anos
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  m.role === "starter"
                                    ? "bg-indigo-500/20 text-indigo-300"
                                    : "bg-slate-800 text-slate-400"
                                }`}
                              >
                                {m.role === "starter" ? "Titular" : "Res."}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-xs font-black ${getOverallColor(
                                  m.player.overall
                                )}`}
                              >
                                {m.player.overall}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* History of Processed Breaks */}
      {internationalBreaks.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-3 text-base font-black text-white">
            Histórico de Datas FIFA na Temporada ({internationalBreaks.length})
          </h3>
          <div className="space-y-3">
            {internationalBreaks.map((br) => {
              const isExpanded = expandedBreakId === br.windowId;
              return (
                <div
                  key={br.windowId}
                  className="rounded-xl border border-slate-800 bg-slate-950/60"
                >
                  <button
                    onClick={() =>
                      setExpandedBreakId(isExpanded ? null : br.windowId)
                    }
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-black text-white">{br.label}</div>
                      <div className="text-[11px] text-slate-400">
                        {formatDateShortPtBr(br.startDate)} – {formatDateShortPtBr(br.endDate)} •{" "}
                        {br.userCallups.length} convocados do clube • {br.results.length} jogos registrados
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-slate-800 p-4">
                      {br.userCallups.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {br.userCallups.map((c) => (
                            <span
                              key={c.playerId}
                              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200"
                            >
                              {c.flag} <strong>{c.playerName}</strong> ({c.apps}j, {c.goals}G {c.assists}A)
                            </span>
                          ))}
                        </div>
                      )}
                      {br.results.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {br.results.map((r, idx) => (
                            <div
                              key={`${r.nationKey}-${r.matchIndex}-${idx}`}
                              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs"
                            >
                              <span className="truncate font-bold text-white">
                                {r.flag} {r.nationLabel}
                              </span>
                              <span className="mx-2 font-black text-white">
                                {r.goalsFor}–{r.goalsAgainst}
                              </span>
                              <span className="truncate text-right text-slate-300">
                                {r.opponentLabel} {r.opponentFlag}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
