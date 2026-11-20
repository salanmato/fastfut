import type {
  Club,
  LoanInfo,
  Player,
  PlayerAttributes,
  PlayerDetailedStats,
  Tactics,
} from "../types/game";
import { autoPickLineup } from "./matchEngine";

function generateAttributes(
  overall: number,
  roleCat: string,
  isGk: boolean
): { faceStats: PlayerAttributes; stats: PlayerDetailedStats } {
  const base = Math.max(40, overall - 4);
  const faceStats: PlayerAttributes = {
    pace: isGk ? 45 : base + (roleCat === "ATT" ? 8 : 2),
    shooting: isGk ? 20 : base + (roleCat === "ATT" ? 6 : -6),
    passing: isGk ? 40 : base + (roleCat === "MID" ? 6 : 0),
    dribbling: isGk ? 30 : base + (roleCat === "ATT" || roleCat === "MID" ? 5 : -4),
    defending: isGk ? 25 : base + (roleCat === "DEF" ? 8 : -8),
    physicality: base + (isGk ? -5 : 3),
    reflexes: isGk ? overall + 2 : 50,
  };

  const s = overall;
  const stats: PlayerDetailedStats = {
    acceleration: faceStats.pace,
    sprintSpeed: faceStats.pace,
    positioning: faceStats.shooting,
    finishing: faceStats.shooting,
    shotPower: faceStats.shooting + 2,
    longShots: faceStats.shooting - 2,
    vision: faceStats.passing,
    crossing: faceStats.passing - 2,
    shortPassing: faceStats.passing + 2,
    longPassing: faceStats.passing,
    dribbling: faceStats.dribbling,
    agility: faceStats.dribbling + 2,
    reactions: s,
    ballControl: faceStats.dribbling,
    composure: s - 2,
    interceptions: faceStats.defending,
    headingAccuracy: faceStats.defending,
    defensiveAwareness: faceStats.defending,
    standingTackle: faceStats.defending,
    slidingTackle: faceStats.defending - 2,
    jumping: faceStats.physicality,
    stamina: 75,
    strength: faceStats.physicality,
    aggression: 65,
  };

  return { faceStats, stats };
}

function estimateMarketValue(overall: number, age: number): number {
  const base = Math.pow(overall / 40, 5) * 8000;
  const ageFactor = age <= 18 ? 2.5 : age <= 21 ? 1.8 : 1.0;
  return Math.round((base * ageFactor) / 50_000) * 50_000;
}

// Known real-world loans for extra authenticity
const KNOWN_LOAN_CONFIGS: Record<string, { parentClubName: string; buyOptionM?: number }> = {
  "Deivid Washington": { parentClubName: "Chelsea", buyOptionM: 12 },
  "Benjamín Rollheiser": { parentClubName: "SL Benfica", buyOptionM: 9.5 },
  "Álvaro Barreal": { parentClubName: "FC Cincinnati", buyOptionM: 7 },
  "Gabriel Menino": { parentClubName: "Atlético Mineiro", buyOptionM: 6.5 },
};

/**
 * Initializes and partitions all players of a club into first_team and youth squad.
 * Clubs maintain ~26-28 first-team players; remaining players under age 22 are placed in the youth academy.
 */
export function initializeSquadCategoriesAndLoans(
  allPlayers: Player[],
  clubs: Club[]
): Player[] {
  const clubByName = new Map<string, Club>(clubs.map((c) => [c.name.toLowerCase(), c]));

  // Group by club
  const playersByClub = new Map<number, Player[]>();
  const unassigned: Player[] = [];

  for (const p of allPlayers) {
    if (p.clubId === null) {
      unassigned.push(p);
      continue;
    }
    const list = playersByClub.get(p.clubId) ?? [];
    list.push(p);
    playersByClub.set(p.clubId, list);
  }

  const processed: Player[] = [];

  for (const [, squad] of playersByClub.entries()) {
    // Sort: highest overall first, then older first
    const sorted = [...squad].sort((a, b) => b.overall - a.overall || b.age - a.age);

    // First team target: 26 to 28 players
    const firstTeamTarget = Math.min(27, sorted.length);

    sorted.forEach((p, index) => {
      let squadCat: "first_team" | "youth" = "first_team";

      // If we already have 26 players and this player is young (<= 21) with lower OVR, send to youth
      if (index >= firstTeamTarget) {
        if (p.age <= 21 && p.overall < 75) {
          squadCat = "youth";
        } else if (index >= 32) {
          // Beyond 32 players, even 22-year-olds with lower rating go to development
          squadCat = p.age <= 22 ? "youth" : "first_team";
        }
      }

      // Check known loan configs
      let loanObj: LoanInfo | undefined = p.loan;
      const known = KNOWN_LOAN_CONFIGS[p.name];
      if (known && !loanObj) {
        const parent = clubByName.get(known.parentClubName.toLowerCase());
        loanObj = {
          isLoan: true,
          parentClubId: parent?.id ?? 9990,
          parentClubName: known.parentClubName,
          parentClubLeague: parent?.league ?? parent?.division ?? "Internacional",
          loanEndSeason: "2026/27",
          buyOptionFeeEur: known.buyOptionM ? known.buyOptionM * 1_000_000 : undefined,
          canPlayAgainstParentClub: false,
          wagePercentagePaid: 100,
        };
      }

      processed.push({
        ...p,
        squadCategory: p.squadCategory ?? squadCat,
        loan: loanObj,
      });
    });
  }

  return [...processed, ...unassigned];
}

/**
 * Promotes a player from Youth Squad to First Team
 */
export function promoteYouthPlayer(
  players: Player[],
  playerId: number,
  userClubId: number
): { nextPlayers: Player[]; promotedPlayer: Player | undefined } {
  let promoted: Player | undefined;

  const nextPlayers = players.map((p) => {
    if (p.id === playerId && p.clubId === userClubId) {
      promoted = { ...p, squadCategory: "first_team" as const };
      return promoted;
    }
    return p;
  });

  return { nextPlayers, promotedPlayer: promoted };
}

/**
 * Demotes a player from First Team to Youth Squad (only if age <= 21)
 */
export function demoteToYouthSquad(
  players: Player[],
  playerId: number,
  userClubId: number,
  tactics: Tactics
): { nextPlayers: Player[]; nextTactics: Tactics; demotedPlayer: Player | undefined } {
  let demoted: Player | undefined;

  const nextPlayers = players.map((p) => {
    if (p.id === playerId && p.clubId === userClubId) {
      demoted = { ...p, squadCategory: "youth" as const };
      return demoted;
    }
    return p;
  });

  // Re-adjust lineup if the demoted player was starter or bench
  let nextTactics = { ...tactics };
  if (tactics.starters.includes(playerId) || tactics.bench.includes(playerId)) {
    const firstTeamSquad = nextPlayers.filter(
      (p) => p.clubId === userClubId && p.squadCategory !== "youth"
    );
    const picked = autoPickLineup(firstTeamSquad, tactics.formation);
    nextTactics = {
      ...tactics,
      starters: picked.starters,
      bench: picked.bench,
    };
  }

  return { nextPlayers, nextTactics, demotedPlayer: demoted };
}

/**
 * Loans out a youth player to another club for 1 season
 */
export function loanOutPlayer(
  players: Player[],
  playerId: number,
  userClub: Club,
  destinationClub: Club,
  currentSeason: string
): { nextPlayers: Player[]; loanedPlayer: Player | undefined } {
  let loaned: Player | undefined;

  const nextPlayers = players.map((p) => {
    if (p.id === playerId && p.clubId === userClub.id) {
      loaned = {
        ...p,
        clubId: destinationClub.id,
        clubName: destinationClub.name,
        league: destinationClub.league ?? destinationClub.division ?? "Liga",
        shirtNumber: undefined,
        squadCategory: "first_team",
        loan: {
          isLoan: true,
          parentClubId: userClub.id,
          parentClubName: userClub.name,
          parentClubLeague: userClub.league ?? userClub.division ?? "Liga",
          loanEndSeason: currentSeason,
          canPlayAgainstParentClub: false,
          wagePercentagePaid: 100,
        },
      };
      return loaned;
    }
    return p;
  });

  return { nextPlayers, loanedPlayer: loaned };
}

/**
 * Exercises the buy option for a loaned player
 */
export function exerciseBuyOption(
  players: Player[],
  clubs: Club[],
  playerId: number,
  userClubId: number
): { nextPlayers: Player[]; nextClubs: Club[]; success: boolean; message: string } {
  const target = players.find((p) => p.id === playerId);
  if (!target || !target.loan?.isLoan || !target.loan.buyOptionFeeEur) {
    return { nextPlayers: players, nextClubs: clubs, success: false, message: "Opção de compra indisponível." };
  }

  const userClub = clubs.find((c) => c.id === userClubId)!;
  const fee = target.loan.buyOptionFeeEur;

  if (userClub.transferBudgetEur < fee) {
    return { nextPlayers: players, nextClubs: clubs, success: false, message: "Orçamento insuficiente para exercer compra." };
  }

  const parentClubId = target.loan.parentClubId;

  const nextClubs = clubs.map((c) => {
    if (c.id === userClubId) {
      return { ...c, transferBudgetEur: c.transferBudgetEur - fee };
    }
    if (c.id === parentClubId) {
      return { ...c, transferBudgetEur: c.transferBudgetEur + fee };
    }
    return c;
  });

  const nextPlayers = players.map((p) => {
    if (p.id === playerId) {
      return {
        ...p,
        loan: undefined, // Permanent player now!
      };
    }
    return p;
  });

  return {
    nextPlayers,
    nextClubs,
    success: true,
    message: `${target.name} foi comprado em definitivo por €${(fee / 1_000_000).toFixed(1)}M!`,
  };
}

/**
 * Generates 2-3 new academy wonderkids during the annual youth intake
 */
export function generateAnnualYouthIntake(
  club: Club,
  currentSeason: string,
  startId: number
): { newPlayers: Player[]; nextStartId: number } {
  const count = 3;
  const newPlayers: Player[] = [];
  let currentId = startId;

  const firstNames = ["Cauã", "Enzo", "Matheus", "Kayky", "Ryan", "Arthur", "Davi", "Bernardo", "Lucca", "Murilo"];
  const lastNames = ["Santos", "Oliveira", "Silva", "Costa", "Ribeiro", "Barbosa", "Lima", "Fernandes", "Vieira", "Almeida"];
  const positions = ["ST", "CAM", "CB", "GK", "RW", "LW", "CDM", "CM"];

  for (let i = 0; i < count; i++) {
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const name = `${fn} ${ln}`;
    const pos = positions[Math.floor(Math.random() * positions.length)];
    const roleCat = pos === "GK" ? "GK" : ["CB", "LB", "RB"].includes(pos) ? "DEF" : ["CDM", "CM", "CAM"].includes(pos) ? "MID" : "ATT";

    const overall = 60 + Math.floor(Math.random() * 8); // 60-67
    const potential = Math.min(92, overall + 16 + Math.floor(Math.random() * 12)); // 76-92 potential
    const age = 16 + (i % 2); // 16 or 17 years old

    const { faceStats, stats } = generateAttributes(overall, roleCat, pos === "GK");
    const mv = estimateMarketValue(overall, age);
    const wage = Math.max(500, Math.round(overall * 35));

    newPlayers.push({
      id: currentId,
      eaId: 900000 + currentId,
      name,
      fullName: `${name} (${club.name} Academy)`,
      clubId: club.id,
      clubName: club.name,
      league: club.league ?? club.division ?? "Brasileirão Série A",
      overall,
      potential,
      primaryPosition: pos,
      positions: [pos],
      roleCategory: roleCat,
      nationality: club.country ?? "Brasil",
      age,
      heightCm: 175 + Math.floor(Math.random() * 14),
      weightKg: 68 + Math.floor(Math.random() * 12),
      preferredFoot: Math.random() > 0.3 ? "Direito" : "Canhoto",
      weakFoot: 3 + Math.floor(Math.random() * 2),
      skillMoves: 3 + Math.floor(Math.random() * 2),
      accelerateType: "Controlled",
      playstylesPlus: [],
      playstylesBase: [],
      fcIqRoles: pos,
      faceStats,
      stats,
      imageUrl: "",
      marketValueEur: mv,
      wageEur: wage,
      contractUntil: `${Number(currentSeason.slice(0, 4)) + 4}-12-31`,
      morale: 85,
      stamina: 100,
      seasonGoals: 0,
      seasonAssists: 0,
      seasonAppearances: 0,
      seasonYellowCards: 0,
      seasonRedCards: 0,
      seasonAvgRating: 0,
      squadCategory: "youth",
    });

    currentId++;
  }

  return { newPlayers, nextStartId: currentId };
}
