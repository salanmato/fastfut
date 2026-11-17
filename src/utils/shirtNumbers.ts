import type { Player, RoleCategory } from "../types/game";

const KNOWN_HISTORICAL_BY_NORMALIZED_NAME: Record<string, number[]> = {
  "bukayo saka": [7, 87],
  "b. saka": [7, 87],
  "martin odegaard": [8, 11, 21],
  "m. odegaard": [8, 11, 21],
  "declan rice": [41, 4, 6],
  "d. rice": [41, 4, 6],
  "kai havertz": [29, 7, 9],
  "k. havertz": [29, 7, 9],
  "william saliba": [2, 4, 12],
  "w. saliba": [2, 4, 12],
  "gabriel magalhaes": [6, 4],
  "gabriel": [6, 4],
  "david raya": [22, 1],
  "d. raya": [22, 1],
  "erling haaland": [9, 19, 30],
  "e. haaland": [9, 19, 30],
  "phil foden": [47, 10, 11],
  "p. foden": [47, 10, 11],
  "rodri": [16, 14],
  "bernardo silva": [20, 10],
  "cole palmer": [20, 10, 80],
  "c. palmer": [20, 10, 80],
  "enzo fernandez": [8, 5, 13, 24],
  "moises caicedo": [25, 23],
  "mohamed salah": [11, 10, 22, 74],
  "m. salah": [11, 10, 22, 74],
  "virgil van dijk": [4, 5, 17],
  "v. van dijk": [4, 5, 17],
  "trent alexander arnold": [66, 2, 8],
  "t. alexander arnold": [66, 2, 8],
  "alisson": [1, 13],
  "alexis mac allister": [10, 8],
  "bruno fernandes": [8, 18],
  "b. fernandes": [8, 18],
  "heung min son": [7, 40],
  "h. son": [7, 40],
  "james maddison": [10, 8, 23],
  "alexander isak": [14, 9, 19],
  "a. isak": [14, 9, 19],
  "bruno guimaraes": [39, 8],
  "anthony gordon": [10, 11, 24],
  "ollie watkins": [11, 14, 9],
  "o. watkins": [11, 14, 9],
  "emiliano martinez": [23, 1, 26],
  "e. martinez": [23, 1, 26],
  "jordan pickford": [1, 13],
  "j. pickford": [1, 13],
  "jarrod bowen": [20, 7, 17],
  "j. bowen": [20, 7, 17],
  "lucas paqueta": [10, 7, 11],
  "kylian mbappe": [9, 7, 10, 29],
  "k. mbappe": [9, 7, 10, 29],
  "vinicius jr": [7, 20, 11],
  "vini jr": [7, 20, 11],
  "jude bellingham": [5, 22, 10],
  "j. bellingham": [5, 22, 10],
  "harry kane": [9, 10, 18],
  "h. kane": [9, 10, 18],
  "lamine yamal": [19, 27, 10],
  "pedri": [8, 16, 21],
  "robert lewandowski": [9, 8],
  "viktor gyokeres": [9, 14, 17],
  "v. gyokeres": [9, 14, 17],
};

function normalizeLookupName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getRoleIdealNumbers(
  primaryPosition: string,
  roleCategory: RoleCategory
): number[] {
  const pos = primaryPosition.toUpperCase().trim();
  if (pos === "GK" || roleCategory === "GK") return [1, 12, 13, 22, 23, 31];
  if (pos === "RB" || pos === "RWB") return [2, 12, 17, 22, 24];
  if (pos === "LB" || pos === "LWB") return [3, 6, 12, 15, 21];
  if (pos === "CB" || roleCategory === "DEF") return [3, 4, 5, 6, 14, 15, 16, 24, 25];
  if (pos === "CDM") return [4, 5, 6, 8, 14, 16, 25];
  if (pos === "CM") return [6, 8, 10, 14, 16, 17, 18, 20, 21];
  if (pos === "CAM") return [7, 8, 10, 11, 14, 19, 20, 21];
  if (pos === "RW" || pos === "RM") return [7, 10, 11, 14, 17, 19, 20, 22];
  if (pos === "LW" || pos === "LM") return [7, 10, 11, 14, 17, 19, 20, 21];
  if (pos === "ST" || pos === "CF" || roleCategory === "ATT") {
    return [7, 9, 10, 11, 14, 18, 19, 20];
  }
  return [6, 8, 10, 14, 18, 20];
}

export function getPlayerPreferredNumbers(
  player: Pick<Player, "id" | "eaId" | "name" | "fullName" | "primaryPosition" | "roleCategory" | "preferredNumbers">
): number[] {
  if (player.preferredNumbers && player.preferredNumbers.length > 0) {
    return player.preferredNumbers;
  }

  const byFull = KNOWN_HISTORICAL_BY_NORMALIZED_NAME[normalizeLookupName(player.fullName)];
  if (byFull) return byFull;

  const byShort = KNOWN_HISTORICAL_BY_NORMALIZED_NAME[normalizeLookupName(player.name)];
  if (byShort) return byShort;

  const rolePool = getRoleIdealNumbers(player.primaryPosition, player.roleCategory);
  const seed = Math.abs((player.eaId || player.id) * 31 + player.id * 7);
  const altSquadPool =
    player.roleCategory === "GK"
      ? [1, 12, 13, 22, 23, 30, 31, 33, 40]
      : [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 29, 32, 34, 37, 45];

  const primaryPref = rolePool[seed % Math.min(3, rolePool.length)];
  const secondPref = rolePool[(seed + 3) % rolePool.length];
  const youthPref = altSquadPool[(seed + 5) % altSquadPool.length];

  return Array.from(new Set([primaryPref, secondPref, youthPref])).slice(0, 3);
}

export type ShirtAffinityTier = "perfect" | "good" | "neutral" | "awkward";

export interface ShirtAffinityResult {
  tier: ShirtAffinityTier;
  matchesRole: boolean;
  matchesHistory: boolean;
  multiplier: number;
  bonusPctText: string;
  label: string;
  roleNumbers: number[];
  historyNumbers: number[];
}

export function evaluateShirtNumberAffinity(player: Player): ShirtAffinityResult {
  const num = player.shirtNumber;
  const roleNumbers = getRoleIdealNumbers(player.primaryPosition, player.roleCategory);
  const historyNumbers = getPlayerPreferredNumbers(player);

  if (!num) {
    return {
      tier: "neutral",
      matchesRole: false,
      matchesHistory: false,
      multiplier: 1.0,
      bonusPctText: "0%",
      label: "Sem Número",
      roleNumbers,
      historyNumbers,
    };
  }

  const matchesRole = roleNumbers.includes(num);
  const matchesHistory = historyNumbers.includes(num);

  const isOutfieldWithKeeperNum =
    player.roleCategory !== "GK" && (num === 1 || num === 13);
  const isKeeperWithAttackerNum =
    player.roleCategory === "GK" && [7, 8, 9, 10, 11].includes(num);

  if (isOutfieldWithKeeperNum || isKeeperWithAttackerNum) {
    return {
      tier: "awkward",
      matchesRole: false,
      matchesHistory: false,
      multiplier: 0.98,
      bonusPctText: "-2.0%",
      label: "Fora de Função",
      roleNumbers,
      historyNumbers,
    };
  }

  const isIconicMatch =
    (player.roleCategory === "GK" && num === 1 && matchesHistory) ||
    ((player.primaryPosition === "ST" || player.primaryPosition === "CF") &&
      num === 9 &&
      matchesHistory) ||
    (player.primaryPosition === "CAM" && num === 10 && matchesHistory);

  if ((matchesRole && matchesHistory) || isIconicMatch) {
    return {
      tier: "perfect",
      matchesRole,
      matchesHistory,
      multiplier: 1.04,
      bonusPctText: "+4.0%",
      label: "Ideal (Função + Histórico)",
      roleNumbers,
      historyNumbers,
    };
  }

  if (matchesRole || matchesHistory) {
    return {
      tier: "good",
      matchesRole,
      matchesHistory,
      multiplier: 1.025,
      bonusPctText: "+2.5%",
      label: matchesHistory ? "Número que já usou" : "Número da Função",
      roleNumbers,
      historyNumbers,
    };
  }

  return {
    tier: "neutral",
    matchesRole: false,
    matchesHistory: false,
    multiplier: 1.0,
    bonusPctText: "0%",
    label: "Neutro",
    roleNumbers,
    historyNumbers,
  };
}

function pickBestFreeNumber(
  player: Player,
  usedNumbers: Set<number>,
  preferHighAffinity: boolean
): number {
  const history = getPlayerPreferredNumbers(player);
  const role = getRoleIdealNumbers(player.primaryPosition, player.roleCategory);

  if (preferHighAffinity) {
    // 1st choice: both history & role
    for (const n of history) {
      if (role.includes(n) && !usedNumbers.has(n)) return n;
    }
    // 2nd choice: history
    for (const n of history) {
      if (!usedNumbers.has(n)) return n;
    }
    // 3rd choice: role
    for (const n of role) {
      if (!usedNumbers.has(n)) return n;
    }
  } else {
    // Prefer standard squad number first if reserving 1..11, or natural role/history
    for (const n of [...history, ...role]) {
      if (!usedNumbers.has(n)) return n;
    }
  }

  // Fallback sequence: start from 12 for outfielders so #1/#13 aren't handed to strikers if avoidable
  const fallbackOrder: number[] =
    player.roleCategory === "GK"
      ? [1, 13, 12, 22, 23, 31, ...Array.from({ length: 85 }, (_, i) => i + 14)]
      : [
          ...Array.from({ length: 88 }, (_, i) => i + 12).filter((n) => n !== 13),
          ...Array.from({ length: 10 }, (_, i) => i + 2),
          13,
          1,
        ];

  for (const n of fallbackOrder) {
    if (n >= 1 && n <= 99 && !usedNumbers.has(n)) return n;
  }
  return 99;
}

export function autoAssignClubShirtNumbers(
  players: Player[],
  clubId: number,
  starterIds: number[] = []
): Player[] {
  const starterRank = new Map<number, number>();
  starterIds.forEach((id, idx) => starterRank.set(id, idx));

  const clubSquad = players
    .filter((p) => p.clubId === clubId)
    .sort((a, b) => {
      const aStarter = starterRank.has(a.id);
      const bStarter = starterRank.has(b.id);
      if (aStarter && !bStarter) return -1;
      if (!aStarter && bStarter) return 1;
      return b.overall - a.overall || a.id - b.id;
    });

  const used = new Set<number>();
  const assignedById = new Map<number, number>();

  for (const p of clubSquad) {
    const picked = pickBestFreeNumber(p, used, true);
    used.add(picked);
    assignedById.set(p.id, picked);
  }

  return players.map((p) => {
    const pref = getPlayerPreferredNumbers(p);
    if (p.clubId !== clubId) {
      return p.preferredNumbers ? p : { ...p, preferredNumbers: pref };
    }
    return {
      ...p,
      preferredNumbers: pref,
      shirtNumber: assignedById.get(p.id) ?? p.shirtNumber,
    };
  });
}

export function ensureAllPlayersShirtNumbers(players: Player[]): Player[] {
  // Fast check to preserve existing valid assignments
  const byClub = new Map<number, Player[]>();
  for (const p of players) {
    if (p.clubId !== null) {
      const list = byClub.get(p.clubId) ?? [];
      list.push(p);
      byClub.set(p.clubId, list);
    }
  }

  const resolvedNumberById = new Map<number, number>();

  for (const [, squad] of byClub) {
    const used = new Set<number>();
    const ordered = [...squad].sort((a, b) => b.overall - a.overall || a.id - b.id);
    const needsAssignment: Player[] = [];

    for (const p of ordered) {
      if (
        typeof p.shirtNumber === "number" &&
        p.shirtNumber >= 1 &&
        p.shirtNumber <= 99 &&
        !used.has(p.shirtNumber)
      ) {
        used.add(p.shirtNumber);
        resolvedNumberById.set(p.id, p.shirtNumber);
      } else {
        needsAssignment.push(p);
      }
    }

    for (const p of needsAssignment) {
      const picked = pickBestFreeNumber(p, used, true);
      used.add(picked);
      resolvedNumberById.set(p.id, picked);
    }
  }

  return players.map((p) => {
    const preferredNumbers =
      p.preferredNumbers && p.preferredNumbers.length > 0
        ? p.preferredNumbers
        : getPlayerPreferredNumbers(p);
    const nextShirt =
      p.clubId !== null
        ? resolvedNumberById.get(p.id) ?? p.shirtNumber
        : p.shirtNumber;

    if (p.preferredNumbers === preferredNumbers && p.shirtNumber === nextShirt) {
      return p;
    }
    return {
      ...p,
      preferredNumbers,
      shirtNumber: nextShirt,
    };
  });
}

export function changeClubPlayerShirtNumber(
  players: Player[],
  clubId: number,
  playerId: number,
  nextNumber: number
): { nextPlayers: Player[]; swappedWith?: Player } {
  const clamped = Math.max(1, Math.min(99, Math.round(nextNumber)));
  const targetPlayer = players.find((p) => p.id === playerId && p.clubId === clubId);
  if (!targetPlayer) return { nextPlayers: players };

  const prevNumber = targetPlayer.shirtNumber;
  if (prevNumber === clamped) return { nextPlayers: players };

  const occupant = players.find(
    (p) => p.clubId === clubId && p.id !== playerId && p.shirtNumber === clamped
  );

  const nextPlayers = players.map((p) => {
    if (p.id === playerId) {
      return {
        ...p,
        shirtNumber: clamped,
        preferredNumbers: getPlayerPreferredNumbers(p),
      };
    }
    if (occupant && p.id === occupant.id) {
      return {
        ...p,
        shirtNumber: prevNumber,
        preferredNumbers: getPlayerPreferredNumbers(p),
      };
    }
    return p;
  });

  return { nextPlayers, swappedWith: occupant };
}
