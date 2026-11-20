import React, { useMemo, useState } from "react";
import {
  Trophy,
  Calendar,
  Award,
  ChevronLeft,
  ChevronRight,
  Tv,
  MapPin,
  Layers,
  Users,
} from "lucide-react";
import type { Club, Fixture, Player, StandingRow } from "../types/game";
import { getTopAssisters, getTopScorers } from "../engine/standings";
import { formatMoney, getOverallColor, getRoleBadgeClass } from "../utils/format";
import { ClubBadge } from "./ClubBadge";
import { PlayerAvatar } from "./PlayerAvatar";

interface LeagueHubProps {
  userClubId: number;
  currentMatchweek: number;
  clubs: Club[];
  players: Player[];
  fixtures: Fixture[];
  standings: StandingRow[];
  onSelectPlayer: (player: Player) => void;
}


export const LeagueHub: React.FC<LeagueHubProps> = ({
  userClubId,
  currentMatchweek,
  clubs,
  players,
  fixtures,
  standings,
  onSelectPlayer,
}) => {
  const clubMap = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const userClub = clubMap.get(userClubId);
  const userDivision: string = userClub?.division ?? userClub?.league ?? "Premier League";

  const [subTab, setSubTab] = useState<"table" | "divisions" | "stats" | "fixtures">("table");
  const [selectedDivision, setSelectedDivision] = useState<string>(userDivision);
  const [expandedDivClubId, setExpandedDivClubId] = useState<number | null>(null);
  const [viewWeek, setViewWeek] = useState<number>(Math.min(38, currentMatchweek));
  const [expandedFixtureId, setExpandedFixtureId] = useState<number | null>(null);

  const allAvailableDivisions = useMemo(() => {
    const list: string[] = [];
    for (const c of clubs) {
      const d = (c.division ?? c.league ?? "Premier League") as string;
      if (!list.includes(d)) list.push(d);
    }
    return list;
  }, [clubs]);

  const activeLeagueClubIds = useMemo(
    () => new Set(standings.map((row) => row.club.id)),
    [standings]
  );

  const divisionScopedPlayers = useMemo(
    () => players.filter((p) => p.clubId !== null && activeLeagueClubIds.has(p.clubId)),
    [players, activeLeagueClubIds]
  );

  const topScorers = useMemo(
    () => getTopScorers(divisionScopedPlayers, 15),
    [divisionScopedPlayers]
  );
  const topAssisters = useMemo(
    () => getTopAssisters(divisionScopedPlayers, 15),
    [divisionScopedPlayers]
  );

  const divisionClubs = useMemo(
    () =>
      clubs
        .filter((c) => (c.division ?? "Premier League") === selectedDivision)
        .sort((a, b) => b.avgOverall - a.avgOverall || b.transferBudgetEur - a.transferBudgetEur),
    [clubs, selectedDivision]
  );

  const weekFixtures = useMemo(
    () => fixtures.filter((f) => f.matchweek === viewWeek),
    [fixtures, viewWeek]
  );

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "table" as const, label: `Classificação (${userDivision})`, icon: Trophy },
          { id: "divisions" as const, label: "Divisões da Inglaterra (64)", icon: Layers },
          { id: "stats" as const, label: "Artilharia & Assistências", icon: Award },
          { id: "fixtures" as const, label: "Calendário (38 Rodadas)", icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                subTab === tab.id
                  ? "bg-emerald-500 text-slate-950"
                  : "border border-slate-800 bg-slate-900/70 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Standings Table */}
      {subTab === "table" && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 w-12">Pos</th>
                  <th className="px-4 py-3">Clube</th>
                  <th className="px-3 py-3 text-center">J</th>
                  <th className="px-3 py-3 text-center">V</th>
                  <th className="px-3 py-3 text-center">E</th>
                  <th className="px-3 py-3 text-center">D</th>
                  <th className="px-3 py-3 text-center">GP</th>
                  <th className="px-3 py-3 text-center">GC</th>
                  <th className="px-3 py-3 text-center">SG</th>
                  <th className="px-4 py-3 text-center">Forma</th>
                  <th className="px-4 py-3 text-right">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {standings.map((row) => {
                  const isUser = row.club.id === userClubId;
                  const zoneColor =
                    row.position <= 4
                      ? "border-l-4 border-l-emerald-500"
                      : row.position === 5
                      ? "border-l-4 border-l-sky-500"
                      : row.position >= 18
                      ? "border-l-4 border-l-rose-500"
                      : "border-l-4 border-l-transparent";

                  return (
                    <tr
                      key={row.club.id}
                      className={`${zoneColor} ${
                        isUser
                          ? "bg-emerald-500/12 font-bold text-white"
                          : "text-slate-300 hover:bg-slate-800/30"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-bold text-slate-400">{row.position}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <ClubBadge club={row.club} size="sm" />
                          <span className="font-semibold text-white">{row.club.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">{row.played}</td>
                      <td className="px-3 py-2.5 text-center">{row.won}</td>
                      <td className="px-3 py-2.5 text-center">{row.drawn}</td>
                      <td className="px-3 py-2.5 text-center">{row.lost}</td>
                      <td className="px-3 py-2.5 text-center text-slate-400">{row.goalsFor}</td>
                      <td className="px-3 py-2.5 text-center text-slate-400">
                        {row.goalsAgainst}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold">
                        {row.goalDifference > 0
                          ? `+${row.goalDifference}`
                          : row.goalDifference}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-center gap-1">
                          {row.form.length === 0 ? (
                            <span className="text-slate-600">-</span>
                          ) : (
                            row.form.map((f, i) => (
                              <span
                                key={i}
                                className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-black ${
                                  f === "W"
                                    ? "bg-emerald-500/25 text-emerald-300"
                                    : f === "D"
                                    ? "bg-slate-600/40 text-slate-300"
                                    : "bg-rose-500/25 text-rose-300"
                                }`}
                              >
                                {f === "W" ? "V" : f === "D" ? "E" : "D"}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-black text-white">
                        {row.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-slate-800 bg-slate-950/50 px-4 py-2.5 text-[11px] text-slate-400">
            {userDivision === "Premier League" ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> 1º–4º UEFA Champions League
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> 5º UEFA Europa League
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> 18º–20º Rebaixamento
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Zona de Acesso / Título
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Playoffs de Acesso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Zona de Rebaixamento
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* All Divisions and Leagues Browser */}
      {subTab === "divisions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {allAvailableDivisions.map((div) => {
              const cnt = clubs.filter(
                (c) => (c.division ?? c.league ?? "Premier League") === div
              ).length;
              return (
                <button
                  key={div}
                  onClick={() => {
                    setSelectedDivision(div);
                    setExpandedDivClubId(null);
                  }}
                  className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    selectedDivision === div
                      ? "bg-emerald-500 text-slate-950"
                      : "border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {div} ({cnt})
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {divisionClubs.map((club) => {
              const squad = players
                .filter((p) => p.clubId === club.id)
                .sort((a, b) => b.overall - a.overall);
              const isOpen = expandedDivClubId === club.id;
              const isUser = club.id === userClubId;

              return (
                <div
                  key={club.id}
                  className={`rounded-lg border p-4 ${
                    isUser
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <ClubBadge club={club} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-white">
                            {club.name}
                          </span>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-black ${getOverallColor(
                              Math.round(club.avgOverall)
                            )}`}
                          >
                            OVR {club.avgOverall}
                          </span>
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {club.stadium} ({club.capacity.toLocaleString("pt-BR")}) • Verba:{" "}
                          <span className="text-emerald-400 font-semibold">
                            {formatMoney(club.transferBudgetEur)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setExpandedDivClubId(isOpen ? null : club.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:bg-slate-700"
                    >
                      <Users className="h-3 w-3 text-sky-400" />
                      {isOpen ? "Ocultar" : `Elenco (${squad.length})`}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto border-t border-slate-800 pt-3 pr-1">
                      {squad.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => onSelectPlayer(p)}
                          className="flex w-full items-center justify-between rounded border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-left text-xs hover:border-slate-700"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`w-9 shrink-0 rounded border py-0.5 text-center text-[9px] font-bold ${getRoleBadgeClass(
                                p.roleCategory
                              )}`}
                            >
                              {p.primaryPosition}
                            </span>
                            <span className="truncate font-semibold text-white">{p.name}</span>
                            <span className="shrink-0 text-[10px] text-slate-500">
                              {p.age}a
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px] text-emerald-400">
                              {formatMoney(p.marketValueEur)}
                            </span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-black ${getOverallColor(
                                p.overall
                              )}`}
                            >
                              {p.overall}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Scorers & Assisters */}
      {subTab === "stats" && (
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: `Artilharia (${userDivision})`,
              list: topScorers,
              metric: "Gols",
              icon: "⚽",
            },
            {
              title: "Líderes em Assistências",
              list: topAssisters,
              metric: "Assist.",
              icon: "👟",
            },
          ].map((panel) => {
            const ourCount = panel.list.filter((p) => p.clubId === userClubId).length;
            return (
              <div
                key={panel.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>{panel.icon}</span>
                    <span>{panel.title}</span>
                  </h3>
                  {ourCount > 0 && (
                    <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      {ourCount} do seu clube
                    </span>
                  )}
                </div>
                {panel.list.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    Jogue a primeira rodada para contabilizar as estatísticas da temporada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {panel.list.map((p, idx) => {
                      const club = p.clubId ? clubMap.get(p.clubId) : undefined;
                      const isOurPlayer = p.clubId === userClubId;
                      return (
                        <button
                          key={p.id}
                          onClick={() => onSelectPlayer(p)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                            isOurPlayer
                              ? "border-emerald-500/60 bg-emerald-500/15 ring-1 ring-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/25"
                              : "border-slate-800/80 bg-slate-950/50 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`w-6 text-xs font-black ${
                                isOurPlayer
                                  ? "text-emerald-400"
                                  : idx === 0
                                  ? "text-amber-400"
                                  : idx === 1
                                  ? "text-slate-300"
                                  : idx === 2
                                  ? "text-amber-600"
                                  : "text-slate-500"
                              }`}
                            >
                              {idx + 1}º
                            </span>
                            <div className={isOurPlayer ? "ring-2 ring-emerald-400 rounded-full" : ""}>
                              <PlayerAvatar
                                name={p.name}
                                imageUrl={p.imageUrl}
                                size="xs"
                                accentColor={club?.primaryColor}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate text-xs font-bold text-white">
                                  {p.name}
                                </span>
                                {isOurPlayer && (
                                  <span className="shrink-0 rounded bg-emerald-500 px-1.5 py-0.2 text-[9px] font-black text-slate-950 uppercase tracking-wide">
                                    Seu Jogador
                                  </span>
                                )}
                              </div>
                              <div
                                className={`text-[10px] ${
                                  isOurPlayer ? "text-emerald-300 font-semibold" : "text-slate-400"
                                }`}
                              >
                                {club?.name ?? p.clubName} • {p.seasonAppearances} jogos
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`text-base font-black ${
                                isOurPlayer ? "text-emerald-300 scale-105" : "text-emerald-400"
                              }`}
                            >
                              {panel.metric === "Gols" ? p.seasonGoals : p.seasonAssists}
                            </div>
                            <div
                              className={`text-[9px] uppercase ${
                                isOurPlayer ? "font-bold text-emerald-400" : "text-slate-500"
                              }`}
                            >
                              {panel.metric}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 38-Week Calendar */}
      {subTab === "fixtures" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
            <button
              disabled={viewWeek <= 1}
              onClick={() => setViewWeek((w) => Math.max(1, w - 1))}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <div className="text-center">
              <div className="text-sm font-black text-white">Rodada {viewWeek} de 38</div>
              <div className="text-[11px] text-slate-400">
                {viewWeek === currentMatchweek
                  ? "Rodada Atual"
                  : viewWeek < currentMatchweek
                  ? "Concluída"
                  : "Agendada"}
              </div>
            </div>
            <button
              disabled={viewWeek >= 38}
              onClick={() => setViewWeek((w) => Math.min(38, w + 1))}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {weekFixtures.map((fx) => {
              const h = clubMap.get(fx.homeClubId)!;
              const a = clubMap.get(fx.awayClubId)!;
              const involvesUser = h.id === userClubId || a.id === userClubId;
              const isExpanded = expandedFixtureId === fx.id;
              const goals = fx.result?.events.filter((e) => e.type === "goal") ?? [];

              return (
                <div
                  key={fx.id}
                  onClick={() => fx.played && setExpandedFixtureId(isExpanded ? null : fx.id)}
                  className={`rounded-xl border p-3.5 transition ${
                    fx.played ? "cursor-pointer hover:border-slate-700" : ""
                  } ${
                    involvesUser
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-900/70"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{fx.date} • {fx.kickoffTimeUk} UK</span>
                      <span className="text-slate-600">•</span>
                      <span className="inline-flex items-center gap-0.5 text-slate-300">
                        <MapPin className="h-2.5 w-2.5 text-emerald-400" /> {h.stadium}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Tv className="h-3 w-3 text-sky-400" /> {fx.tvBroadcaster}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <ClubBadge club={h} size="sm" />
                      <span className="truncate font-bold text-white">{h.name}</span>
                    </div>
                    <div className="rounded-lg bg-slate-950 px-3 py-1 font-black text-white ring-1 ring-slate-800">
                      {fx.played ? `${fx.homeGoals} - ${fx.awayGoals}` : "vs"}
                    </div>
                    <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
                      <span className="truncate font-bold text-white">{a.name}</span>
                      <ClubBadge club={a} size="sm" />
                    </div>
                  </div>
                  {isExpanded && fx.result && (
                    <div className="mt-3 space-y-1.5 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-300">
                      {fx.result.attendance !== undefined && (
                        <div className="flex flex-wrap justify-between gap-2 text-[10px] text-slate-400">
                          <span>
                            Público:{" "}
                            <strong className="text-white">
                              {fx.result.attendance.toLocaleString("pt-BR")}
                            </strong>
                          </span>
                          {fx.result.gateRevenueEur !== undefined && (
                            <span>
                              Bilheteria:{" "}
                              <strong className="text-emerald-400">
                                {formatMoney(fx.result.gateRevenueEur)}
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between text-slate-400">
                        <span>Posse: {fx.result.homeStats.possession}%</span>
                        <span>
                          xG: {fx.result.homeStats.xg.toFixed(2)} -{" "}
                          {fx.result.awayStats.xg.toFixed(2)}
                        </span>
                        <span>Posse: {fx.result.awayStats.possession}%</span>
                      </div>
                      {goals.map((g) => (
                        <div key={g.id} className="text-emerald-300">
                          ⚽ {g.minute}' {g.playerName} (
                          {clubMap.get(g.clubId)?.shortName})
                          {g.assistPlayerName ? ` — assist. ${g.assistPlayerName}` : ""}
                        </div>
                      ))}
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
