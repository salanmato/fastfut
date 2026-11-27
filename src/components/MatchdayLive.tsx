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
  BatteryCharging,
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
  autoPickLineup,
  cancelPendingSubstitution,
  computeTacticalMatchup,
  evaluateTacticalFit,
  finalizeMatchResult,
  initLiveMatchSession,
  requestLiveSubstitution,
  stepLiveMatchMinute,
  type AutoPickMode,
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
  const [activeMainTab, setActiveMainTab] = useState<"pitch" | "commentary" | "stats" | "other_matches">("pitch");
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

  const handleStartSecondHalf = () => {
    for (const session of sessionsRef.current) {
      if (session.isHalftime) {
        session.isHalftime = false;
        session.secondHalfStarted = true;
        session.minute = 45; // Próximo minuto será 46 (início da segunda etapa)
        session.events.push({
          id: `whistle-2nd-${session.fixtureId}-${Date.now()}`,
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
    simPauseUntilRef.current = Date.now() + 1200;
    setIsPlaying(true);
    setTick((t) => t + 1);
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
    setIsPlaying(false);
    for (const session of sessionsRef.current) {
      if (session.finished) continue;
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
    const results = sessionsRef.current.map((s) => finalizeMatchResult(s));
    onFinishMatchweek(results);
  };

  const executeLiveSub = (outId: number, inId: number) => {
    if (!userSession || userSession.finished) return;
    const pOut = playerMap.get(outId);
    const pIn = playerMap.get(inId);
    if (!pOut || !pIn) return;

    const isImmediate =
      userSession.minute === 0 ||
      Boolean(userSession.isHalftime) ||
      tacticalStopReason !== null;

    requestLiveSubstitution(
      userSession,
      userClubId,
      pOut.id,
      pIn.id,
      pOut.name,
      pIn.name,
      isImmediate
    );

    setSubOutId(null);
    setSubInId(null);
    setTick((t) => t + 1);
  };

  const handleCancelPendingSub = (subId: string) => {
    if (!userSession) return;
    cancelPendingSubstitution(userSession, subId);
    setTick((t) => t + 1);
  };

  const handleClickPitchStarter = (starterId: number) => {
    if (!userSession || userSession.finished) return;
    const subsUsed =
      userSession.homeClubId === userClubId
        ? userSession.homeSubsUsed
        : userSession.awaySubsUsed;
    const pendingCount = (userSession.pendingSubs ?? []).filter(
      (ps) => ps.clubId === userClubId
    ).length;
    if (subsUsed + pendingCount >= 5) return;

    const alreadyPending = (userSession.pendingSubs ?? []).find(
      (ps) => ps.clubId === userClubId && ps.playerOutId === starterId
    );
    if (alreadyPending) {
      handleCancelPendingSub(alreadyPending.id);
      return;
    }

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
    const pendingCount = (userSession.pendingSubs ?? []).filter(
      (ps) => ps.clubId === userClubId
    ).length;
    if (subsUsed + pendingCount >= 5) return;

    const alreadyPending = (userSession.pendingSubs ?? []).find(
      (ps) => ps.clubId === userClubId && ps.playerInId === benchPlayerId
    );
    if (alreadyPending) {
      handleCancelPendingSub(alreadyPending.id);
      return;
    }

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

  const handlePreMatchAutoPick = (mode: AutoPickMode) => {
    if (!userSession || userSession.minute > 0) return;
    const userClubPlayers = players.filter(
      (p) => p.clubId === userClubId && p.squadCategory !== "youth"
    );
    const currentTactics = liveTacticsByClub[userClubId];
    if (!currentTactics || userClubPlayers.length === 0) return;

    const picked = autoPickLineup(userClubPlayers, currentTactics.formation, mode);
    const isHome = userSession.homeClubId === userClubId;

    if (isHome) {
      userSession.homeActiveIds = [...picked.starters];
      userSession.homeBenchIds = [...picked.bench];
    } else {
      userSession.awayActiveIds = [...picked.starters];
      userSession.awayBenchIds = [...picked.bench];
    }

    for (const pid of picked.starters) {
      if (userSession.playerRatings[pid] === undefined) {
        userSession.playerRatings[pid] = 6.5;
      }
    }

    setLiveTacticsByClub((prev) => ({
      ...prev,
      [userClubId]: {
        ...prev[userClubId],
        starters: picked.starters,
        bench: picked.bench,
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
  const pendingUserSubs = (userSession.pendingSubs ?? []).filter(
    (ps) => ps.clubId === userClubId
  );
  const totalUserSubsCount = userSubsUsed + pendingUserSubs.length;

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

  const oppClubId = isUserHome ? awayClub.id : homeClub.id;
  const oppTactics = liveTacticsByClub[oppClubId];
  const userActivePlayers = isUserHome ? homeStarters : awayStarters;
  const oppActivePlayers = isUserHome ? awayStarters : homeStarters;

  const userTacticalFit = evaluateTacticalFit(
    userActivePlayers,
    userTactics,
    userSession.playerStamina
  );
  const oppTacticalFit = evaluateTacticalFit(
    oppActivePlayers,
    oppTactics,
    userSession.playerStamina
  );
  const userTacticalMatchup = computeTacticalMatchup(
    userTactics,
    oppTactics,
    userTacticalFit,
    oppTacticalFit
  );

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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                      <Compass className="h-4 w-4" />
                      <span>Ajustes Rápidos da sua Equipe</span>
                    </div>
                    {userSession.minute === 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => handlePreMatchAutoPick("best")}
                          title="Escala o melhor 11 titular mantendo craques disponíveis"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/30"
                        >
                          <Sparkles className="h-3 w-3" /> Melhor 11
                        </button>
                        <button
                          onClick={() => handlePreMatchAutoPick("rotation")}
                          title="Prioriza jogadores descansados para poupar atletas cansados"
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-500/30"
                        >
                          <BatteryCharging className="h-3 w-3" /> Poupar Cansados
                        </button>
                      </div>
                    )}
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
                {getPlayerDisplayName(g.playerName)}
                {g.isPenalty ? " (P)" : ""} ({g.minute}')
              </span>
            ))}
            {awayGoalEvents.map((g) => (
              <span key={g.id} className="text-sky-300 flex items-center gap-1">
                <Award className="h-3 w-3 text-sky-400 shrink-0" />
                {getPlayerDisplayName(g.playerName)}
                {g.isPenalty ? " (P)" : ""} ({g.minute}')
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
                    <Play className="h-3.5 w-3.5 fill-current" /> <span className="hidden sm:inline">Retomar</span>
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
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Partida Concluída</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Arena: Left Column with Main Tabs (Campinho 2D | Lance a Lance | Stats | Jogos) + Right Fixed Tactics & Substitutions Panel */}
      <div
        className={`flex-1 min-h-0 grid gap-2 overflow-hidden ${
          pitchSize === "full" && activeMainTab === "pitch" ? "grid-cols-1" : "lg:grid-cols-12"
        }`}
      >
        {/* Left Column: Main View Tabs (Campinho 2D | Lance a Lance | Stats | Outros Jogos) + Halftime/Finish Action Buttons */}
        <div
          className={`flex flex-col min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 ${
            pitchSize === "full" && activeMainTab === "pitch"
              ? "w-full"
              : "lg:col-span-7 xl:col-span-8"
          }`}
        >
          {/* Main View Tab Bar & Match Phase Action Buttons right above the Campinho */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/75 px-2.5 py-1.5 shrink-0">
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setActiveMainTab("pitch")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeMainTab === "pitch"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                <span>Campinho 2D</span>
              </button>

              <button
                onClick={() => setActiveMainTab("commentary")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeMainTab === "commentary"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Lance a Lance</span>
                {userSession.events.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                      activeMainTab === "commentary"
                        ? "bg-slate-950/25 text-slate-950"
                        : "bg-slate-800 text-sky-300"
                    }`}
                  >
                    {userSession.events.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveMainTab("stats")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeMainTab === "stats"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Stats</span>
              </button>

              <button
                onClick={() => setActiveMainTab("other_matches")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeMainTab === "other_matches"
                    ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Jogos</span>
              </button>
            </div>

            {/* Halftime & Finish Match Buttons directly above the Campinho / Main Tabs */}
            <div className="flex items-center gap-2">
              {isHalftime && !userSession.finished && (
                <button
                  type="button"
                  onClick={handleStartSecondHalf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 transition hover:bg-amber-300 animate-pulse cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Iniciar 2º Tempo</span>
                </button>
              )}

              {userSession.finished && (
                <button
                  type="button"
                  onClick={handleCompleteRound}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Finalizar Partida</span>
                </button>
              )}
            </div>
          </div>

          {/* MAIN TAB 1: 2D Live Pitch (kept mounted so simulation never pauses/resets when inspecting other tabs) */}
          <div
            className={
              activeMainTab === "pitch"
                ? "flex-1 min-h-0 flex flex-col overflow-hidden"
                : "hidden"
            }
          >
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
                handleClickPitchStarter(pid);
              }}
              pitchSize={pitchSize}
              onPitchSizeChange={setPitchSize}
              isHalftime={isHalftime}
            />
          </div>

          {/* MAIN TAB 2: Live Play-by-Play Commentary */}
          {activeMainTab === "commentary" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Narração Lance a Lance ({userSession.events.length} eventos)
                </span>
                <span className="text-[11px] text-slate-500">
                  {homeClub.shortName} {userSession.homeGoals} x {userSession.awayGoals} {awayClub.shortName}
                </span>
              </div>
              {userSession.events.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-500">
                  Bola rolando! Aguardando os primeiros lances de perigo...
                </div>
              )}
              {[...userSession.events].reverse().map((ev) => {
                const badgeStyle =
                  ev.type === "goal"
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                    : ev.type === "penalty_miss"
                    ? "border-amber-500/60 bg-amber-500/15 text-amber-100 font-semibold"
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
                    : ev.type === "throw_in"
                    ? "border-teal-500/40 bg-teal-500/10 text-teal-200"
                    : ev.type === "substitution"
                    ? "border-emerald-500/40 bg-slate-900/90 text-slate-200"
                    : ev.type === "foul"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : ev.type === "offside"
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-200"
                    : "border-slate-800 bg-slate-950/60 text-slate-300";

                let eventIconNode: React.ReactNode = <span className="text-slate-500">•</span>;
                if (ev.type === "goal") {
                  eventIconNode = <Award className="h-4 w-4 text-emerald-400" />;
                } else if (ev.type === "penalty_miss") {
                  eventIconNode = <Shield className="h-4 w-4 text-amber-400" />;
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
                } else if (ev.type === "foul") {
                  eventIconNode = <AlertTriangle className="h-4 w-4 text-amber-400" />;
                } else if (ev.type === "offside") {
                  eventIconNode = <Flag className="h-4 w-4 text-orange-400" />;
                } else if (ev.type === "substitution") {
                  eventIconNode = <ArrowLeftRight className="h-4 w-4 text-emerald-400" />;
                } else if (ev.type === "corner") {
                  eventIconNode = <Flag className="h-4 w-4 text-cyan-400 fill-cyan-400" />;
                } else if (ev.type === "throw_in") {
                  eventIconNode = <Compass className="h-4 w-4 text-teal-400" />;
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
                      className={`flex flex-col gap-1.5 rounded-xl border px-3 py-2 text-xs ${badgeStyle}`}
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
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs ${badgeStyle}`}
                  >
                    <span className="font-black text-slate-100 font-mono shrink-0">{minDisplay}</span>
                    <span className="shrink-0 flex items-center justify-center mt-0.5">{eventIconNode}</span>
                    <span className="min-w-0 flex-1">{ev.text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* MAIN TAB 3: Match Statistics */}
          {activeMainTab === "stats" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Estatísticas Comparativas ({homeClub.shortName} vs {awayClub.shortName})
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
                  "Pênaltis (Convertidos)",
                  `${userSession.homeStats.penaltiesAwarded ?? 0} (${userSession.homeStats.penaltiesScored ?? 0})`,
                  `${userSession.awayStats.penaltiesAwarded ?? 0} (${userSession.awayStats.penaltiesScored ?? 0})`,
                  userSession.homeStats.penaltiesAwarded ?? 0,
                  userSession.awayStats.penaltiesAwarded ?? 0,
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
                  "Escanteios / Laterais",
                  `${userSession.homeStats.corners} / ${userSession.homeStats.throwIns ?? 0}`,
                  `${userSession.awayStats.corners} / ${userSession.awayStats.throwIns ?? 0}`,
                  userSession.homeStats.corners + (userSession.homeStats.throwIns ?? 0),
                  userSession.awayStats.corners + (userSession.awayStats.throwIns ?? 0),
                ],
                [
                  "Faltas",
                  `${userSession.homeStats.fouls}`,
                  `${userSession.awayStats.fouls}`,
                  userSession.homeStats.fouls,
                  userSession.awayStats.fouls,
                ],
              ].map(([label, hText, aText, hNum, aNum]) => {
                const total = Math.max(0.01, (hNum as number) + (aNum as number));
                const hPct = Math.round(((hNum as number) / total) * 100);
                return (
                  <div
                    key={label as string}
                    className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800"
                  >
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-white">{hText}</span>
                      <span className="text-slate-400 font-medium">{label}</span>
                      <span className="font-bold text-white">{aText}</span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="bg-emerald-500 transition-all" style={{ width: `${hPct}%` }} />
                      <div className="bg-sky-500 transition-all" style={{ width: `${100 - hPct}%` }} />
                    </div>
                  </div>
                );
              })}

              {motmPlayer && finalizedUser && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <Award className="h-4 w-4 text-amber-400" />
                  <span>
                    Craque da Partida:{" "}
                    <strong className="text-white">{getPlayerDisplayName(motmPlayer.name)}</strong> (Nota{" "}
                    {finalizedUser.playerRatings[motmPlayer.id]?.toFixed(1)})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* MAIN TAB 4: Other Matches of the Round */}
          {activeMainTab === "other_matches" && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Jogos Simultâneos da Rodada {matchweek}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {sessionsRef.current
                  .filter((s) => s.fixtureId !== userSession.fixtureId)
                  .map((s) => {
                    const h = clubMap.get(s.homeClubId)!;
                    const a = clubMap.get(s.awayClubId)!;
                    return (
                      <div
                        key={s.fixtureId}
                        className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5"
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
            </div>
          )}
        </div>

        {/* Right Column: Fixed Tactics & Substitutions Hub (Always Visible) */}
        <div
          className={`flex flex-col min-h-0 rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden ${
            pitchSize === "full" && activeMainTab === "pitch"
              ? "hidden"
              : "lg:col-span-5 xl:col-span-4"
          }`}
        >
          {/* Fixed Tactics & Substitutions Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/75 px-3.5 py-2.5 shrink-0">
            <div className="flex items-center gap-2 text-xs font-black text-white">
              <Flame className="h-4 w-4 text-amber-400" />
              <span>Tática & Substituições</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                Trocas:{" "}
                <strong className="text-emerald-400">
                  {userSubsUsed}/5
                </strong>
                {pendingUserSubs.length > 0 && (
                  <span className="ml-1 text-amber-300 font-bold">
                    (+{pendingUserSubs.length} agendada{pendingUserSubs.length > 1 ? "s" : ""})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Tactics & Substitutions Content (Smooth Internal Scroll) */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5">
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

            {/* Real-time Skill-Driven Tactical Fit & Head-to-Head Matchup Feedback */}
            <div className="rounded-xl border border-slate-800/90 bg-slate-950/75 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-300 truncate">
                  {userTacticalFit.styleSummary}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black border ${
                    userTacticalFit.overallFit >= 80
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : userTacticalFit.overallFit >= 70
                      ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                      : "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  }`}
                  title="O quanto as habilidades detalhadas (passe curto/longo, visão, controle, frieza, velocidade, fôlego e desarme) dos seus 11 titulares em campo combinam com esta estratégia"
                >
                  Adequação: {userTacticalFit.overallFit}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div className="rounded-lg bg-slate-900/90 px-2 py-1 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Mentalidade</span>
                  <strong
                    className={
                      userTacticalFit.mentalityFit >= 78
                        ? "text-emerald-300"
                        : userTacticalFit.mentalityFit >= 68
                        ? "text-sky-300"
                        : "text-amber-300"
                    }
                  >
                    {userTacticalFit.mentalityFit}%
                  </strong>
                </div>
                <div className="rounded-lg bg-slate-900/90 px-2 py-1 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Pressão</span>
                  <strong
                    className={
                      userTacticalFit.pressingFit >= 78
                        ? "text-emerald-300"
                        : userTacticalFit.pressingFit >= 68
                        ? "text-sky-300"
                        : "text-amber-300"
                    }
                  >
                    {userTacticalFit.pressingFit}%
                  </strong>
                </div>
                <div className="rounded-lg bg-slate-900/90 px-2 py-1 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Passe</span>
                  <strong
                    className={
                      userTacticalFit.passingFit >= 78
                        ? "text-emerald-300"
                        : userTacticalFit.passingFit >= 68
                        ? "text-sky-300"
                        : "text-amber-300"
                    }
                  >
                    {userTacticalFit.passingFit}%
                  </strong>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 leading-snug">
                {userTacticalFit.keyStrengths[0] ? (
                  <span className="text-emerald-300 font-semibold">
                    ✓ {userTacticalFit.keyStrengths[0]}
                  </span>
                ) : userTacticalFit.keyWeaknesses[0] ? (
                  <span className="text-amber-300 font-semibold">
                    ⚠ {userTacticalFit.keyWeaknesses[0]}
                  </span>
                ) : (
                  <span>• {userTacticalMatchup.matchupNote}</span>
                )}
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

            {/* Pending Substitutions Waiting for Dead-Ball Banner */}
            {pendingUserSubs.length > 0 && (
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-2.5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Clock className="h-3.5 w-3.5 animate-spin" />
                    Substituição agendada ({pendingUserSubs.length})
                  </span>
                  <span className="text-[10px] font-semibold text-amber-400">
                    Aguardando a bola sair
                  </span>
                </div>
                <div className="space-y-1">
                  {pendingUserSubs.map((ps) => (
                    <div
                      key={ps.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-slate-950/80 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-1.5 truncate">
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-black text-emerald-300">
                          <ArrowUp className="h-2.5 w-2.5 stroke-[3]" /> ENTRA
                        </span>
                        <span className="truncate font-bold text-white">
                          {getPlayerDisplayName(ps.playerInName)}
                        </span>
                        <span className="text-slate-400 text-[10px]">p/</span>
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-rose-500/20 px-1 py-0.2 text-[9px] font-black text-rose-300">
                          <ArrowDown className="h-2.5 w-2.5 stroke-[3]" /> SAI
                        </span>
                        <span className="truncate font-semibold text-slate-300">
                          {getPlayerDisplayName(ps.playerOutName)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelPendingSub(ps.id)}
                        className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-rose-500 hover:text-white transition cursor-pointer"
                        title="Cancelar esta substituição antes da bola sair"
                      >
                        Cancelar
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  ⏳ O atleta já está pronto na linha lateral e entrará na próxima parada de jogo (lateral, escanteio, falta, tiro de meta ou gol).
                </p>
              </div>
            )}

            {/* Starters list */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Em Campo ({userActiveIds.length})</span>
                <span className={subInId !== null ? "text-rose-400 animate-pulse" : ""}>
                  {totalUserSubsCount >= 5
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
                  const isPendingOut = pendingUserSubs.some((ps) => ps.playerOutId === id);
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
                      disabled={totalUserSubsCount >= 5 || userSession.finished}
                      onClick={() => handleClickPitchStarter(id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                        isPendingOut
                          ? "border-amber-400/80 bg-amber-500/20 ring-1 ring-amber-400/40 cursor-pointer"
                          : isSelected
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
                        {isPendingOut && (
                          <span className="ml-1 shrink-0 rounded bg-amber-500/25 px-1 py-0.2 text-[8px] font-black uppercase text-amber-300 border border-amber-500/50 animate-pulse">
                            ⏳ Sai na parada
                          </span>
                        )}
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
                        {isPendingOut ? (
                          <span className="text-[9px] font-bold text-amber-300">
                            Aguardando
                          </span>
                        ) : subInId !== null ? (
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
                  {totalUserSubsCount >= 5
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
                  const isPendingIn = pendingUserSubs.some((ps) => ps.playerInId === id);
                  const canSub = totalUserSubsCount < 5 && !userSession.finished && !isPendingIn;
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
                      disabled={!canSub && !isPendingIn}
                      onClick={() => handleClickBenchPlayer(id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                        isPendingIn
                          ? "border-emerald-400/80 bg-emerald-500/20 ring-1 ring-emerald-400/40 cursor-pointer shadow-sm"
                          : isSelectedToEnter
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
                            isPendingIn || isSelectedToEnter || isReadyToCompleteOut
                              ? "text-emerald-300"
                              : "text-slate-400"
                          }`}
                        >
                          {p.primaryPosition}
                        </span>
                        <span className="truncate">{getPlayerDisplayName(p.name)}</span>
                        {isPendingIn && (
                          <span className="ml-1 shrink-0 rounded bg-emerald-500/25 px-1 py-0.2 text-[8px] font-black uppercase text-emerald-300 border border-emerald-500/50 animate-pulse">
                            ⏳ Aguarda na linha
                          </span>
                        )}
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
                          isPendingIn || isSelectedToEnter || isReadyToCompleteOut
                            ? "text-emerald-300"
                            : "text-slate-300"
                        )}
                        {isPendingIn ? (
                          <span className="text-[9px] font-bold text-emerald-300">
                            Na Lateral
                          </span>
                        ) : isSelectedToEnter ? (
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
