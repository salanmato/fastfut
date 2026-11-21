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
  AlertTriangle,
  HeartPulse,
  Compass,
  Flag,
} from "lucide-react";
import type {
  Club,
  Fixture,
  Formation,
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
  autoOpenFormationOnRedCard?: boolean;
  onToggleAutoFormationOnRedCard?: () => void;
  onFinishMatchweek: (results: MatchResult[]) => void;
}

const LIVE_FORMATIONS: Formation[] = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "5-3-2"];

function renderOvrStamina(
  overall: number,
  stamina: number,
  className = "text-slate-300",
  suffix?: string
) {
  return (
    <span
      title={`Overall ${overall} / Energia ${stamina}%`}
      className={`flex items-center gap-1 text-[11px] font-bold shrink-0 ${className}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${getStaminaColor(stamina)}`} />
      <span>
        {overall} / {stamina}%{suffix ? ` ${suffix}` : ""}
      </span>
    </span>
  );
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
  autoOpenFormationOnRedCard = true,
  onToggleAutoFormationOnRedCard,
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
  const [speedMs, setSpeedMs] = useState<number>(1200);
  const [pitchSize, setPitchSize] = useState<"normal" | "large" | "full">(() => {
    try {
      const saved = localStorage.getItem("fm_pitch_size") as "normal" | "large" | "full";
      if (saved === "normal" || saved === "large" || saved === "full") return saved;
    } catch {}
    return "large";
  });
  const simPauseUntilRef = useRef<number>(0);
  const halftimeTriggeredRef = useRef<boolean>(false);
  const [subOutId, setSubOutId] = useState<number | null>(null);
  const [tacticalStopReason, setTacticalStopReason] = useState<{
    type: "red_card" | "injury";
    playerId: number;
    playerName: string;
    minute: number;
    text: string;
  } | null>(null);

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

  const isHalftime =
    Boolean(userSession) &&
    !allFinished &&
    !isPlaying &&
    halftimeTriggeredRef.current &&
    userSession!.minute === 45;

  useEffect(() => {
    if (!isPlaying || allFinished) return;

    const timer = window.setInterval(() => {
      // Freeze the clock during goal celebrations / big chances so nothing is skipped
      if (Date.now() < simPauseUntilRef.current) return;

      const uSess = sessionsRef.current.find(
        (s) => s.homeClubId === userClubId || s.awayClubId === userClubId
      );
      const prevUserEventsLen = uSess ? uSess.events.length : 0;

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

      // Half-time break for the user's match
      if (uSess && !uSess.finished && uSess.minute === 45 && !halftimeTriggeredRef.current) {
        halftimeTriggeredRef.current = true;
        setIsPlaying(false);
      }

      if (uSess && !uSess.finished && uSess.events.length > prevUserEventsLen) {
        const freshEvents = uSess.events.slice(prevUserEventsLen);
        const triggerEvent = freshEvents.find(
          (ev) =>
            ev.clubId === userClubId &&
            (ev.type === "red_card" || ev.type === "injury")
        );
        if (triggerEvent && autoOpenFormationOnRedCard) {
          setIsPlaying(false);
          setTacticalStopReason({
            type: triggerEvent.type as "red_card" | "injury",
            playerId: triggerEvent.playerId,
            playerName: triggerEvent.playerName,
            minute: triggerEvent.minute,
            text: triggerEvent.text,
          });
          const isUserHomeNow = uSess.homeClubId === userClubId;
          const subsUsedNow = isUserHomeNow ? uSess.homeSubsUsed : uSess.awaySubsUsed;
          if (triggerEvent.type === "injury" && subsUsedNow < 5) {
            setSubOutId(triggerEvent.playerId);
          }
        }
      }

      setTick((t) => t + 1);
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [
    isPlaying,
    speedMs,
    allFinished,
    clubMap,
    playerMap,
    liveTacticsByClub,
    userClubId,
    stadiumByClub,
    autoOpenFormationOnRedCard,
  ]);

  const handleChangeFormationLive = (formation: Formation) => {
    setLiveTacticsByClub((prev) => ({
      ...prev,
      [userClubId]: {
        ...prev[userClubId],
        formation,
      },
    }));
  };

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-3.5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            {homeClub.division ?? "Premier League"} • Rodada {matchweek} Ao Vivo
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
              {onToggleAutoFormationOnRedCard && (
                <button
                  onClick={onToggleAutoFormationOnRedCard}
                  title="Quando ativo, pausa o jogo e abre a formação automaticamente ao sofrer expulsão ou lesão"
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${
                    autoOpenFormationOnRedCard
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                      : "border-slate-700 bg-slate-800 text-slate-400"
                  }`}
                >
                  <Compass className="h-3.5 w-3.5" />
                  Auto-Formação: {autoOpenFormationOnRedCard ? "ON" : "OFF"}
                </button>
              )}
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
              {[
                { label: "0.5x", ms: 2400 },
                { label: "1x", ms: 1200 },
                { label: "2x", ms: 600 },
                { label: "4x", ms: 300 },
                { label: "8x", ms: 150 },
              ].map((opt) => (
                <button
                  key={opt.ms}
                  onClick={() => setSpeedMs(opt.ms)}
                  title={`${opt.label}: ~${Math.round((opt.ms * 93) / 60000 * 10) / 10} min para os 90 minutos`}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold ${
                    speedMs === opt.ms
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {opt.ms <= 300 && <FastForward className="h-3.5 w-3.5" />} {opt.label}
                </button>
              ))}
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
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar Rodada e Avançar
            </button>
          )}
        </div>
      </div>

      {isHalftime && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-3.5">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-amber-300">
              Intervalo • {userSession.homeGoals} x {userSession.awayGoals}
            </div>
            <div className="text-xs text-slate-300">
              Hora de ajustar a formação, trocar jogadores e corrigir o rumo do jogo antes do 2º tempo.
            </div>
          </div>
          <button
            onClick={() => setIsPlaying(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2 text-xs font-black text-slate-950 hover:bg-amber-300"
          >
            <Play className="h-3.5 w-3.5 fill-current" /> Iniciar 2º Tempo
          </button>
        </div>
      )}

      {/* Main Layout */}
      <div className={`grid gap-5 transition-all ${pitchSize === "full" ? "grid-cols-1" : "lg:grid-cols-12"}`}>
        {/* Left/Center: User Match Broadcast */}
        <div className={`space-y-5 transition-all ${pitchSize === "full" ? "w-full" : "lg:col-span-8"}`}>
          {/* Scoreboard with Stadium Photo Atmosphere */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-6">
            {getClubVisuals(homeClub).stadiumImageUrl && (
              <img
                src={getClubVisuals(homeClub).stadiumImageUrl}
                alt={homeClub.stadium}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-slate-950/80" />

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
                    : isHalftime
                    ? "INTERVALO"
                    : `${userSession.minute <= 45 ? "1º TEMPO" : "2º TEMPO"} • ${
                        userSession.minute > 90
                          ? `90+${userSession.minute - 90}'`
                          : `${userSession.minute}'`
                      }`}
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
                      <div key={g.id} className="flex items-center gap-1.5">
                        <Award className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span>{g.playerName} ({g.minute}')</span>
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
                      <div key={g.id} className="flex items-center gap-1.5">
                        <Award className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span>{g.playerName} ({g.minute}')</span>
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
            speedMs={speedMs}
            simPauseRef={simPauseUntilRef}
            subOutId={subOutId}
            onSelectSubOut={(pid) => setSubOutId((prev) => (prev === pid ? null : pid))}
            pitchSize={pitchSize}
            onPitchSizeChange={setPitchSize}
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
                  "Impedimentos",
                  `${userSession.homeStats.offsides ?? 0}`,
                  `${userSession.awayStats.offsides ?? 0}`,
                  userSession.homeStats.offsides ?? 0,
                  userSession.awayStats.offsides ?? 0,
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
                      : ev.type === "injury"
                      ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                      : ev.type === "yellow_card"
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                      : ev.type === "substitution"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                      : ev.type === "offside"
                      ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                      : "border-slate-800 bg-slate-950/60 text-slate-300";

                  let eventIconNode: React.ReactNode = <span className="text-slate-500">•</span>;
                  if (ev.type === "goal") {
                    eventIconNode = <Award className="h-4 w-4 text-emerald-400" />;
                  } else if (ev.type === "yellow_card") {
                    eventIconNode = (
                      <span className="inline-block h-3.5 w-2.5 rounded-[1px] bg-amber-400 border border-amber-600 shadow-sm mt-0.5" />
                    );
                  } else if (ev.type === "red_card") {
                    eventIconNode = (
                      <span className="inline-block h-3.5 w-2.5 rounded-[1px] bg-rose-600 border border-rose-300 shadow-sm mt-0.5" />
                    );
                  } else if (ev.type === "injury") {
                    eventIconNode = <HeartPulse className="h-4 w-4 text-rose-400" />;
                  } else if (ev.type === "offside") {
                    eventIconNode = <Flag className="h-4 w-4 text-orange-400" />;
                  } else if (ev.type === "substitution") {
                    eventIconNode = <ArrowLeftRight className="h-4 w-4 text-sky-400" />;
                  } else if (ev.type === "save") {
                    eventIconNode = <Shield className="h-4 w-4 text-indigo-400" />;
                  }

                  return (
                    <div
                      key={ev.id}
                      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs ${badgeStyle}`}
                    >
                      <span className="font-black text-slate-100">{ev.minute}'</span>
                      <span className="shrink-0 flex items-center justify-center mt-0.5">{eventIconNode}</span>
                      <span className="min-w-0 flex-1">{ev.text}</span>
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
        <div className={`transition-all ${pitchSize === "full" ? "w-full" : "lg:col-span-4"}`}>
          <div className="sticky top-20 rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Flame className="h-3.5 w-3.5 text-amber-400" /> Substituições & Tática
              </h3>
              <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                Trocas: {userSubsUsed}/5
              </span>
            </div>

            {/* Quick Formation selector */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                <span>Formação em Campo</span>
                <span className="text-slate-400">{userActiveIds.length} atletas</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {LIVE_FORMATIONS.map((f) => (
                  <button
                    key={f}
                    disabled={userSession.finished}
                    onClick={() => handleChangeFormationLive(f)}
                    className={`rounded-lg py-1 text-[11px] font-bold transition ${
                      userTactics.formation === f
                        ? "bg-emerald-500 text-slate-950"
                        : "border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 disabled:opacity-50"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
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
                      const isInjured = userSession.injuredIds.includes(id);
                      return (
                        <button
                          key={id}
                          disabled={userSubsUsed >= 5}
                          onClick={() => setSubOutId((prev) => (prev === id ? null : id))}
                          className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                            isSelected
                              ? "border-amber-400 bg-amber-400/15 ring-1 ring-amber-400/40"
                              : isInjured
                              ? "border-rose-500/60 bg-rose-500/15"
                              : "border-slate-800 bg-slate-950/70 hover:border-amber-500/40 disabled:opacity-60"
                          }`}
                        >
                          <span className="truncate font-semibold text-white">
                            <span className="mr-1.5 inline-block w-7 text-[10px] font-bold text-slate-400">
                              {p.primaryPosition}
                            </span>
                            {p.name}
                            {isInjured && (
                              <span className="ml-1.5 rounded bg-rose-600 px-1 py-0.2 text-[9px] font-black text-white">
                                +LESÃO
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-400" title="Nota na partida">
                              {rating}
                            </span>
                            {renderOvrStamina(p.overall, stam, "text-slate-200")}
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
                      const stam = Math.round(userSession.playerStamina[id] ?? p.stamina);
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
                          {renderOvrStamina(
                            p.overall,
                            stam,
                            ready ? "text-emerald-300" : "text-slate-300",
                            ready ? "• Entrar" : undefined
                          )}
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

      {/* Tactical Stop Modal on Red Card / Injury */}
      {tacticalStopReason && !userSession.finished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-rose-500/60 bg-slate-900 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40">
                  {tacticalStopReason.type === "red_card" ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <HeartPulse className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-400">
                    {tacticalStopReason.type === "red_card"
                      ? `Expulsão aos ${tacticalStopReason.minute}'`
                      : `Lesão aos ${tacticalStopReason.minute}'`}
                  </div>
                  <h3 className="text-lg font-black text-white">
                    Reorganizar Formação ({userActiveIds.length} em campo)
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-300">{tacticalStopReason.text}</p>
                </div>
              </div>
            </div>

            {/* Formation + Tactical Controls */}
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nova Formação Tática
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {LIVE_FORMATIONS.map((f) => (
                    <button
                      key={f}
                      onClick={() => handleChangeFormationLive(f)}
                      className={`rounded-lg py-2 text-xs font-black transition ${
                        userTactics.formation === f
                          ? "bg-emerald-500 text-slate-950"
                          : "border border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Mentalidade</label>
                  <select
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
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    <option value="Defensive">Defensiva</option>
                    <option value="Balanced">Equilibrada</option>
                    <option value="Attacking">Ofensiva</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Pressão</label>
                  <select
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
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    <option value="Low">Baixa</option>
                    <option value="Medium">Média</option>
                    <option value="High">Alta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500">Passe</label>
                  <select
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
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    <option value="Short">Curto</option>
                    <option value="Mixed">Misto</option>
                    <option value="Direct">Direto</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Substitutions inside Modal */}
            {userSubsUsed < 5 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-1.5 text-[10px] font-bold uppercase text-slate-400">
                    Em Campo ({userActiveIds.length}) — Trocas {userSubsUsed}/5
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {userActiveIds.map((id) => {
                      const p = playerMap.get(id);
                      if (!p) return null;
                      const stam = Math.round(userSession.playerStamina[id] ?? p.stamina);
                      const isSel = subOutId === id;
                      const isInj = userSession.injuredIds.includes(id);
                      return (
                        <button
                          key={id}
                          onClick={() => setSubOutId((prev) => (prev === id ? null : id))}
                          className={`flex w-full items-center justify-between rounded-lg border px-2 py-1 text-left text-xs ${
                            isSel
                              ? "border-amber-400 bg-amber-400/15"
                              : isInj
                              ? "border-rose-500/60 bg-rose-500/15"
                              : "border-slate-800 bg-slate-900/70 hover:border-amber-500/40"
                          }`}
                        >
                          <span className="truncate font-semibold text-white">
                            <span className="mr-1 text-[10px] text-slate-400">
                              {p.primaryPosition}
                            </span>
                            {p.name}
                            {isInj && (
                              <span className="ml-1 rounded bg-rose-600 px-1 text-[9px] font-black text-white">
                                +LESÃO
                              </span>
                            )}
                          </span>
                          {renderOvrStamina(p.overall, stam, "text-slate-300")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-1.5 text-[10px] font-bold uppercase text-emerald-400">
                    {subOutId !== null
                      ? `Entrar no lugar de ${playerMap.get(subOutId)?.name}`
                      : "Banco de Reservas"}
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {userBenchIds.map((id) => {
                      const p = playerMap.get(id);
                      if (!p) return null;
                      const stam = Math.round(userSession.playerStamina[id] ?? p.stamina);
                      const ready = subOutId !== null;
                      return (
                        <button
                          key={id}
                          disabled={!ready}
                          onClick={() => handleLiveSub(id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-2 py-1 text-left text-xs ${
                            ready
                              ? "border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25"
                              : "border-slate-800 bg-slate-900/40 opacity-60"
                          }`}
                        >
                          <span className="truncate font-semibold text-white">
                            <span className="mr-1 text-[10px] text-emerald-300">
                              {p.primaryPosition}
                            </span>
                            {p.name}
                          </span>
                          {renderOvrStamina(
                            p.overall,
                            stam,
                            ready ? "text-emerald-300" : "text-slate-300"
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {onToggleAutoFormationOnRedCard ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={autoOpenFormationOnRedCard}
                    onChange={onToggleAutoFormationOnRedCard}
                    className="accent-emerald-500"
                  />
                  Pausar e abrir formação automaticamente em expulsões/lesões
                </label>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTacticalStopReason(null)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
                >
                  Manter Pausado
                </button>
                <button
                  onClick={() => {
                    setTacticalStopReason(null);
                    setIsPlaying(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Confirmar Formação e Retomar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
