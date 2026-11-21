import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Shirt,
  Star,
  Flag,
  Award,
  Footprints,
  Activity,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Plus,
  Users,
  Coins,
  Sparkles,
  Clock,
  Pause,
  Play,
  CheckCircle2,
} from "lucide-react";
import type { Club, MatchEvent, Player, Tactics } from "../types/game";
import type { LiveMatchSession } from "../engine/matchEngine";
import {
  formatMoney,
  getFormationSlots,
  getPlayerDisplayName,
  getStaminaColor,
  type FormationSlot,
} from "../utils/format";
import { getClubVisuals } from "../utils/clubVisuals";
import { ClubKit } from "./ClubKit";

export type PitchSize = "normal" | "large" | "full";

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
  speedMs?: number;
  simPauseRef?: React.MutableRefObject<number>;
  subOutId: number | null;
  onSelectSubOut: (playerId: number) => void;
  pitchSize?: PitchSize;
  onPitchSizeChange?: (size: PitchSize) => void;
  isHalftime?: boolean;
  onStartSecondHalf?: () => void;
  onFinishMatch?: () => void;
}

const ACTION_EVERY = 4; // pitch ticks per ball action (pass / dribble / turnover)

interface OffsideMark {
  lineY: number;
  offenderId: number;
  attackingHome: boolean;
  disallowedGoal: boolean;
}

function computeOffsideLineY(
  defIds: number[],
  coords: Record<number, Coord>,
  defendingIsHome: boolean
): number | null {
  const ys = defIds
    .map((id) => coords[id]?.y)
    .filter((y): y is number => typeof y === "number");
  if (ys.length < 2) return null;
  if (defendingIsHome) {
    ys.sort((a, b) => b - a);
    return Math.max(ys[1], 50);
  }
  ys.sort((a, b) => a - b);
  return Math.min(ys[1], 50);
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
  kind: "pass" | "shot" | "goal" | "cross" | "header";
  isAerial: boolean;
  maxAltitude: number;
  curveX: number;
  curveY: number;
}

interface BallVisualState {
  x: number;
  y: number;
  altitude: number; // 0 = ground, 1 = max aerial flight
  isAerial: boolean;
}

interface ActiveCardHighlight {
  playerId: number;
  playerName: string;
  type: "yellow_card" | "red_card" | "injury";
  minute: number;
}

interface ActiveSubHighlight {
  playerInId: number;
  playerInName: string;
  playerOutName?: string;
  minute: number;
}

const PLAY_PHASE_LABELS: Record<PlayPhase, string> = {
  build_up: "Construção",
  progression: "Progressão",
  final_third: "Ataque Final",
  counter: "Contra-Ataque",
};

interface EventBanner {
  text: string;
  tone:
    | "goal"
    | "woodwork"
    | "save"
    | "chance"
    | "corner"
    | "substitution"
    | "yellow_card"
    | "red_card"
    | "injury"
    | "offside"
    | "stoppage"
    | "halftime";
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

function computeTrajectoryCurve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  forceAerial: boolean,
  kind: "pass" | "shot" | "goal" | "cross" | "header"
): { curveX: number; curveY: number; isAerial: boolean; maxAltitude: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);

  if (dist < 1.5) {
    return { curveX: mx, curveY: my, isAerial: false, maxAltitude: 0 };
  }

  // Perpendicular normal vector
  const nx = -dy / dist;
  const ny = dx / dist;

  // Crosses from the wing, long passes, aerial shots
  const isCross =
    kind === "cross" ||
    (Math.abs(x1 - 50) > 22 && Math.abs(x2 - 50) < 22 && dist > 18);
  const isLongBall = dist > 26;
  const isHighShot =
    (kind === "shot" || kind === "goal") && (dist > 18 || Math.random() < 0.45);
  const isAerial =
    forceAerial || isCross || isLongBall || isHighShot || kind === "header";

  let maxAltitude = 0;
  if (isAerial) {
    if (isCross) maxAltitude = 0.88;
    else if (isLongBall) maxAltitude = 0.76;
    else if (isHighShot) maxAltitude = 0.58;
    else maxAltitude = 0.65;
  }

  // Curve direction:
  // For crosses from the flank, curve inward towards goal center
  let curveDir = 1;
  if (isCross) {
    curveDir = x1 < 50 ? 1 : -1;
  } else {
    curveDir = (Math.round(x1 + y1 * 3) % 2 === 0 ? 1 : -1);
  }

  // Curve intensity (magnitude)
  const curveMagnitude = isAerial
    ? clamp(dist * 0.14, 3.2, 10.5) * curveDir
    : clamp(dist * 0.05, 1.2, 4.2) * curveDir;

  const curveX = clamp(mx + nx * curveMagnitude, 5, 95);
  const curveY = clamp(my + ny * curveMagnitude, 4, 96);

  return { curveX, curveY, isAerial, maxAltitude };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface SofascoreRatingStyle {
  bg: string;
  text: string;
  border: string;
  glow?: string;
}

export function getSofascoreRatingColor(rating: number): SofascoreRatingStyle {
  if (rating >= 9.0) {
    return { bg: "#2563eb", text: "#ffffff", border: "#60a5fa", glow: "rgba(37,99,235,0.4)" };
  }
  if (rating >= 8.0) {
    return { bg: "#0284c7", text: "#ffffff", border: "#38bdf8", glow: "rgba(2,132,199,0.4)" };
  }
  if (rating >= 7.0) {
    return { bg: "#16a34a", text: "#ffffff", border: "#4ade80", glow: "rgba(22,163,74,0.4)" };
  }
  if (rating >= 6.5) {
    return { bg: "#d97706", text: "#ffffff", border: "#fbbf24", glow: "rgba(217,119,6,0.4)" };
  }
  if (rating >= 6.0) {
    return { bg: "#ea580c", text: "#ffffff", border: "#fb923c", glow: "rgba(234,88,12,0.4)" };
  }
  return { bg: "#dc2626", text: "#ffffff", border: "#f87171", glow: "rgba(220,38,38,0.4)" };
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
    tactics.mentality === "Attacking" ? 4.0 : tactics.mentality === "Defensive" ? -4.0 : 0;
  const pressShift =
    tactics.pressing === "High" ? 2.0 : tactics.pressing === "Low" ? -2.0 : 0;
  const counterBoost = playPhase === "counter" ? 4.5 : 0;

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
    // CBs maintain their left/right/center lane while stepping up cleanly behind the ball
    const baseOffset = localBallY > 55 ? 14 : 23;
    const attY = clamp(
      localBallY + baseOffset - mentalityShift * 0.55 - pressShift * 0.45,
      48,
      88
    );
    const spreadX = localBallY > 58 ? sideSign * 3.5 : 0;
    const flankX = clamp(baseX + (localBallX - 50) * 0.12 + spreadX, 18, 82);
    return { x: flankX, y: attY };
  }

  if (isFullbackSlot(label)) {
    const isWingback = label === "LWB" || label === "RWB";
    let attY: number;
    if (ballOnMyFlank) {
      const advance = isWingback ? 8 : 4;
      attY = clamp(
        localBallY - advance - mentalityShift * 0.8 - counterBoost * 0.4,
        18,
        82
      );
    } else {
      // Weak-side fullback stays behind the ball for rest defense
      attY = clamp(localBallY + 10 - mentalityShift * 0.4, 34, 86);
    }
    const wideBias = ballOnMyFlank ? sideSign * 4 : -sideSign * 1.5;
    const flankX = clamp(baseX + wideBias, 8, 92);
    return { x: flankX, y: attY };
  }

  if (label === "CDM") {
    // Anchors strictly BEHIND the ball as the pivot to recycle play, preserving left/right pivot lane
    const anchorY = clamp(localBallY + 9 - mentalityShift * 0.4, 28, 78);
    const flankX = clamp(baseX + (localBallX - 50) * 0.16, 20, 80);
    return { x: flankX, y: anchorY };
  }

  if (label === "CM" || label === "CAM") {
    const isCam = label === "CAM" || player?.primaryPosition === "CAM";
    let attY: number;
    if (isCam) {
      // CAM plays in the hole between opponent midfield and defense
      if (localBallY > 60) {
        attY = clamp(localBallY - 12 - mentalityShift * 0.6, 44, 65);
      } else if (localBallY > 30) {
        attY = clamp(localBallY - 9 - mentalityShift * 0.8 - counterBoost * 0.5, 20, 50);
      } else {
        attY = clamp(18 - mentalityShift * 0.5, 14, 26);
      }
    } else {
      // CM: ball-side CM steps up to support/arrive in box, far-side CM balances the midfield line
      if (ballOnMyFlank && (attackProgress > 0.52 || playPhase === "counter")) {
        attY = clamp(localBallY - 6 - mentalityShift * 0.6, 18, 62);
      } else {
        attY = clamp(localBallY + 2 - mentalityShift * 0.5, 25, 74);
      }
    }
    const flankX = clamp(baseX + (localBallX - 50) * 0.16, 16, 84);
    return { x: flankX, y: attY };
  }

  if (isWingerSlot(label)) {
    let attY: number;
    if (localBallY > 60) {
      // Deep build-up: wingers drop to offer diagonal passing outlets
      attY = clamp(localBallY - 12 - mentalityShift * 0.6, 38, 65);
    } else if (localBallY > 32) {
      // Progression: stay 8 to 12 units ahead of ball
      attY = clamp(localBallY - 10 - mentalityShift * 0.8 - counterBoost, 18, 48);
    } else {
      // Final third: ball-side attacks byline, weak-side attacks far post
      attY = ballOnMyFlank
        ? clamp(localBallY - 4, 7.5, 22)
        : clamp(localBallY - 5, 6.5, 16);
    }

    const cutInFactor = !ballOnMyFlank && attackProgress > 0.48 ? 0.45 : 0.06;
    const stretchX = ballOnMyFlank ? sideSign * 3.5 : 0;
    const flankX = clamp(baseX * (1 - cutInFactor) + (50 - sideSign * 16) * cutInFactor + stretchX, 8, 92);
    return { x: flankX, y: attY };
  }

  // Striker (ST / CF):
  // Preserves horizontal spacing in 2-striker setups (e.g. 4-4-2 / 3-5-2) while attacking the box
  const isTwoStrikerSide = Math.abs(baseX - 50) > 5;
  const stLaneOffset = isTwoStrikerSide ? (baseX - 50) * 0.78 : 0;
  let attY: number;
  let flankX: number;
  if (localBallY > 65) {
    attY = clamp(localBallY - 16 + (tactics.passingStyle === "Short" ? 4 : 0), 46, 60);
    flankX = clamp(50 + stLaneOffset + (localBallX - 50) * 0.16, 24, 76);
  } else if (localBallY > 38) {
    const lead = tactics.passingStyle === "Direct" ? 14 : tactics.passingStyle === "Short" ? 9 : 12;
    attY = clamp(localBallY - lead - mentalityShift * 0.6 - counterBoost * 0.6, 20, 46);
    flankX = clamp(50 + stLaneOffset + (localBallX - 50) * 0.18, 24, 76);
  } else if (localBallY > 22) {
    const staggerY = isTwoStrikerSide ? (ballOnMyFlank ? -1.5 : 1.5) : 0;
    attY = clamp(localBallY - 8 - mentalityShift * 0.6 + staggerY, 8, 24);
    flankX = clamp(50 + stLaneOffset * 0.88 + (localBallX - 50) * 0.18, 26, 74);
  } else {
    // Inside the penalty box: stagger near post vs penalty spot in 2-striker formations
    const staggerY = isTwoStrikerSide ? (ballOnMyFlank ? -1.8 : 1.8) : 0;
    attY = clamp(localBallY - 5 + staggerY, 6, 15);
    flankX = clamp(50 + stLaneOffset * 0.82 + (localBallX - 50) * 0.16, 28, 72);
  }

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
    tactics.pressing === "High" ? -6 : tactics.pressing === "Low" ? 6 : 0;
  const mentBias =
    tactics.mentality === "Attacking" ? -4 : tactics.mentality === "Defensive" ? 5 : 0;
  const counterRetreat = isCounter ? 5 : 0;

  // In local coords: 100 = own goal, 0 = opponent goal.
  // Defenders (depthNorm ~0.22) sit on the backline closest to own goal (100).
  // Midfielders (depthNorm ~0.50) sit 10-13 units ahead of the backline.
  // Attackers (depthNorm ~0.92) sit 22-27 units ahead of the backline toward halfway line.
  const depthNorm = clamp((92 - slot.y) / 80, 0.18, 0.95);
  const roleForwardOffset = clamp((depthNorm - 0.21) / 0.72, 0, 1);

  const backlineY = clamp(
    Math.max(localBallY + 7, 60 + localBallY * 0.28 + pressBias + mentBias + counterRetreat),
    55,
    89
  );
  const blockSpan = tactics.pressing === "Low" ? 21 : tactics.pressing === "High" ? 28 : 24;

  const attY = clamp(backlineY - roleForwardOffset * blockSpan, 30, 89.5);
  // Subtle zonal lateral shift toward ball side while keeping horizontal formation lanes intact
  const shiftFactor = slot.label === "CB" ? 0.12 : 0.16;
  const flankX = clamp(baseX + (localBallX - 50) * shiftFactor, 9, 91);
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
  const minSep = 7.4;
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

  const ballProgress = isHome
    ? clamp((92 - ballPos.y) / 84, 0, 1)
    : clamp((ballPos.y - 8) / 84, 0, 1);
  const isFinalThird = ballProgress >= 0.70 || playPhase === "final_third";

  const scored = pool.map((id) => {
    const pos = coords[id] ?? { x: ballPos.x, y: ballPos.y };
    const dist = Math.hypot(pos.x - ballPos.x, pos.y - ballPos.y);
    const progress = (pos.y - ballPos.y) * dirY;
    const p = playerMap.get(id);
    const isGk = p?.roleCategory === "GK";
    const isForward = p?.roleCategory === "ATT" || p?.primaryPosition === "CAM";
    const inBox = isHome ? pos.y <= 24 : pos.y >= 76;

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
      if (isForward) score += 1.6;
    } else {
      score += progress > 3 ? 2.1 : progress > -4 ? 1.1 : 0.45;
      score += dist >= 10 && dist <= 38 ? 1.2 : 0.4;
    }

    if (playPhase === "counter" && progress > 10) {
      score *= 1.9;
    }

    // FINAL THIRD AGGRESSION:
    // Strikers and wingers in the box are prioritized for decisive finishes and crosses!
    if (isFinalThird) {
      if (isForward) score += 4.5;
      if (inBox) score += 4.0;

      // Crossing opportunity: Ball is on flank and target is central in the box
      const ballWide = Math.abs(ballPos.x - 50) > 17;
      const receiverCentral = Math.abs(pos.x - 50) < 22;
      if (ballWide && receiverCentral && inBox) {
        score += 5.5; // High priority driven cross or far-post delivery
      }

      // Suppress backward recycling passes when in the attacking danger area
      if (progress < -7) {
        const isDefenderOrCdm = p?.roleCategory === "DEF" || p?.primaryPosition === "CDM";
        if (isDefenderOrCdm) {
          score *= 0.12; // Do NOT pass backwards 30m when attacking the goal!
        } else if ((p?.primaryPosition === "CAM" || p?.primaryPosition === "CM") && dist < 18) {
          score += 2.2; // Cutback to the edge of the box for a shot is a great option
        } else {
          score *= 0.35;
        }
      }
    }

    // In the box, attackers are naturally marked closely: do not heavily penalize them!
    const markingMult =
      isFinalThird && isForward
        ? clamp(0.9 + minOppDist / 30, 0.85, 1.35)
        : clamp(0.55 + minOppDist / 18, 0.45, 1.65);
    score *= markingMult;
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
  awayTactics: Tactics,
  forceNeutral = false
): Record<number, Coord> {
  const seed: Record<number, Coord> = {};
  homeIds.forEach((id, idx) => {
    const slot = homeSlots[Math.min(slotIndexMap.get(id) ?? idx, homeSlots.length - 1)];
    seed[id] = getBaseVerticalCoord(slot.x, slot.y, true, homeTactics, forceNeutral);
  });
  awayIds.forEach((id, idx) => {
    const slot = awaySlots[Math.min(slotIndexMap.get(id) ?? idx, awaySlots.length - 1)];
    seed[id] = getBaseVerticalCoord(slot.x, slot.y, false, awayTactics, forceNeutral);
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
  speedMs = 1200,
  simPauseRef,
  subOutId,
  onSelectSubOut,
  pitchSize: propPitchSize,
  onPitchSizeChange,
  isHalftime = false,
  onStartSecondHalf,
  onFinishMatch,
}) => {
  const [pitchSizeState, setPitchSizeState] = useState<PitchSize>(() => {
    try {
      const saved = localStorage.getItem("fm_pitch_size") as PitchSize;
      if (saved === "normal" || saved === "large" || saved === "full") return saved;
    } catch {}
    return "large";
  });

  const activePitchSize = propPitchSize ?? pitchSizeState;

  const handlePitchSizeChange = (nextSize: PitchSize) => {
    setPitchSizeState(nextSize);
    try {
      localStorage.setItem("fm_pitch_size", nextSize);
    } catch {}
    onPitchSizeChange?.(nextSize);
  };

  const [showOffsideLine, setShowOffsideLine] = useState(true);
  const [offsideMark, setOffsideMark] = useState<OffsideMark | null>(null);
  const [showNames, setShowNames] = useState(true);
  const [showRatings, setShowRatings] = useState(true);
  const [showKits, setShowKits] = useState(true);

  // Sofascore Player of the Match (MOTM - Highest rating >= 7.0), Goals per player & Subbed-in tracker
  const { topRatedPlayerId, playerGoalsMap, subbedInMap } = useMemo(() => {
    let highestRating = 0;
    let topId: number | null = null;
    const goalsMap = new Map<number, number>();
    const subsMap = new Map<number, { minute: number; outName?: string }>();

    for (const ev of session.events) {
      if (ev.type === "goal" && !ev.disallowedGoal && ev.playerId) {
        goalsMap.set(ev.playerId, (goalsMap.get(ev.playerId) ?? 0) + 1);
      } else if (ev.type === "substitution" && ev.playerId) {
        subsMap.set(ev.playerId, { minute: ev.minute, outName: ev.assistPlayerName });
      }
    }

    for (const [pid, rating] of Object.entries(session.playerRatings)) {
      const numPid = Number(pid);
      if (rating > highestRating) {
        highestRating = rating;
        topId = numPid;
      }
    }

    return {
      topRatedPlayerId: highestRating >= 7.0 ? topId : null,
      playerGoalsMap: goalsMap,
      subbedInMap: subsMap,
    };
  }, [session.events, session.playerRatings]);

  const [ballPos, setBallPos] = useState<Coord>({ x: 50, y: 50 });
  const [ballVisual, setBallVisual] = useState<BallVisualState>({
    x: 50,
    y: 50,
    altitude: 0,
    isAerial: false,
  });
  const [cardHighlight, setCardHighlight] = useState<ActiveCardHighlight | null>(null);
  const [subHighlight, setSubHighlight] = useState<ActiveSubHighlight | null>(null);
  const flightRafRef = useRef<number | null>(null);

  const triggerBallFlight = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    isAerial: boolean,
    maxAltitude: number,
    durationMs: number
  ) => {
    if (flightRafRef.current !== null) {
      cancelAnimationFrame(flightRafRef.current);
      flightRafRef.current = null;
    }

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = clamp(elapsed / durationMs, 0, 1);

      // Quadratic Bézier curve formula: B(t) = (1-t)^2 * P0 + 2*(1-t)*t * P1 + t^2 * P2
      const t = progress;
      const u = 1 - t;
      const bx = u * u * x1 + 2 * u * t * cx + t * t * x2;
      const by = u * u * y1 + 2 * u * t * cy + t * t * y2;
      const alt = isAerial ? Math.sin(t * Math.PI) * maxAltitude : 0;

      setBallVisual({ x: bx, y: by, altitude: alt, isAerial });

      if (progress < 1) {
        flightRafRef.current = requestAnimationFrame(step);
      } else {
        flightRafRef.current = null;
        setBallVisual({ x: x2, y: y2, altitude: 0, isAerial: false });
      }
    };

    flightRafRef.current = requestAnimationFrame(step);
  };

  // Clean up flight animation on unmount
  useEffect(() => {
    return () => {
      if (flightRafRef.current !== null) {
        cancelAnimationFrame(flightRafRef.current);
      }
    };
  }, []);

  const [carrierId, setCarrierId] = useState<number | null>(null);
  const [carrierClubId, setCarrierClubId] = useState<number>(homeClub.id);
  const [playPhase, setPlayPhase] = useState<PlayPhase>("build_up");
  const [trail, setTrail] = useState<PitchTrail | null>(null);
  const [banner, setBanner] = useState<EventBanner | null>(null);
  const [woodworkImpact, setWoodworkImpact] = useState<{
    x: number;
    y: number;
    kind: "post" | "crossbar";
  } | null>(null);

  useEffect(() => {
    if (!woodworkImpact) return;
    const t = window.setTimeout(() => setWoodworkImpact(null), 1650);
    return () => window.clearTimeout(t);
  }, [woodworkImpact]);

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

  // Reset coordinates cleanly at kickoff (minute 0) or Halftime break / second half restart
  useEffect(() => {
    if (!isPlaying && (session.minute === 0 || isHalftime)) {
      const seed = buildFormationSeedCoords(
        session.homeActiveIds,
        session.awayActiveIds,
        homeSlots,
        awaySlots,
        slotIndexRef.current,
        homeTactics,
        awayTactics
      );

      // In 1st half: home striker kicks off at (50, 50.5)
      // In 2nd half / Halftime: away striker kicks off at (50, 49.5)
      if (isHalftime) {
        const awayStrikerId = session.awayActiveIds[session.awayActiveIds.length - 1] ?? session.awayActiveIds[0];
        if (awayStrikerId) {
          seed[awayStrikerId] = { x: 50, y: 49.5 };
        }
        const homeStrikerId = session.homeActiveIds[session.homeActiveIds.length - 1] ?? session.homeActiveIds[0];
        if (homeStrikerId) {
          seed[homeStrikerId] = { x: 50, y: 52 };
        }
        if (awayStrikerId) {
          setCarrierId(awayStrikerId);
          setCarrierClubId(awayClub.id);
        }
      } else {
        const homeStrikerId = session.homeActiveIds[session.homeActiveIds.length - 1] ?? session.homeActiveIds[0];
        if (homeStrikerId) {
          seed[homeStrikerId] = { x: 50, y: 50.5 };
          setCarrierId(homeStrikerId);
          setCarrierClubId(homeClub.id);
        }
      }

      setLiveCoords(seed);
      liveCoordsRef.current = seed;
      setBallPos({ x: 50, y: 50 });
      ballPosRef.current = { x: 50, y: 50 };
      setBallVisual({ x: 50, y: 50, altitude: 0, isAerial: false });
      setTrail(null);
      setOffsideMark(null);
      setPlayPhase("build_up");

      if (isHalftime) {
        setBanner({
          text: "INTERVALO",
          tone: "halftime",
          minute: session.minute > 45 ? 45 : session.minute,
          clubName: "Fim do 1º Tempo",
          scorerName: `${homeClub.shortName} ${session.homeGoals} x ${session.awayGoals} ${awayClub.shortName}`,
        });
      }
    }
  }, [
    session.fixtureId,
    homeTactics.formation,
    awayTactics.formation,
    isPlaying,
    session.minute,
    isHalftime,
    session.homeActiveIds,
    session.awayActiveIds,
    homeSlots,
    awaySlots,
    homeTactics,
    awayTactics,
    homeClub.id,
    awayClub.id,
    homeClub.shortName,
    awayClub.shortName,
    session.homeGoals,
    session.awayGoals,
  ]);

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
  const lastHandledEventCountRef = useRef<number>(0);
  const pendingKickoffHomeRef = useRef<boolean | null>(null);
  const kickoffTimeoutRef = useRef<number | null>(null);
  const highlightPauseUntilRef = useRef<number>(0);
  const speedRef = useRef<number>(speedMs);
  speedRef.current = speedMs;
  const setHighlightPause = (baseMs: number, minMs = 500) => {
    const scale = clamp(speedRef.current / 1200, 0.4, 1.4);
    const until = Date.now() + Math.max(minMs, Math.round(baseMs * scale));
    highlightPauseUntilRef.current = until;
    if (simPauseRef) simPauseRef.current = until;
  };
  const pitchTickMs = clamp(Math.round((speedMs * 0.7) / ACTION_EVERY), 65, 225);
  const ballPosRef = useRef<Coord>(ballPos);
  const carrierIdRef = useRef<number | null>(carrierId);
  const carrierClubIdRef = useRef<number>(carrierClubId);
  const lastPasserIdRef = useRef<number | null>(null);
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

  // Reset all 22 players to their neutral halves and place the ball at the center circle (50, 50) for kickoff
  const resetToCenterKickoff = (kickoffIsHome: boolean) => {
    if (flightRafRef.current !== null) {
      cancelAnimationFrame(flightRafRef.current);
      flightRafRef.current = null;
    }
    const cur = latestSimRef.current;
    const seed = buildFormationSeedCoords(
      cur.session.homeActiveIds,
      cur.session.awayActiveIds,
      cur.homeSlots,
      cur.awaySlots,
      slotIndexRef.current,
      cur.homeTactics,
      cur.awayTactics,
      true
    );

    const koIds = kickoffIsHome ? cur.session.homeActiveIds : cur.session.awayActiveIds;
    const oppIds = kickoffIsHome ? cur.session.awayActiveIds : cur.session.homeActiveIds;
    const koOutfield = koIds.filter((id) => cur.playerMap.get(id)?.roleCategory !== "GK");
    const koForwards = koOutfield.filter((id) => cur.playerMap.get(id)?.roleCategory === "ATT");
    const kickoffTakerId =
      koForwards[0] ?? koOutfield[koOutfield.length - 1] ?? koIds[koIds.length - 1] ?? null;
    const kickoffSupportId =
      koForwards[1] ??
      koOutfield.find((id) => id !== kickoffTakerId && cur.playerMap.get(id)?.roleCategory === "MID") ??
      koOutfield.find((id) => id !== kickoffTakerId) ??
      null;

    if (kickoffTakerId !== null) {
      seed[kickoffTakerId] = { x: 50, y: kickoffIsHome ? 50.4 : 49.6 };
    }
    if (kickoffSupportId !== null) {
      seed[kickoffSupportId] = { x: 43.5, y: kickoffIsHome ? 52.5 : 47.5 };
    }

    const oppForwardId =
      oppIds.filter((id) => cur.playerMap.get(id)?.roleCategory === "ATT")[0] ??
      oppIds[oppIds.length - 1];
    if (oppForwardId) {
      seed[oppForwardId] = { x: 50, y: kickoffIsHome ? 41.5 : 58.5 };
    }

    activeRunsRef.current.clear();
    counterUntilTickRef.current = 0;

    const kickoffClubId = kickoffIsHome ? cur.homeClubId : cur.awayClubId;
    setLiveCoords(seed);
    liveCoordsRef.current = seed;
    setBallPos({ x: 50, y: 50 });
    ballPosRef.current = { x: 50, y: 50 };
    setBallVisual({ x: 50, y: 50, altitude: 0, isAerial: false });
    setTrail(null);
    setOffsideMark(null);
    setPlayPhase("build_up");
    playPhaseRef.current = "build_up";
    if (kickoffTakerId !== null) {
      setCarrierId(kickoffTakerId);
      carrierIdRef.current = kickoffTakerId;
    }
    setCarrierClubId(kickoffClubId);
    carrierClubIdRef.current = kickoffClubId;
  };

  // React immediately to real match events (goal, save, chance, cards) with area choreography
  useEffect(() => {
    if (session.events.length === 0) {
      lastHandledEventCountRef.current = 0;
      return;
    }
    const prevCount = lastHandledEventCountRef.current;
    const newEvents =
      session.events.length > prevCount
        ? session.events.slice(prevCount)
        : [session.events[session.events.length - 1]];
    lastHandledEventCountRef.current = session.events.length;

    const EVENT_PRIORITY: Record<MatchEvent["type"], number> = {
      corner: 105, // Corner sequence chains any follow-up header goal/woodwork/chance in the same minute!
      goal: 100,
      red_card: 90,
      whistle: 85,
      offside: 80,
      woodwork: 75,
      save: 65,
      chance: 60,
      substitution: 55,
      injury: 50,
      yellow_card: 45,
      stoppage_time: 40,
    };
    const latest: MatchEvent = [...newEvents].sort(
      (a, b) => (EVENT_PRIORITY[b.type] ?? 0) - (EVENT_PRIORITY[a.type] ?? 0)
    )[0];
    const cornerFollowUpEvent: MatchEvent | undefined =
      latest.type === "corner"
        ? newEvents.find(
            (e) =>
              e.id !== latest.id &&
              (e.type === "goal" || e.type === "woodwork" || e.type === "chance")
          )
        : undefined;

    if (latest.id === lastHandledEventIdRef.current) return;
    lastHandledEventIdRef.current = latest.id;

    const isHomeEvent = latest.clubId === homeClub.id;
    const curCoords = liveCoordsRef.current;

    const choreographBoxAction = (
      attackingHome: boolean,
      shooterId: number | null,
      assisterId?: number,
      targetGoalCoord?: Coord
    ): { shooterCoord: Coord } => {
      const existingShooter = shooterId !== null ? curCoords[shooterId] : undefined;
      const shooterCoord: Coord = existingShooter
        ? {
            x: clamp(existingShooter.x, 24, 76),
            y: attackingHome
              ? clamp(existingShooter.y, 9, 25)
              : clamp(existingShooter.y, 75, 91),
          }
        : {
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
        const existingAssister = curCoords[assisterId];
        if (existingAssister) {
          updated[assisterId] = {
            x: clamp(existingAssister.x, 12, 88),
            y: attackingHome
              ? clamp(existingAssister.y, 12, 42)
              : clamp(existingAssister.y, 58, 88),
          };
        } else {
          const wingX =
            shooterCoord.x < 50 ? 14 + Math.random() * 16 : 70 + Math.random() * 16;
          updated[assisterId] = {
            x: wingX,
            y: attackingHome
              ? clamp(shooterCoord.y + 7 + Math.random() * 8, 12, 36)
              : clamp(shooterCoord.y - 7 - Math.random() * 8, 64, 88),
          };
        }
      }

      // Bring attackers and defenders into the penalty box
      for (const id of attIds) {
        if (id === shooterId || id === assisterId) continue;
        const p = playerMap.get(id);
        if (!p || p.roleCategory === "GK") continue;
        const base = updated[id] ?? { x: 50, y: 50 };
        const isAtt = p.roleCategory === "ATT";
        const isMid = p.roleCategory === "MID" || p.primaryPosition === "CAM";
        const boxPull = isAtt ? 0.72 : isMid ? 0.55 : 0.25;
        const targetBoxY = isAtt
          ? (attackingHome ? 11 + Math.random() * 5 : 89 - Math.random() * 5)
          : (attackingHome ? 22 : 78);
        updated[id] = {
          x: clamp(base.x * 0.65 + shooterCoord.x * 0.35 + (isAtt ? (Math.random() * 8 - 4) : 0), 12, 88),
          y: clamp(base.y * (1 - boxPull) + targetBoxY * boxPull, 7, 93),
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

      const { curveX, curveY, isAerial, maxAltitude } = computeTrajectoryCurve(
        shooterCoord.x,
        shooterCoord.y,
        goalX,
        goalY,
        true,
        "goal"
      );

      setPlayPhase("final_third");
      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: shooterCoord.x,
        y1: shooterCoord.y,
        x2: goalX,
        y2: goalY,
        kind: "goal",
        isAerial,
        maxAltitude,
        curveX,
        curveY,
      });
      setBallPos({ x: goalX, y: goalY });
      triggerBallFlight(
        shooterCoord.x,
        shooterCoord.y,
        goalX,
        goalY,
        curveX,
        curveY,
        true,
        maxAltitude,
        500
      );
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
      setHighlightPause(2800, 1800);

      // Schedule post-goal center circle kickoff restart for the team that conceded
      const concedingIsHome = !isHomeEvent;
      pendingKickoffHomeRef.current = concedingIsHome;
      if (kickoffTimeoutRef.current !== null) {
        window.clearTimeout(kickoffTimeoutRef.current);
      }
      const koDelay = Math.max(
        850,
        Math.round(1350 * clamp(speedRef.current / 1200, 0.4, 1.4))
      );
      kickoffTimeoutRef.current = window.setTimeout(() => {
        kickoffTimeoutRef.current = null;
        if (pendingKickoffHomeRef.current !== null) {
          const koHome = pendingKickoffHomeRef.current;
          pendingKickoffHomeRef.current = null;
          resetToCenterKickoff(koHome);
        }
      }, koDelay);
    } else if (latest.type === "save") {
      // On "save", latest.clubId is the keeper's club; opposing side took the shot (stored in assistPlayerId)
      const attackingHome = !isHomeEvent;
      const keeperTarget: Coord = {
        x: 48 + Math.random() * 4,
        y: isHomeEvent ? 95.5 : 4.5,
      };
      const oppIds = attackingHome ? session.homeActiveIds : session.awayActiveIds;
      const oppAttackers = oppIds.filter((id) => playerMap.get(id)?.roleCategory === "ATT");
      const shooterGuess =
        latest.assistPlayerId ?? oppAttackers[0] ?? oppIds[Math.max(0, oppIds.length - 1)] ?? null;
      const { shooterCoord } = choreographBoxAction(
        attackingHome,
        shooterGuess,
        undefined,
        keeperTarget
      );

      const { curveX, curveY, isAerial, maxAltitude } = computeTrajectoryCurve(
        shooterCoord.x,
        shooterCoord.y,
        keeperTarget.x,
        keeperTarget.y,
        true,
        "shot"
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
        isAerial,
        maxAltitude,
        curveX,
        curveY,
      });
      setBallPos(keeperTarget);
      triggerBallFlight(
        shooterCoord.x,
        shooterCoord.y,
        keeperTarget.x,
        keeperTarget.y,
        curveX,
        curveY,
        true,
        maxAltitude,
        420
      );
      setBanner({
        text: `DEFESAÇA! ${latest.playerName} (${latest.minute}')`,
        tone: "save",
      });
      setHighlightPause(1300);
    } else if (latest.type === "woodwork") {
      // 2-Stage Woodwork Animation:
      // Stage 1 (0 -> 380ms): Shot flies straight onto the goalpost (x=45.05 or 54.95) or crossbar (x=47..53)
      // Stage 2 (380 -> 900ms): Goal frame flashes on impact and ball ricochets back into the penalty area!
      const isCrossbar = Math.random() < 0.42;
      const hitLeftPost = Math.random() < 0.5;
      const postX = isCrossbar
        ? 47 + Math.random() * 6
        : hitLeftPost
        ? 45.05
        : 54.95;
      const postY = isHomeEvent ? 3.0 : 97.0;
      const { shooterCoord } = choreographBoxAction(
        isHomeEvent,
        latest.playerId,
        latest.assistPlayerId,
        { x: postX, y: postY }
      );

      const shotCurve = computeTrajectoryCurve(
        shooterCoord.x,
        shooterCoord.y,
        postX,
        postY,
        true,
        "shot"
      );

      setPlayPhase("final_third");
      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: shooterCoord.x,
        y1: shooterCoord.y,
        x2: postX,
        y2: postY,
        kind: "shot",
        isAerial: true,
        maxAltitude: isCrossbar ? 0.85 : 0.45,
        curveX: shotCurve.curveX,
        curveY: shotCurve.curveY,
      });
      setBallPos({ x: postX, y: postY });
      ballPosRef.current = { x: postX, y: postY };
      triggerBallFlight(
        shooterCoord.x,
        shooterCoord.y,
        postX,
        postY,
        shotCurve.curveX,
        shotCurve.curveY,
        true,
        isCrossbar ? 0.85 : 0.45,
        380
      );
      setBanner({
        text: isCrossbar
          ? `NO TRAVESSÃO! ${getPlayerDisplayName(latest.playerName)} (${latest.minute}')`
          : `NA TRAVE! ${getPlayerDisplayName(latest.playerName)} (${latest.minute}')`,
        tone: "woodwork",
        minute: latest.minute,
        clubName: (isHomeEvent ? homeClub : awayClub).shortName,
        scorerName: latest.playerName,
      });
      setHighlightPause(1950, 1250);

      // Stage 2: Impact flash on post/crossbar + sharp ricochet rebound back into play
      window.setTimeout(() => {
        setWoodworkImpact({
          x: postX,
          y: postY,
          kind: isCrossbar ? "crossbar" : "post",
        });

        const reboundX = clamp(
          postX + (postX < 50 ? -8 - Math.random() * 9 : 8 + Math.random() * 9),
          22,
          78
        );
        const reboundY = isHomeEvent
          ? 11 + Math.random() * 7.5
          : 89 - Math.random() * 7.5;
        const rebCurve = computeTrajectoryCurve(
          postX,
          postY,
          reboundX,
          reboundY,
          true,
          "pass"
        );

        const defIds = isHomeEvent ? session.awayActiveIds : session.homeActiveIds;
        const reboundRecovererId =
          defIds.find((id) => playerMap.get(id)?.roleCategory === "DEF") ??
          defIds[0] ??
          latest.playerId;

        setCarrierId(reboundRecovererId);
        carrierIdRef.current = reboundRecovererId;
        setCarrierClubId(isHomeEvent ? awayClub.id : homeClub.id);
        carrierClubIdRef.current = isHomeEvent ? awayClub.id : homeClub.id;
        setTrail({
          x1: postX,
          y1: postY,
          x2: reboundX,
          y2: reboundY,
          kind: "shot",
          isAerial: true,
          maxAltitude: 0.55,
          curveX: rebCurve.curveX,
          curveY: rebCurve.curveY,
        });
        setBallPos({ x: reboundX, y: reboundY });
        ballPosRef.current = { x: reboundX, y: reboundY };
        triggerBallFlight(
          postX,
          postY,
          reboundX,
          reboundY,
          rebCurve.curveX,
          rebCurve.curveY,
          true,
          0.55,
          460
        );
      }, 380);
    } else if (latest.type === "chance") {
      const missX = Math.random() < 0.5 ? 35 : 65;
      const missY = isHomeEvent ? 1.5 : 98.5;
      const { shooterCoord } = choreographBoxAction(
        isHomeEvent,
        latest.playerId,
        latest.assistPlayerId
      );

      const { curveX, curveY, isAerial, maxAltitude } = computeTrajectoryCurve(
        shooterCoord.x,
        shooterCoord.y,
        missX,
        missY,
        true,
        "shot"
      );

      setPlayPhase("final_third");
      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: shooterCoord.x,
        y1: shooterCoord.y,
        x2: missX,
        y2: missY,
        kind: "shot",
        isAerial,
        maxAltitude,
        curveX,
        curveY,
      });
      setBallPos({ x: missX, y: missY });
      triggerBallFlight(
        shooterCoord.x,
        shooterCoord.y,
        missX,
        missY,
        curveX,
        curveY,
        true,
        maxAltitude,
        440
      );
      setBanner({
        text: `QUASE! ${latest.playerName} (${latest.minute}')`,
        tone: "chance",
      });
      setHighlightPause(1100);
    } else if (latest.type === "yellow_card" || latest.type === "red_card") {
      const isRed = latest.type === "red_card";
      const foulSpot: Coord = {
        x: clamp(ballPosRef.current.x, 10, 90),
        y: clamp(ballPosRef.current.y, 12, 88),
      };
      const victimId = latest.assistPlayerId ?? carrierIdRef.current;
      const duelCoords: Record<number, Coord> = { ...curCoords };
      if (victimId) {
        duelCoords[victimId] = foulSpot;
      }
      duelCoords[latest.playerId] = {
        x: clamp(foulSpot.x + (foulSpot.x < 50 ? 1.6 : -1.6), 8, 92),
        y: clamp(foulSpot.y + (isHomeEvent ? -1.4 : 1.4), 8, 92),
      };
      setLiveCoords(duelCoords);
      liveCoordsRef.current = duelCoords;
      setBallPos(foulSpot);
      ballPosRef.current = foulSpot;
      setBallVisual({ x: foulSpot.x, y: foulSpot.y, altitude: 0, isAerial: false });
      setTrail(null);

      setBanner({
        text: isRed
          ? `EXPULSO! ${latest.playerName} (${latest.minute}')`
          : `CARTÃO AMARELO • ${latest.playerName} (${latest.minute}')`,
        tone: isRed ? "red_card" : "yellow_card",
        minute: latest.minute,
      });
      setCardHighlight({
        playerId: latest.playerId,
        playerName: latest.playerName,
        type: isRed ? "red_card" : "yellow_card",
        minute: latest.minute,
      });
      setHighlightPause(isRed ? 2400 : 1900, 1250);

      // Stage 2: Free kick taken from the exact spot of the foul by the fouled team!
      const fouledHome = !isHomeEvent;
      const fkClubId = fouledHome ? homeClub.id : awayClub.id;
      const fkActiveIds = fouledHome ? session.homeActiveIds : session.awayActiveIds;
      const fkDelay = Math.max(
        700,
        Math.round((isRed ? 1300 : 1000) * clamp(speedRef.current / 1200, 0.45, 1.4))
      );
      window.setTimeout(() => {
        const fkTakerId =
          (victimId && fkActiveIds.includes(victimId) ? victimId : null) ??
          fkActiveIds.find((id) => playerMap.get(id)?.roleCategory === "MID") ??
          fkActiveIds.find((id) => playerMap.get(id)?.roleCategory !== "GK") ??
          null;
        if (fkTakerId === null) return;

        const targetReceiverId =
          fkActiveIds.find(
            (id) =>
              id !== fkTakerId &&
              (playerMap.get(id)?.roleCategory === "ATT" ||
                playerMap.get(id)?.roleCategory === "MID")
          ) ?? fkTakerId;
        const rawReceiverCoord = liveCoordsRef.current[targetReceiverId] ?? {
          x: 50,
          y: fouledHome ? Math.max(12, foulSpot.y - 18) : Math.min(88, foulSpot.y + 18),
        };
        const fkTarget: Coord = {
          x: clamp(rawReceiverCoord.x, 16, 84),
          y: fouledHome
            ? clamp(Math.min(foulSpot.y - 12, rawReceiverCoord.y), 10, 82)
            : clamp(Math.max(foulSpot.y + 12, rawReceiverCoord.y), 18, 90),
        };
        const fkCurve = computeTrajectoryCurve(
          foulSpot.x,
          foulSpot.y,
          fkTarget.x,
          fkTarget.y,
          true,
          "pass"
        );
        setCarrierId(targetReceiverId);
        carrierIdRef.current = targetReceiverId;
        setCarrierClubId(fkClubId);
        carrierClubIdRef.current = fkClubId;
        lastPasserIdRef.current = fkTakerId;
        setTrail({
          x1: foulSpot.x,
          y1: foulSpot.y,
          x2: fkTarget.x,
          y2: fkTarget.y,
          kind: "pass",
          isAerial: true,
          maxAltitude: 0.75,
          curveX: fkCurve.curveX,
          curveY: fkCurve.curveY,
        });
        setBallPos(fkTarget);
        ballPosRef.current = fkTarget;
        triggerBallFlight(
          foulSpot.x,
          foulSpot.y,
          fkTarget.x,
          fkTarget.y,
          fkCurve.curveX,
          fkCurve.curveY,
          true,
          0.75,
          480
        );
      }, fkDelay);
    } else if (latest.type === "injury") {
      const injSpot: Coord = {
        x: clamp(ballPosRef.current.x, 10, 90),
        y: clamp(ballPosRef.current.y, 12, 88),
      };
      const injCoords: Record<number, Coord> = {
        ...curCoords,
        [latest.playerId]: injSpot,
      };
      if (latest.assistPlayerId) {
        injCoords[latest.assistPlayerId] = {
          x: clamp(injSpot.x + 2, 8, 92),
          y: clamp(injSpot.y + 1.5, 8, 92),
        };
      }
      setLiveCoords(injCoords);
      liveCoordsRef.current = injCoords;
      setBallPos(injSpot);
      ballPosRef.current = injSpot;
      setBallVisual({ x: injSpot.x, y: injSpot.y, altitude: 0, isAerial: false });
      setTrail(null);
      setBanner({
        text: `LESÃO! ${latest.playerName} (${latest.minute}')`,
        tone: "injury",
        minute: latest.minute,
      });
      setCardHighlight({
        playerId: latest.playerId,
        playerName: latest.playerName,
        type: "injury",
        minute: latest.minute,
      });
      setHighlightPause(1900, 1200);
    } else if (latest.type === "corner") {
      const attackingHome = isHomeEvent;
      const cornerClub = isHomeEvent ? homeClub : awayClub;
      const attIds = attackingHome ? session.homeActiveIds : session.awayActiveIds;
      const defIds = attackingHome ? session.awayActiveIds : session.homeActiveIds;
      const speedScale = clamp(speedRef.current / 1200, 0.45, 1.4);

      // STAGE 1 (0ms -> ~900ms): The shot that gets deflected by a defender or saved by GK out over the endline!
      const shooterId = latest.assistPlayerId ?? latest.playerId;
      const shooterName = getPlayerDisplayName(latest.assistPlayerName ?? latest.playerName);
      const { shooterCoord } = choreographBoxAction(attackingHome, shooterId);

      // Pick the corner side matching the side from which the shot was deflected
      const cornerLeft = shooterCoord.x < 50;
      const outX = cornerLeft ? 34 + Math.random() * 6 : 60 + Math.random() * 6;
      const outY = attackingHome ? 2.0 : 98.0;

      const shotCurve = computeTrajectoryCurve(
        shooterCoord.x,
        shooterCoord.y,
        outX,
        outY,
        true,
        "shot"
      );

      setPlayPhase("final_third");
      setCarrierId(shooterId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: shooterCoord.x,
        y1: shooterCoord.y,
        x2: outX,
        y2: outY,
        kind: "shot",
        isAerial: true,
        maxAltitude: 0.55,
        curveX: shotCurve.curveX,
        curveY: shotCurve.curveY,
      });
      setBallPos({ x: outX, y: outY });
      triggerBallFlight(
        shooterCoord.x,
        shooterCoord.y,
        outX,
        outY,
        shotCurve.curveX,
        shotCurve.curveY,
        true,
        0.55,
        420
      );
      setBanner({
        text: `CHUTE DESVIADO! ${shooterName} → Escanteio (${latest.minute}')`,
        tone: "save",
      });

      const totalPauseBase = cornerFollowUpEvent?.type === "goal" ? 4100 : 2850;
      setHighlightPause(totalPauseBase, 2000);

      // STAGE 2 (~900ms): Ball placed at the corner flag, taker runs to flag, box crowds, and aerial cross flies in!
      const cornerFlagX = cornerLeft ? 4.5 : 95.5;
      const cornerFlagY = attackingHome ? 3.5 : 96.5;
      const targetBoxX = 45 + Math.random() * 10;
      const targetBoxY = attackingHome ? 10 + Math.random() * 4.5 : 90 - Math.random() * 4.5;
      const stage2Delay = Math.max(550, Math.round(900 * speedScale));

      window.setTimeout(() => {
        const boxCoords: Record<number, Coord> = { ...liveCoordsRef.current };

        // Position corner taker right at the corner flag
        boxCoords[latest.playerId] = {
          x: cornerFlagX + (cornerLeft ? 1.5 : -1.5),
          y: cornerFlagY + (attackingHome ? 1.2 : -1.2),
        };

        // Defending GK on line and defenders marking in box
        for (const id of defIds) {
          const p = playerMap.get(id);
          if (p?.roleCategory === "GK") {
            boxCoords[id] = { x: 50, y: attackingHome ? 4.5 : 95.5 };
          } else if (p) {
            const base = boxCoords[id] ?? { x: 50, y: 50 };
            boxCoords[id] = {
              x: clamp(base.x * 0.4 + (40 + Math.random() * 20) * 0.6, 26, 74),
              y: clamp(attackingHome ? 8 + Math.random() * 9 : 92 - Math.random() * 9, 5, 95),
            };
          }
        }

        // Attacking tall players (CBs / ST) push into penalty area; if there is a header target, place them at targetBox
        for (const id of attIds) {
          if (id === latest.playerId) continue;
          if (cornerFollowUpEvent && id === cornerFollowUpEvent.playerId) {
            boxCoords[id] = { x: targetBoxX, y: targetBoxY };
            continue;
          }
          const p = playerMap.get(id);
          if (!p || p.roleCategory === "GK") continue;
          const isTall = p.roleCategory === "ATT" || p.roleCategory === "DEF";
          const boxY = isTall
            ? (attackingHome ? 9 + Math.random() * 7 : 91 - Math.random() * 7)
            : (attackingHome ? 22 + Math.random() * 4 : 78 - Math.random() * 4);
          boxCoords[id] = {
            x: clamp(32 + Math.random() * 36, 24, 76),
            y: clamp(boxY, 6, 94),
          };
        }

        setLiveCoords(boxCoords);
        liveCoordsRef.current = boxCoords;

        const { curveX, curveY } = computeTrajectoryCurve(
          cornerFlagX,
          cornerFlagY,
          targetBoxX,
          targetBoxY,
          true,
          "cross"
        );

        setCarrierId(latest.playerId);
        carrierIdRef.current = latest.playerId;
        setCarrierClubId(latest.clubId);
        carrierClubIdRef.current = latest.clubId;
        setTrail({
          x1: cornerFlagX,
          y1: cornerFlagY,
          x2: targetBoxX,
          y2: targetBoxY,
          kind: "cross",
          isAerial: true,
          maxAltitude: 1.15,
          curveX,
          curveY,
        });
        setBallPos({ x: targetBoxX, y: targetBoxY });
        ballPosRef.current = { x: targetBoxX, y: targetBoxY };
        triggerBallFlight(
          cornerFlagX,
          cornerFlagY,
          targetBoxX,
          targetBoxY,
          curveX,
          curveY,
          true,
          1.15,
          700
        );
        setBanner({
          text: "ESCANTEIO",
          tone: "corner",
          minute: latest.minute,
          clubName: cornerClub.name,
          clubColor: cornerClub.primaryColor,
          scorerName: `${latest.playerName} (${cornerClub.shortName})`,
        });
      }, stage2Delay);

      // STAGE 3 (~1680ms): Header in the box (Goal, dangerous header chance, or defensive clearance)
      const stage3Delay = stage2Delay + Math.max(520, Math.round(740 * speedScale));
      window.setTimeout(() => {
        if (cornerFollowUpEvent?.type === "goal") {
          const goalX = 50 + (Math.random() * 4 - 2);
          const goalY = attackingHome ? 1.6 : 98.4;
          const scorer = playerMap.get(cornerFollowUpEvent.playerId);
          const assister = cornerFollowUpEvent.assistPlayerId
            ? playerMap.get(cornerFollowUpEvent.assistPlayerId)
            : undefined;
          const hdrCurve = computeTrajectoryCurve(
            targetBoxX,
            targetBoxY,
            goalX,
            goalY,
            true,
            "goal"
          );
          setCarrierId(cornerFollowUpEvent.playerId);
          carrierIdRef.current = cornerFollowUpEvent.playerId;
          setTrail({
            x1: targetBoxX,
            y1: targetBoxY,
            x2: goalX,
            y2: goalY,
            kind: "goal",
            isAerial: true,
            maxAltitude: 0.65,
            curveX: hdrCurve.curveX,
            curveY: hdrCurve.curveY,
          });
          setBallPos({ x: goalX, y: goalY });
          ballPosRef.current = { x: goalX, y: goalY };
          triggerBallFlight(
            targetBoxX,
            targetBoxY,
            goalX,
            goalY,
            hdrCurve.curveX,
            hdrCurve.curveY,
            true,
            0.65,
            420
          );
          setBanner({
            text: "GOOOOL DE CABEÇA!",
            tone: "goal",
            minute: cornerFollowUpEvent.minute,
            clubName: cornerClub.name,
            clubColor: cornerClub.primaryColor,
            scorerName: cornerFollowUpEvent.playerName,
            scorerShirt: scorer?.shirtNumber,
            scorerRating: (session.playerRatings[cornerFollowUpEvent.playerId] ?? 7.8).toFixed(1),
            assistName: cornerFollowUpEvent.assistPlayerName,
            assistShirt: assister?.shirtNumber,
            assistRating: cornerFollowUpEvent.assistPlayerId
              ? (session.playerRatings[cornerFollowUpEvent.assistPlayerId] ?? 7.3).toFixed(1)
              : undefined,
          });

          const concedingIsHome = !attackingHome;
          pendingKickoffHomeRef.current = concedingIsHome;
          if (kickoffTimeoutRef.current !== null) {
            window.clearTimeout(kickoffTimeoutRef.current);
          }
          kickoffTimeoutRef.current = window.setTimeout(() => {
            kickoffTimeoutRef.current = null;
            if (pendingKickoffHomeRef.current !== null) {
              const koHome = pendingKickoffHomeRef.current;
              pendingKickoffHomeRef.current = null;
              resetToCenterKickoff(koHome);
            }
          }, Math.max(700, Math.round(1150 * speedScale)));
        } else if (cornerFollowUpEvent?.type === "woodwork") {
          const postX = 46.5 + Math.random() * 7;
          const postY = attackingHome ? 3.0 : 97.0;
          const hdrCurve = computeTrajectoryCurve(
            targetBoxX,
            targetBoxY,
            postX,
            postY,
            true,
            "header"
          );
          setCarrierId(cornerFollowUpEvent.playerId);
          carrierIdRef.current = cornerFollowUpEvent.playerId;
          setTrail({
            x1: targetBoxX,
            y1: targetBoxY,
            x2: postX,
            y2: postY,
            kind: "shot",
            isAerial: true,
            maxAltitude: 0.85,
            curveX: hdrCurve.curveX,
            curveY: hdrCurve.curveY,
          });
          setBallPos({ x: postX, y: postY });
          ballPosRef.current = { x: postX, y: postY };
          triggerBallFlight(
            targetBoxX,
            targetBoxY,
            postX,
            postY,
            hdrCurve.curveX,
            hdrCurve.curveY,
            true,
            0.85,
            340
          );
          setBanner({
            text: `CABEÇADA NO TRAVESSÃO! ${getPlayerDisplayName(cornerFollowUpEvent.playerName)} (${cornerFollowUpEvent.minute}')`,
            tone: "woodwork",
            minute: cornerFollowUpEvent.minute,
            clubName: cornerClub.shortName,
            scorerName: cornerFollowUpEvent.playerName,
          });

          window.setTimeout(() => {
            setWoodworkImpact({ x: postX, y: postY, kind: "crossbar" });
            const rebX = clamp(postX + (Math.random() * 16 - 8), 28, 72);
            const rebY = attackingHome ? 12 + Math.random() * 6 : 88 - Math.random() * 6;
            const rebCurve = computeTrajectoryCurve(postX, postY, rebX, rebY, true, "pass");
            setTrail({
              x1: postX,
              y1: postY,
              x2: rebX,
              y2: rebY,
              kind: "shot",
              isAerial: true,
              maxAltitude: 0.5,
              curveX: rebCurve.curveX,
              curveY: rebCurve.curveY,
            });
            setBallPos({ x: rebX, y: rebY });
            ballPosRef.current = { x: rebX, y: rebY };
            triggerBallFlight(postX, postY, rebX, rebY, rebCurve.curveX, rebCurve.curveY, true, 0.5, 420);
          }, 340);
        } else if (cornerFollowUpEvent?.type === "chance") {
          const missX = Math.random() < 0.5 ? 41 : 59;
          const missY = attackingHome ? 1.5 : 98.5;
          const hdrCurve = computeTrajectoryCurve(
            targetBoxX,
            targetBoxY,
            missX,
            missY,
            true,
            "header"
          );
          setCarrierId(cornerFollowUpEvent.playerId);
          carrierIdRef.current = cornerFollowUpEvent.playerId;
          setTrail({
            x1: targetBoxX,
            y1: targetBoxY,
            x2: missX,
            y2: missY,
            kind: "shot",
            isAerial: true,
            maxAltitude: 0.7,
            curveX: hdrCurve.curveX,
            curveY: hdrCurve.curveY,
          });
          setBallPos({ x: missX, y: missY });
          ballPosRef.current = { x: missX, y: missY };
          triggerBallFlight(
            targetBoxX,
            targetBoxY,
            missX,
            missY,
            hdrCurve.curveX,
            hdrCurve.curveY,
            true,
            0.7,
            400
          );
          setBanner({
            text: `QUASE DE CABEÇA! ${getPlayerDisplayName(cornerFollowUpEvent.playerName)} (${cornerFollowUpEvent.minute}')`,
            tone: "chance",
          });
        } else {
          // Defense rises in the box and heads the ball clear out of the penalty area!
          const clearX = 32 + Math.random() * 36;
          const clearY = attackingHome ? 27 + Math.random() * 8 : 73 - Math.random() * 8;
          const clrCurve = computeTrajectoryCurve(
            targetBoxX,
            targetBoxY,
            clearX,
            clearY,
            true,
            "header"
          );
          const clearerId =
            defIds.find((id) => playerMap.get(id)?.roleCategory === "DEF") ?? defIds[0] ?? null;
          if (clearerId !== null) {
            setCarrierId(clearerId);
            carrierIdRef.current = clearerId;
            setCarrierClubId(attackingHome ? awayClub.id : homeClub.id);
            carrierClubIdRef.current = attackingHome ? awayClub.id : homeClub.id;
          }
          setTrail({
            x1: targetBoxX,
            y1: targetBoxY,
            x2: clearX,
            y2: clearY,
            kind: "pass",
            isAerial: true,
            maxAltitude: 0.85,
            curveX: clrCurve.curveX,
            curveY: clrCurve.curveY,
          });
          setBallPos({ x: clearX, y: clearY });
          ballPosRef.current = { x: clearX, y: clearY };
          triggerBallFlight(
            targetBoxX,
            targetBoxY,
            clearX,
            clearY,
            clrCurve.curveX,
            clrCurve.curveY,
            true,
            0.85,
            450
          );
        }
      }, stage3Delay);
    } else if (latest.type === "offside") {
      const attackingHome = isHomeEvent;
      const attIds = attackingHome ? session.homeActiveIds : session.awayActiveIds;
      const defIds = attackingHome ? session.awayActiveIds : session.homeActiveIds;
      const lineY = computeOffsideLineY(defIds, curCoords, !attackingHome) ?? 50;
      const offenderOld = curCoords[latest.playerId] ?? { x: 50, y: 50 };
      const beyond = 2.2 + Math.random() * 2.8;
      const offenderCoord: Coord = {
        x: clamp(offenderOld.x, 12, 88),
        y: attackingHome ? clamp(lineY - beyond, 8, 47) : clamp(lineY + beyond, 53, 92),
      };

      // Passer: the actual player who played the through ball (stored in latest.assistPlayerId)
      const passerId =
        (latest.assistPlayerId && attIds.includes(latest.assistPlayerId)
          ? latest.assistPlayerId
          : undefined) ??
        attIds.find(
          (id) =>
            id !== latest.playerId &&
            playerMap.get(id)?.roleCategory === "MID"
        ) ??
        attIds.find((id) => id !== latest.playerId && playerMap.get(id)?.roleCategory !== "GK");
      const passerCoord: Coord = passerId
        ? { ...(curCoords[passerId] ?? { x: 50, y: 50 }) }
        : { x: 50, y: attackingHome ? 60 : 40 };
      const updatedCoords = { ...curCoords, [latest.playerId]: offenderCoord };
      setLiveCoords(updatedCoords);

      const { curveX, curveY, isAerial, maxAltitude } = computeTrajectoryCurve(
        passerCoord.x,
        passerCoord.y,
        offenderCoord.x,
        offenderCoord.y,
        false,
        "pass"
      );

      setOffsideMark({
        lineY,
        offenderId: latest.playerId,
        attackingHome,
        disallowedGoal: Boolean(latest.disallowedGoal),
      });
      setPlayPhase("final_third");
      setCarrierId(latest.playerId);
      setCarrierClubId(latest.clubId);
      setTrail({
        x1: passerCoord.x,
        y1: passerCoord.y,
        x2: offenderCoord.x,
        y2: offenderCoord.y,
        kind: "pass",
        isAerial,
        maxAltitude,
        curveX,
        curveY,
      });
      setBallPos(offenderCoord);
      triggerBallFlight(
        passerCoord.x,
        passerCoord.y,
        offenderCoord.x,
        offenderCoord.y,
        curveX,
        curveY,
        false,
        0,
        380
      );
      setBanner({
        text: latest.disallowedGoal
          ? `GOL ANULADO! Impedimento de ${latest.playerName} (${latest.minute}')`
          : `IMPEDIMENTO! ${latest.playerName} (${latest.minute}')`,
        tone: "offside",
      });
      setHighlightPause(latest.disallowedGoal ? 2400 : 1700, 1100);

      // After the whistle: free kick for the defending side, taken by their best-placed defender/keeper
      const freeKickDelay = Math.max(900, Math.round((latest.disallowedGoal ? 2400 : 1700) * clamp(speedRef.current / 1200, 0.4, 1.4)));
      window.setTimeout(() => {
        const defendingHome = !attackingHome;
        const takerId =
          defIds.find((id) => playerMap.get(id)?.roleCategory === "DEF") ??
          defIds.find((id) => playerMap.get(id)?.roleCategory === "GK") ??
          null;
        if (takerId !== null) {
          const takerCoord = liveCoordsRef.current[takerId] ?? { x: 50, y: defendingHome ? 78 : 22 };
          setCarrierId(takerId);
          setCarrierClubId(defendingHome ? homeClub.id : awayClub.id);
          setBallPos(takerCoord);
          setBallVisual({ x: takerCoord.x, y: takerCoord.y, altitude: 0, isAerial: false });
          setPlayPhase("build_up");
          setTrail(null);
        }
      }, freeKickDelay);
    } else if (latest.type === "stoppage_time") {
      const isFirst = !session.secondHalfStarted;
      const extraMins = isFirst ? session.firstHalfExtra : session.secondHalfExtra;
      setBanner({
        text: "TEMPO ADICIONAL",
        tone: "stoppage",
        minute: latest.minute,
        clubName: "4º Árbitro",
        scorerName: `+${extraMins} Minuto${extraMins > 1 ? "s" : ""} de Acréscimo`,
      });
      setHighlightPause(2200, 1200);
    } else if (latest.type === "substitution") {
      const subClub = isHomeEvent ? homeClub : awayClub;
      const playerIn = playerMap.get(latest.playerId);
      const playerOut = latest.assistPlayerId ? playerMap.get(latest.assistPlayerId) : undefined;
      setBanner({
        text: "SUBSTITUIÇÃO",
        tone: "substitution",
        minute: latest.minute,
        clubName: subClub.name,
        clubColor: subClub.primaryColor,
        scorerName: latest.playerName,
        scorerShirt: playerIn?.shirtNumber,
        assistName: latest.assistPlayerName,
        assistShirt: playerOut?.shirtNumber,
      });
      setSubHighlight({
        playerInId: latest.playerId,
        playerInName: latest.playerName,
        playerOutName: latest.assistPlayerName,
        minute: latest.minute,
      });
      setHighlightPause(1900, 1200);
    } else if (latest.type === "whistle") {
      if (session.finished) {
        setBanner({
          text: "FIM DE JOGO",
          tone: "halftime",
          minute: session.minute,
          clubName: "Apito Final",
          scorerName: `${homeClub.shortName} ${session.homeGoals} x ${session.awayGoals} ${awayClub.shortName}`,
        });
      } else if (session.isHalftime) {
        setBanner({
          text: "INTERVALO",
          tone: "halftime",
          minute: session.minute > 45 ? 45 : session.minute,
          clubName: "Fim do 1º Tempo",
          scorerName: `${homeClub.shortName} ${session.homeGoals} x ${session.awayGoals} ${awayClub.shortName}`,
        });
      }
      setHighlightPause(1800, 1000);
    }
  }, [session.events.length, homeClub.id, awayClub.id, playerMap]);

  // Clear banner smoothly after highlight window
  useEffect(() => {
    if (!banner) return;
    if (banner.tone === "halftime" && isHalftime) return;
    const durationMs =
      banner.tone === "goal"
        ? 2600
        : banner.tone === "stoppage" || banner.tone === "substitution" || banner.tone === "corner"
        ? 2400
        : 1800;
    const t = window.setTimeout(() => {
      setBanner(null);
      setTrail(null);
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [banner, isHalftime]);

  // Clear offside overlay after a short while
  useEffect(() => {
    if (!offsideMark) return;
    const t = window.setTimeout(() => setOffsideMark(null), offsideMark.disallowedGoal ? 3000 : 2200);
    return () => window.clearTimeout(t);
  }, [offsideMark]);

  // Clear card highlight after duration
  useEffect(() => {
    if (!cardHighlight) return;
    const t = window.setTimeout(() => setCardHighlight(null), 2500);
    return () => window.clearTimeout(t);
  }, [cardHighlight]);

  // Clear substitution highlight after duration
  useEffect(() => {
    if (!subHighlight) return;
    const t = window.setTimeout(() => setSubHighlight(null), 3200);
    return () => window.clearTimeout(t);
  }, [subHighlight]);

  // Sub-tick continuous tactical movement, active runs, dribbling & progressive passing (220ms)
  useEffect(() => {
    if (!isPlaying || session.finished) return;

    const timer = window.setInterval(() => {
      if (Date.now() < highlightPauseUntilRef.current) return;

      if (pendingKickoffHomeRef.current !== null) {
        const koHome = pendingKickoffHomeRef.current;
        pendingKickoffHomeRef.current = null;
        resetToCenterKickoff(koHome);
        return;
      }

      tickCountRef.current += 1;
      const tick = tickCountRef.current;
      const doAction = tick % ACTION_EVERY === 0;
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

      if (!doAction) {
        // Between ball actions the carrier keeps possession, drifting slowly toward goal
        if (
          currentCarrierId !== null &&
          cur.playerMap.get(currentCarrierId)?.roleCategory !== "GK"
        ) {
          const driftDir = prevIsHome ? -1 : 1;
          nextBallPos = {
            x: clamp(nextBallPos.x + (50 - nextBallPos.x) * 0.02, 8, 92),
            y: clamp(nextBallPos.y + driftDir * 0.55, 6, 94),
          };
          if (flightRafRef.current === null) {
            setBallVisual({ x: nextBallPos.x, y: nextBallPos.y, altitude: 0, isAerial: false });
          }
        }
      } else if (keepSameTeam && currentCarrierId !== null) {
        const carrierPlayer = cur.playerMap.get(currentCarrierId);
        const progressNorm = prevIsHome
          ? clamp((92 - nextBallPos.y) / 84, 0, 1)
          : clamp((nextBallPos.y - 8) / 84, 0, 1);
        const dirY = prevIsHome ? -1 : 1;
        const isForward =
          carrierPlayer?.roleCategory === "ATT" ||
          carrierPlayer?.primaryPosition === "CAM" ||
          ["LW", "RW", "ST", "CF"].includes(carrierPlayer?.primaryPosition ?? "");
        const goalDistY = prevIsHome ? nextBallPos.y - 4.5 : 95.5 - nextBallPos.y;
        const isCentered = Math.abs(nextBallPos.x - 50) < 26;

        // IN-THE-BOX AGGRESSION:
        // When an attacker penetrates the final 24m, they drive into prime shooting position and flag a real shot for the engine!
        const shootProb = isForward
          ? isCentered ? 0.46 : 0.30
          : carrierPlayer?.roleCategory === "MID" && isCentered
          ? 0.24
          : 0.06;

        const takeTickShot =
          progressNorm >= 0.72 && goalDistY < 26 && Math.random() < shootProb;

        if (takeTickShot) {
          // Position the ball carrier inside/at edge of the box ready for stepLiveMatchMinute to fire the official shot!
          const shootSpot: Coord = {
            x: clamp(nextBallPos.x * 0.7 + 50 * 0.3, 28, 72),
            y: prevIsHome
              ? clamp(nextBallPos.y + dirY * 2.5, 10, 21)
              : clamp(nextBallPos.y + dirY * 2.5, 79, 90),
          };
          nextBallPos = shootSpot;
          curCoords[currentCarrierId] = shootSpot;
          nextCarrierId = currentCarrierId;
          nextIsHome = prevIsHome;
          nextPhase = "final_third";
          setTrail(null);
          if (flightRafRef.current === null) {
            setBallVisual({ x: shootSpot.x, y: shootSpot.y, altitude: 0, isAerial: false });
          }
          if (cur.session.pitchContext) {
            cur.session.pitchContext.pendingVisualShot = true;
          }
        } else {
          const dribbleRate =
            isForward ? 0.44 : carrierPlayer?.roleCategory === "MID" ? 0.34 : 0.22;

          // Attackers drive with pace into the box right up to 0.94 progress!
          if (progressNorm < 0.94 && Math.random() < dribbleRate) {
            // Dribble progression along vertical axis: carrier drives forward or cuts inside
            const paceBoost = ((carrierPlayer?.faceStats.dribbling ?? 72) - 65) * 0.08;
            const stepY = (4.8 + Math.random() * 5.2 + Math.max(0, paceBoost)) * dirY;
            const cutCenterX =
              progressNorm > 0.6 ? (50 - nextBallPos.x) * 0.32 : Math.random() * 10 - 5;
            nextBallPos = {
              x: clamp(nextBallPos.x + cutCenterX + (Math.random() * 4 - 2), 8, 92),
              y: clamp(nextBallPos.y + stepY, 6, 94),
            };
            curCoords[currentCarrierId] = nextBallPos;
            setTrail(null);
            if (flightRafRef.current === null) {
              setBallVisual({ x: nextBallPos.x, y: nextBallPos.y, altitude: 0, isAerial: false });
            }
          } else {
            // Decisive progressive pass / cross / cutback
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

            const passDist = Math.hypot(targetBall.x - nextBallPos.x, targetBall.y - nextBallPos.y);
            const isCross =
              Math.abs(nextBallPos.x - 50) > 20 &&
              Math.abs(targetBall.x - 50) < 22 &&
              (prevIsHome ? targetBall.y < 32 : targetBall.y > 68);
            const isLongSwitch = passDist > 25;
            const forceAerial =
              isCross ||
              isLongSwitch ||
              (currentTactics.passingStyle === "Direct" && passDist > 18 && Math.random() < 0.65);

            const { curveX, curveY, isAerial, maxAltitude } = computeTrajectoryCurve(
              nextBallPos.x,
              nextBallPos.y,
              targetBall.x,
              targetBall.y,
              forceAerial,
              isCross ? "cross" : "pass"
            );

            setTrail({
              x1: nextBallPos.x,
              y1: nextBallPos.y,
              x2: targetBall.x,
              y2: targetBall.y,
              kind: isCross ? "cross" : "pass",
              isAerial,
              maxAltitude,
              curveX,
              curveY,
            });

            triggerBallFlight(
              nextBallPos.x,
              nextBallPos.y,
              targetBall.x,
              targetBall.y,
              curveX,
              curveY,
              isAerial,
              maxAltitude,
              Math.max(220, Math.min(520, passDist * 14))
            );

            if (receiverId !== currentCarrierId) {
              lastPasserIdRef.current = currentCarrierId;
            }
            nextBallPos = targetBall;
            nextCarrierId = receiverId;
          }
        }
      } else {
        // Possession turnover: closest defender intercepts and springs build-up or counter
        nextIsHome = !prevIsHome;
        lastPasserIdRef.current = null;
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
        if (flightRafRef.current === null) {
          setBallVisual({ x: meetBall.x, y: meetBall.y, altitude: 0, isAerial: false });
        }

        const newProgress = nextIsHome
          ? (92 - nextBallPos.y) / 84
          : (nextBallPos.y - 8) / 84;
        if (newProgress < 0.58) {
          counterUntilTickRef.current = tick + 6 * ACTION_EVERY;
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

      if (attRunners < 3 && Math.random() < 0.65) {
        const eligible = attackIds.filter((id) => {
          const p = cur.playerMap.get(id);
          return id !== nextCarrierId && p?.roleCategory !== "GK" && !activeRunsRef.current.has(id);
        });
        if (eligible.length > 0) {
          // If in final third, prioritize attackers making aggressive box runs
          const sortedEligible = [...eligible].sort((a, b) => {
            const pa = cur.playerMap.get(a)?.roleCategory === "ATT" ? 1 : 0;
            const pb = cur.playerMap.get(b)?.roleCategory === "ATT" ? 1 : 0;
            return pb - pa;
          });
          const runnerId = sortedEligible[0];
          const slotIdx = slotIndexRef.current.get(runnerId) ?? 5;
          const slot = attackSlots[Math.min(slotIdx, attackSlots.length - 1)];
          const duration = Math.round((3 + Math.floor(Math.random() * 4)) * ACTION_EVERY * 0.6);
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
            vx = runType === "cut_inside" ? (50 - runnerCoord.x) * 0.45 : 0;
            vy = attDirY * (11 + Math.random() * 8);
          } else if (slot.roleCategory === "ATT") {
            // In final third or deep attack (currentProgress >= 0.50), attackers NEVER drop backwards!
            const dropsToFeet = currentProgress < 0.45 && Math.random() < 0.35;
            if (dropsToFeet) {
              runType = "support";
              vx = (nextBallPos.x - runnerCoord.x) * 0.25;
              vy = attDirY * (-4 - Math.random() * 3);
            } else if (nextPhase === "final_third" || currentProgress >= 0.68) {
              // Relentless box crash! Strikers charge the 6-yard box or near post
              runType = "box_crash";
              vx = (50 - runnerCoord.x) * 0.35 + (Math.random() * 6 - 3);
              vy = attDirY * (12 + Math.random() * 8);
            } else {
              runType = "in_behind";
              vx = Math.random() * 8 - 4;
              vy = attDirY * (10 + Math.random() * 7);
            }
          } else if (slot.label === "CM" || slot.label === "CAM") {
            runType = nextPhase === "final_third" || nextPhase === "counter" ? "box_crash" : "support";
            vx = (nextBallPos.x - runnerCoord.x) * 0.25;
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

      // Shoulder-to-shoulder cross-team separation so opposing badges never overlap on the exact same pixel
      const minOppSep = 4.6;
      for (const hId of cur.session.homeActiveIds) {
        if (cur.playerMap.get(hId)?.roleCategory === "GK") continue;
        const hPos = homeTargets.get(hId);
        if (!hPos) continue;
        for (const aId of cur.session.awayActiveIds) {
          if (cur.playerMap.get(aId)?.roleCategory === "GK") continue;
          const aPos = awayTargets.get(aId);
          if (!aPos) continue;
          const dx = hPos.x - aPos.x;
          const dy = hPos.y - aPos.y;
          const dist = Math.hypot(dx, dy);
          if (dist < minOppSep) {
            const safeDist = Math.max(0.1, dist);
            const push = (minOppSep - safeDist) * 0.45;
            const nx = dist < 0.1 ? 0.7 : dx / safeDist;
            const ny = dist < 0.1 ? 0.7 : dy / safeDist;
            if (hId !== nextCarrierId) {
              homeTargets.set(hId, {
                x: clamp(hPos.x + nx * push, 7, 93),
                y: clamp(hPos.y + ny * push, 6, 94),
              });
            }
            if (aId !== nextCarrierId) {
              awayTargets.set(aId, {
                x: clamp(aPos.x - nx * push, 7, 93),
                y: clamp(aPos.y - ny * push, 6, 94),
              });
            }
          }
        }
      }

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
          const tickScale =
            (pitchTickMs / 220) * 0.62 * clamp(Math.sqrt(1200 / speedRef.current), 0.7, 2.6);
          const maxStep =
            (3.4 + (pace / 100) * 2.2) *
            (0.72 + 0.28 * (stam / 100)) *
            counterMult *
            activeRunBonus *
            tickScale;

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

      // Find the defending outfield player closest to the ball carrier for causal fouls/duels
      const defIds = nextIsHome ? cur.session.awayActiveIds : cur.session.homeActiveIds;
      let closestDefenderId: number | null = null;
      let minDefDist = Infinity;
      for (const dId of defIds) {
        if (cur.playerMap.get(dId)?.roleCategory === "GK") continue;
        const dCoord = nextCoords[dId] ?? curCoords[dId];
        if (!dCoord) continue;
        const d = Math.hypot(dCoord.x - nextBallPos.x, dCoord.y - nextBallPos.y);
        if (d < minDefDist) {
          minDefDist = d;
          closestDefenderId = dId;
        }
      }

      cur.session.pitchContext = {
        ballX: nextBallPos.x,
        ballY: nextBallPos.y,
        carrierId: nextCarrierId,
        carrierClubId: nextClubId,
        lastPasserId: lastPasserIdRef.current,
        closestDefenderId,
        playPhase: nextPhase,
        attackProgress: clamp(currentProgress, 0, 1),
        pendingVisualShot: cur.session.pitchContext?.pendingVisualShot ?? false,
      };

      setBallPos(nextBallPos);
      setCarrierId(nextCarrierId);
      setCarrierClubId(nextClubId);
      setPlayPhase(nextPhase);
      setLiveCoords(nextCoords);
    }, pitchTickMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, session.finished, pitchTickMs]);

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

  // Live offside line: shown for the defending side when the ball is in the attacker's half
  const defendingIsHome = carrierClubId !== homeClub.id;
  const attackerInOppHalf = defendingIsHome ? ballPos.y < 58 : ballPos.y > 42;
  const liveOffsideLineY =
    showOffsideLine && attackerInOppHalf
      ? computeOffsideLineY(
          defendingIsHome ? session.homeActiveIds : session.awayActiveIds,
          liveCoords,
          defendingIsHome
        )
      : null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-2.5 sm:p-3 flex flex-col h-full min-h-0 justify-between">
      {/* Pitch Header Controls - Sleek, single-line TV Broadcast Toolbar */}
      <div className="mb-2 flex items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm shrink-0">
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40 shrink-0"
              style={{ backgroundColor: awayKitColors.primary }}
            />
            <span className="text-slate-200">{awayClub.shortName}</span>
            <span className="text-[10px] text-slate-500 font-mono">({awayTactics.formation})</span>
            <span className="text-slate-600 text-[10px]">x</span>
            <span className="text-[10px] text-slate-500 font-mono">({homeTactics.formation})</span>
            <span className="text-slate-200">{homeClub.shortName}</span>
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40 shrink-0"
              style={{ backgroundColor: homeKitColors.primary }}
            />
          </div>

          {session.finished ? (
            <div className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                <Star className="h-3 w-3 text-amber-400" />
                Notas Finais
              </span>
              {onFinishMatch && (
                <button
                  type="button"
                  onClick={onFinishMatch}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-slate-950 shadow-sm transition hover:bg-emerald-400"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Finalizar Partida</span>
                </button>
              )}
            </div>
          ) : carrierPlayer ? (
            <div className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-0.5 text-[11px] text-slate-300">
              <span
                className="h-2 w-2 rounded-full animate-pulse shrink-0"
                style={{
                  backgroundColor:
                    carrierClub.id === homeClub.id
                      ? homeKitColors.primary
                      : awayKitColors.primary,
                }}
              />
              <span className="text-slate-400">Posse:</span>
              <strong className="text-white max-w-[90px] truncate">{getPlayerDisplayName(carrierPlayer.name)}</strong>
              <span className="text-slate-500">•</span>
              <span
                className={`font-bold shrink-0 ${
                  playPhase === "final_third"
                    ? "text-amber-300"
                    : playPhase === "counter"
                    ? "text-rose-300"
                    : "text-emerald-300"
                }`}
              >
                {PLAY_PHASE_LABELS[playPhase]}
              </span>
            </div>
          ) : null}

          {/* Stoppage Time & Halftime Status Badges */}
          {!session.finished && !isHalftime && (
            (!session.secondHalfStarted && session.minute >= 45) ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-400 border border-amber-300 px-2 py-0.5 text-[10px] font-black text-slate-950 font-mono shadow-sm animate-pulse">
                <Clock className="h-3 w-3" />
                +{session.firstHalfExtra}' Acréscimos
              </span>
            ) : (session.secondHalfStarted && session.minute >= 90) ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-400 border border-amber-300 px-2 py-0.5 text-[10px] font-black text-slate-950 font-mono shadow-sm animate-pulse">
                <Clock className="h-3 w-3" />
                +{session.secondHalfExtra}' Acréscimos
              </span>
            ) : null
          )}
          {isHalftime && (
            <div className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black text-amber-300">
                <Pause className="h-2.5 w-2.5 fill-current" />
                Intervalo
              </span>
              {onStartSecondHalf && (
                <button
                  type="button"
                  onClick={onStartSecondHalf}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-black text-slate-950 shadow-sm transition hover:bg-amber-300"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Iniciar 2º Tempo</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Unified Toolbar: Sizing & Display toggles (Guaranteed 1 line) */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[10px] font-bold">
            <button
              onClick={() => handlePitchSizeChange("normal")}
              className={`rounded px-2 py-0.5 transition ${
                activePitchSize === "normal"
                  ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Tamanho Normal"
            >
              Padrão
            </button>
            <button
              onClick={() => handlePitchSizeChange("large")}
              className={`rounded px-2 py-0.5 transition ${
                activePitchSize === "large"
                  ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Tamanho Grande"
            >
              Grande
            </button>
            <button
              onClick={() => handlePitchSizeChange("full")}
              className={`rounded px-2 py-0.5 transition ${
                activePitchSize === "full"
                  ? "bg-emerald-500 text-slate-950 font-black shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Tamanho Expandido"
            >
              Cheia
            </button>
          </div>

          <button
            onClick={() => setShowOffsideLine((v) => !v)}
            title="Linha de impedimento (VAR)"
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
              showOffsideLine
                ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                : "border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Flag className="h-3 w-3" />
            <span className="hidden xl:inline">VAR</span>
          </button>

          <button
            onClick={() => setShowKits((v) => !v)}
            title="Alternar entre Camisas e Tokens circulares"
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
              showKits
                ? "border-sky-500/40 bg-sky-500/20 text-sky-300"
                : "border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Shirt className="h-3 w-3" />
            <span className="hidden xl:inline">{showKits ? "Camisas" : "Tokens"}</span>
          </button>

          <button
            onClick={() => setShowNames((v) => !v)}
            title="Mostrar/Ocultar nomes dos atletas"
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
              showNames
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                : "border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300"
            }`}
          >
            {showNames ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            <span className="hidden xl:inline">Nomes</span>
          </button>

          <button
            onClick={() => setShowRatings((v) => !v)}
            title="Mostrar/Ocultar notas em tempo real (Padrão Sofascore)"
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
              showRatings
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300 shadow-sm"
                : "border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Star className={`h-3 w-3 ${showRatings ? "fill-emerald-400 text-emerald-400" : ""}`} />
            <span className="hidden xl:inline">Notas</span>
          </button>
        </div>
      </div>

      {/* Vertical 2D Pitch Arena Container - Perfectly fits inside available height without clipping */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden py-0.5">
        <div
          className={`relative overflow-hidden rounded-2xl border-2 border-emerald-950/80 select-none shadow-[inset_0_0_60px_rgba(0,0,0,0.45),0_8px_30px_rgba(0,0,0,0.5)] transition-all duration-300 ${
            activePitchSize === "normal"
              ? "aspect-[3/4]"
              : activePitchSize === "large"
              ? "aspect-[3/4] sm:aspect-[4/5]"
              : "aspect-[3/4] sm:aspect-[4/5] lg:aspect-[1/1]"
          }`}
          style={{
            height: "100%",
            width: "auto",
            maxHeight: "100%",
            maxWidth: "100%",
            backgroundImage:
              "repeating-linear-gradient(180deg, #1b633e 0%, #1b633e 8.333%, #226f46 8.333%, #226f46 16.666%)",
          }}
        >
        {/* SVG Field Lines, Offside Line & Ball Trail */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {/* Real-world proportions (105x68m) with non-scaling strokes so circles stay round */}
          <g fill="none" stroke="rgba(255,255,255,0.58)" strokeWidth={1.5} vectorEffect="non-scaling-stroke">
            <rect x="4" y="3" width="92" height="94" vectorEffect="non-scaling-stroke" />
            <line x1="4" y1="50" x2="96" y2="50" vectorEffect="non-scaling-stroke" />
            <ellipse cx="50" cy="50" rx="12.4" ry="8.4" vectorEffect="non-scaling-stroke" />

            {/* Top: penalty area, goal area, arc */}
            <rect x="22.8" y="3" width="54.4" height="14.8" vectorEffect="non-scaling-stroke" />
            <rect x="37.6" y="3" width="24.8" height="4.9" vectorEffect="non-scaling-stroke" />
            <path d="M 40.17 17.8 A 12.4 8.2 0 0 0 59.83 17.8" vectorEffect="non-scaling-stroke" />

            {/* Bottom: penalty area, goal area, arc */}
            <rect x="22.8" y="82.2" width="54.4" height="14.8" vectorEffect="non-scaling-stroke" />
            <rect x="37.6" y="92.1" width="24.8" height="4.9" vectorEffect="non-scaling-stroke" />
            <path d="M 40.17 82.2 A 12.4 8.2 0 0 1 59.83 82.2" vectorEffect="non-scaling-stroke" />

            {/* Corner arcs */}
            <path d="M 4 3.9 A 1.35 0.9 0 0 0 5.35 3" vectorEffect="non-scaling-stroke" />
            <path d="M 94.65 3 A 1.35 0.9 0 0 0 96 3.9" vectorEffect="non-scaling-stroke" />
            <path d="M 4 96.1 A 1.35 0.9 0 0 1 5.35 97" vectorEffect="non-scaling-stroke" />
            <path d="M 94.65 97 A 1.35 0.9 0 0 1 96 96.1" vectorEffect="non-scaling-stroke" />
          </g>

          {/* Center mark & penalty spots */}
          <g fill="rgba(255,255,255,0.6)">
            <ellipse cx="50" cy="50" rx="0.8" ry="0.6" />
            <ellipse cx="50" cy="12.85" rx="0.6" ry="0.45" />
            <ellipse cx="50" cy="87.15" rx="0.6" ry="0.45" />
          </g>

          {/* Goals */}
          <rect
            x="45.05"
            y="0.6"
            width="9.9"
            height="2.4"
            fill="rgba(255,255,255,0.14)"
            stroke={woodworkImpact && woodworkImpact.y < 50 ? "#fbbf24" : "rgba(255,255,255,0.75)"}
            strokeWidth={woodworkImpact && woodworkImpact.y < 50 ? 2.6 : 1.4}
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x="45.05"
            y="97"
            width="9.9"
            height="2.4"
            fill="rgba(255,255,255,0.14)"
            stroke={woodworkImpact && woodworkImpact.y > 50 ? "#fbbf24" : "rgba(255,255,255,0.75)"}
            strokeWidth={woodworkImpact && woodworkImpact.y > 50 ? 2.6 : 1.4}
            vectorEffect="non-scaling-stroke"
          />

          {/* Woodwork Impact Shockwave Ring on Post / Crossbar */}
          {woodworkImpact && (
            <g>
              <circle
                cx={woodworkImpact.x}
                cy={woodworkImpact.y}
                r={3.6}
                fill="rgba(251, 191, 36, 0.25)"
                stroke="#f59e0b"
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={woodworkImpact.x}
                cy={woodworkImpact.y}
                r={1.8}
                fill="#fbbf24"
                stroke="#ffffff"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}

          {/* Live offside line (second-last defender of the defending team) */}
          {!session.finished && !offsideMark && liveOffsideLineY !== null && showOffsideLine && (
            <line
              x1="4"
              y1={liveOffsideLineY}
              x2="96"
              y2={liveOffsideLineY}
              stroke="rgba(245, 158, 11, 0.65)"
              strokeWidth={1.2}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Offside call highlight */}
          {offsideMark && (
            <>
              <rect
                x="4"
                y={offsideMark.attackingHome ? 3 : offsideMark.lineY}
                width="92"
                height={
                  offsideMark.attackingHome ? offsideMark.lineY - 3 : 97 - offsideMark.lineY
                }
                fill="rgba(249,115,22,0.10)"
              />
              <line
                x1="4"
                y1={offsideMark.lineY}
                x2="96"
                y2={offsideMark.lineY}
                stroke="#f97316"
                strokeWidth={2.4}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {/* Pass / Shot Trajectory with Curves and Aerial Shadow */}
          {!session.finished && trail && (
            <g>
              {trail.isAerial && (
                <path
                  d={`M ${trail.x1} ${trail.y1} Q ${trail.curveX} ${trail.curveY} ${trail.x2} ${trail.y2}`}
                  fill="none"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={1.8}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={`M ${trail.x1} ${trail.y1} Q ${trail.curveX} ${trail.curveY} ${trail.x2} ${trail.y2}`}
                fill="none"
                stroke={
                  trail.kind === "goal"
                    ? "#fbbf24"
                    : trail.kind === "shot"
                    ? "#fb7185"
                    : trail.isAerial
                    ? "#38bdf8"
                    : "rgba(255,255,255,0.65)"
                }
                strokeWidth={
                  trail.kind === "goal"
                    ? 3.0
                    : trail.kind === "shot"
                    ? 2.4
                    : trail.isAerial
                    ? 2.2
                    : 1.6
                }
                strokeDasharray={
                  trail.kind === "pass" || trail.isAerial ? "5 4" : undefined
                }
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={trail.x2}
                cy={trail.y2}
                r={trail.isAerial ? 1.4 : 0.9}
                fill={trail.isAerial ? "rgba(56,189,248,0.4)" : "rgba(255,255,255,0.4)"}
                stroke={trail.isAerial ? "#38bdf8" : "rgba(255,255,255,0.8)"}
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        {/* Linesman flag at the touchline when offside is called */}
        {offsideMark && (
          <div
            className="pointer-events-none absolute left-1 z-20 -translate-y-1/2 flex items-center gap-1.5"
            style={{ top: `${offsideMark.lineY}%` }}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded bg-orange-500 text-slate-950 shadow-md">
              <Flag className="h-3 w-3 fill-slate-950" />
            </div>
            <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-950">
              Impedimento
            </span>
          </div>
        )}



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
                        <span className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                          <Award className="h-3 w-3" /> GOL
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
                            <span className="shrink-0 inline-flex items-center gap-1 rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                              <Footprints className="h-3 w-3" /> ASSIST
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
          ) : banner.tone === "yellow_card" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
              <div className="flex items-center gap-2.5 rounded-lg border-2 border-amber-300 bg-amber-400 px-4 py-2 text-slate-950 shadow-[0_0_25px_rgba(251,191,36,0.7)] font-black">
                <div className="h-5 w-3.5 rounded-[2px] bg-amber-300 border border-amber-600 shadow-sm" />
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-amber-950 font-bold">
                    Advertência Disciplinar
                  </div>
                  <div className="text-xs font-black">{banner.text}</div>
                </div>
              </div>
            </div>
          ) : banner.tone === "red_card" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
              <div className="flex items-center gap-2.5 rounded-lg border-2 border-rose-300 bg-rose-600 px-4 py-2 text-white shadow-[0_0_30px_rgba(244,63,94,0.8)] font-black">
                <div className="h-5 w-3.5 rounded-[2px] bg-rose-500 border border-rose-200 shadow-sm" />
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-rose-200 font-bold">
                    Expulsão de Campo
                  </div>
                  <div className="text-xs font-black">{banner.text}</div>
                </div>
              </div>
            </div>
          ) : banner.tone === "injury" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
              <div className="flex items-center gap-2.5 rounded-lg border-2 border-rose-400 bg-slate-950 px-4 py-2 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.5)] font-black">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-rose-500 text-white">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-rose-500 font-bold">
                    Atendimento Médico
                  </div>
                  <div className="text-xs font-black">{banner.text}</div>
                </div>
              </div>
            </div>
          ) : banner.tone === "stoppage" ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
              <div className="flex items-center gap-3 rounded-xl border border-amber-400/60 bg-slate-950/95 backdrop-blur-md px-4 py-2 text-white shadow-[0_0_30px_rgba(251,191,36,0.4)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-slate-950 shadow-md">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-amber-300 font-bold">
                    Tempo Adicional • 4º Árbitro
                  </div>
                  <div className="text-sm font-black text-white">{banner.scorerName}</div>
                </div>
              </div>
            </div>
          ) : banner.tone === "halftime" ? null : banner.tone === "woodwork" ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 animate-bounce">
              <div className="flex items-center gap-3 rounded-xl border-2 border-amber-400 bg-slate-950/95 backdrop-blur-md px-4 py-2 text-white shadow-[0_0_30px_rgba(251,191,36,0.65)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-slate-950 text-sm font-black shadow-md">
                  💥
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-amber-300 font-bold">
                    Bola na Trave • {banner.clubName ?? "Quase Gol"} ({banner.minute}')
                  </div>
                  <div className="text-xs font-black text-white">
                    {banner.text}
                  </div>
                </div>
              </div>
            </div>
          ) : banner.tone === "corner" ? (
            <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 animate-bounce">
              <div className="flex items-center gap-3 rounded-xl border border-cyan-400/70 bg-slate-950/95 backdrop-blur-md px-4 py-2 text-white shadow-[0_0_30px_rgba(34,211,238,0.45)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400 text-slate-950 font-black shadow-md">
                  <Flag className="h-4 w-4 fill-current" />
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-cyan-300 font-bold">
                    Escanteio • Bola Parada ({banner.minute}')
                  </div>
                  <div className="text-xs font-black text-white">
                    Cobrança: {banner.scorerName || banner.text}
                  </div>
                </div>
              </div>
            </div>
          ) : banner.tone === "substitution" ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 w-[86%] max-w-[300px] -translate-x-1/2">
              <div className="overflow-hidden rounded-xl border-2 border-emerald-400/70 bg-slate-950/95 backdrop-blur-md text-white shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-1">
                  <div className="flex items-center gap-1.5">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-300">
                      Substituição • {banner.clubName}
                    </span>
                  </div>
                  {banner.minute !== undefined && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[10px] font-black text-amber-300">
                      {banner.minute}'
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1 p-2">
                  <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                        <ArrowUp className="h-2.5 w-2.5 stroke-[3]" /> ENTRA
                      </span>
                      {banner.scorerShirt !== undefined && (
                        <span className="font-mono text-[11px] font-black text-emerald-300">
                          #{banner.scorerShirt}
                        </span>
                      )}
                      <span className="truncate text-xs font-black text-white">
                        {banner.scorerName}
                      </span>
                    </div>
                  </div>
                  {banner.assistName && (
                    <div className="flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="inline-flex items-center gap-0.5 rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                          <ArrowDown className="h-2.5 w-2.5 stroke-[3]" /> SAI
                        </span>
                        {banner.assistShirt !== undefined && (
                          <span className="font-mono text-[11px] font-black text-rose-300">
                            #{banner.assistShirt}
                          </span>
                        )}
                        <span className="truncate text-xs font-bold text-rose-100">
                          {banner.assistName}
                        </span>
                      </div>
                    </div>
                  )}
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
                    : banner.tone === "offside"
                    ? "bg-orange-500 text-slate-950 border-orange-200"
                    : "bg-rose-500 text-white border-rose-200"
                }`}
              >
                {banner.text}
              </div>
            </div>
          ))}

        {/* Interactive Halftime Overlay directly on top of the 2D Pitch */}
        {isHalftime && !session.finished && (
          <div className="absolute left-1/2 top-3 z-40 w-[92%] max-w-sm -translate-x-1/2">
            <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-amber-400/80 bg-slate-950/95 backdrop-blur-md px-3.5 py-2 text-white shadow-[0_0_30px_rgba(245,158,11,0.5)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950 shadow-md">
                  <Pause className="h-4 w-4 fill-current" />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-widest text-amber-300 font-black">
                    Intervalo • Fim do 1ºT
                  </div>
                  <div className="truncate text-xs font-bold text-slate-200">
                    {homeClub.shortName} {session.homeGoals} x {session.awayGoals} {awayClub.shortName}
                  </div>
                </div>
              </div>
              {onStartSecondHalf && (
                <button
                  type="button"
                  onClick={onStartSecondHalf}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md transition hover:bg-amber-300 hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Iniciar 2º Tempo</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Interactive Full-Time Overlay directly on top of the 2D Pitch */}
        {session.finished && (
          <div className="absolute left-1/2 top-3 z-40 w-[92%] max-w-sm -translate-x-1/2">
            <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-400/80 bg-slate-950/95 backdrop-blur-md px-3.5 py-2 text-white shadow-[0_0_30px_rgba(16,185,129,0.5)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 shadow-md">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-widest text-emerald-300 font-black">
                    Fim de Jogo • Placar Final
                  </div>
                  <div className="truncate text-xs font-bold text-slate-200">
                    {homeClub.shortName} {session.homeGoals} x {session.awayGoals} {awayClub.shortName}
                  </div>
                </div>
              </div>
              {onFinishMatch && (
                <button
                  type="button"
                  onClick={onFinishMatch}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md transition hover:bg-emerald-400 hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Finalizar Partida</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 22 Active Players (Sofascore Official Layout) */}
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
          const isCardTarget = cardHighlight?.playerId === playerId;
          const isSubTarget = subHighlight?.playerInId === playerId;
          const subbedInInfo = subbedInMap.get(playerId);
          const stamina = Math.round(session.playerStamina[playerId] ?? player.stamina);
          const numRating = session.playerRatings[playerId] ?? 6.5;
          const rating = numRating.toFixed(1);
          const sofascoreStyle = getSofascoreRatingColor(numRating);
          const isTopRated = topRatedPlayerId === playerId;
          const goalsCount = playerGoalsMap.get(playerId) ?? 0;
          const surname = getPlayerDisplayName(player.name);

          return (
            <button
              key={playerId}
              type="button"
              disabled={!isUserPlayer || session.finished}
              onClick={() => isUserPlayer && !session.finished && onSelectSubOut(playerId)}
              title={`${player.name} (${player.primaryPosition}) • Nota Sofascore ${rating}${
                isTopRated ? " ★ Melhor em Campo" : ""
              }${subbedInInfo ? ` • Entrou aos ${subbedInInfo.minute}'` : ""} • Energia ${stamina}%`}
              style={{
                left: `${info.coord.x}%`,
                top: `${info.coord.y}%`,
                transitionDuration: `${pitchTickMs}ms`,
              }}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-[left,top,transform] ease-linear ${
                isUserPlayer && !session.finished ? "cursor-pointer hover:scale-110" : "cursor-default"
              }`}
            >
              {/* Floating Card Highlight Notification over Player */}
              {isCardTarget && cardHighlight && (
                <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center animate-bounce">
                  {cardHighlight.type === "yellow_card" ? (
                    <>
                      <div className="h-5 w-3.5 rounded-[2px] bg-amber-400 border border-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.9)]" />
                      <span className="mt-0.5 whitespace-nowrap rounded bg-slate-950/95 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/50 shadow-md">
                        Amarelo ({cardHighlight.minute}')
                      </span>
                    </>
                  ) : cardHighlight.type === "red_card" ? (
                    <>
                      <div className="h-5 w-3.5 rounded-[2px] bg-rose-600 border border-rose-200 shadow-[0_0_18px_rgba(225,29,72,0.9)]" />
                      <span className="mt-0.5 whitespace-nowrap rounded bg-slate-950/95 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-rose-300 ring-1 ring-rose-500/50 shadow-md">
                        Expulsão ({cardHighlight.minute}')
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 border border-white shadow-[0_0_15px_rgba(225,29,72,0.8)] text-white">
                        <Plus className="h-3 w-3 stroke-[3]" />
                      </div>
                      <span className="mt-0.5 whitespace-nowrap rounded bg-slate-950/95 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-rose-300 ring-1 ring-rose-500/50 shadow-md">
                        Lesão ({cardHighlight.minute}')
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Floating Substitution-In Notification over Newly Entered Player */}
              {isSubTarget && subHighlight && (
                <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center animate-bounce">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-slate-950 ring-2 ring-white shadow-[0_0_15px_rgba(16,185,129,0.9)]">
                    <ArrowUp className="h-2.5 w-2.5 stroke-[3]" /> ENTROU ({subHighlight.minute}')
                  </span>
                  {subHighlight.playerOutName && (
                    <span className="mt-0.5 whitespace-nowrap rounded bg-slate-950/95 px-1.5 py-0.2 text-[7px] font-bold text-rose-300 ring-1 ring-rose-500/40">
                      Saiu: {getPlayerDisplayName(subHighlight.playerOutName)}
                    </span>
                  )}
                </div>
              )}

              {/* Floating Tag when Manager Selects Player to Sub Out */}
              {isSubSelected && !isSubTarget && (
                <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center animate-pulse">
                  <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-md bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-slate-950 ring-2 ring-white shadow-[0_0_14px_rgba(251,191,36,0.9)]">
                    <ArrowDown className="h-2.5 w-2.5 stroke-[3]" /> VAI SAIR
                  </span>
                </div>
              )}

              {/* Sofascore Goal Scorer Football Badge on Top of Token */}
              {goalsCount > 0 && (
                <span
                  title={`${goalsCount} gol(s) na partida`}
                  className="pointer-events-none -mb-1.5 z-30 inline-flex items-center gap-0.5 rounded-full bg-white px-1 py-0.2 text-[8px] font-black leading-none text-slate-950 ring-1 ring-slate-900 shadow-md"
                >
                  <span>⚽</span>
                  {goalsCount > 1 && <span>{goalsCount}</span>}
                </span>
              )}

              {/* Token: Kit SVG or Sofascore Circle */}
              {showKits ? (
                <div
                  className={`relative rounded-lg transition-transform ${
                    isCardTarget && cardHighlight?.type === "yellow_card"
                      ? "ring-4 ring-amber-400 shadow-[0_0_20px_#f59e0b] scale-120 animate-pulse"
                      : isCardTarget && cardHighlight?.type === "red_card"
                      ? "ring-4 ring-rose-600 shadow-[0_0_25px_#e11d48] scale-120 animate-pulse"
                      : isSubTarget
                      ? "ring-4 ring-emerald-400 shadow-[0_0_22px_#10b981] scale-120 animate-pulse"
                      : isSubSelected
                      ? "ring-3 ring-amber-400 bg-amber-400/30 scale-115 shadow-[0_0_16px_rgba(251,191,36,0.7)]"
                      : isCarrier
                      ? "ring-2 ring-white ring-offset-1 ring-offset-emerald-700 scale-110 shadow-lg"
                      : ""
                  }`}
                >
                  <ClubKit
                    club={club}
                    variant={variant}
                    size={activePitchSize === "full" ? "md" : "sm"}
                    number={player.shirtNumber ?? info.label.slice(0, 2)}
                  />
                  {hasYellow && (
                    <span
                      title="Cartão Amarelo"
                      className="absolute -left-1 -top-1 z-20 flex h-3 w-2 items-center justify-center rounded-[1px] bg-amber-400 border border-amber-700 shadow"
                    />
                  )}
                  {subbedInInfo && (
                    <span
                      title={`Entrou aos ${subbedInInfo.minute}'${
                        subbedInInfo.outName ? ` no lugar de ${subbedInInfo.outName}` : ""
                      }`}
                      className="absolute -right-1.5 -top-1 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-slate-950 ring-1 ring-white shadow"
                    >
                      <ArrowUp className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                  {isInjured && (
                    <span className="absolute -left-1 -bottom-0.5 z-20 flex h-3 w-3 items-center justify-center rounded-full bg-rose-600 text-[8px] font-black text-white ring-1 ring-white">
                      +
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className={`relative flex items-center justify-center rounded-full font-black shadow-md transition-transform ${
                    activePitchSize === "full"
                      ? "h-8 w-8 text-[11px]"
                      : activePitchSize === "large"
                      ? "h-7 w-7 text-[10px]"
                      : "h-6 w-6 text-[9px]"
                  } ${
                    isCardTarget && cardHighlight?.type === "yellow_card"
                      ? "ring-4 ring-amber-400 shadow-[0_0_20px_#f59e0b] scale-120 animate-pulse"
                      : isCardTarget && cardHighlight?.type === "red_card"
                      ? "ring-4 ring-rose-600 shadow-[0_0_25px_#e11d48] scale-120 animate-pulse"
                      : isSubTarget
                      ? "ring-4 ring-emerald-400 shadow-[0_0_22px_#10b981] scale-120 animate-pulse"
                      : isSubSelected
                      ? "ring-3 ring-amber-400 scale-115 shadow-[0_0_16px_rgba(251,191,36,0.7)]"
                      : isCarrier
                      ? "ring-2 ring-white ring-offset-1 ring-offset-emerald-700 scale-110"
                      : "ring-1 ring-black/60"
                  }`}
                  style={{
                    backgroundColor: kitColors.primary,
                    color: textColor,
                    borderColor: kitColors.secondary,
                    borderWidth: "2px",
                  }}
                >
                  {player.shirtNumber ?? info.label.slice(0, 2)}

                  {hasYellow && (
                    <span
                      title="Cartão Amarelo"
                      className="absolute -left-1 -top-1 z-20 flex h-3 w-2 items-center justify-center rounded-[1px] bg-amber-400 border border-amber-700 shadow"
                    />
                  )}
                  {subbedInInfo && (
                    <span
                      title={`Entrou aos ${subbedInInfo.minute}'${
                        subbedInInfo.outName ? ` no lugar de ${subbedInInfo.outName}` : ""
                      }`}
                      className="absolute -right-1.5 -top-1 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-slate-950 ring-1 ring-white shadow"
                    >
                      <ArrowUp className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                  {isInjured && (
                    <span className="absolute -left-1 -bottom-0.5 z-20 flex h-3 w-3 items-center justify-center rounded-full bg-rose-600 text-[8px] font-black text-white ring-1 ring-white">
                      +
                    </span>
                  )}
                </div>
              )}

              {/* Official Sofascore Rectangular Rating Badge coupled directly beneath the player token */}
              {(showRatings || session.finished) && (
                <div
                  style={{
                    backgroundColor: sofascoreStyle.bg,
                    color: sofascoreStyle.text,
                    borderColor: sofascoreStyle.border,
                    boxShadow: sofascoreStyle.glow ? `0 2px 6px ${sofascoreStyle.glow}` : undefined,
                  }}
                  className={`-mt-1.5 z-20 inline-flex items-center justify-center gap-0.5 rounded-[3px] border px-1.5 py-0.2 font-mono text-[9px] font-black leading-tight shadow-md ${
                    isTopRated ? "ring-1 ring-amber-300 scale-105" : ""
                  }`}
                >
                  {isTopRated && (
                    <Star className="h-2 w-2 fill-amber-300 text-amber-300 inline shrink-0" />
                  )}
                  <span>{rating}</span>
                </div>
              )}

              {/* Sofascore Clean Player Name with crisp drop-shadow + micro stamina bar */}
              {showNames && (
                <div className="mt-0.5 flex flex-col items-center pointer-events-none">
                  <span className="max-w-[72px] truncate px-1 text-[9px] sm:text-[10px] font-bold leading-tight text-white tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.98)]">
                    {surname}
                  </span>
                  {!session.finished && (
                    <div className="mt-0.5 h-0.5 w-5 overflow-hidden rounded-full bg-slate-950/85">
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

        {/* Animated Ball with Ground Shadow, 3D Elevation & Altitude Scale */}
        {!session.finished && (
          <>
            {/* Ground Shadow on Pitch */}
            <div
              className="pointer-events-none absolute z-15 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 transition-[opacity,transform] duration-75"
              style={{
                left: `${ballVisual.x}%`,
                top: `${ballVisual.y}%`,
                width: `${Math.max(6, 13 * (1 - ballVisual.altitude * 0.45))}px`,
                height: `${Math.max(3.5, 7.5 * (1 - ballVisual.altitude * 0.45))}px`,
                opacity: 0.7 - ballVisual.altitude * 0.35,
                filter: `blur(${ballVisual.altitude * 2.8}px)`,
                transform: `translate(-50%, -50%) translate(${ballVisual.altitude * 7}px, ${ballVisual.altitude * 5}px)`,
              }}
            />

            {/* Ball Body in 3D Flight */}
            <div
              style={{
                left: `${ballVisual.x}%`,
                top: `${ballVisual.y}%`,
                transform: `translate(-50%, -50%) translateY(${-ballVisual.altitude * 28}px) scale(${1 + ballVisual.altitude * 0.75})`,
              }}
              className="pointer-events-none absolute z-25 -translate-x-1/2 -translate-y-1/2 transition-[transform] duration-75 ease-out"
            >
              <div className="relative flex items-center justify-center">
                {/* Flat 2D Soccer Ball Token */}
                <div
                  className={`rounded-full bg-white border-2 border-slate-950 shadow-md flex items-center justify-center ${
                    activePitchSize === "full"
                      ? "h-4 w-4"
                      : activePitchSize === "large"
                      ? "h-3.5 w-3.5 sm:h-4 sm:w-4"
                      : "h-3 w-3 sm:h-3.5 sm:w-3.5"
                  }`}
                >
                  <div
                    className={`rounded-full bg-slate-950 ${
                      activePitchSize === "full" ? "h-1.5 w-1.5" : "h-1 w-1"
                    }`}
                  />
                </div>

                {/* Aerial altitude pill */}
                {ballVisual.altitude > 0.45 && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-slate-950/90 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-sky-300 ring-1 ring-sky-400/50 shadow-sm">
                    <ArrowUp className="h-2 w-2" />
                    <span>ALTO</span>
                  </span>
                )}
              </div>
            </div>
          </>
        )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3 text-slate-400" />
            <strong className="text-white">
              {session.attendance.toLocaleString("pt-BR")}
            </strong>{" "}
            ({Math.round((session.attendance / Math.max(1, session.stadiumCapacity)) * 100)}%)
          </span>
          <span className="flex items-center gap-1">
            <Coins className="h-3 w-3 text-emerald-400" />
            <strong className="text-emerald-400">{formatMoney(session.gateRevenueEur)}</strong>
          </span>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-300" />
            <strong className="text-amber-300">+{session.homeAdvantagePct.toFixed(1)}% Casa</strong>
          </span>
        </div>

        {/* Sofascore Official Rating Legend */}
        <div className="flex items-center gap-1 text-[8px] font-mono">
          <span className="text-slate-400 mr-0.5 font-sans font-bold uppercase tracking-wider">
            Sofascore:
          </span>
          <span className="rounded-[2px] bg-[#dc2626] px-1 py-0.2 font-black text-white">
            &lt;6.0
          </span>
          <span className="rounded-[2px] bg-[#ea580c] px-1 py-0.2 font-black text-white">
            6.0
          </span>
          <span className="rounded-[2px] bg-[#d97706] px-1 py-0.2 font-black text-white">
            6.5
          </span>
          <span className="rounded-[2px] bg-[#16a34a] px-1 py-0.2 font-black text-white">
            7.0+
          </span>
          <span className="rounded-[2px] bg-[#0284c7] px-1 py-0.2 font-black text-white">
            8.0+
          </span>
          <span className="rounded-[2px] bg-[#2563eb] px-1 py-0.2 font-black text-white">
            9.0+
          </span>
        </div>
      </div>
    </div>
  );
};
