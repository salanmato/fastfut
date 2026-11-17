import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  FastForward,
  SkipForward,
  CheckCircle2,
  ArrowLeftRight,
  Award,
  Flame,
  Shield,
} from "lucide-react";
import type {
  Club,
  Fixture,
  MatchResult,
  Mentality,
  PassingStyle,
  Player,
  Pressing,
  Referee,
  StadiumConfig,
  Tactics,
} from "../types/game";
import {
  finalizeMatchResult,
  initLiveMatchSession,
  performLiveSubstitution,
  stepLiveMatchMinute,
  type LiveMatchSession,
} from "../engine/matchEngine";
import { formatMoney, getStaminaColor } from "../utils/format";
import { getClubVisuals } from "../utils/clubVisuals";
import { ClubBadge } from "./ClubBadge";
import { ClubKit } from "./ClubKit";
import { LivePitch2D } from "./LivePitch2D";

interface MatchdayLiveProps {
  matchweek: number;
  userClubId: number;
  clubs: Club[];
  players: Player[];
  fixtures: Fixture[];
  referees: Referee[];
  tacticsByClub: Record<number, Tactics>;
  stadiumByClub: Record<number, StadiumConfig>;
  userKitVariant?: "home" | "away";
  onFinishMatchweek: (results: MatchResult[]) => void;
}

export const MatchdayLive: React.FC<MatchdayLiveProps> = ({
  matchweek,
  userClubId,
  clubs,
  players,
  fixtures,
  referees,
  tacticsByClub,
  stadiumByClub,
  userKitVariant = "home",
  onFinishMatchweek,
}) => {
  const clubMap = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const refMap = useMemo(() => new Map(referees.map((r) => [r.id, r])), [referees]);

  const weekFixtures = useMemo(
    () => fixtures.filter((f) => f.matchweek === matchweek && !f.played),
    [fixtures, matchweek]
  );

  // Local mutable live tactics for user during the match
  const [liveTacticsByClub, setLiveTacticsByClub] = useState<Record<number, Tactics>>(() => {
    const copy: Record<number, Tactics> = {};
    for (const [k, v] of Object.entries(tacticsByClub)) {
      copy[Number(k)] = { ...v, starters: [...v.starters], bench: [...v.bench] };
    }
    return copy;
  });

  const sessionsRef = useRef<LiveMatchSession[]>([]);
  const [, setTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedMs, setSpeedMs] = useState<number>(280);
  const [subOutId, setSubOutId] = useState<number | null>(null);

  // Initialize all 10 sessions for this matchweek once
  if (sessionsRef.current.length === 0 && weekFixtures.length > 0) {
    sessionsRef.current = weekFixtures.map((fx) => {
      const homePlayers = players.filter((p) => p.clubId === fx.homeClubId);
      const awayPlayers = players.filter((p) => p.clubId === fx.awayClubId);
      const ref = refMap.get(fx.refereeId) ?? referees[0];
      const hClub = clubMap.get(fx.homeClubId);
      const aClub = clubMap.get(fx.awayClubId);
      return initLiveMatchSession(
        fx,
        homePlayers,
        awayPlayers,
        liveTacticsByClub[fx.homeClubId],
        liveTacticsByClub[fx.awayClubId],
        ref,
        hClub,
        aClub,
        stadiumByClub[fx.homeClubId]
      );
    });
  }

  const userSession = sessionsRef.current.find(
    (s) => s.homeClubId === userClubId || s.awayClubId === userClubId
  );
  const allFinished =
    sessionsRef.current.length > 0 && sessionsRef.current.every((s) => s.finished);

  useEffect(() => {
    if (!isPlaying || allFinished) return;

    const timer = window.setInterval(() => {
      for (const session of sessionsRef.current) {
        if (session.finished) continue;
        const hClub = clubMap.get(session.homeClubId);
        const aClub = clubMap.get(session.awayClubId);
        if (!hClub || !aClub) continue;

        stepLiveMatchMinute(
          session,
          playerMap,
          hClub,
          aClub,
          liveTacticsByClub[session.homeClubId],
          liveTacticsByClub[session.awayClubId],
          userClubId,
          stadiumByClub[session.homeClubId]
        );
      }
      setTick((t) => t + 1);
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, speedMs, allFinished, clubMap, playerMap, liveTacticsByClub, userClubId, stadiumByClub]);

  const handleSimulateToEnd = () => {
    setIsPlaying(false);
    for (const session of sessionsRef.current) {
      const hClub = clubMap.get(session.homeClubId);
      const aClub = clubMap.get(session.awayClubId);
      if (!hClub || !aClub) continue;
      while (!session.finished) {
        stepLiveMatchMinute(
          session,
          playerMap,
          hClub,
          aClub,
          liveTacticsByClub[session.homeClubId],
          liveTacticsByClub[session.awayClubId],
          userClubId,
          stadiumByClub[session.homeClubId]
        );
      }
    }
    setTick((t) => t + 1);
  };

  const handleCompleteRound = () => {
    const results = sessionsRef.current.map((s) => finalizeMatchResult(s));
    onFinishMatchweek(results);
  };

  const handleLiveSub = (benchPlayerId: number) => {
    if (!userSession || subOutId === null || userSession.finished) return;
    const pOut = playerMap.get(subOutId);
    const pIn = playerMap.get(benchPlayerId);
    if (!pOut || !pIn) return;
    const ok = performLiveSubstitution(
      userSession,
      userClubId,
      pOut.id,
      pIn.id,
      pOut.name,
      pIn.name
    );
    if (ok) {
      setSubOutId(null);
      setTick((t) => t + 1);
    }
  };

  if (!userSession) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-slate-400">Nenhuma partida pendente nesta rodada.</p>
      </div>
    );
  }

  const userFixture = weekFixtures.find((f) => f.id === userSession.fixtureId)!;
  const homeClub = clubMap.get(userSession.homeClubId)!;
  const awayClub = clubMap.get(userSession.awayClubId)!;
  const isUserHome = userSession.homeClubId === userClubId;
  const userTactics = liveTacticsByClub[userClubId];

  const userActiveIds = isUserHome ? userSession.homeActiveIds : userSession.awayActiveIds;
  const userBenchIds = isUserHome ? userSession.homeBenchIds : userSession.awayBenchIds;
  const userSubsUsed = isUserHome ? userSession.homeSubsUsed : userSession.awaySubsUsed;

  const homeGoalEvents = userSession.events.filter(
    (e) => e.type === "goal" && e.clubId === homeClub.id
  );
  const awayGoalEvents = userSession.events.filter(
    (e) => e.type === "goal" && e.clubId === awayClub.id
  );

  const finalizedUser = userSession.finished ? finalizeMatchResult(userSession) : null;
  const motmPlayer = finalizedUser?.motmPlayerId
    ? playerMap.get(finalizedUser.motmPlayerId)
    : undefined;

  return (
    <div className="space-y-5">
      {/* Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 px-5 py-3.5 shadow-lg">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Premier League • Rodada {matchweek} Ao Vivo
          </div>
          <div className="text-xs text-slate-400">
            {homeClub.stadium} ({userSession.attendance.toLocaleString("pt-BR")} /{" "}
            {userSession.stadiumCapacity.toLocaleString("pt-BR")}) • Renda:{" "}
            <span className="text-emerald-400 font-semibold">
              {formatMoney(userSession.gateRevenueEur)}
            </span>{" "}
            • Árbitro: {userSession.referee.name} • {userFixture.tvBroadcaster}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!allFinished ? (
            <>
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Retomar
                  </>
                )}
              </button>
              <button
                onClick={() => setSpeedMs(280)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  speedMs === 280
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                1x
              </button>
              <button
                onClick={() => setSpeedMs(75)}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold ${
                  speedMs === 75
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <FastForward className="h-3.5 w-3.5" /> 4x
              </button>
              <button
                onClick={handleSimulateToEnd}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-slate-700"
              >
                <SkipForward className="h-3.5 w-3.5" /> Simular Fim
              </button>
            </>
          ) : (
            <button
              onClick={handleCompleteRound}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar Rodada e Avançar
            </button>
          )}
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left/Center: User Match Broadcast */}
        <div className="space-y-5 lg:col-span-8">
          {/* Scoreboard with Stadium Photo Atmosphere */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-xl">
            {getClubVisuals(homeClub).stadiumImageUrl && (
              <img
                src={getClubVisuals(homeClub).stadiumImageUrl}
                alt={homeClub.stadium}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-900/80 to-slate-950/95" />

            <div className="relative">
              <div className="mb-3 flex justify-center">
                <span
                  className={`rounded-full px-3.5 py-1 text-xs font-black tracking-wider ${
                    userSession.finished
                      ? "bg-slate-800 text-slate-300"
                      : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 animate-pulse"
                  }`}
                >
                  {userSession.finished
                    ? "FIM DE JOGO"
                    : userSession.minute > 90
                    ? `90+${userSession.minute - 90}'`
                    : `${userSession.minute}'`}
                </span>
              </div>

              <div className="grid grid-cols-11 items-center gap-2">
                <div className="col-span-4 flex flex-col items-center text-center sm:items-end sm:text-right">
                  <div className="flex items-center gap-2.5">
                    <span className="hidden sm:inline text-lg font-black text-white">
                      {homeClub.name}
                    </span>
                    <span className="sm:hidden text-sm font-black text-white">
                      {homeClub.shortName}
                    </span>
                    <div className="hidden md:block">
                      <ClubKit
                        club={homeClub}
                        variant={homeClub.id === userClubId ? userKitVariant : "home"}
                        size="sm"
                      />
                    </div>
                    <ClubBadge club={homeClub} size="lg" />
                  </div>
                  <div className="mt-2 space-y-0.5 text-[11px] text-emerald-300">
                    {homeGoalEvents.map((g) => (
                      <div key={g.id}>
                        ⚽ {g.playerName} ({g.minute}')
                      </div>
                    ))}
                  </div>
                </div>

                <div className="col-span-3 flex items-center justify-center gap-3 text-4xl font-black text-white sm:text-5xl">
                  <span>{userSession.homeGoals}</span>
                  <span className="text-slate-500 text-2xl">-</span>
                  <span>{userSession.awayGoals}</span>
                </div>

                <div className="col-span-4 flex flex-col items-center text-center sm:items-start sm:text-left">
                  <div className="flex items-center gap-2.5">
                    <ClubBadge club={awayClub} size="lg" />
                    <div className="hidden md:block">
                      <ClubKit
                        club={awayClub}
                        variant={awayClub.id === userClubId ? userKitVariant : "away"}
                        size="sm"
                      />
                    </div>
                    <span className="hidden sm:inline text-lg font-black text-white">
                      {awayClub.name}
                    </span>
                    <span className="sm:hidden text-sm font-black text-white">
                      {awayClub.shortName}
                    </span>
                  </div>
                  <div className="mt-2 space-y-0.5 text-[11px] text-emerald-300">
                    {awayGoalEvents.map((g) => (
                      <div key={g.id}>
                        ⚽ {g.playerName} ({g.minute}')
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {motmPlayer && finalizedUser && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
                  <Award className="h-4 w-4 text-amber-400" />
                  <span>
                    Craque da Partida: <strong className="text-white">{motmPlayer.name}</strong> (Nota{" "}
                    {finalizedUser.playerRatings[motmPlayer.id]?.toFixed(1)})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2D Live Pitch Radar */}
          <LivePitch2D
            session={userSession}
            homeClub={homeClub}
            awayClub={awayClub}
            homeTactics={liveTacticsByClub[homeClub.id]}
            awayTactics={liveTacticsByClub[awayClub.id]}
            playerMap={playerMap}
            userClubId={userClubId}
            userKitVariant={userKitVariant}
            isPlaying={isPlaying}
            subOutId={subOutId}
            onSelectSubOut={(pid) => setSubOutId((prev) => (prev === pid ? null : pid))}
          />

          {/* Match Stats */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              Estatísticas da Partida
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [
                  "Posse de Bola",
                  `${userSession.homeStats.possession}%`,
                  `${userSession.awayStats.possession}%`,
                  userSession.homeStats.possession,
                  userSession.awayStats.possession,
                ],
                [
                  "Gols Esperados (xG)",
                  userSession.homeStats.xg.toFixed(2),
                  userSession.awayStats.xg.toFixed(2),
                  userSession.homeStats.xg,
                  userSession.awayStats.xg,
                ],
                [
                  "Finalizações (No Alvo)",
                  `${userSession.homeStats.shots} (${userSession.homeStats.shotsOnTarget})`,
                  `${userSession.awayStats.shots} (${userSession.awayStats.shotsOnTarget})`,
                  userSession.homeStats.shots,
                  userSession.awayStats.shots,
                ],
                [
                  "Escanteios / Faltas",
                  `${userSession.homeStats.corners} / ${userSession.homeStats.fouls}`,
                  `${userSession.awayStats.corners} / ${userSession.awayStats.fouls}`,
                  userSession.homeStats.corners + userSession.homeStats.fouls,
                  userSession.awayStats.corners + userSession.awayStats.fouls,
                ],
              ].map(([label, hText, aText, hNum, aNum]) => {
                const total = Math.max(0.01, (hNum as number) + (aNum as number));
                const hPct = Math.round(((hNum as number) / total) * 100);
                return (
                  <div key={label as string} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-white">{hText}</span>
                      <span className="text-slate-400">{label}</span>
                      <span className="font-bold text-white">{aText}</span>
                    </div>
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${hPct}%` }} />
                      <div
                        className="bg-sky-500 transition-all"
                        style={{ width: `${100 - hPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Commentary + Other Matches of the Round */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Commentary */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Narração Lance a Lance
              </h3>
              <div className="h-80 space-y-2 overflow-y-auto pr-1">
                {userSession.events.length === 0 && (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Bola rolando! Aguardando os primeiros lances de perigo...
                  </div>
                )}
                {[...userSession.events].reverse().map((ev) => {
                  const badgeStyle =
                    ev.type === "goal"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : ev.type === "red_card"
                      ? "border-rose-500/50 bg-rose-500/15 text-rose-200"
                      : ev.type === "yellow_card"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                      : ev.type === "substitution"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                      : "border-slate-800 bg-slate-950/60 text-slate-300";

                  return (
                    <div
                      key={ev.id}
                      className={`rounded-xl border px-3 py-2 text-xs ${badgeStyle}`}
                    >
                      <span className="mr-2 font-black">{ev.minute}'</span>
                      <span>{ev.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Other 9 Matches of the Round */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Outros Jogos da Rodada {matchweek}
              </h3>
              <div className="h-80 space-y-2 overflow-y-auto pr-1">
                {sessionsRef.current
                  .filter((s) => s.fixtureId !== userSession.fixtureId)
                  .map((s) => {
                    const h = clubMap.get(s.homeClubId)!;
                    const a = clubMap.get(s.awayClubId)!;
                    return (
                      <div
                        key={s.fixtureId}
                        className="rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex w-[38%] items-center gap-2">
                            <ClubBadge club={h} size="sm" />
                            <span className="truncate font-bold text-slate-200">{h.shortName}</span>
                          </div>
                          <div className="text-center">
                            <div className="rounded-md bg-slate-900 px-2.5 py-0.5 font-black text-white ring-1 ring-slate-800">
                              {s.homeGoals} - {s.awayGoals}
                            </div>
                            <div className="mt-0.5 text-[9px] font-semibold text-slate-500">
                              {s.finished ? "FIN" : `${s.minute}'`}
                            </div>
                          </div>
                          <div className="flex w-[38%] items-center justify-end gap-2">
                            <span className="truncate font-bold text-slate-200">{a.shortName}</span>
                            <ClubBadge club={a} size="sm" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Substitutions & Live Coaching */}
        <div className="lg:col-span-4">
          <div className="sticky top-20 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Flame className="h-3.5 w-3.5 text-amber-400" /> Substituições & Tática
              </h3>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                Trocas: {userSubsUsed}/5
              </span>
            </div>

            {/* Quick tactical knobs */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500">Mentalidade</label>
                <select
                  disabled={userSession.finished}
                  value={userTactics.mentality}
                  onChange={(e) =>
                    setLiveTacticsByClub((prev) => ({
                      ...prev,
                      [userClubId]: {
                        ...prev[userClubId],
                        mentality: e.target.value as Mentality,
                      },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-semibold text-white"
                >
                  <option value="Defensive">Defensiva</option>
                  <option value="Balanced">Equilibrada</option>
                  <option value="Attacking">Ofensiva</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500">Pressão</label>
                <select
                  disabled={userSession.finished}
                  value={userTactics.pressing}
                  onChange={(e) =>
                    setLiveTacticsByClub((prev) => ({
                      ...prev,
                      [userClubId]: {
                        ...prev[userClubId],
                        pressing: e.target.value as Pressing,
                      },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-semibold text-white"
                >
                  <option value="Low">Baixa</option>
                  <option value="Medium">Média</option>
                  <option value="High">Alta</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500">Passe</label>
                <select
                  disabled={userSession.finished}
                  value={userTactics.passingStyle}
                  onChange={(e) =>
                    setLiveTacticsByClub((prev) => ({
                      ...prev,
                      [userClubId]: {
                        ...prev[userClubId],
                        passingStyle: e.target.value as PassingStyle,
                      },
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-semibold text-white"
                >
                  <option value="Short">Curto</option>
                  <option value="Mixed">Misto</option>
                  <option value="Direct">Direto</option>
                </select>
              </div>
            </div>

            {/* Substitutions Area */}
            {userSession.finished ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
                <Shield className="mx-auto mb-1.5 h-5 w-5 text-slate-500" />
                Partida encerrada! Clique em Finalizar Rodada acima para atualizar a tabela.
              </div>
            ) : (
              <div className="space-y-3">
                {subOutId !== null && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    <span className="truncate">
                      Saindo: <strong className="text-white">{playerMap.get(subOutId)?.name}</strong>
                    </span>
                    <button
                      onClick={() => setSubOutId(null)}
                      className="shrink-0 rounded bg-slate-800 px-2 py-0.5 font-bold text-slate-200 hover:bg-slate-700"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {/* Em Campo (11) */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Em Campo ({userActiveIds.length})</span>
                    <span>{userSubsUsed < 5 ? "Clique p/ tirar" : "Trocas esgotadas"}</span>
                  </div>
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {userActiveIds.map((id) => {
                      const p = playerMap.get(id);
                      if (!p) return null;
                      const stam = Math.round(userSession.playerStamina[id] ?? p.stamina);
                      const rating = (userSession.playerRatings[id] ?? 6.5).toFixed(1);
                      const isSelected = subOutId === id;
                      return (
                        <button
                          key={id}
                          disabled={userSubsUsed >= 5}
                          onClick={() => setSubOutId((prev) => (prev === id ? null : id))}
                          className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                            isSelected
                              ? "border-amber-400 bg-amber-400/15 ring-1 ring-amber-400/40"
                              : "border-slate-800 bg-slate-950/70 hover:border-amber-500/40 disabled:opacity-60"
                          }`}
                        >
                          <span className="truncate font-semibold text-white">
                            <span className="mr-1.5 inline-block w-7 text-[10px] font-bold text-slate-400">
                              {p.primaryPosition}
                            </span>
                            {p.name}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-400">{rating}</span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-300">
                              <span
                                className={`inline-block h-2 w-2 rounded-full ${getStaminaColor(
                                  stam
                                )}`}
                              />
                              {stam}%
                            </span>
                            <ArrowLeftRight
                              className={`h-3 w-3 ${
                                isSelected ? "text-amber-300" : "text-slate-500"
                              }`}
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Banco de Reservas */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    <span>Banco de Reservas ({userBenchIds.length})</span>
                    <span>
                      {subOutId !== null && userSubsUsed < 5
                        ? "Clique p/ entrar"
                        : "Selecione quem sai"}
                    </span>
                  </div>
                  <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                    {userBenchIds.map((id) => {
                      const p = playerMap.get(id);
                      if (!p) return null;
                      const ready = subOutId !== null && userSubsUsed < 5;
                      return (
                        <button
                          key={id}
                          disabled={!ready}
                          onClick={() => handleLiveSub(id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                            ready
                              ? "border-emerald-500/50 bg-emerald-500/12 hover:bg-emerald-500/25 cursor-pointer"
                              : "border-slate-800/80 bg-slate-950/40 text-slate-400 opacity-75 cursor-default"
                          }`}
                        >
                          <span className="truncate font-semibold text-white">
                            <span
                              className={`mr-1.5 inline-block w-7 text-[10px] font-bold ${
                                ready ? "text-emerald-300" : "text-slate-500"
                              }`}
                            >
                              {p.primaryPosition}
                            </span>
                            {p.name}
                          </span>
                          <span
                            className={`text-[11px] font-bold shrink-0 ${
                              ready ? "text-emerald-300" : "text-slate-400"
                            }`}
                          >
                            OVR {p.overall} {ready ? "• Entrar" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
