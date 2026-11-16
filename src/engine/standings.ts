import type { Club, Fixture, Player, StandingRow } from "../types/game";

export function computeStandings(clubs: Club[], fixtures: Fixture[]): StandingRow[] {
  const map = new Map<number, StandingRow>();
  for (const club of clubs) {
    map.set(club.id, {
      position: 0,
      club,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
    });
  }

  const playedFixtures = fixtures
    .filter((f) => f.played && f.homeGoals !== null && f.awayGoals !== null)
    .sort((a, b) => a.matchweek - b.matchweek || a.id - b.id);

  for (const fx of playedFixtures) {
    const home = map.get(fx.homeClubId);
    const away = map.get(fx.awayClubId);
    if (!home || !away) continue;

    const hg = fx.homeGoals as number;
    const ag = fx.awayGoals as number;

    home.played += 1;
    away.played += 1;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
      home.form.push("W");
      away.form.push("L");
    } else if (hg < ag) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
      home.form.push("L");
      away.form.push("W");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      home.form.push("D");
      away.form.push("D");
    }
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    goalDifference: r.goalsFor - r.goalsAgainst,
    form: r.form.slice(-5),
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.club.name.localeCompare(b.club.name);
  });

  rows.forEach((row, idx) => {
    row.position = idx + 1;
  });

  return rows;
}

export function getTopScorers(players: Player[], limit = 15): Player[] {
  return players
    .filter((p) => p.clubId !== null && p.seasonGoals > 0)
    .sort((a, b) => b.seasonGoals - a.seasonGoals || b.seasonAssists - a.seasonAssists || b.overall - a.overall)
    .slice(0, limit);
}

export function getTopAssisters(players: Player[], limit = 15): Player[] {
  return players
    .filter((p) => p.clubId !== null && p.seasonAssists > 0)
    .sort((a, b) => b.seasonAssists - a.seasonAssists || b.seasonGoals - a.seasonGoals || b.overall - a.overall)
    .slice(0, limit);
}
