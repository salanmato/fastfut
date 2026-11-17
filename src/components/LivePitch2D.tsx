import React, { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Shirt, Star } from "lucide-react";
import type { Club, MatchEvent, Player, Tactics } from "../types/game";
import type { LiveMatchSession } from "../engine/matchEngine";
import { formatMoney, getFormationSlots, getStaminaColor } from "../utils/format";
import { getClubVisuals } from "../utils/clubVisuals";
import { ClubKit } from "./ClubKit";

interface LivePitch2DProps {
  session: LiveMatchSession;
  homeClub: Club;
  awayClub: Club;
  homeTactics: Tactics;
  awayTactics: Tactics;
  playerMap: Map<number, Player>;
  userClubId: number;
  userKitVariant?: "home" | "away";
  isPlaying: boolean;
  subOutId: number | null;
  onSelectSubOut: (playerId: number) => void;
}

interface Coord {
  x: number;
  y: number;
}

interface PitchTrail {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "pass" | "shot" | "goal";
}

interface EventBanner {
  text: string;
  tone: "goal" | "save" | "chance" | "card";
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

function colorsTooClose(hexA: string, hexB: string): boolean {
  const parse = (h: string) => {
    const c = h.replace("#", "");
    if (c.length !== 6) return [0, 0, 0];
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  const dist = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  return dist < 110;
}

function getBaseHorizontalCoord(
  slotX: number,
  slotY: number,
  isHome: boolean,
  tactics: Tactics
): Coord {
  // slotY: 89 (GK) -> 15 (ATT)
  const depthNorm = (92 - slotY) / 80; // ~0.04 for GK, ~0.96 for ST
  const isGk = slotY > 82;

  let shift = 0;
  if (!isGk) {
    if (tactics.mentality === "Attacking") shift += 5.5;
    else if (tactics.mentality === "Defensive") shift -= 5.0;
    if (tactics.pressing === "High") shift += 3.5;
    else if (tactics.pressing === "Low") shift -= 3.5;
  }

  if (isHome) {
    const x = isGk ? 6.5 : clamp(16 + depthNorm * 49 + shift, 13, 74);
    const y = clamp(slotX, 11, 89);
    return { x, y };
  } else {
    const x = isGk ? 93.5 : clamp(84 - depthNorm * 49 - shift, 26, 87);
    const y = clamp(100 - slotX, 11, 89);
    return { x, y };
  }
}

export const LivePitch2D: React.FC<LivePitch2DProps> = ({
  session,
  homeClub,
  awayClub,
  homeTactics,
  awayTactics,
  playerMap,
  userClubId,
  userKitVariant = "home",
  isPlaying,
  subOutId,
  onSelectSubOut,
}) => {
  const [showNames, setShowNames] = useState(true);
  const [showRatings, setShowRatings] = useState(true);
  const [showKits, setShowKits] = useState(true);

  const [ballPos, setBallPos] = useState<Coord>({ x: 50, y: 50 });
  const [carrierId, setCarrierId] = useState<number | null>(null);
  const [carrierClubId, setCarrierClubId] = useState<number>(homeClub.id);
  const [trail, setTrail] = useState<PitchTrail | null>(null);
  const [banner, setBanner] = useState<EventBanner | null>(null);
  const [offsets, setOffsets] = useState<Record<number, { dx: number; dy: number }>>({});

  // Track persistent slot index per player across substitutions and red cards
  const slotIndexRef = useRef<Map<number, number>>(new Map());
  if (slotIndexRef.current.size === 0) {
    homeTactics.starters.forEach((id, idx) => slotIndexRef.current.set(id, idx));
    awayTactics.starters.forEach((id, idx) => slotIndexRef.current.set(id, idx));
  }

  // Update slot index mapping whenever substitution events occur
  useEffect(() => {
    for (const ev of session.events) {
      if (ev.type === "substitution" && ev.assistPlayerId) {
        const prevSlot = slotIndexRef.current.get(ev.assistPlayerId);
        if (prevSlot !== undefined && !slotIndexRef.current.has(ev.playerId)) {
          slotIndexRef.current.set(ev.playerId, prevSlot);
        }
      }
    }
  }, [session.events.length]);

  const homeSlots = useMemo(
    () => getFormationSlots(homeTactics.formation),
    [homeTactics.formation]
  );
  const awaySlots = useMemo(
    () => getFormationSlots(awayTactics.formation),
    [awayTactics.formation]
  );

  // Compute current rendered position for each active player
  const playerPositions = useMemo(() => {
    const posMap = new Map<number, { coord: Coord; isHome: boolean; label: string }>();

    const ballShiftX = (ballPos.x - 50) * 0.28;
    const ballShiftY = (ballPos.y - 50) * 0.14;

    const placeTeam = (
      activeIds: number[],
      slots: ReturnType<typeof getFormationSlots>,
      isHome: boolean,
      tactics: Tactics
    ) => {
      activeIds.forEach((id, fallbackIdx) => {
        const slotIdx = slotIndexRef.current.get(id) ?? fallbackIdx;
        const slot = slots[Math.min(slotIdx, slots.length - 1)];
        const base = getBaseHorizontalCoord(slot.x, slot.y, isHome, tactics);
        const isGk = slot.roleCategory === "GK";
        const jit = offsets[id] ?? { dx: 0, dy: 0 };

        let x = isGk ? base.x : clamp(base.x + ballShiftX + jit.dx, 10, 90);
        let y = isGk
          ? clamp(50 + (ballPos.y - 50) * 0.14, 42, 58)
          : clamp(base.y + ballShiftY + jit.dy, 8, 92);

        // Pull ball carrier slightly toward ballPos if event isn't dragging them away
        if (carrierId === id && !isGk) {
          x = clamp(x * 0.35 + ballPos.x * 0.65, 8, 92);
          y = clamp(y * 0.35 + ballPos.y * 0.65, 8, 92);
        }

        posMap.set(id, { coord: { x, y }, isHome, label: slot.label });
      });
    };

    placeTeam(session.homeActiveIds, homeSlots, true, homeTactics);
    placeTeam(session.awayActiveIds, awaySlots, false, awayTactics);
    return posMap;
  }, [
    session.homeActiveIds,
    session.awayActiveIds,
    homeSlots,
    awaySlots,
    homeTactics,
    awayTactics,
    ballPos,
    carrierId,
    offsets,
  ]);

  const lastHandledEventIdRef = useRef<string | null>(null);
  const highlightPauseUntilRef = useRef<number>(0);
  const ballPosRef = useRef<Coord>(ballPos);
  const carrierIdRef = useRef<number | null>(carrierId);
  const carrierClubIdRef = useRef<number>(carrierClubId);
  const latestSimRef = useRef({
    session,
    homeTactics,
    awayTactics,
    homeSlots,
    awaySlots,
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    playerMap,
  });

  ballPosRef.current = ballPos;
  carrierIdRef.current = carrierId;
  carrierClubIdRef.current = carrierClubId;
  latestSimRef.current = {
    session,
    homeTactics,
    awayTactics,
    homeSlots,
    awaySlots,
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    playerMap,
  };

  // React immediately to real match events (goal, save, chance, cards)
  useEffect(() => {
    if (session.events.length === 0) return;
    const latest: MatchEvent = session.events[session.events.length - 1];
    if (latest.id === lastHandledEventIdRef.current) return;
    lastHandledEventIdRef.current = latest.id;

    const isHomeEvent = latest.clubId === homeClub.id;
    const now = Date.now();

    if (latest.type === "goal") {
      const shooterCoord = playerPositions.get(latest.playerId)?.coord ?? {
        x: isHomeEvent ? 82 : 18,
        y: 50,
      };
      const goalX = isHomeEvent ? 98.2 : 1.8;
      const goalY = 47 + Math.random() * 6;

      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: shooterCoord.x,
        y1: shooterCoord.y,
        x2: goalX,
        y2: goalY,
        kind: "goal",
      });
      setBallPos({ x: goalX, y: goalY });
      setBanner({
        text: `GOOOOL! ${latest.playerName} (${latest.minute}')`,
        tone: "goal",
      });
      highlightPauseUntilRef.current = now + 1800;
    } else if (latest.type === "save") {
      const keeperPos = playerPositions.get(latest.playerId)?.coord ?? {
        x: isHomeEvent ? 6.5 : 93.5,
        y: 50,
      };
      const originX = isHomeEvent ? 22 : 78;
      const originY = 38 + Math.random() * 24;
      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: originX,
        y1: originY,
        x2: keeperPos.x,
        y2: keeperPos.y,
        kind: "shot",
      });
      setBallPos(keeperPos);
      setBanner({
        text: `DEFESAÇA! ${latest.playerName} (${latest.minute}')`,
        tone: "save",
      });
      highlightPauseUntilRef.current = now + 1300;
    } else if (latest.type === "chance") {
      const shooterCoord = playerPositions.get(latest.playerId)?.coord ?? {
        x: isHomeEvent ? 80 : 20,
        y: 50,
      };
      const missX = isHomeEvent ? 98 : 2;
      const missY = Math.random() < 0.5 ? 39 : 61;
      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: shooterCoord.x,
        y1: shooterCoord.y,
        x2: missX,
        y2: missY,
        kind: "shot",
      });
      setBallPos({ x: missX, y: missY });
      setBanner({
        text: `QUASE! ${latest.playerName} (${latest.minute}')`,
        tone: "chance",
      });
      highlightPauseUntilRef.current = now + 1100;
    } else if (latest.type === "yellow_card" || latest.type === "red_card" || latest.type === "injury") {
      setBanner({
        text:
          latest.type === "red_card"
            ? `EXPULSO! ${latest.playerName} (${latest.minute}')`
            : latest.type === "injury"
            ? `LESÃO! ${latest.playerName} (${latest.minute}')`
            : `AMARELO: ${latest.playerName} (${latest.minute}')`,
        tone: "card",
      });
      highlightPauseUntilRef.current = now + 1100;
    }
  }, [session.events.length, homeClub.id, playerPositions]);

  // Clear banner smoothly after highlight window
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => {
      setBanner(null);
      setTrail(null);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Sub-tick continuous ball passing & organic movement
  useEffect(() => {
    if (!isPlaying || session.finished) return;

    const timer = window.setInterval(() => {
      if (Date.now() < highlightPauseUntilRef.current) return;

      const cur = latestSimRef.current;
      const homePossWeight = cur.session.homeStats.possession / 100;
      const keepSameTeam = Math.random() < 0.72;
      const nextIsHome = keepSameTeam
        ? carrierClubIdRef.current === cur.homeClubId
        : Math.random() < homePossWeight;

      const teamClubId = nextIsHome ? cur.homeClubId : cur.awayClubId;
      const activeIds = nextIsHome ? cur.session.homeActiveIds : cur.session.awayActiveIds;
      const outfield = activeIds.filter((id) => cur.playerMap.get(id)?.roleCategory !== "GK");
      const candidates = outfield.length > 0 ? outfield : activeIds;
      if (candidates.length === 0) return;

      const others = candidates.filter((id) => id !== carrierIdRef.current);
      const receiverId =
        others.length > 0
          ? others[Math.floor(Math.random() * others.length)]
          : candidates[0];

      const slots = nextIsHome ? cur.homeSlots : cur.awaySlots;
      const tac = nextIsHome ? cur.homeTactics : cur.awayTactics;
      const slotIdx = slotIndexRef.current.get(receiverId) ?? 5;
      const slot = slots[Math.min(slotIdx, slots.length - 1)];
      const base = getBaseHorizontalCoord(slot.x, slot.y, nextIsHome, tac);

      const targetX = clamp(base.x + (Math.random() * 14 - 7), 10, 90);
      const targetY = clamp(base.y + (Math.random() * 14 - 7), 10, 90);

      setTrail({
        x1: ballPosRef.current.x,
        y1: ballPosRef.current.y,
        x2: targetX,
        y2: targetY,
        kind: "pass",
      });
      setBallPos({ x: targetX, y: targetY });
      setCarrierId(receiverId);
      setCarrierClubId(teamClubId);

      const nextOffsets: Record<number, { dx: number; dy: number }> = {};
      for (const id of [...cur.session.homeActiveIds, ...cur.session.awayActiveIds]) {
        nextOffsets[id] = {
          dx: Math.random() * 6 - 3,
          dy: Math.random() * 7 - 3.5,
        };
      }
      setOffsets(nextOffsets);
    }, 360);

    return () => window.clearInterval(timer);
  }, [isPlaying, session.finished]);

  const homeVisuals = getClubVisuals(homeClub);
  const awayVisuals = getClubVisuals(awayClub);
  const isUserHome = homeClub.id === userClubId;

  let homeVariant: "home" | "away" = isUserHome ? userKitVariant : "home";
  let awayVariant: "home" | "away" = !isUserHome ? userKitVariant : "home";

  const selectedHomeKit = homeVariant === "home" ? homeVisuals.homeKit : homeVisuals.awayKit;
  const selectedAwayKit = awayVariant === "home" ? awayVisuals.homeKit : awayVisuals.awayKit;

  if (colorsTooClose(selectedHomeKit.primary, selectedAwayKit.primary)) {
    if (isUserHome) {
      awayVariant = awayVariant === "home" ? "away" : "home";
    } else {
      homeVariant = homeVariant === "home" ? "away" : "home";
    }
  }

  const homeKitColors = homeVariant === "home" ? homeVisuals.homeKit : homeVisuals.awayKit;
  const awayKitColors = awayVariant === "home" ? awayVisuals.homeKit : awayVisuals.awayKit;

  const homeTextColor = isLightColor(homeKitColors.primary) ? "#0f172a" : "#ffffff";
  const awayTextColor = isLightColor(awayKitColors.primary) ? "#0f172a" : "#ffffff";
  const carrierClub = carrierClubId === homeClub.id ? homeClub : awayClub;
  const carrierPlayer = carrierId ? playerMap.get(carrierId) : undefined;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
      {/* Pitch Header Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-bold text-white">
            <span
              className="h-3 w-3 rounded-full ring-1 ring-white/40"
              style={{ backgroundColor: homeKitColors.primary }}
            />
            {homeClub.shortName} ({homeTactics.formation}) →
          </span>
          <span className="text-slate-600">|</span>
          <span className="inline-flex items-center gap-1.5 font-bold text-white">
            ← {awayClub.shortName} ({awayTactics.formation})
            <span
              className="h-3 w-3 rounded-full ring-1 ring-white/40"
              style={{ backgroundColor: awayKitColors.primary }}
            />
          </span>
          {!session.finished && carrierPlayer && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-0.5 text-[11px] text-slate-300">
              <span
                className="h-2 w-2 rounded-full animate-pulse"
                style={{
                  backgroundColor:
                    carrierClub.id === homeClub.id
                      ? homeKitColors.primary
                      : awayKitColors.primary,
                }}
              />
              Posse: <strong className="text-white">{carrierPlayer.name}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowKits((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              showKits
                ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                : "border-slate-700 bg-slate-800 text-slate-400"
            }`}
          >
            <Shirt className="h-3 w-3" /> {showKits ? "Camisas" : "Bolinhas"}
          </button>
          <button
            onClick={() => setShowNames((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              showNames
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-slate-700 bg-slate-800 text-slate-400"
            }`}
          >
            {showNames ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} Nomes
          </button>
          <button
            onClick={() => setShowRatings((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              showRatings
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-slate-700 bg-slate-800 text-slate-400"
            }`}
          >
            <Star className="h-3 w-3" /> Notas
          </button>
        </div>
      </div>

      {/* Horizontal 2D Pitch */}
      <div
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border-2 border-emerald-900/80 shadow-inner select-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, #064e3b 0%, #064e3b 8.333%, #065f46 8.333%, #065f46 16.666%)",
        }}
      >
        {/* SVG Field Lines & Ball Trail */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {/* Outer boundary */}
          <rect
            x="2"
            y="4"
            width="96"
            height="92"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.4"
          />
          {/* Halfway line & center circle */}
          <line
            x1="50"
            y1="4"
            x2="50"
            y2="96"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.4"
          />
          <circle
            cx="50"
            cy="50"
            r="11"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.4"
          />
          <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.45)" />

          {/* Left Penalty & Goal Box */}
          <rect
            x="2"
            y="22"
            width="15"
            height="56"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.4"
          />
          <rect
            x="2"
            y="36"
            width="5.5"
            height="28"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.4"
          />
          {/* Left Goal */}
          <rect
            x="0.3"
            y="42"
            width="1.7"
            height="16"
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="0.4"
          />

          {/* Right Penalty & Goal Box */}
          <rect
            x="83"
            y="22"
            width="15"
            height="56"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.4"
          />
          <rect
            x="92.5"
            y="36"
            width="5.5"
            height="28"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.4"
          />
          {/* Right Goal */}
          <rect
            x="98"
            y="42"
            width="1.7"
            height="16"
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="0.4"
          />

          {/* Pass / Shot Trajectory */}
          {trail && (
            <line
              x1={trail.x1}
              y1={trail.y1}
              x2={trail.x2}
              y2={trail.y2}
              stroke={
                trail.kind === "goal"
                  ? "#fbbf24"
                  : trail.kind === "shot"
                  ? "#fb7185"
                  : "rgba(255,255,255,0.45)"
              }
              strokeWidth={trail.kind === "pass" ? "0.45" : "0.75"}
              strokeDasharray={trail.kind === "pass" ? "1.2 1.2" : "none"}
            />
          )}
        </svg>

        {/* Event Banner Overlay */}
        {banner && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
            <div
              className={`rounded-full px-4 py-1.5 text-xs font-black tracking-wide shadow-2xl ring-2 ${
                banner.tone === "goal"
                  ? "bg-amber-400 text-slate-950 ring-white animate-bounce"
                  : banner.tone === "save"
                  ? "bg-sky-500 text-white ring-sky-200"
                  : banner.tone === "chance"
                  ? "bg-emerald-500 text-slate-950 ring-emerald-200"
                  : "bg-rose-500 text-white ring-rose-200"
              }`}
            >
              {banner.text}
            </div>
          </div>
        )}

        {/* 22 Active Players */}
        {Array.from(playerPositions.entries()).map(([playerId, info]) => {
          const player = playerMap.get(playerId);
          if (!player) return null;

          const club = info.isHome ? homeClub : awayClub;
          const kitColors = info.isHome ? homeKitColors : awayKitColors;
          const variant: "home" | "away" = info.isHome ? homeVariant : awayVariant;
          const textColor = info.isHome ? homeTextColor : awayTextColor;
          const isUserPlayer = club.id === userClubId;
          const isSubSelected = subOutId === playerId;
          const isCarrier = carrierId === playerId;
          const hasYellow = session.yellowCardedIds.includes(playerId);
          const isInjured = session.injuredIds.includes(playerId);
          const stamina = Math.round(session.playerStamina[playerId] ?? player.stamina);
          const rating = (session.playerRatings[playerId] ?? 6.5).toFixed(1);
          const surname = player.name.split(" ").slice(-1)[0];

          return (
            <button
              key={playerId}
              type="button"
              disabled={!isUserPlayer || session.finished}
              onClick={() => isUserPlayer && !session.finished && onSelectSubOut(playerId)}
              title={`${player.name} (${player.primaryPosition}) • Nota ${rating} • Energia ${stamina}%`}
              style={{
                left: `${info.coord.x}%`,
                top: `${info.coord.y}%`,
              }}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-300 ease-out ${
                isUserPlayer && !session.finished ? "cursor-pointer hover:scale-110" : "cursor-default"
              }`}
            >
              {/* Token: Kit SVG or Circle */}
              {showKits ? (
                <div
                  className={`relative rounded-lg transition ${
                    isSubSelected
                      ? "ring-2 ring-amber-400 bg-amber-400/20 scale-115"
                      : isCarrier
                      ? "ring-2 ring-white/90 bg-white/10 scale-110"
                      : ""
                  }`}
                >
                  <ClubKit
                    club={club}
                    variant={variant}
                    size="sm"
                    number={info.label.slice(0, 2)}
                  />
                  {hasYellow && (
                    <span className="absolute -left-0.5 -top-0.5 h-2.5 w-1.5 rounded-[1px] bg-amber-400 ring-1 ring-black/60" />
                  )}
                  {isInjured && (
                    <span className="absolute -left-1.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-600 text-[9px] font-black text-white ring-1 ring-white">
                      +
                    </span>
                  )}
                  {showRatings && (
                    <span className="absolute -right-1.5 -top-1 rounded bg-slate-950/95 px-1 text-[8px] font-bold text-amber-300 ring-1 ring-white/15">
                      {rating}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className={`relative flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[9px] font-black shadow-md transition ${
                    isSubSelected
                      ? "ring-2 ring-amber-400 scale-115"
                      : isCarrier
                      ? "ring-2 ring-white scale-110"
                      : "ring-1 ring-black/50"
                  }`}
                  style={{
                    backgroundColor: kitColors.primary,
                    color: textColor,
                    borderColor: kitColors.secondary,
                    borderWidth: "1.5px",
                  }}
                >
                  {info.label.slice(0, 2)}

                  {hasYellow && (
                    <span className="absolute -left-1 -top-1 h-2.5 w-1.5 rounded-[1px] bg-amber-400 ring-1 ring-black/60" />
                  )}
                  {isInjured && (
                    <span className="absolute -left-1 -bottom-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-600 text-[9px] font-black text-white ring-1 ring-white">
                      +
                    </span>
                  )}

                  {showRatings && (
                    <span className="absolute -right-2 -top-1.5 rounded bg-slate-950/90 px-1 text-[8px] font-bold text-amber-300 ring-1 ring-white/15">
                      {rating}
                    </span>
                  )}
                </div>
              )}

              {/* Name & Stamina pill */}
              {showNames && (
                <div className="mt-0.5 flex flex-col items-center">
                  <span className="max-w-[66px] truncate rounded bg-slate-950/80 px-1 text-[9px] font-semibold leading-tight text-white shadow">
                    {surname}
                  </span>
                  <div className="mt-0.5 h-0.5 w-6 overflow-hidden rounded-full bg-slate-900/90">
                    <div
                      className={`h-full ${getStaminaColor(stamina)}`}
                      style={{ width: `${stamina}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
          );
        })}

        {/* Animated Ball */}
        <div
          style={{ left: `${ballPos.x}%`, top: `${ballPos.y}%` }}
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out"
        >
          <div className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] ring-2 ring-slate-900" />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Público:{" "}
            <strong className="text-white">
              {session.attendance.toLocaleString("pt-BR")} /{" "}
              {session.stadiumCapacity.toLocaleString("pt-BR")}
            </strong>{" "}
            ({Math.round((session.attendance / Math.max(1, session.stadiumCapacity)) * 100)}%)
          </span>
          <span>
            Renda:{" "}
            <strong className="text-emerald-400">{formatMoney(session.gateRevenueEur)}</strong>
          </span>
          <span>
            Fator Estádio:{" "}
            <strong className="text-amber-300">+{session.homeAdvantagePct.toFixed(1)}%</strong>
          </span>
        </div>
        {!session.finished && (
          <span className="text-slate-500">
            Clique em um atleta do <strong className="text-slate-300">{userClubId === homeClub.id ? homeClub.shortName : awayClub.shortName}</strong> para substituir
          </span>
        )}
      </div>
    </div>
  );
};
