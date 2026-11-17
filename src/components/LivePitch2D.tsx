import React, { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Shirt, Star } from "lucide-react";
import type { Club, MatchEvent, Player, Tactics } from "../types/game";
import type { LiveMatchSession } from "../engine/matchEngine";
import {
  formatMoney,
  getFormationSlots,
  getStaminaColor,
  type FormationSlot,
} from "../utils/format";
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

type PlayPhase = "build_up" | "progression" | "final_third" | "counter";
type RunType = "overlap" | "in_behind" | "cut_inside" | "support" | "box_crash";

interface Coord {
  x: number;
  y: number;
}

interface ActiveRun {
  vx: number;
  vy: number;
  expiresAtTick: number;
  runType: RunType;
}

interface PitchTrail {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "pass" | "shot" | "goal";
}

const PLAY_PHASE_LABELS: Record<PlayPhase, string> = {
  build_up: "Construção",
  progression: "Progressão",
  final_third: "Ataque Final",
  counter: "Contra-Ataque",
};

interface EventBanner {
  text: string;
  tone: "goal" | "save" | "chance" | "card";
  minute?: number;
  clubName?: string;
  clubColor?: string;
  scorerName?: string;
  scorerShirt?: number;
  scorerRating?: string;
  assistName?: string;
  assistShirt?: number;
  assistRating?: string;
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

function getBaseVerticalCoord(
  slotX: number,
  slotY: number,
  isHome: boolean,
  tactics: Tactics,
  forceNeutral = false
): Coord {
  // slotY: 89 (GK) -> 15 (ATT)
  const depthNorm = clamp((92 - slotY) / 80, 0, 1); // ~0 for GK, ~0.25 for DEF, ~0.55 for MID, ~0.95 for ST
  const isGk = slotY > 82;

  let shift = 0;
  if (!isGk && !forceNeutral) {
    if (tactics.mentality === "Attacking") shift += 3.5;
    else if (tactics.mentality === "Defensive") shift -= 3.5;
    if (tactics.pressing === "High") shift += 2.0;
    else if (tactics.pressing === "Low") shift -= 2.0;
  }

  if (isHome) {
    // Home defends bottom (y=92), attacks up towards top goal (y=2)
    const x = clamp(slotX, 10, 90);
    const y = isGk ? 92.5 : clamp(92 - depthNorm * 38 - shift, 52, 92);
    return { x, y };
  } else {
    // Away defends top (y=8), attacks down towards bottom goal (y=98)
    const x = clamp(100 - slotX, 10, 90);
    const y = isGk ? 7.5 : clamp(8 + depthNorm * 38 + shift, 8, 48);
    return { x, y };
  }
}

function isFullbackSlot(label: string): boolean {
  return label === "LB" || label === "RB" || label === "LWB" || label === "RWB";
}

function isWingerSlot(label: string): boolean {
  return (
    label === "LW" ||
    label === "RW" ||
    label === "LM" ||
    label === "RM" ||
    label === "LAM" ||
    label === "RAM"
  );
}

function computeRoleAttackTarget(
  slot: FormationSlot,
  player: Player | undefined,
  localBallX: number,
  localBallY: number,
  tactics: Tactics,
  attackProgress: number,
  playPhase: PlayPhase
): Coord {
  // In local attack perspective:
  // localBallX: 10..90 (left to right)
  // localBallY: 0 (opponent goal) to 100 (own goal). Higher attackProgress means closer to 0!
  const baseX = clamp(slot.x, 10, 90);
  const mentalityShift =
    tactics.mentality === "Attacking" ? 5.0 : tactics.mentality === "Defensive" ? -4.5 : 0;
  const pressShift =
    tactics.pressing === "High" ? 2.5 : tactics.pressing === "Low" ? -2.5 : 0;
  const counterBoost = playPhase === "counter" ? 5.5 : 0;

  if (slot.roleCategory === "GK") {
    return {
      x: clamp(50 + (localBallX - 50) * 0.16, 42, 58),
      y: clamp(94.5 - attackProgress * 8.5 - (tactics.pressing === "High" ? 1.5 : 0), 84, 95.5),
    };
  }

  const label = slot.label;
  const sideSign = baseX < 50 ? -1 : 1;
  const ballOnMyFlank = Math.abs(localBallX - baseX) < 28;

  if (label === "CB") {
    const attY = clamp(
      82 - attackProgress * 28 - mentalityShift * 0.65 - pressShift * 0.6,
      48,
      86
    );
    const spreadX = localBallY > 58 ? sideSign * 4.5 : 0;
    const flankX = clamp(baseX * 0.85 + localBallX * 0.15 + spreadX, 20, 80);
    return { x: flankX, y: attY };
  }

  if (isFullbackSlot(label)) {
    const isWingback = label === "LWB" || label === "RWB";
    const flankAdvance = ballOnMyFlank || attackProgress > 0.48 ? 12 : 2;
    const attY = clamp(
      78 -
        attackProgress * 46 -
        flankAdvance -
        (isWingback ? 5 : 0) -
        mentalityShift -
        counterBoost * 0.4,
      16,
      84
    );
    const wideBias = localBallY > 30 || ballOnMyFlank ? sideSign * 5 : -sideSign * 3;
    const flankX = clamp(baseX + wideBias, 7, 93);
    return { x: flankX, y: attY };
  }

  if (label === "CDM") {
    const anchorY = Math.min(localBallY + 11, 72 - attackProgress * 32);
    const attY = clamp(anchorY - mentalityShift * 0.5, 28, 76);
    const flankX = clamp(baseX * 0.66 + localBallX * 0.34, 22, 78);
    return { x: flankX, y: attY };
  }

  if (label === "CM" || label === "CAM") {
    const isCam = label === "CAM" || player?.primaryPosition === "CAM";
    const boxCrash = attackProgress > 0.6 || playPhase === "counter" ? (isCam ? 12 : 8) : 0;
    const attY = clamp(
      (isCam ? 54 : 62) -
        attackProgress * 34 -
        boxCrash -
        mentalityShift -
        counterBoost * 0.6,
      13,
      72
    );
    const flankX = clamp(baseX * 0.68 + localBallX * 0.32, 18, 82);
    return { x: flankX, y: attY };
  }

  if (isWingerSlot(label)) {
    const attY = clamp(
      52 -
        attackProgress * 38 -
        mentalityShift * 0.8 -
        counterBoost -
        (playPhase === "final_third" ? 4 : 0),
      9,
      65
    );
    // Ball-side winger stretches wide; weak-side winger cuts inside towards the far post
    const cutInFactor = !ballOnMyFlank && attackProgress > 0.52 ? 0.45 : 0.08;
    const stretchX = ballOnMyFlank ? sideSign * 4 : 0;
    const flankX = clamp(baseX * (1 - cutInFactor) + 50 * cutInFactor + stretchX, 8, 92);
    return { x: flankX, y: attY };
  }

  // Striker (ST / CF): stretch backline in depth and dart across the box
  const linkDrop = tactics.passingStyle === "Short" && localBallY > 56 ? 9 : 0;
  const attY = clamp(
    45 -
      attackProgress * 34 -
      mentalityShift * 0.6 -
      counterBoost +
      linkDrop -
      (playPhase === "final_third" ? 4 : 0),
    8,
    58
  );
  const channelShift = (localBallX - 50) * 0.28;
  const flankX = clamp(baseX * 0.72 + (50 + channelShift) * 0.28, 28, 72);
  return { x: flankX, y: attY };
}

function computeRoleDefendTarget(
  slot: FormationSlot,
  localBallX: number,
  localBallY: number,
  tactics: Tactics,
  isCounter: boolean
): Coord {
  if (slot.roleCategory === "GK") {
    return {
      x: clamp(50 + (localBallX - 50) * 0.18, 42, 58),
      y: clamp(95.5 - Math.max(0, (65 - localBallY) * 0.06), 91, 95.5),
    };
  }

  const baseX = clamp(slot.x, 10, 90);
  const pressBias =
    tactics.pressing === "High" ? -7 : tactics.pressing === "Low" ? 7 : -1;
  const mentBias =
    tactics.mentality === "Attacking" ? -5 : tactics.mentality === "Defensive" ? 6 : 0;
  const counterRetreat = isCounter ? 6 : 0;

  // Higher depthNorm means further up towards the opponent when defending
  const depthNorm = clamp((92 - slot.y) / 80, 0.15, 0.96);
  // Keep block compact between own goal (100) and the ball
  const ballAnchor = clamp(localBallY * 0.72 + 28 + pressBias + mentBias + counterRetreat, 32, 88);
  const blockSpan = tactics.pressing === "Low" ? 22 : tactics.pressing === "High" ? 32 : 27;

  const attY = clamp(ballAnchor - (1 - depthNorm) * blockSpan, 24, 89);
  // Zonal lateral shift toward ball side
  const compressX = slot.label === "CB" ? 0.28 : 0.36;
  const flankX = clamp(baseX * (1 - compressX) + localBallX * compressX, 10, 90);
  return { x: flankX, y: attY };
}

function computeTeamTargets(
  activeIds: number[],
  slots: FormationSlot[],
  slotIndexMap: Map<number, number>,
  playerMap: Map<number, Player>,
  isHome: boolean,
  tactics: Tactics,
  ballPos: Coord,
  inPossession: boolean,
  playPhase: PlayPhase,
  activeRuns: Map<number, ActiveRun>,
  carrierId: number | null
): Map<number, Coord> {
  const targets = new Map<number, Coord>();
  // For Home: attacking is toward top (y = 0), so localBallY is ballPos.y
  // For Away: attacking is toward bottom (y = 100), so localBallY is 100 - ballPos.y
  const localBallX = isHome ? ballPos.x : 100 - ballPos.x;
  const localBallY = isHome ? ballPos.y : 100 - ballPos.y;
  const attackProgress = clamp((90 - localBallY) / 76, 0, 1);

  activeIds.forEach((id, fallbackIdx) => {
    const slotIdx = slotIndexMap.get(id) ?? fallbackIdx;
    const slot = slots[Math.min(slotIdx, slots.length - 1)];
    const player = playerMap.get(id);

    let localCoord = inPossession
      ? computeRoleAttackTarget(
          slot,
          player,
          localBallX,
          localBallY,
          tactics,
          attackProgress,
          playPhase
        )
      : computeRoleDefendTarget(
          slot,
          localBallX,
          localBallY,
          tactics,
          playPhase === "counter"
        );

    if (inPossession && id !== carrierId && slot.roleCategory !== "GK") {
      const run = activeRuns.get(id);
      if (run) {
        const localVx = isHome ? run.vx : -run.vx;
        const localVy = isHome ? run.vy : -run.vy;
        localCoord = {
          x: clamp(localCoord.x + localVx, 8, 92),
          y: clamp(localCoord.y + localVy, 7, 93),
        };
      }
    }

    const screenX = isHome ? localCoord.x : 100 - localCoord.x;
    const screenY = isHome ? localCoord.y : 100 - localCoord.y;
    targets.set(id, {
      x: clamp(screenX, 6, 94),
      y: clamp(screenY, 5.5, 94.5),
    });
  });

  // Active ball pressing (hunters) when defending
  if (!inPossession) {
    const pressersCount =
      tactics.pressing === "High" ? 3 : tactics.pressing === "Medium" ? 2 : 1;
    const candidates = activeIds
      .filter((id) => playerMap.get(id)?.roleCategory !== "GK")
      .map((id) => {
        const t = targets.get(id)!;
        const dist = Math.hypot(t.x - ballPos.x, t.y - ballPos.y);
        return { id, dist, target: t };
      })
      .sort((a, b) => a.dist - b.dist);

    const goalY = isHome ? 96 : 4;
    const toGoalDist = Math.max(1, Math.hypot(50 - ballPos.x, goalY - ballPos.y));
    const goalUnitX = (50 - ballPos.x) / toGoalDist;
    const goalUnitY = (goalY - ballPos.y) / toGoalDist;

    candidates.slice(0, pressersCount).forEach((entry, rank) => {
      if (rank === 0) {
        // Primary hunter closes directly down on goal-side of carrier
        targets.set(entry.id, {
          x: clamp(ballPos.x + goalUnitX * 2.5, 7, 93),
          y: clamp(ballPos.y + goalUnitY * 2.8, 7, 93),
        });
      } else {
        // Secondary hunters squeeze passing lanes near the ball
        const pull = rank === 1 ? 0.48 : 0.3;
        targets.set(entry.id, {
          x: clamp(entry.target.x * (1 - pull) + (ballPos.x + goalUnitX * 6) * pull, 7, 93),
          y: clamp(entry.target.y * (1 - pull) + (ballPos.y + goalUnitY * 8) * pull, 7, 93),
        });
      }
    });
  }

  // Keep carrier synced near the ball
  if (inPossession && carrierId !== null && targets.has(carrierId)) {
    const carrierSlotIdx = slotIndexMap.get(carrierId) ?? 0;
    const carrierSlot = slots[Math.min(carrierSlotIdx, slots.length - 1)];
    if (carrierSlot?.roleCategory !== "GK") {
      targets.set(carrierId, {
        x: clamp(ballPos.x, 7, 93),
        y: clamp(ballPos.y, 6, 94),
      });
    }
  }

  // Lightweight anti-clumping repulsion between outfield teammates
  const minSep = 6.2;
  const outfieldIds = activeIds.filter((id) => playerMap.get(id)?.roleCategory !== "GK");
  for (let i = 0; i < outfieldIds.length; i++) {
    for (let j = i + 1; j < outfieldIds.length; j++) {
      const idA = outfieldIds[i];
      const idB = outfieldIds[j];
      const a = targets.get(idA)!;
      const b = targets.get(idB)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.01 && dist < minSep) {
        const push = (minSep - dist) * 0.42;
        const nx = dx / dist;
        const ny = dy / dist;
        if (idA !== carrierId) {
          targets.set(idA, { x: clamp(a.x + nx * push, 7, 93), y: clamp(a.y + ny * push, 6, 94) });
        }
        if (idB !== carrierId) {
          targets.set(idB, { x: clamp(b.x - nx * push, 7, 93), y: clamp(b.y - ny * push, 6, 94) });
        }
      }
    }
  }

  return targets;
}

function selectPassTarget(
  candidates: number[],
  carrierId: number,
  isHome: boolean,
  tactics: Tactics,
  playPhase: PlayPhase,
  ballPos: Coord,
  coords: Record<number, Coord>,
  oppCoords: Coord[],
  playerMap: Map<number, Player>
): number {
  // Home attacks toward y=0 (progress is -dy), Away attacks toward y=100 (progress is +dy)
  const dirY = isHome ? -1 : 1;
  const pool = candidates.filter((id) => id !== carrierId);
  if (pool.length === 0) return carrierId;

  const scored = pool.map((id) => {
    const pos = coords[id] ?? { x: ballPos.x, y: ballPos.y };
    const dist = Math.hypot(pos.x - ballPos.x, pos.y - ballPos.y);
    const progress = (pos.y - ballPos.y) * dirY;
    const p = playerMap.get(id);
    const isGk = p?.roleCategory === "GK";

    let minOppDist = 30;
    for (const oc of oppCoords) {
      const d = Math.hypot(pos.x - oc.x, pos.y - oc.y);
      if (d < minOppDist) minOppDist = d;
    }

    let score = 1.0;
    if (isGk) {
      const localBallY = isHome ? ballPos.y : 100 - ballPos.y;
      score = localBallY > 66 ? 0.55 : 0.03;
    } else if (tactics.passingStyle === "Short") {
      score += dist >= 7 && dist <= 25 ? 2.4 : dist < 35 ? 1.0 : 0.25;
      score += progress > -4 ? 1.1 : 0.3;
    } else if (tactics.passingStyle === "Direct") {
      score += progress > 11 ? 3.2 : progress > 2 ? 1.4 : 0.35;
      if (p?.roleCategory === "ATT" || p?.primaryPosition === "CAM") score += 1.4;
    } else {
      score += progress > 3 ? 2.1 : progress > -4 ? 1.1 : 0.45;
      score += dist >= 10 && dist <= 38 ? 1.2 : 0.4;
    }

    if (playPhase === "counter" && progress > 10) {
      score *= 1.9;
    }

    // Prefer open receivers away from tight marking
    score *= clamp(0.55 + minOppDist / 18, 0.45, 1.65);
    return { id, score };
  });

  const total = scored.reduce((s, x) => s + Math.max(0.05, x.score), 0);
  let r = Math.random() * total;
  for (const item of scored) {
    r -= Math.max(0.05, item.score);
    if (r <= 0) return item.id;
  }
  return scored[scored.length - 1].id;
}

function buildFormationSeedCoords(
  homeIds: number[],
  awayIds: number[],
  homeSlots: FormationSlot[],
  awaySlots: FormationSlot[],
  slotIndexMap: Map<number, number>,
  homeTactics: Tactics,
  awayTactics: Tactics
): Record<number, Coord> {
  const seed: Record<number, Coord> = {};
  homeIds.forEach((id, idx) => {
    const slot = homeSlots[Math.min(slotIndexMap.get(id) ?? idx, homeSlots.length - 1)];
    seed[id] = getBaseVerticalCoord(slot.x, slot.y, true, homeTactics);
  });
  awayIds.forEach((id, idx) => {
    const slot = awaySlots[Math.min(slotIndexMap.get(id) ?? idx, awaySlots.length - 1)];
    seed[id] = getBaseVerticalCoord(slot.x, slot.y, false, awayTactics);
  });
  return seed;
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
  const [playPhase, setPlayPhase] = useState<PlayPhase>("build_up");
  const [trail, setTrail] = useState<PitchTrail | null>(null);
  const [banner, setBanner] = useState<EventBanner | null>(null);

  const homeSlots = useMemo(
    () => getFormationSlots(homeTactics.formation),
    [homeTactics.formation]
  );
  const awaySlots = useMemo(
    () => getFormationSlots(awayTactics.formation),
    [awayTactics.formation]
  );

  // Track persistent slot index per player across substitutions and red cards
  const slotIndexRef = useRef<Map<number, number>>(new Map());
  const lastFixtureIdRef = useRef<number>(session.fixtureId);
  if (lastFixtureIdRef.current !== session.fixtureId || slotIndexRef.current.size === 0) {
    lastFixtureIdRef.current = session.fixtureId;
    slotIndexRef.current = new Map();
    homeTactics.starters.forEach((id, idx) => slotIndexRef.current.set(id, idx));
    awayTactics.starters.forEach((id, idx) => slotIndexRef.current.set(id, idx));
  }

  const [liveCoords, setLiveCoords] = useState<Record<number, Coord>>(() =>
    buildFormationSeedCoords(
      session.homeActiveIds,
      session.awayActiveIds,
      homeSlots,
      awaySlots,
      slotIndexRef.current,
      homeTactics,
      awayTactics
    )
  );

  // Update slot index mapping and initialize subbed-in player position whenever substitutions occur
  useEffect(() => {
    for (const ev of session.events) {
      if (ev.type === "substitution" && ev.assistPlayerId) {
        const prevSlot = slotIndexRef.current.get(ev.assistPlayerId);
        if (prevSlot !== undefined && !slotIndexRef.current.has(ev.playerId)) {
          slotIndexRef.current.set(ev.playerId, prevSlot);
          const isHomeSub = ev.clubId === homeClub.id;
          const slots = isHomeSub ? homeSlots : awaySlots;
          const slot = slots[Math.min(prevSlot, slots.length - 1)];
          const tac = isHomeSub ? homeTactics : awayTactics;
          const spawnCoord = getBaseVerticalCoord(slot.x, slot.y, isHomeSub, tac);
          setLiveCoords((prev) =>
            prev[ev.playerId] ? prev : { ...prev, [ev.playerId]: spawnCoord }
          );
        }
      }
    }
  }, [session.events.length, homeClub.id, homeSlots, awaySlots, homeTactics, awayTactics]);

  // Reset coordinates cleanly if fixture or paused formation changes
  useEffect(() => {
    if (!isPlaying && session.minute === 0) {
      setLiveCoords(
        buildFormationSeedCoords(
          session.homeActiveIds,
          session.awayActiveIds,
          homeSlots,
          awaySlots,
          slotIndexRef.current,
          homeTactics,
          awayTactics
        )
      );
      setBallPos({ x: 50, y: 50 });
      setPlayPhase("build_up");
    }
  }, [session.fixtureId, homeTactics.formation, awayTactics.formation, isPlaying, session.minute]);

  // Compute rendered positions from continuous liveCoords with smooth fallback
  // When the match is finished, return cleanly spread initial formation positions with ratings
  const playerPositions = useMemo(() => {
    const posMap = new Map<number, { coord: Coord; isHome: boolean; label: string }>();

    if (session.finished) {
      const addFinishedTeam = (
        activeIds: number[],
        slots: FormationSlot[],
        isHome: boolean,
        tactics: Tactics
      ) => {
        activeIds.forEach((id, fallbackIdx) => {
          const slotIdx = slotIndexRef.current.get(id) ?? fallbackIdx;
          const slot = slots[Math.min(slotIdx, slots.length - 1)];
          const coord = getBaseVerticalCoord(slot.x, slot.y, isHome, tactics, true);
          posMap.set(id, { coord, isHome, label: slot.label });
        });
      };
      addFinishedTeam(session.homeActiveIds, homeSlots, true, homeTactics);
      addFinishedTeam(session.awayActiveIds, awaySlots, false, awayTactics);
      return posMap;
    }

    const addTeam = (
      activeIds: number[],
      slots: FormationSlot[],
      isHome: boolean,
      tactics: Tactics
    ) => {
      activeIds.forEach((id, fallbackIdx) => {
        const slotIdx = slotIndexRef.current.get(id) ?? fallbackIdx;
        const slot = slots[Math.min(slotIdx, slots.length - 1)];
        const coord =
          liveCoords[id] ?? getBaseVerticalCoord(slot.x, slot.y, isHome, tactics);
        posMap.set(id, { coord, isHome, label: slot.label });
      });
    };
    addTeam(session.homeActiveIds, homeSlots, true, homeTactics);
    addTeam(session.awayActiveIds, awaySlots, false, awayTactics);
    return posMap;
  }, [
    session.homeActiveIds,
    session.awayActiveIds,
    session.finished,
    homeSlots,
    awaySlots,
    homeTactics,
    awayTactics,
    liveCoords,
  ]);

  const lastHandledEventIdRef = useRef<string | null>(null);
  const highlightPauseUntilRef = useRef<number>(0);
  const ballPosRef = useRef<Coord>(ballPos);
  const carrierIdRef = useRef<number | null>(carrierId);
  const carrierClubIdRef = useRef<number>(carrierClubId);
  const playPhaseRef = useRef<PlayPhase>(playPhase);
  const liveCoordsRef = useRef<Record<number, Coord>>(liveCoords);
  const activeRunsRef = useRef<Map<number, ActiveRun>>(new Map());
  const tickCountRef = useRef<number>(0);
  const counterUntilTickRef = useRef<number>(0);
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
  playPhaseRef.current = playPhase;
  liveCoordsRef.current = liveCoords;
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

  // React immediately to real match events (goal, save, chance, cards) with area choreography
  useEffect(() => {
    if (session.events.length === 0) return;
    const latest: MatchEvent = session.events[session.events.length - 1];
    if (latest.id === lastHandledEventIdRef.current) return;
    lastHandledEventIdRef.current = latest.id;

    const isHomeEvent = latest.clubId === homeClub.id;
    const now = Date.now();
    const curCoords = liveCoordsRef.current;

    const choreographBoxAction = (
      attackingHome: boolean,
      shooterId: number | null,
      assisterId?: number,
      targetGoalCoord?: Coord
    ): { shooterCoord: Coord } => {
      const shooterCoord: Coord = {
        x: 36 + Math.random() * 28,
        y: attackingHome ? 10 + Math.random() * 9 : 90 - Math.random() * 9,
      };
      const updated: Record<number, Coord> = { ...curCoords };
      const attIds = attackingHome ? session.homeActiveIds : session.awayActiveIds;
      const defIds = attackingHome ? session.awayActiveIds : session.homeActiveIds;
      const goalY = attackingHome ? 4.5 : 95.5;

      if (shooterId !== null) {
        updated[shooterId] = shooterCoord;
      }
      if (assisterId !== undefined) {
        const wingX =
          shooterCoord.x < 50 ? 14 + Math.random() * 16 : 70 + Math.random() * 16;
        updated[assisterId] = {
          x: wingX,
          y: attackingHome
            ? clamp(shooterCoord.y + 7 + Math.random() * 8, 12, 36)
            : clamp(shooterCoord.y - 7 - Math.random() * 8, 64, 88),
        };
      }

      // Bring attackers and defenders near the penalty box
      for (const id of attIds) {
        if (id === shooterId || id === assisterId) continue;
        const p = playerMap.get(id);
        if (!p || p.roleCategory === "GK") continue;
        const base = updated[id] ?? { x: 50, y: 50 };
        const boxPull = p.roleCategory === "ATT" || p.roleCategory === "MID" ? 0.55 : 0.25;
        updated[id] = {
          x: clamp(base.x * 0.75 + shooterCoord.x * 0.25, 10, 90),
          y: clamp(base.y * (1 - boxPull) + (attackingHome ? 24 : 76) * boxPull, 8, 92),
        };
      }
      for (const id of defIds) {
        const p = playerMap.get(id);
        if (!p) continue;
        if (p.roleCategory === "GK" && targetGoalCoord) {
          updated[id] = {
            x: clamp(50 + (targetGoalCoord.x - 50) * 0.45, 43, 57),
            y: attackingHome ? 4.5 : 95.5,
          };
          continue;
        }
        const base = updated[id] ?? { x: 50, y: goalY };
        const boxPull = p.roleCategory === "DEF" ? 0.6 : 0.4;
        updated[id] = {
          x: clamp(base.x * 0.7 + shooterCoord.x * 0.3, 14, 86),
          y: clamp(base.y * (1 - boxPull) + (attackingHome ? 14 : 86) * boxPull, 6, 94),
        };
      }

      setLiveCoords(updated);
      return { shooterCoord };
    };

    if (latest.type === "goal") {
      const goalX = 50 + (Math.random() * 4 - 2);
      const goalY = isHomeEvent ? 1.6 : 98.4;
      const { shooterCoord } = choreographBoxAction(
        isHomeEvent,
        latest.playerId,
        latest.assistPlayerId,
        { x: goalX, y: goalY }
      );
      const scoringClub = isHomeEvent ? homeClub : awayClub;
      const scorer = playerMap.get(latest.playerId);
      const assister = latest.assistPlayerId ? playerMap.get(latest.assistPlayerId) : undefined;

      setPlayPhase("final_third");
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
        text: "GOOOOL!",
        tone: "goal",
        minute: latest.minute,
        clubName: scoringClub.name,
        clubColor: scoringClub.primaryColor,
        scorerName: latest.playerName,
        scorerShirt: scorer?.shirtNumber,
        scorerRating: (session.playerRatings[latest.playerId] ?? 7.6).toFixed(1),
        assistName: latest.assistPlayerName,
        assistShirt: assister?.shirtNumber,
        assistRating: latest.assistPlayerId
          ? (session.playerRatings[latest.assistPlayerId] ?? 7.1).toFixed(1)
          : undefined,
      });
      highlightPauseUntilRef.current = now + 2400;
    } else if (latest.type === "save") {
      // On "save", latest.clubId is the keeper's club; opposing side took the shot
      const attackingHome = !isHomeEvent;
      const keeperTarget: Coord = {
        x: 48 + Math.random() * 4,
        y: isHomeEvent ? 95.5 : 4.5,
      };
      const oppIds = attackingHome ? session.homeActiveIds : session.awayActiveIds;
      const oppAttackers = oppIds.filter((id) => playerMap.get(id)?.roleCategory === "ATT");
      const shooterGuess = oppAttackers[0] ?? oppIds[Math.max(0, oppIds.length - 1)] ?? null;
      const { shooterCoord } = choreographBoxAction(
        attackingHome,
        shooterGuess,
        undefined,
        keeperTarget
      );

      setPlayPhase("final_third");
      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: shooterCoord.x,
        y1: shooterCoord.y,
        x2: keeperTarget.x,
        y2: keeperTarget.y,
        kind: "shot",
      });
      setBallPos(keeperTarget);
      setBanner({
        text: `DEFESAÇA! ${latest.playerName} (${latest.minute}')`,
        tone: "save",
      });
      highlightPauseUntilRef.current = now + 1300;
    } else if (latest.type === "chance") {
      const missX = Math.random() < 0.5 ? 35 : 65;
      const missY = isHomeEvent ? 1.5 : 98.5;
      const { shooterCoord } = choreographBoxAction(isHomeEvent, latest.playerId);

      setPlayPhase("final_third");
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
  }, [session.events.length, homeClub.id, awayClub.id, playerMap]);

  // Clear banner smoothly after highlight window
  useEffect(() => {
    if (!banner) return;
    const durationMs = banner.tone === "goal" ? 2600 : 1800;
    const t = window.setTimeout(() => {
      setBanner(null);
      setTrail(null);
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [banner]);

  // Sub-tick continuous tactical movement, active runs, dribbling & progressive passing (220ms)
  useEffect(() => {
    if (!isPlaying || session.finished) return;

    const timer = window.setInterval(() => {
      if (Date.now() < highlightPauseUntilRef.current) return;

      tickCountRef.current += 1;
      const tick = tickCountRef.current;
      const cur = latestSimRef.current;
      const curCoords = { ...liveCoordsRef.current };

      const ensureActiveCarrier = (activeIds: number[]): number | null => {
        if (carrierIdRef.current !== null && activeIds.includes(carrierIdRef.current)) {
          return carrierIdRef.current;
        }
        const outfield = activeIds.filter((id) => cur.playerMap.get(id)?.roleCategory !== "GK");
        return outfield[0] ?? activeIds[0] ?? null;
      };

      const prevIsHome = carrierClubIdRef.current === cur.homeClubId;
      const prevActiveIds = prevIsHome ? cur.session.homeActiveIds : cur.session.awayActiveIds;
      const currentCarrierId = ensureActiveCarrier(prevActiveIds);
      const currentTactics = prevIsHome ? cur.homeTactics : cur.awayTactics;
      const oppCoordsList = (prevIsHome ? cur.session.awayActiveIds : cur.session.homeActiveIds)
        .map((id) => curCoords[id])
        .filter((c): c is Coord => Boolean(c));

      const homePossWeight = clamp(cur.session.homeStats.possession / 100, 0.25, 0.75);
      const teamTargetWeight = prevIsHome ? homePossWeight : 1 - homePossWeight;
      const styleKeepBonus =
        currentTactics.passingStyle === "Short"
          ? 0.05
          : currentTactics.passingStyle === "Direct"
          ? -0.05
          : 0;
      const keepProb = clamp(0.73 + (teamTargetWeight - 0.5) * 0.14 + styleKeepBonus, 0.62, 0.86);
      const keepSameTeam = currentCarrierId !== null && Math.random() < keepProb;

      let nextIsHome = prevIsHome;
      let nextCarrierId = currentCarrierId;
      let nextBallPos: Coord = { ...ballPosRef.current };
      let nextPhase: PlayPhase = playPhaseRef.current;

      if (keepSameTeam && currentCarrierId !== null) {
        const carrierPlayer = cur.playerMap.get(currentCarrierId);
        const progressNorm = prevIsHome
          ? clamp((92 - nextBallPos.y) / 84, 0, 1)
          : clamp((nextBallPos.y - 8) / 84, 0, 1);
        const dirY = prevIsHome ? -1 : 1;
        const dribbleRate =
          carrierPlayer?.roleCategory === "ATT" || carrierPlayer?.primaryPosition === "CAM"
            ? 0.42
            : carrierPlayer?.roleCategory === "MID"
            ? 0.34
            : 0.22;

        if (progressNorm < 0.85 && Math.random() < dribbleRate) {
          // Dribble progression along vertical axis: carrier drives forward or cuts inside
          const paceBoost = ((carrierPlayer?.faceStats.dribbling ?? 72) - 65) * 0.08;
          const stepY = (4.8 + Math.random() * 5.2 + Math.max(0, paceBoost)) * dirY;
          const cutCenterX =
            progressNorm > 0.6 ? (50 - nextBallPos.x) * 0.25 : Math.random() * 10 - 5;
          nextBallPos = {
            x: clamp(nextBallPos.x + cutCenterX + (Math.random() * 4 - 2), 8, 92),
            y: clamp(nextBallPos.y + stepY, 6, 94),
          };
          curCoords[currentCarrierId] = nextBallPos;
          setTrail(null);
        } else {
          // Tactical progressive pass
          const receiverId = selectPassTarget(
            prevActiveIds,
            currentCarrierId,
            prevIsHome,
            currentTactics,
            nextPhase,
            nextBallPos,
            curCoords,
            oppCoordsList,
            cur.playerMap
          );
          const receiverCoord = curCoords[receiverId] ?? nextBallPos;
          const receiverRun = activeRunsRef.current.get(receiverId);
          const leadX = receiverRun ? receiverRun.vx * 0.45 : Math.random() * 6 - 3;
          const leadY = receiverRun ? receiverRun.vy * 0.45 : dirY * (2 + Math.random() * 4);
          const targetBall: Coord = {
            x: clamp(receiverCoord.x + leadX, 7, 93),
            y: clamp(receiverCoord.y + leadY, 6, 94),
          };

          setTrail({
            x1: nextBallPos.x,
            y1: nextBallPos.y,
            x2: targetBall.x,
            y2: targetBall.y,
            kind: "pass",
          });
          nextBallPos = targetBall;
          nextCarrierId = receiverId;
        }
      } else {
        // Possession turnover: closest defender intercepts and springs build-up or counter
        nextIsHome = !prevIsHome;
        const newActiveIds = nextIsHome
          ? cur.session.homeActiveIds
          : cur.session.awayActiveIds;
        const outfield = newActiveIds.filter((id) => cur.playerMap.get(id)?.roleCategory !== "GK");
        const candidates = outfield.length > 0 ? outfield : newActiveIds;
        if (candidates.length === 0) return;

        let bestInterceptor = candidates[0];
        let bestScore = Infinity;
        for (const id of candidates) {
          const c = curCoords[id] ?? { x: 50, y: 50 };
          const p = cur.playerMap.get(id);
          const dist = Math.hypot(c.x - nextBallPos.x, c.y - nextBallPos.y);
          const roleFactor =
            p?.roleCategory === "DEF" ? 0.85 : p?.roleCategory === "MID" ? 0.92 : 1.05;
          const s = dist * roleFactor;
          if (s < bestScore) {
            bestScore = s;
            bestInterceptor = id;
          }
        }

        const interceptorCoord = curCoords[bestInterceptor] ?? nextBallPos;
        const meetBall: Coord = {
          x: clamp(nextBallPos.x * 0.35 + interceptorCoord.x * 0.65, 7, 93),
          y: clamp(nextBallPos.y * 0.35 + interceptorCoord.y * 0.65, 8, 92),
        };
        curCoords[bestInterceptor] = meetBall;
        nextBallPos = meetBall;
        nextCarrierId = bestInterceptor;
        setTrail(null);

        const newProgress = nextIsHome
          ? (92 - nextBallPos.y) / 84
          : (nextBallPos.y - 8) / 84;
        if (newProgress < 0.58) {
          counterUntilTickRef.current = tick + 6;
        }
      }

      // Compute current PlayPhase for the possession side along the vertical pitch
      const currentProgress = nextIsHome
        ? (92 - nextBallPos.y) / 84
        : (nextBallPos.y - 8) / 84;
      if (tick <= counterUntilTickRef.current && currentProgress < 0.72) {
        nextPhase = "counter";
      } else if (currentProgress < 0.36) {
        nextPhase = "build_up";
      } else if (currentProgress < 0.68) {
        nextPhase = "progression";
      } else {
        nextPhase = "final_third";
      }

      // Manage dynamic off-ball runs for attacking players
      for (const [runPlayerId, run] of activeRunsRef.current.entries()) {
        if (tick >= run.expiresAtTick) {
          activeRunsRef.current.delete(runPlayerId);
        }
      }
      const attackIds = nextIsHome ? cur.session.homeActiveIds : cur.session.awayActiveIds;
      const attackSlots = nextIsHome ? cur.homeSlots : cur.awaySlots;
      const attDirY = nextIsHome ? -1 : 1;
      const attRunners = Array.from(activeRunsRef.current.keys()).filter((id) =>
        attackIds.includes(id)
      ).length;

      if (attRunners < 3 && Math.random() < 0.55) {
        const eligible = attackIds.filter((id) => {
          const p = cur.playerMap.get(id);
          return id !== nextCarrierId && p?.roleCategory !== "GK" && !activeRunsRef.current.has(id);
        });
        if (eligible.length > 0) {
          const runnerId = eligible[Math.floor(Math.random() * eligible.length)];
          const slotIdx = slotIndexRef.current.get(runnerId) ?? 5;
          const slot = attackSlots[Math.min(slotIdx, attackSlots.length - 1)];
          const duration = 3 + Math.floor(Math.random() * 4);
          const runnerCoord = curCoords[runnerId] ?? { x: 50, y: 50 };

          let runType: RunType = "support";
          let vx = 0;
          let vy = attDirY * (6 + Math.random() * 6);

          if (isFullbackSlot(slot.label)) {
            runType = "overlap";
            vx = (runnerCoord.x < 50 ? -1 : 1) * 3;
            vy = attDirY * (10 + Math.random() * 8);
          } else if (isWingerSlot(slot.label)) {
            runType = nextPhase === "final_third" ? "cut_inside" : "in_behind";
            vx = runType === "cut_inside" ? (50 - runnerCoord.x) * 0.35 : 0;
            vy = attDirY * (9 + Math.random() * 8);
          } else if (slot.roleCategory === "ATT") {
            runType = "in_behind";
            vx = Math.random() * 12 - 6;
            vy = attDirY * (10 + Math.random() * 9);
          } else if (slot.label === "CM" || slot.label === "CAM") {
            runType = nextPhase === "final_third" || nextPhase === "counter" ? "box_crash" : "support";
            vx = (nextBallPos.x - runnerCoord.x) * 0.2;
            vy = runType === "box_crash" ? attDirY * (11 + Math.random() * 7) : attDirY * 5;
          }

          activeRunsRef.current.set(runnerId, {
            vx,
            vy,
            expiresAtTick: tick + duration,
            runType,
          });
        }
      }

      const nextClubId = nextIsHome ? cur.homeClubId : cur.awayClubId;
      const homeTargets = computeTeamTargets(
        cur.session.homeActiveIds,
        cur.homeSlots,
        slotIndexRef.current,
        cur.playerMap,
        true,
        cur.homeTactics,
        nextBallPos,
        nextIsHome,
        nextPhase,
        activeRunsRef.current,
        nextCarrierId
      );
      const awayTargets = computeTeamTargets(
        cur.session.awayActiveIds,
        cur.awaySlots,
        slotIndexRef.current,
        cur.playerMap,
        false,
        cur.awayTactics,
        nextBallPos,
        !nextIsHome,
        nextPhase,
        activeRunsRef.current,
        nextCarrierId
      );

      // Smoothly move each player toward their dynamic tactical target based on pace & stamina
      const nextCoords: Record<number, Coord> = {};
      const stepPlayers = (ids: number[], targetMap: Map<number, Coord>) => {
        for (const id of ids) {
          const target = targetMap.get(id);
          if (!target) continue;
          const prev = curCoords[id] ?? target;
          const player = cur.playerMap.get(id);
          const pace = player?.faceStats.pace ?? 72;
          const stam = cur.session.playerStamina[id] ?? player?.stamina ?? 85;
          const counterMult = nextPhase === "counter" ? 1.2 : 1.0;
          const activeRunBonus = activeRunsRef.current.has(id) ? 1.25 : 1.0;
          const maxStep =
            (3.4 + (pace / 100) * 2.2) * (0.72 + 0.28 * (stam / 100)) * counterMult * activeRunBonus;

          const dx = target.x - prev.x;
          const dy = target.y - prev.y;
          const dist = Math.hypot(dx, dy);

          if (id === nextCarrierId && player?.roleCategory !== "GK") {
            nextCoords[id] = nextBallPos;
          } else if (dist <= maxStep || dist < 0.01) {
            nextCoords[id] = target;
          } else {
            nextCoords[id] = {
              x: clamp(prev.x + (dx / dist) * maxStep, 4.5, 95.5),
              y: clamp(prev.y + (dy / dist) * maxStep, 6, 94),
            };
          }
        }
      };

      stepPlayers(cur.session.homeActiveIds, homeTargets);
      stepPlayers(cur.session.awayActiveIds, awayTargets);

      setBallPos(nextBallPos);
      setCarrierId(nextCarrierId);
      setCarrierClubId(nextClubId);
      setPlayPhase(nextPhase);
      setLiveCoords(nextCoords);
    }, 220);

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
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      {/* Pitch Header Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-bold text-white">
            <span
              className="h-3 w-3 rounded-full ring-1 ring-white/40"
              style={{ backgroundColor: awayKitColors.primary }}
            />
            ▲ {awayClub.shortName} ({awayTactics.formation})
          </span>
          <span className="text-slate-600">vs</span>
          <span className="inline-flex items-center gap-1.5 font-bold text-white">
            ▼ {homeClub.shortName} ({homeTactics.formation})
            <span
              className="h-3 w-3 rounded-full ring-1 ring-white/40"
              style={{ backgroundColor: homeKitColors.primary }}
            />
          </span>
          {session.finished ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
              <Star className="h-3 w-3 text-amber-400" />
              Fim de Jogo • Formação Inicial & Notas
            </span>
          ) : carrierPlayer ? (
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
              <span className="text-slate-500">•</span>
              <span
                className={`font-bold ${
                  playPhase === "final_third"
                    ? "text-amber-300"
                    : playPhase === "counter"
                    ? "text-rose-300"
                    : "text-emerald-300"
                }`}
              >
                {PLAY_PHASE_LABELS[playPhase]}
              </span>
            </span>
          ) : null}
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

      {/* Vertical 2D Pitch */}
      <div
        className="relative aspect-[3/4] w-full max-w-xl mx-auto overflow-hidden rounded-xl border-2 border-emerald-800 select-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, #064e3b 0%, #064e3b 8.333%, #065f46 8.333%, #065f46 16.666%)",
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
            x="4"
            y="3"
            width="92"
            height="94"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          {/* Halfway line & center circle */}
          <line
            x1="4"
            y1="50"
            x2="96"
            y2="50"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <circle
            cx="50"
            cy="50"
            r="11"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.45)" />

          {/* Top Penalty Box & Goal Box (Away side defending top) */}
          <rect
            x="22"
            y="3"
            width="56"
            height="15"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <rect
            x="36"
            y="3"
            width="28"
            height="5.5"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <circle cx="50" cy="11.5" r="0.6" fill="rgba(255,255,255,0.45)" />
          <path
            d="M 40 18 A 9 9 0 0 0 60 18"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          {/* Top Goal Net */}
          <rect
            x="42"
            y="0.6"
            width="16"
            height="2.4"
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="0.5"
          />

          {/* Bottom Penalty Box & Goal Box (Home side defending bottom) */}
          <rect
            x="22"
            y="82"
            width="56"
            height="15"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <rect
            x="36"
            y="91.5"
            width="28"
            height="5.5"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <circle cx="50" cy="88.5" r="0.6" fill="rgba(255,255,255,0.45)" />
          <path
            d="M 40 82 A 9 9 0 0 1 60 82"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          {/* Bottom Goal Net */}
          <rect
            x="42"
            y="97"
            width="16"
            height="2.4"
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="0.5"
          />

          {/* Corner Arcs */}
          <path
            d="M 4 5 A 2 2 0 0 0 6 3"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <path
            d="M 94 3 A 2 2 0 0 0 96 5"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <path
            d="M 4 95 A 2 2 0 0 0 6 97"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />
          <path
            d="M 94 97 A 2 2 0 0 0 96 95"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.5"
          />

          {/* Pass / Shot Trajectory */}
          {!session.finished && trail && (
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
        {banner &&
          (banner.tone === "goal" ? (
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55">
              <div className="w-full max-w-md overflow-hidden rounded-md border-2 border-amber-400 bg-slate-950 text-center">
                <div
                  className="h-2 w-full"
                  style={{ backgroundColor: banner.clubColor ?? "#fbbf24" }}
                />
                <div className="px-6 py-5 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-300">
                    {banner.clubName} • {banner.minute}'
                  </div>

                  <h1 className="font-h1 text-4xl sm:text-5xl tracking-wider text-amber-400">
                    GOOOOL!
                  </h1>

                  <div className="space-y-2 border-t border-slate-800 pt-3 text-left">
                    {/* Scorer Row */}
                    <div className="flex items-center justify-between gap-3 rounded border border-emerald-500/40 bg-emerald-500/15 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                          ⚽ GOL
                        </span>
                        {banner.scorerShirt !== undefined && (
                          <span className="shrink-0 text-xs font-black text-amber-300">
                            #{banner.scorerShirt}
                          </span>
                        )}
                        <span className="truncate text-sm font-black text-white">
                          {banner.scorerName}
                        </span>
                      </div>
                      {banner.scorerRating && (
                        <span className="shrink-0 rounded border border-emerald-400/50 bg-slate-900 px-2 py-0.5 text-xs font-black text-emerald-300">
                          Nota {banner.scorerRating}
                        </span>
                      )}
                    </div>

                    {/* Assister Row */}
                    <div className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900 px-3 py-2">
                      {banner.assistName ? (
                        <>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                              👟 ASSIST
                            </span>
                            {banner.assistShirt !== undefined && (
                              <span className="shrink-0 text-xs font-black text-sky-300">
                                #{banner.assistShirt}
                              </span>
                            )}
                            <span className="truncate text-xs font-bold text-slate-100">
                              {banner.assistName}
                            </span>
                          </div>
                          {banner.assistRating && (
                            <span className="shrink-0 rounded border border-sky-400/40 bg-slate-950 px-2 py-0.5 text-xs font-black text-sky-300">
                              Nota {banner.assistRating}
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="flex w-full items-center justify-center text-[11px] font-semibold text-slate-400">
                          Jogada Individual (sem assistência)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
              <div
                className={`rounded-md px-4 py-1.5 text-xs font-black tracking-wide border-2 ${
                  banner.tone === "save"
                    ? "bg-sky-500 text-white border-sky-200"
                    : banner.tone === "chance"
                    ? "bg-emerald-500 text-slate-950 border-emerald-200"
                    : "bg-rose-500 text-white border-rose-200"
                }`}
              >
                {banner.text}
              </div>
            </div>
          ))}

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
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-200 ease-linear ${
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
                    number={player.shirtNumber ?? info.label.slice(0, 2)}
                  />
                  {hasYellow && (
                    <span className="absolute -left-0.5 -top-0.5 h-2.5 w-1.5 rounded-[1px] bg-amber-400 ring-1 ring-black/60" />
                  )}
                  {isInjured && (
                    <span className="absolute -left-1.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-600 text-[9px] font-black text-white ring-1 ring-white">
                      +
                    </span>
                  )}
                  {(showRatings || session.finished) && (
                    <span
                      className={`absolute -right-1.5 -top-1 rounded px-1 text-[8px] font-black ${
                        session.finished
                          ? "bg-amber-400 text-slate-950 ring-1 ring-black/60"
                          : "bg-slate-950/95 text-amber-300 ring-1 ring-white/15"
                      }`}
                    >
                      {rating}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className={`relative flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[9px] font-black transition ${
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
                  {player.shirtNumber ?? info.label.slice(0, 2)}

                  {hasYellow && (
                    <span className="absolute -left-1 -top-1 h-2.5 w-1.5 rounded-[1px] bg-amber-400 ring-1 ring-black/60" />
                  )}
                  {isInjured && (
                    <span className="absolute -left-1 -bottom-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-600 text-[9px] font-black text-white ring-1 ring-white">
                      +
                    </span>
                  )}

                  {(showRatings || session.finished) && (
                    <span
                      className={`absolute -right-2 -top-1.5 rounded px-1 text-[8px] font-black ${
                        session.finished
                          ? "bg-amber-400 text-slate-950 ring-1 ring-black/60"
                          : "bg-slate-950/90 text-amber-300 ring-1 ring-white/15"
                      }`}
                    >
                      {rating}
                    </span>
                  )}
                </div>
              )}

              {/* Name & Stamina pill */}
              {showNames && (
                <div className="mt-0.5 flex flex-col items-center">
                  <span className="max-w-[66px] truncate rounded bg-slate-950/90 px-1 text-[9px] font-semibold leading-tight text-white">
                    {surname}
                  </span>
                  {!session.finished && (
                    <div className="mt-0.5 h-0.5 w-6 overflow-hidden rounded-full bg-slate-900">
                      <div
                        className={`h-full ${getStaminaColor(stamina)}`}
                        style={{ width: `${stamina}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}

        {/* Animated Ball */}
        {!session.finished && (
          <div
            style={{ left: `${ballPos.x}%`, top: `${ballPos.y}%` }}
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out"
          >
            <div className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full bg-white border-2 border-slate-950" />
          </div>
        )}
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
