import type { Formation, RoleCategory } from "../types/game";

export function formatMoney(eur: number): string {
  if (eur >= 1_000_000) {
    const millions = eur / 1_000_000;
    return `€${millions >= 10 ? millions.toFixed(1) : millions.toFixed(2)}M`;
  }
  if (eur >= 1_000) {
    return `€${Math.round(eur / 1_000)}K`;
  }
  return `€${eur}`;
}

export function formatWage(weeklyEur: number): string {
  return `${formatMoney(weeklyEur)}/sem`;
}

export function getOverallColor(ovr: number): string {
  if (ovr >= 86) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (ovr >= 80) return "bg-teal-500/20 text-teal-300 border-teal-500/40";
  if (ovr >= 74) return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  if (ovr >= 68) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-slate-600/30 text-slate-300 border-slate-500/40";
}

export function getStatBarColor(val: number): string {
  if (val >= 85) return "bg-emerald-400";
  if (val >= 76) return "bg-teal-400";
  if (val >= 66) return "bg-amber-400";
  return "bg-rose-400";
}

export function getStatTextColor(val: number): string {
  if (val >= 85) return "text-emerald-300";
  if (val >= 76) return "text-teal-300";
  if (val >= 66) return "text-amber-300";
  return "text-rose-300";
}

export function getRoleBadgeClass(role: RoleCategory): string {
  switch (role) {
    case "GK":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "DEF":
      return "bg-sky-500/20 text-sky-300 border-sky-500/40";
    case "MID":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "ATT":
      return "bg-rose-500/20 text-rose-300 border-rose-500/40";
  }
}

export function getStaminaColor(stamina: number): string {
  if (stamina >= 80) return "bg-emerald-500";
  if (stamina >= 60) return "bg-amber-400";
  return "bg-rose-500";
}

export interface FormationSlot {
  slotIndex: number;
  label: string;
  roleCategory: RoleCategory;
  preferredPositions: string[];
  x: number; // percentage left->right (0..100)
  y: number; // percentage top->bottom (0..100, GK at bottom ~88)
}

export const FORMATION_SLOTS: Record<Formation, FormationSlot[]> = {
  "4-3-3": [
    { slotIndex: 0, label: "GK", roleCategory: "GK", preferredPositions: ["GK"], x: 50, y: 89 },
    { slotIndex: 1, label: "LB", roleCategory: "DEF", preferredPositions: ["LB", "LWB", "CB"], x: 16, y: 70 },
    { slotIndex: 2, label: "CB", roleCategory: "DEF", preferredPositions: ["CB", "CDM"], x: 38, y: 73 },
    { slotIndex: 3, label: "CB", roleCategory: "DEF", preferredPositions: ["CB", "CDM"], x: 62, y: 73 },
    { slotIndex: 4, label: "RB", roleCategory: "DEF", preferredPositions: ["RB", "RWB", "CB"], x: 84, y: 70 },
    { slotIndex: 5, label: "CDM", roleCategory: "MID", preferredPositions: ["CDM", "CM"], x: 50, y: 54 },
    { slotIndex: 6, label: "CM", roleCategory: "MID", preferredPositions: ["CM", "CAM", "LM"], x: 30, y: 44 },
    { slotIndex: 7, label: "CM", roleCategory: "MID", preferredPositions: ["CM", "CAM", "RM"], x: 70, y: 44 },
    { slotIndex: 8, label: "LW", roleCategory: "ATT", preferredPositions: ["LW", "LM", "ST"], x: 20, y: 22 },
    { slotIndex: 9, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF"], x: 50, y: 15 },
    { slotIndex: 10, label: "RW", roleCategory: "ATT", preferredPositions: ["RW", "RM", "ST"], x: 80, y: 22 },
  ],
  "4-4-2": [
    { slotIndex: 0, label: "GK", roleCategory: "GK", preferredPositions: ["GK"], x: 50, y: 89 },
    { slotIndex: 1, label: "LB", roleCategory: "DEF", preferredPositions: ["LB", "LWB", "CB"], x: 16, y: 71 },
    { slotIndex: 2, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 38, y: 74 },
    { slotIndex: 3, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 62, y: 74 },
    { slotIndex: 4, label: "RB", roleCategory: "DEF", preferredPositions: ["RB", "RWB", "CB"], x: 84, y: 71 },
    { slotIndex: 5, label: "LM", roleCategory: "MID", preferredPositions: ["LM", "LW", "CM"], x: 16, y: 45 },
    { slotIndex: 6, label: "CM", roleCategory: "MID", preferredPositions: ["CM", "CDM"], x: 39, y: 49 },
    { slotIndex: 7, label: "CM", roleCategory: "MID", preferredPositions: ["CM", "CDM", "CAM"], x: 61, y: 49 },
    { slotIndex: 8, label: "RM", roleCategory: "MID", preferredPositions: ["RM", "RW", "CM"], x: 84, y: 45 },
    { slotIndex: 9, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF"], x: 37, y: 18 },
    { slotIndex: 10, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF", "CAM"], x: 63, y: 18 },
  ],
  "4-2-3-1": [
    { slotIndex: 0, label: "GK", roleCategory: "GK", preferredPositions: ["GK"], x: 50, y: 89 },
    { slotIndex: 1, label: "LB", roleCategory: "DEF", preferredPositions: ["LB", "LWB", "CB"], x: 16, y: 72 },
    { slotIndex: 2, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 38, y: 75 },
    { slotIndex: 3, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 62, y: 75 },
    { slotIndex: 4, label: "RB", roleCategory: "DEF", preferredPositions: ["RB", "RWB", "CB"], x: 84, y: 72 },
    { slotIndex: 5, label: "CDM", roleCategory: "MID", preferredPositions: ["CDM", "CM"], x: 36, y: 55 },
    { slotIndex: 6, label: "CDM", roleCategory: "MID", preferredPositions: ["CDM", "CM"], x: 64, y: 55 },
    { slotIndex: 7, label: "LAM", roleCategory: "ATT", preferredPositions: ["LW", "LM", "CAM"], x: 20, y: 34 },
    { slotIndex: 8, label: "CAM", roleCategory: "MID", preferredPositions: ["CAM", "CM", "CF"], x: 50, y: 34 },
    { slotIndex: 9, label: "RAM", roleCategory: "ATT", preferredPositions: ["RW", "RM", "CAM"], x: 80, y: 34 },
    { slotIndex: 10, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF"], x: 50, y: 15 },
  ],
  "3-5-2": [
    { slotIndex: 0, label: "GK", roleCategory: "GK", preferredPositions: ["GK"], x: 50, y: 89 },
    { slotIndex: 1, label: "CB", roleCategory: "DEF", preferredPositions: ["CB", "LB"], x: 26, y: 73 },
    { slotIndex: 2, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 50, y: 75 },
    { slotIndex: 3, label: "CB", roleCategory: "DEF", preferredPositions: ["CB", "RB"], x: 74, y: 73 },
    { slotIndex: 4, label: "LWB", roleCategory: "MID", preferredPositions: ["LWB", "LM", "LB", "LW"], x: 14, y: 48 },
    { slotIndex: 5, label: "CDM", roleCategory: "MID", preferredPositions: ["CDM", "CM"], x: 38, y: 54 },
    { slotIndex: 6, label: "CM", roleCategory: "MID", preferredPositions: ["CM", "CAM"], x: 50, y: 40 },
    { slotIndex: 7, label: "CDM", roleCategory: "MID", preferredPositions: ["CDM", "CM"], x: 62, y: 54 },
    { slotIndex: 8, label: "RWB", roleCategory: "MID", preferredPositions: ["RWB", "RM", "RB", "RW"], x: 86, y: 48 },
    { slotIndex: 9, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF"], x: 37, y: 18 },
    { slotIndex: 10, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF"], x: 63, y: 18 },
  ],
  "5-3-2": [
    { slotIndex: 0, label: "GK", roleCategory: "GK", preferredPositions: ["GK"], x: 50, y: 89 },
    { slotIndex: 1, label: "LWB", roleCategory: "DEF", preferredPositions: ["LB", "LWB", "LM"], x: 14, y: 66 },
    { slotIndex: 2, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 32, y: 74 },
    { slotIndex: 3, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 50, y: 75 },
    { slotIndex: 4, label: "CB", roleCategory: "DEF", preferredPositions: ["CB"], x: 68, y: 74 },
    { slotIndex: 5, label: "RWB", roleCategory: "DEF", preferredPositions: ["RB", "RWB", "RM"], x: 86, y: 66 },
    { slotIndex: 6, label: "CM", roleCategory: "MID", preferredPositions: ["CM", "CDM"], x: 30, y: 47 },
    { slotIndex: 7, label: "CDM", roleCategory: "MID", preferredPositions: ["CDM", "CM"], x: 50, y: 52 },
    { slotIndex: 8, label: "CM", roleCategory: "MID", preferredPositions: ["CM", "CAM"], x: 70, y: 47 },
    { slotIndex: 9, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF"], x: 38, y: 19 },
    { slotIndex: 10, label: "ST", roleCategory: "ATT", preferredPositions: ["ST", "CF", "RW"], x: 62, y: 19 },
  ],
};

export function getFormationSlots(formation: Formation): FormationSlot[] {
  return FORMATION_SLOTS[formation];
}
