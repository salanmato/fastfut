import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
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
  Radio,
  BarChart3,
  Users,
  Sparkles,
  Clock,
  ArrowUp,
  ArrowDown,
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
import { formatMoney, getPlayerDisplayName, getStaminaColor } from "../utils/format";
import { getClubVisuals } from "../utils/clubVisuals";
import { ClubBadge } from "./ClubBadge";
import { ClubKit } from "./ClubKit";
import { LivePitch2D, getSofascoreRatingColor, type PitchSize } from "./LivePitch2D";
import type { ClubSynergyTracker } from "../types/game";
import {
  calculateTeamSynergy,
  getOrCreateClubSynergyTracker,
} from "../engine/synergyEngine";

interface MatchdayLiveProps {
  matchweek: number;
  userClubId: number;
  clubs: Club[];
  players: Player[];
  fixtures: Fixture[];
  referees: Referee[];
  tacticsByClub: Record<number, Tactics>;
  stadiumByClub: Record<number, StadiumConfig>;
  synergyByClub?: Record<number, ClubSynergyTracker>;
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
  synergyByClub,
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

  // Pre-Match lineup presentation state
  const [isPreMatch, setIsPreMatch] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState<number>(1200);
  const [pitchSize, setPitchSize] = useState<PitchSize>(() => {
    try {
      const saved = localStorage.getItem("fm_pitch_size") as PitchSize;
      if (saved === "normal" || saved === "large" || saved === "full") return saved;
    } catch {}
    return "large";
  });
  const [activePanelTab, setActivePanelTab] = useState<"subs" | "commentary" | "stats" | "other_matches">("subs");
  const simPauseUntilRef = useRef<number>(0);
  const halftimeTriggeredRef = useRef<boolean>(false);
  const [subOutId, setSubOutId] = useState<number | null>(null);
  const [subInId, setSubInId] = useState<number | null>(null);
  const [preMatchSwapId, setPreMatchSwapId] = useState<number | null>(null);
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

      const hTactics = liveTacticsByClub[fx.homeClubId];
      const aTactics = liveTacticsByClub[fx.awayClubId];
      const hTracker = getOrCreateClubSynergyTracker(
        { clubs, players, currentMatchweek: matchweek, tacticsByClub: liveTacticsByClub, synergyByClub },
        fx.homeClubId
      );
      const aTracker = getOrCreateClubSynergyTracker(
        { clubs, players, currentMatchweek: matchweek, tacticsByClub: liveTacticsByClub, synergyByClub },
        fx.awayClubId
      );
      const hStarters = hTactics.starters.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
      const aStarters = aTactics.starters.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
      const hSynergy = calculateTeamSynergy(hStarters, hTactics, hTracker);
      const aSynergy = calculateTeamSynergy(aStarters, aTactics, aTracker);

      return initLiveMatchSession(
        fx,
        homePlayers,
        awayPlayers,
        hTactics,
        aTactics,
        ref,
        hClub,
        aClub,
        stadiumByClub[fx.homeClubId],
        hSynergy,
        aSynergy
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
    Boolean(userSession?.isHalftime);

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
      if (uSess && !uSess.finished && uSess.isHalftime && !halftimeTriggeredRef.current) {
        halftimeTriggeredRef.current = true;
        setIsPlaying(false);
        setActivePanelTab("subs"); // Auto focus on substitutions for user to make changes
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
          setActivePanelTab("subs");
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

  const handleStartSecondHalf = () => {
    for (const session of sessionsRef.current) {
      if (session.isHalftime) {
        session.isHalftime = false;
        session.secondHalfStarted = true;
        session.minute = 45; // Próximo minuto será 46 (início da segunda etapa)
        session.events.push({
          id: `whistle-2nd-${session.fixtureId}`,
          minute: 45,
          type: "whistle",
          clubId: session.awayClubId,
          playerId: 0,
          playerName: "Árbitro",
          text: "Bola rolando para a segunda etapa! Início do 2º tempo.",
        });
      }
    }
    halftimeTriggeredRef.current = false;
    setIsPlaying(true);
  };

  const handleSimulateToEnd = () => {
    setIsPlaying(false);
    for (const session of sessionsRef.current) {
      const hClub = clubMap.get(session.homeClubId);
      const aClub = clubMap.get(session.awayClubId);
      if (!hClub || !aClub) continue;
      while (!session.finished) {
        if (session.isHalftime) {
          session.isHalftime = false;
          session.secondHalfStarted = true;
          session.minute = 45;
        }
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
    halftimeTriggeredRef.current = false;
    setTick((t) => t + 1);
  };

  const handleCompleteRound = () => {
    const results = sessionsRef.current.map((s) => finalizeMatchResult(s));
    onFinishMatchweek(results);
  };

  const executeLiveSub = (outId: number, inId: number) => {
    if (!userSession || userSession.finished) return;
    const pOut = playerMap.get(outId);
    const pIn = playerMap.get(inId);
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
      setSubInId(null);
      setTick((t) => t + 1);
    }
  };

  const handleClickPitchStarter = (starterId: number) => {
    if (!userSession || userSession.finished) return;
    const subsUsed =
      userSession.homeClubId === userClubId
        ? userSession.homeSubsUsed
        : userSession.awaySubsUsed;
    if (subsUsed >= 5) return;

    if (subInId !== null) {
      executeLiveSub(starterId, subInId);
      return;
    }
    setSubOutId((prev) => (prev === starterId ? null : starterId));
  };

  const handleClickBenchPlayer = (benchPlayerId: number) => {
    if (!userSession || userSession.finished) return;
    const subsUsed =
      userSession.homeClubId === userClubId
        ? userSession.homeSubsUsed
        : userSession.awaySubsUsed;
    if (subsUsed >= 5) return;

    if (subOutId !== null) {
      executeLiveSub(subOutId, benchPlayerId);
      return;
    }
    setSubInId((prev) => (prev === benchPlayerId ? null : benchPlayerId));
  };

  const handlePreMatchSwap = (clickedId: number) => {
    if (!userSession || userSession.minute > 0) return;
    if (preMatchSwapId === null) {
      setPreMatchSwapId(clickedId);
      return;
    }
    if (preMatchSwapId === clickedId) {
      setPreMatchSwapId(null);
      return;
    }

    const isHome = userSession.homeClubId === userClubId;
    const activeIds = isHome ? [...userSession.homeActiveIds] : [...userSession.awayActiveIds];
    const benchIds = isHome ? [...userSession.homeBenchIds] : [...userSession.awayBenchIds];

    const idxAStart = activeIds.indexOf(preMatchSwapId);
    const idxABench = benchIds.indexOf(preMatchSwapId);
    const idxBStart = activeIds.indexOf(clickedId);
    const idxBBench = benchIds.indexOf(clickedId);

    if (idxAStart >= 0) activeIds[idxAStart] = clickedId;
    else if (idxABench >= 0) benchIds[idxABench] = clickedId;

    if (idxBStart >= 0) activeIds[idxBStart] = preMatchSwapId;
    else if (idxBBench >= 0) benchIds[idxBBench] = preMatchSwapId;

    if (isHome) {
      userSession.homeActiveIds = activeIds;
      userSession.homeBenchIds = benchIds;
    } else {
      userSession.awayActiveIds = activeIds;
      userSession.awayBenchIds = benchIds;
    }

    setLiveTacticsByClub((prev) => ({
      ...prev,
      [userClubId]: {
        ...prev[userClubId],
        starters: activeIds,
        bench: benchIds,
      },
    }));
    setPreMatchSwapId(null);
    setTick((t) => t + 1);
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

  // Starters and Benches for both clubs
  const homeStarters = userSession.homeActiveIds
    .map((id) => playerMap.get(id))
    .filter(Boolean) as Player[];
  const awayStarters = userSession.awayActiveIds
    .map((id) => playerMap.get(id))
    .filter(Boolean) as Player[];

  const homeBench = userSession.homeBenchIds
    .map((id) => playerMap.get(id))
    .filter(Boolean) as Player[];
  const awayBench = userSession.awayBenchIds
    .map((id) => playerMap.get(id))
    .filter(Boolean) as Player[];

  const homeAvgOvr =
    homeStarters.length > 0
      ? Math.round(homeStarters.reduce((acc, p) => acc + p.overall, 0) / homeStarters.length)
      : homeClub.avgOverall;

  const awayAvgOvr =
    awayStarters.length > 0
      ? Math.round(awayStarters.reduce((acc, p) => acc + p.overall, 0) / awayStarters.length)
      : awayClub.avgOverall;

  const homeTracker = useMemo(
    () =>
      getOrCreateClubSynergyTracker(
        { clubs, players, currentMatchweek: matchweek, tacticsByClub: liveTacticsByClub, synergyByClub },
        homeClub.id
      ),
    [clubs, players, matchweek, liveTacticsByClub, synergyByClub, homeClub.id]
  );
  const awayTracker = useMemo(
    () =>
      getOrCreateClubSynergyTracker(
        { clubs, players, currentMatchweek: matchweek, tacticsByClub: liveTacticsByClub, synergyByClub },
        awayClub.id
      ),
    [clubs, players, matchweek, liveTacticsByClub, synergyByClub, awayClub.id]
  );
  const homeSynergy = useMemo(
    () => calculateTeamSynergy(homeStarters, liveTacticsByClub[homeClub.id], homeTracker),
    [homeStarters, liveTacticsByClub, homeClub.id, homeTracker]
  );
  const awaySynergy = useMemo(
    () => calculateTeamSynergy(awayStarters, liveTacticsByClub[awayClub.id], awayTracker),
    [awayStarters, liveTacticsByClub, awayClub.id, awayTracker]
  );

  // --- PRE-MATCH / FORMATION PRESENTATION MODAL / SCREEN ---
  if (isPreMatch) {
    return (
      <div className="flex flex-col gap-4 max-h-[calc(100vh-5.5rem)] overflow-y-auto pr-1 text-slate-100">
        {/* Stadium Atmosphere & Header Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
          {getClubVisuals(homeClub).stadiumImageUrl && (
            <img
              src={getClubVisuals(homeClub).stadiumImageUrl}
              alt={homeClub.stadium}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                {homeClub.division ?? "Premier League"} • Rodada {matchweek}
              </div>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                Apresentação das Equipes & Formações
              </h2>
              <div className="mt-1 text-xs text-slate-400">
                {homeClub.stadium} ({userSession.attendance.toLocaleString("pt-BR")} torcedores) • Renda Estimada:{" "}
                <span className="text-emerald-400 font-semibold">{formatMoney(userSession.gateRevenueEur)}</span> •
                Árbitro: {userSession.referee.name} • {userFixture.tvBroadcaster}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsPreMatch(false);
                  setIsPlaying(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:scale-105 active:scale-95"
              >
                <Play className="h-4 w-4 fill-current" />
                {userSession.minute > 0 ? "Voltar ao Jogo Ao Vivo" : "Dar o Pontapé Inicial"}
              </button>
            </div>
          </div>
        </div>

        {/* Side-by-side Lineups & Tactical Face-off */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Home Team Column */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 lg:col-span-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <ClubBadge club={homeClub} size="lg" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-black text-white text-base">{homeClub.name}</h3>
                    {homeClub.id === userClubId && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                        Seu Time
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>Mandante</span>
                    <span>•</span>
                    <span className="font-bold text-emerald-400">OVR Médio: {homeAvgOvr}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                    <Flame className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-slate-300 font-semibold">
                      Sinergia: <strong className={homeSynergy.tierColor}>{homeSynergy.overallScore}%</strong> ({homeSynergy.bonusPercentFormatted})
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-xs font-black text-emerald-300">
                  {liveTacticsByClub[homeClub.id]?.formation ?? "4-3-3"}
                </div>
                <div className="mt-1 hidden sm:block">
                  <ClubKit
                    club={homeClub}
                    variant={homeClub.id === userClubId ? userKitVariant : "home"}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* Home Starting XI */}
            <div className="space-y-1.5 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex justify-between">
                <span>
                  11 Titulares{" "}
                  {homeClub.id === userClubId && userSession.minute === 0 && (
                    <span className="text-emerald-400 normal-case font-semibold">
                      (clique p/ trocar com banco)
                    </span>
                  )}
                </span>
                <span>OVR / Stamina</span>
              </div>
              <div className="space-y-1">
                {homeStarters.map((p) => {
                  const isUserInteractive = homeClub.id === userClubId && userSession.minute === 0;
                  const isSelected = preMatchSwapId === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      disabled={!isUserInteractive}
                      onClick={() => isUserInteractive && handlePreMatchSwap(p.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                        isSelected
                          ? "border-amber-400 bg-amber-400/15 ring-1 ring-amber-400/40"
                          : isUserInteractive && preMatchSwapId !== null
                          ? "border-emerald-500/40 bg-slate-950/80 hover:border-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                          : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-center font-bold text-amber-300 text-[11px]">
                          #{p.shirtNumber ?? "-"}
                        </span>
                        <span className="w-8 text-center rounded bg-slate-800 px-1 py-0.5 text-[10px] font-bold text-slate-300">
                          {p.primaryPosition}
                        </span>
                        <span className="truncate font-semibold text-white">
                          {getPlayerDisplayName(p.name)}
                        </span>
                      </div>
                      {renderOvrStamina(p.overall, Math.round(p.stamina), "text-slate-200")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Home Bench */}
            <div className="pt-2 border-t border-slate-800">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Banco de Reservas ({homeBench.length})</span>
                {homeClub.id === userClubId && userSession.minute === 0 && (
                  <span className="text-emerald-400">
                    {preMatchSwapId !== null ? "Selecione com quem trocar" : "Clique p/ escalar"}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {homeBench.slice(0, 7).map((p) => {
                  const isUserInteractive = homeClub.id === userClubId && userSession.minute === 0;
                  const isSelected = preMatchSwapId === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      disabled={!isUserInteractive}
                      onClick={() => isUserInteractive && handlePreMatchSwap(p.id)}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium border transition ${
                        isSelected
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/50"
                          : isUserInteractive
                          ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400 hover:text-emerald-300 cursor-pointer"
                          : "border-slate-800 bg-slate-950 text-slate-300"
                      }`}
                      title={`${p.name} (${p.primaryPosition}) - OVR ${p.overall}`}
                    >
                      {p.primaryPosition} {getPlayerDisplayName(p.name)} ({p.overall})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Center Column: Tactical Adjustments & Matchup Tuning */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 lg:col-span-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-center gap-2 text-center border-b border-slate-800 pb-3">
                <span className="text-xl font-black text-slate-400">VS</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Confronto Tático
                </span>
              </div>

              {/* Tactical Tuning for User Club */}
              <div className="mt-4 space-y-3.5">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <Compass className="h-4 w-4" />
                    <span>Ajustes Rápidos da sua Equipe</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">
                    Você pode alterar a formação e postura tática antes de dar o pontapé inicial.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                    Formação Tática
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {LIVE_FORMATIONS.map((f) => (
                      <button
                        key={f}
                        onClick={() => handleChangeFormationLive(f)}
                        className={`rounded-lg py-1.5 text-xs font-black transition ${
                          userTactics.formation === f
                            ? "bg-emerald-500 text-slate-950 shadow-md"
                            : "border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Mentalidade
                    </label>
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
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-white"
                    >
                      <option value="Defensive">Defensiva</option>
                      <option value="Balanced">Equilibrada</option>
                      <option value="Attacking">Ofensiva</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Pressão
                    </label>
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
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-white"
                    >
                      <option value="Low">Baixa</option>
                      <option value="Medium">Média</option>
                      <option value="High">Alta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">
                      Passe
                    </label>
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
                      className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-white"
                    >
                      <option value="Short">Curto</option>
                      <option value="Mixed">Misto</option>
                      <option value="Direct">Direto</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Big Launch Button */}
            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setIsPreMatch(false);
                  setIsPlaying(true);
                }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400"
              >
                <Play className="h-4 w-4 fill-current" />
                {userSession.minute > 0 ? "Retomar Partida Ao Vivo" : "Confirmar e Rolar a Bola"}
              </button>
            </div>
          </div>

          {/* Away Team Column */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 lg:col-span-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <ClubBadge club={awayClub} size="lg" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-black text-white text-base">{awayClub.name}</h3>
                    {awayClub.id === userClubId && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                        Seu Time
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>Visitante</span>
                    <span>•</span>
                    <span className="font-bold text-sky-400">OVR Médio: {awayAvgOvr}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                    <Flame className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-slate-300 font-semibold">
                      Sinergia: <strong className={awaySynergy.tierColor}>{awaySynergy.overallScore}%</strong> ({awaySynergy.bonusPercentFormatted})
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="rounded-lg bg-sky-500/20 border border-sky-500/40 px-2.5 py-1 text-xs font-black text-sky-300">
                  {liveTacticsByClub[awayClub.id]?.formation ?? "4-3-3"}
                </div>
                <div className="mt-1 hidden sm:block">
                  <ClubKit
                    club={awayClub}
                    variant={awayClub.id === userClubId ? userKitVariant : "away"}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* Away Starting XI */}
            <div className="space-y-1.5 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex justify-between">
                <span>
                  11 Titulares{" "}
                  {awayClub.id === userClubId && userSession.minute === 0 && (
                    <span className="text-emerald-400 normal-case font-semibold">
                      (clique p/ trocar com banco)
                    </span>
                  )}
                </span>
                <span>OVR / Stamina</span>
              </div>
              <div className="space-y-1">
                {awayStarters.map((p) => {
                  const isUserInteractive = awayClub.id === userClubId && userSession.minute === 0;
                  const isSelected = preMatchSwapId === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      disabled={!isUserInteractive}
                      onClick={() => isUserInteractive && handlePreMatchSwap(p.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                        isSelected
                          ? "border-amber-400 bg-amber-400/15 ring-1 ring-amber-400/40"
                          : isUserInteractive && preMatchSwapId !== null
                          ? "border-emerald-500/40 bg-slate-950/80 hover:border-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                          : "border-slate-800/80 bg-slate-950/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-center font-bold text-amber-300 text-[11px]">
                          #{p.shirtNumber ?? "-"}
                        </span>
                        <span className="w-8 text-center rounded bg-slate-800 px-1 py-0.5 text-[10px] font-bold text-slate-300">
                          {p.primaryPosition}
                        </span>
                        <span className="truncate font-semibold text-white">
                          {getPlayerDisplayName(p.name)}
                        </span>
                      </div>
                      {renderOvrStamina(p.overall, Math.round(p.stamina), "text-slate-200")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Away Bench */}
            <div className="pt-2 border-t border-slate-800">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Banco de Reservas ({awayBench.length})</span>
                {awayClub.id === userClubId && userSession.minute === 0 && (
                  <span className="text-emerald-400">
                    {preMatchSwapId !== null ? "Selecione com quem trocar" : "Clique p/ escalar"}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {awayBench.slice(0, 7).map((p) => {
                  const isUserInteractive = awayClub.id === userClubId && userSession.minute === 0;
                  const isSelected = preMatchSwapId === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      disabled={!isUserInteractive}
                      onClick={() => isUserInteractive && handlePreMatchSwap(p.id)}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium border transition ${
                        isSelected
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/50"
                          : isUserInteractive
                          ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-emerald-400 hover:text-emerald-300 cursor-pointer"
                          : "border-slate-800 bg-slate-950 text-slate-300"
                      }`}
                      title={`${p.name} (${p.primaryPosition}) - OVR ${p.overall}`}
                    >
                      {p.primaryPosition} {getPlayerDisplayName(p.name)} ({p.overall})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- LIVE MATCHDAY DASHBOARD (OPTIMIZED VIEWPORT HEIGHT - FIT TO SCREEN) ---
  return (
    <div className="flex flex-col gap-1.5 h-full min-h-0 flex-1 overflow-hidden">
      {/* 1. Integrated Compact Broadcast Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/95 px-3.5 py-1.5 shrink-0">
        {/* Left: Scoreboard */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ClubBadge club={homeClub} size="sm" />
            <span className="font-black text-white text-sm hidden sm:inline">{homeClub.name}</span>
            <span className="font-black text-white text-xs sm:hidden">{homeClub.shortName}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1 font-black text-white text-base ring-1 ring-slate-800">
            <span className="text-emerald-400">{userSession.homeGoals}</span>
            <span className="text-slate-500">-</span>
            <span className="text-sky-400">{userSession.awayGoals}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-black text-white text-xs sm:hidden">{awayClub.shortName}</span>
            <span className="font-black text-white text-sm hidden sm:inline">{awayClub.name}</span>
            <ClubBadge club={awayClub} size="sm" />
          </div>

          {/* Goal Scorer Ticker */}
          <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-300 pl-2 border-l border-slate-800">
            {homeGoalEvents.map((g) => (
              <span key={g.id} className="text-emerald-300 flex items-center gap-1">
                <Award className="h-3 w-3 text-emerald-400 shrink-0" />
                {getPlayerDisplayName(g.playerName)} ({g.minute}')
              </span>
            ))}
            {awayGoalEvents.map((g) => (
              <span key={g.id} className="text-sky-300 flex items-center gap-1">
                <Award className="h-3 w-3 text-sky-400 shrink-0" />
                {getPlayerDisplayName(g.playerName)} ({g.minute}')
              </span>
            ))}
          </div>
        </div>

        {/* Center: Live Minute Pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-black tracking-wider ${
                userSession.finished
                  ? "bg-slate-800 text-slate-300"
                  : isHalftime
                  ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 animate-pulse"
              }`}
            >
              {userSession.finished
                ? "FIM DE JOGO"
                : isHalftime
                ? "INTERVALO"
                : !userSession.secondHalfStarted
                ? userSession.minute > 45
                  ? `1ºT • 45+${userSession.minute - 45}'`
                  : `1ºT • ${userSession.minute}'`
                : userSession.minute > 90
                ? `2ºT • 90+${userSession.minute - 90}'`
                : `2ºT • ${userSession.minute}'`}
            </span>

            {/* Placa Digital do 4º Árbitro (Acréscimos) */}
            {!userSession.finished && !isHalftime && (
              (!userSession.secondHalfStarted && userSession.minute >= 45) ? (
                <span
                  title={`Tempo Adicional: +${userSession.firstHalfExtra} minuto(s) no 1º tempo`}
                  className="inline-flex items-center gap-1 rounded bg-amber-400 border border-amber-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950 font-mono shadow-sm animate-pulse"
                >
                  <Clock className="h-2.5 w-2.5" />
                  +{userSession.firstHalfExtra}'
                </span>
              ) : (userSession.secondHalfStarted && userSession.minute >= 90) ? (
                <span
                  title={`Tempo Adicional: +${userSession.secondHalfExtra} minuto(s) no 2º tempo`}
                  className="inline-flex items-center gap-1 rounded bg-amber-400 border border-amber-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950 font-mono shadow-sm animate-pulse"
                >
                  <Clock className="h-2.5 w-2.5" />
                  +{userSession.secondHalfExtra}'
                </span>
              ) : null
            )}
          </div>
          <span className="hidden md:inline text-[11px] text-slate-400">
            Rodada {matchweek}
          </span>
        </div>

        {/* Right: Controls & Speed */}
        <div className="flex items-center gap-1.5">
          {/* Button to view formations */}
          <button
            onClick={() => setIsPreMatch(true)}
            title="Ver Escalações e Formações Táticas de Ambos os Times"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            <Users className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Escalações</span>
          </button>

          {!allFinished ? (
            <>
              {onToggleAutoFormationOnRedCard && (
                <button
                  onClick={onToggleAutoFormationOnRedCard}
                  title="Pausa automática em expulsões/lesões"
                  className={`hidden sm:inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                    autoOpenFormationOnRedCard
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                      : "border-slate-800 bg-slate-950 text-slate-500"
                  }`}
                >
                  <Compass className="h-3.5 w-3.5" />
                  Auto: {autoOpenFormationOnRedCard ? "ON" : "OFF"}
                </button>
              )}

              <button
                onClick={() => {
                  if (isHalftime) {
                    handleStartSecondHalf();
                  } else {
                    setIsPlaying((p) => !p);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 transition"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pausar</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" /> <span className="hidden sm:inline">{isHalftime ? "Iniciar 2º Tempo" : "Retomar"}</span>
                  </>
                )}
              </button>

              {[
                { label: "1x", ms: 1200 },
                { label: "2x", ms: 600 },
                { label: "4x", ms: 300 },
              ].map((opt) => (
                <button
                  key={opt.ms}
                  onClick={() => setSpeedMs(opt.ms)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                    speedMs === opt.ms
                      ? "bg-emerald-500 text-slate-950 font-black"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}

              <button
                onClick={handleSimulateToEnd}
                title="Simular partida até o apito final"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-slate-700 transition"
              >
                <SkipForward className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Fim</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleCompleteRound}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-black text-slate-950 transition hover:bg-emerald-400"
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar Rodada
            </button>
          )}
        </div>
      </div>

      {/* Halftime Quick Banner - Compact & sleek */}
      {isHalftime && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 shrink-0">
          <div className="text-xs text-amber-200 truncate">
            <strong>Intervalo ({userSession.homeGoals} x {userSession.awayGoals})</strong> — Ajuste a equipe na aba Tática e retome quando quiser.
          </div>
          <button
            onClick={handleStartSecondHalf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1 text-xs font-black text-slate-950 hover:bg-amber-300 transition shadow-sm shrink-0"
          >
            <Play className="h-3.5 w-3.5 fill-current" /> Iniciar 2º Tempo
          </button>
        </div>
      )}

      {/* 2. Main Arena: 2D Pitch on Left, Integrated Tabs on Right */}
      <div className={`flex-1 min-h-0 grid gap-2 overflow-hidden ${pitchSize === "full" ? "grid-cols-1" : "lg:grid-cols-12"}`}>
        {/* Left Column: 2D Live Pitch & Ball Action */}
        <div className={`flex flex-col min-h-0 overflow-hidden ${pitchSize === "full" ? "w-full" : "lg:col-span-7 xl:col-span-8"}`}>
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
            onSelectSubOut={(pid) => {
              setActivePanelTab("subs");
              handleClickPitchStarter(pid);
            }}
            pitchSize={pitchSize}
            onPitchSizeChange={setPitchSize}
            isHalftime={isHalftime}
          />
        </div>

        {/* Right Column: Interactive Broadcast Hub with Tabs (Subs / Narração / Estatísticas / Outros Jogos) */}
        <div className={`flex flex-col min-h-0 rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden ${pitchSize === "full" ? "hidden" : "lg:col-span-5 xl:col-span-4"}`}>
          {/* Top Panel Tab Headers */}
          <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/60 p-1 shrink-0">
            <button
              onClick={() => setActivePanelTab("subs")}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-bold rounded-lg transition ${
                activePanelTab === "subs"
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span>Tática</span>
              <span className="rounded bg-slate-900 px-1 py-0.2 text-[10px] text-slate-300">
                {userSubsUsed}/5
              </span>
            </button>

            <button
              onClick={() => setActivePanelTab("commentary")}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-bold rounded-lg transition ${
                activePanelTab === "commentary"
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Radio className="h-3.5 w-3.5 text-sky-400" />
              <span>Lances</span>
            </button>

            <button
              onClick={() => setActivePanelTab("stats")}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-bold rounded-lg transition ${
                activePanelTab === "stats"
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Stats</span>
            </button>

            <button
              onClick={() => setActivePanelTab("other_matches")}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 text-xs font-bold rounded-lg transition ${
                activePanelTab === "other_matches"
                  ? "bg-slate-800 text-emerald-400 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Shield className="h-3.5 w-3.5 text-teal-400" />
              <span>Jogos</span>
            </button>
          </div>

          {/* Panel Tab Content (Smooth Internal Scroll) */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5">
            {/* TAB 1: Substitutions & Tactics */}
            {activePanelTab === "subs" && (
              <div className="space-y-3.5">
                {/* Quick Formation selector */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase text-slate-400">
                    <span>Formação em Campo</span>
                    <span className="text-emerald-400 font-semibold">{userActiveIds.length} atletas</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {LIVE_FORMATIONS.map((f) => (
                      <button
                        key={f}
                        disabled={userSession.finished}
                        onClick={() => handleChangeFormationLive(f)}
                        className={`rounded-lg py-1 text-[11px] font-bold transition ${
                          userTactics.formation === f
                            ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                            : "border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 disabled:opacity-50"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tactical Knobs */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Mentalidade</label>
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Pressão</label>
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Passe</label>
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

                {/* Sub Out / Sub In active selection banner */}
                {(subOutId !== null || subInId !== null) && (
                  <div
                    className={`flex flex-col gap-1 rounded-xl border-2 px-3 py-2 text-xs shadow-sm ${
                      subInId !== null
                        ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200"
                        : "border-amber-400/70 bg-amber-500/15 text-amber-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {subOutId !== null ? (
                        <span className="inline-flex items-center gap-1.5 truncate font-bold">
                          <span className="inline-flex items-center gap-0.5 rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                            <ArrowDown className="h-2.5 w-2.5 stroke-[3]" /> SAI
                          </span>
                          <strong className="text-white">
                            {getPlayerDisplayName(playerMap.get(subOutId)?.name)}
                          </strong>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 truncate font-bold">
                          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                            <ArrowUp className="h-2.5 w-2.5 stroke-[3]" /> ENTRA
                          </span>
                          <strong className="text-white">
                            {getPlayerDisplayName(playerMap.get(subInId!)?.name)} (
                            {playerMap.get(subInId!)?.primaryPosition})
                          </strong>
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setSubOutId(null);
                          setSubInId(null);
                        }}
                        className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:bg-slate-700"
                      >
                        Cancelar
                      </button>
                    </div>
                    <div
                      className={`text-[10px] font-semibold ${
                        subOutId !== null ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {subOutId !== null
                        ? "▲ Selecione abaixo no Banco de Reservas quem vai ENTRAR"
                        : "▼ Selecione abaixo em 'Em Campo' quem vai SAIR"}
                    </div>
                  </div>
                )}

                {/* Starters list */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Em Campo ({userActiveIds.length})</span>
                    <span className={subInId !== null ? "text-rose-400 animate-pulse" : ""}>
                      {userSubsUsed >= 5
                        ? "Trocas esgotadas"
                        : subInId !== null
                        ? "Clique em quem vai SAIR"
                        : "Clique p/ substituir"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {userActiveIds.map((id) => {
                      const p = playerMap.get(id);
                      if (!p) return null;
                      const stam = Math.round(userSession.playerStamina[id] ?? p.stamina);
                      const numRating = userSession.playerRatings[id] ?? 6.5;
                      const rating = numRating.toFixed(1);
                      const sofaColor = getSofascoreRatingColor(numRating);
                      const isSelected = subOutId === id;
                      const isInjured = userSession.injuredIds.includes(id);
                      const subInPlayer = subInId !== null ? playerMap.get(subInId) : undefined;
                      const isSamePosAsSubIn =
                        subInPlayer &&
                        (p.primaryPosition === subInPlayer.primaryPosition ||
                          subInPlayer.positions?.includes(p.primaryPosition));
                      const subInEv = userSession.events.find(
                        (e) => e.type === "substitution" && e.playerId === id
                      );
                      return (
                        <button
                          key={id}
                          disabled={userSubsUsed >= 5 || userSession.finished}
                          onClick={() => handleClickPitchStarter(id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                            isSelected
                              ? "border-amber-400 bg-amber-400/15 ring-1 ring-amber-400/40"
                              : subInId !== null
                              ? isSamePosAsSubIn
                                ? "border-rose-400/70 bg-rose-500/15 hover:bg-rose-500/25 ring-1 ring-rose-400/30 cursor-pointer"
                                : "border-rose-500/40 bg-slate-950/80 hover:border-rose-400 hover:bg-rose-500/15 cursor-pointer"
                              : isInjured
                              ? "border-rose-500/60 bg-rose-500/15"
                              : "border-slate-800 bg-slate-950/70 hover:border-amber-500/40 disabled:opacity-60"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-1 truncate font-semibold text-white">
                            <span
                              className={`inline-block w-6 shrink-0 text-[10px] font-bold ${
                                isSamePosAsSubIn ? "text-emerald-300" : "text-slate-400"
                              }`}
                            >
                              {p.primaryPosition}
                            </span>
                            <span className="truncate">{getPlayerDisplayName(p.name)}</span>
                            {isSamePosAsSubIn && (
                              <span className="ml-1 shrink-0 rounded bg-emerald-500/20 px-1 py-0.2 text-[8px] font-black uppercase text-emerald-300 border border-emerald-500/40">
                                Mesma Pos.
                              </span>
                            )}
                            {subInEv && (
                              <span
                                title={`Entrou aos ${subInEv.minute}' no lugar de ${subInEv.assistPlayerName}`}
                                className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-black text-emerald-300 ring-1 ring-emerald-500/40"
                              >
                                <ArrowUp className="h-2.5 w-2.5 stroke-[3]" />
                                {subInEv.minute}'
                              </span>
                            )}
                            {isInjured && (
                              <span className="ml-1 shrink-0 rounded bg-rose-600 px-1 py-0.2 text-[9px] font-black text-white">
                                +LESÃO
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span
                              style={{ backgroundColor: sofaColor.bg, color: sofaColor.text }}
                              className="rounded-[3px] px-1.5 py-0.2 font-mono text-[10px] font-black leading-tight shadow-sm"
                              title="Nota Sofascore em tempo real"
                            >
                              {rating}
                            </span>
                            {renderOvrStamina(p.overall, stam, "text-slate-200")}
                            {subInId !== null ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                                <ArrowDown className="h-2.5 w-2.5 stroke-[3]" /> SAIR
                              </span>
                            ) : (
                              <ArrowLeftRight
                                className={`h-3 w-3 ${
                                  isSelected ? "text-amber-300" : "text-slate-500"
                                }`}
                              />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bench list */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    <span>Banco de Reservas ({userBenchIds.length})</span>
                    <span className={subOutId !== null ? "text-emerald-300 animate-pulse" : ""}>
                      {userSubsUsed >= 5
                        ? "Trocas esgotadas"
                        : subOutId !== null
                        ? "Clique em quem vai ENTRAR"
                        : "Clique p/ preparar entrada"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {userBenchIds.map((id) => {
                      const p = playerMap.get(id);
                      if (!p) return null;
                      const stam = Math.round(userSession.playerStamina[id] ?? p.stamina);
                      const canSub = userSubsUsed < 5 && !userSession.finished;
                      const isReadyToCompleteOut = subOutId !== null && canSub;
                      const isSelectedToEnter = subInId === id;
                      const subOutPlayer = subOutId !== null ? playerMap.get(subOutId) : undefined;
                      const isSamePosAsSubOut =
                        subOutPlayer &&
                        (p.primaryPosition === subOutPlayer.primaryPosition ||
                          p.positions?.includes(subOutPlayer.primaryPosition));
                      return (
                        <button
                          key={id}
                          disabled={!canSub}
                          onClick={() => handleClickBenchPlayer(id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                            isSelectedToEnter
                              ? "border-emerald-400 bg-emerald-400/20 ring-1 ring-emerald-400/50 shadow-sm"
                              : isReadyToCompleteOut
                              ? isSamePosAsSubOut
                                ? "border-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30 cursor-pointer shadow-sm ring-1 ring-emerald-400/40"
                                : "border-emerald-500/60 bg-emerald-500/15 hover:bg-emerald-500/25 cursor-pointer shadow-sm ring-1 ring-emerald-500/30"
                              : canSub
                              ? "border-slate-800 bg-slate-950/70 text-slate-200 hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer"
                              : "border-slate-800/80 bg-slate-950/40 text-slate-400 opacity-60 cursor-not-allowed"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-1 truncate font-semibold text-white">
                            <span
                              className={`inline-block w-6 shrink-0 text-[10px] font-bold ${
                                isSelectedToEnter || isReadyToCompleteOut
                                  ? "text-emerald-300"
                                  : "text-slate-400"
                              }`}
                            >
                              {p.primaryPosition}
                            </span>
                            <span className="truncate">{getPlayerDisplayName(p.name)}</span>
                            {isSamePosAsSubOut && (
                              <span className="ml-1 shrink-0 rounded bg-emerald-500/20 px-1 py-0.2 text-[8px] font-black uppercase text-emerald-300 border border-emerald-500/40">
                                Mesma Pos.
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {renderOvrStamina(
                              p.overall,
                              stam,
                              isSelectedToEnter || isReadyToCompleteOut
                                ? "text-emerald-300"
                                : "text-slate-300"
                            )}
                            {isSelectedToEnter ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                                <ArrowUp className="h-2.5 w-2.5 stroke-[3]" /> PRONTO
                              </span>
                            ) : isReadyToCompleteOut ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                                <ArrowUp className="h-2.5 w-2.5 stroke-[3]" /> ENTRAR
                              </span>
                            ) : (
                              <ArrowLeftRight className="h-3 w-3 text-slate-500" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subbed Out History */}
                {(isUserHome ? userSession.homeSubbedOutIds : userSession.awaySubbedOutIds).length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-rose-400">
                      <span>
                        Substituídos (
                        {(isUserHome ? userSession.homeSubbedOutIds : userSession.awaySubbedOutIds).length}
                        )
                      </span>
                      <span>Fora de Jogo</span>
                    </div>
                    <div className="space-y-1">
                      {(isUserHome ? userSession.homeSubbedOutIds : userSession.awaySubbedOutIds).map(
                        (outId) => {
                          const p = playerMap.get(outId);
                          if (!p) return null;
                          const numRating = userSession.playerRatings[outId] ?? 6.5;
                          const sofaColor = getSofascoreRatingColor(numRating);
                          const subOutEv = userSession.events.find(
                            (e) => e.type === "substitution" && e.assistPlayerId === outId
                          );
                          return (
                            <div
                              key={outId}
                              className="flex w-full items-center justify-between rounded-lg border border-slate-800/70 bg-slate-950/40 px-2.5 py-1 text-xs opacity-75"
                            >
                              <span className="flex min-w-0 items-center gap-1 truncate text-slate-300">
                                <span className="inline-block w-6 shrink-0 text-[10px] font-bold text-slate-500">
                                  {p.primaryPosition}
                                </span>
                                <span className="truncate">{getPlayerDisplayName(p.name)}</span>
                                <span className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded bg-rose-500/20 px-1 py-0.2 text-[9px] font-black text-rose-300 ring-1 ring-rose-500/40">
                                  <ArrowDown className="h-2.5 w-2.5 stroke-[3]" />
                                  {subOutEv ? `${subOutEv.minute}'` : "SAIU"}
                                </span>
                              </span>
                              <span
                                style={{ backgroundColor: sofaColor.bg, color: sofaColor.text }}
                                className="rounded-[3px] px-1.5 py-0.2 font-mono text-[10px] font-black leading-tight"
                              >
                                {numRating.toFixed(1)}
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Live Commentary */}
            {activePanelTab === "commentary" && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Narração Lance a Lance
                </div>
                {userSession.events.length === 0 && (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Bola rolando! Aguardando os primeiros lances de perigo...
                  </div>
                )}
                {[...userSession.events].reverse().map((ev) => {
                  const badgeStyle =
                    ev.type === "goal"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : ev.type === "woodwork"
                      ? "border-amber-400/70 bg-amber-500/15 text-amber-100 font-semibold"
                      : ev.type === "red_card"
                      ? "border-rose-500/50 bg-rose-500/15 text-rose-200"
                      : ev.type === "injury"
                      ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                      : ev.type === "yellow_card"
                      ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                      : ev.type === "stoppage_time"
                      ? "border-amber-400/60 bg-amber-500/15 text-amber-200 font-bold"
                      : ev.type === "whistle"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold"
                      : ev.type === "corner"
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200 font-bold"
                      : ev.type === "substitution"
                      ? "border-emerald-500/40 bg-slate-900/90 text-slate-200"
                      : ev.type === "offside"
                      ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                      : "border-slate-800 bg-slate-950/60 text-slate-300";

                  let eventIconNode: React.ReactNode = <span className="text-slate-500">•</span>;
                  if (ev.type === "goal") {
                    eventIconNode = <Award className="h-4 w-4 text-emerald-400" />;
                  } else if (ev.type === "woodwork") {
                    eventIconNode = <Flame className="h-4 w-4 text-amber-400" />;
                  } else if (ev.type === "stoppage_time") {
                    eventIconNode = <Clock className="h-4 w-4 text-amber-400" />;
                  } else if (ev.type === "whistle") {
                    eventIconNode = <Radio className="h-4 w-4 text-emerald-400" />;
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
                    eventIconNode = <ArrowLeftRight className="h-4 w-4 text-emerald-400" />;
                  } else if (ev.type === "corner") {
                    eventIconNode = <Flag className="h-4 w-4 text-cyan-400 fill-cyan-400" />;
                  } else if (ev.type === "save") {
                    eventIconNode = <Shield className="h-4 w-4 text-indigo-400" />;
                  }

                  let minDisplay = `${ev.minute}'`;
                  if (!userSession.secondHalfStarted && ev.minute > 45) {
                    minDisplay = `45+${ev.minute - 45}'`;
                  } else if (ev.minute > 90) {
                    minDisplay = `90+${ev.minute - 90}'`;
                  }

                  if (ev.type === "substitution") {
                    const subClub = ev.clubId === homeClub.id ? homeClub : awayClub;
                    return (
                      <div
                        key={ev.id}
                        className={`flex flex-col gap-1.5 rounded-xl border px-2.5 py-2 text-xs ${badgeStyle}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 font-black text-emerald-300 text-[10px] uppercase tracking-wider">
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            Substituição • {subClub.shortName}
                          </span>
                          <span className="font-black text-slate-100 font-mono">{minDisplay}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-200">
                            <ArrowUp className="h-3 w-3 text-emerald-400 stroke-[3]" />
                            ENTRA: <strong className="text-white">{ev.playerName}</strong>
                          </span>
                          {ev.assistPlayerName && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-200">
                              <ArrowDown className="h-3 w-3 text-rose-400 stroke-[3]" />
                              SAI: <strong className="text-white">{ev.assistPlayerName}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={ev.id}
                      className={`flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${badgeStyle}`}
                    >
                      <span className="font-black text-slate-100 font-mono shrink-0">{minDisplay}</span>
                      <span className="shrink-0 flex items-center justify-center mt-0.5">{eventIconNode}</span>
                      <span className="min-w-0 flex-1">{ev.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 3: Match Statistics */}
            {activePanelTab === "stats" && (
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Estatísticas Comparativas
                </div>
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
                    "Bolas na Trave",
                    `${userSession.homeStats.woodwork ?? 0}`,
                    `${userSession.awayStats.woodwork ?? 0}`,
                    userSession.homeStats.woodwork ?? 0,
                    userSession.awayStats.woodwork ?? 0,
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
                    <div key={label as string} className="space-y-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-white">{hText}</span>
                        <span className="text-slate-400 font-medium">{label}</span>
                        <span className="font-bold text-white">{aText}</span>
                      </div>
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div className="bg-emerald-500 transition-all" style={{ width: `${hPct}%` }} />
                        <div className="bg-sky-500 transition-all" style={{ width: `${100 - hPct}%` }} />
                      </div>
                    </div>
                  );
                })}

                {motmPlayer && finalizedUser && (
                  <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                    <Award className="h-4 w-4 text-amber-400" />
                    <span>
                      Craque da Partida: <strong className="text-white">{getPlayerDisplayName(motmPlayer.name)}</strong> (Nota{" "}
                      {finalizedUser.playerRatings[motmPlayer.id]?.toFixed(1)})
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Other Matches of the Round */}
            {activePanelTab === "other_matches" && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Jogos Simultâneos da Rodada {matchweek}
                </div>
                {sessionsRef.current
                  .filter((s) => s.fixtureId !== userSession.fixtureId)
                  .map((s) => {
                    const h = clubMap.get(s.homeClubId)!;
                    const a = clubMap.get(s.awayClubId)!;
                    return (
                      <div
                        key={s.fixtureId}
                        className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex w-[38%] items-center gap-1.5">
                            <ClubBadge club={h} size="sm" />
                            <span className="truncate font-bold text-slate-200">{h.shortName}</span>
                          </div>
                          <div className="text-center">
                            <div className="rounded-md bg-slate-900 px-2 py-0.5 font-black text-white ring-1 ring-slate-800">
                              {s.homeGoals} - {s.awayGoals}
                            </div>
                            <div className="mt-0.5 text-[9px] font-semibold text-slate-500">
                              {s.finished ? "FIN" : `${s.minute}'`}
                            </div>
                          </div>
                          <div className="flex w-[38%] items-center justify-end gap-1.5">
                            <span className="truncate font-bold text-slate-200">{a.shortName}</span>
                            <ClubBadge club={a} size="sm" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                    {subInId !== null
                      ? `Quem sai p/ entrada de ${getPlayerDisplayName(playerMap.get(subInId)?.name)}?`
                      : `Em Campo (${userActiveIds.length}) — Trocas ${userSubsUsed}/5`}
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
                          onClick={() => handleClickPitchStarter(id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-2 py-1 text-left text-xs ${
                            isSel
                              ? "border-amber-400 bg-amber-400/15"
                              : subInId !== null
                              ? "border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20"
                              : isInj
                              ? "border-rose-500/60 bg-rose-500/15"
                              : "border-slate-800 bg-slate-900/70 hover:border-amber-500/40"
                          }`}
                        >
                          <span className="truncate font-semibold text-white">
                            <span className="mr-1 text-[10px] text-slate-400">
                              {p.primaryPosition}
                            </span>
                            {getPlayerDisplayName(p.name)}
                            {isInj && (
                              <span className="ml-1 rounded bg-rose-600 px-1 text-[9px] font-black text-white">
                                +LESÃO
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {renderOvrStamina(p.overall, stam, "text-slate-300")}
                            {subInId !== null && (
                              <span className="rounded bg-rose-500 px-1 py-0.5 text-[8px] font-black text-white">
                                SAIR
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-1.5 text-[10px] font-bold uppercase text-emerald-400">
                    {subOutId !== null
                      ? `Entrar no lugar de ${getPlayerDisplayName(playerMap.get(subOutId)?.name)}`
                      : "Banco de Reservas (clique p/ substituir)"}
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {userBenchIds.map((id) => {
                      const p = playerMap.get(id);
                      if (!p) return null;
                      const stam = Math.round(userSession.playerStamina[id] ?? p.stamina);
                      const isSelIn = subInId === id;
                      const ready = subOutId !== null;
                      return (
                        <button
                          key={id}
                          onClick={() => handleClickBenchPlayer(id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-2 py-1 text-left text-xs ${
                            isSelIn
                              ? "border-emerald-400 bg-emerald-400/20 ring-1 ring-emerald-400/40"
                              : ready
                              ? "border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25"
                              : "border-slate-800 bg-slate-900/70 hover:border-emerald-500/40"
                          }`}
                        >
                          <span className="truncate font-semibold text-white">
                            <span className="mr-1 text-[10px] text-emerald-300">
                              {p.primaryPosition}
                            </span>
                            {getPlayerDisplayName(p.name)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {renderOvrStamina(
                              p.overall,
                              stam,
                              isSelIn || ready ? "text-emerald-300" : "text-slate-300"
                            )}
                            {isSelIn ? (
                              <span className="rounded bg-emerald-400 px-1 py-0.5 text-[8px] font-black text-slate-950">
                                PRONTO
                              </span>
                            ) : ready ? (
                              <span className="rounded bg-emerald-400 px-1 py-0.5 text-[8px] font-black text-slate-950">
                                ENTRAR
                              </span>
                            ) : null}
                          </span>
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
