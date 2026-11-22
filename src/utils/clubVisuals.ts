import type { CSSProperties } from "react";
import type { Club } from "../types/game";

export type KitPattern = "solid" | "sleeves" | "stripes" | "pinstripes" | "sash";

export interface KitSpec {
  primary: string;
  secondary: string;
  trim: string;
  pattern: KitPattern;
}

export interface ClubVisualSpec {
  badgeUrl: string;
  stadiumImageUrl: string;
  homeKit: KitSpec;
  awayKit: KitSpec;
}

export const CLUB_VISUAL_CATALOG: Record<string, ClubVisualSpec> = {
  Arsenal: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/11.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/London_Emirates_Stadium_arsenal.jpg/1280px-London_Emirates_Stadium_arsenal.jpg",
    homeKit: { primary: "#EF0107", secondary: "#FFFFFF", trim: "#063672", pattern: "sleeves" },
    awayKit: { primary: "#111827", secondary: "#FBBF24", trim: "#EF0107", pattern: "solid" },
  },
  "Aston Villa": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/405.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fe/Birmingham_aston_villa_park_stadium.jpg/1280px-Birmingham_aston_villa_park_stadium.jpg",
    homeKit: { primary: "#670E36", secondary: "#95BFE5", trim: "#FFFFFF", pattern: "sleeves" },
    awayKit: { primary: "#F8FAFC", secondary: "#670E36", trim: "#95BFE5", pattern: "sleeves" },
  },
  "AFC Bournemouth": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/989.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/Deancourt_14092013_vblackpool.jpg/1280px-Deancourt_14092013_vblackpool.jpg",
    homeKit: { primary: "#DA291C", secondary: "#111111", trim: "#FBBF24", pattern: "stripes" },
    awayKit: { primary: "#0F172A", secondary: "#38BDF8", trim: "#FFFFFF", pattern: "solid" },
  },
  Brentford: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/1148.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Brentford_Community_Stadium_2020.jpg/1280px-Brentford_Community_Stadium_2020.jpg",
    homeKit: { primary: "#E30613", secondary: "#FFFFFF", trim: "#111111", pattern: "stripes" },
    awayKit: { primary: "#1E293B", secondary: "#F43F5E", trim: "#FFFFFF", pattern: "sash" },
  },
  "Brighton & Hove Albion": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/1237.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/Amex_Community_Stadium.jpg/1280px-Amex_Community_Stadium.jpg",
    homeKit: { primary: "#0057B8", secondary: "#FFFFFF", trim: "#FFCD00", pattern: "stripes" },
    awayKit: { primary: "#FFCD00", secondary: "#0057B8", trim: "#0F172A", pattern: "solid" },
  },
  Chelsea: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/631.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/London_Stamford_Bridge.jpg/1280px-London_Stamford_Bridge.jpg",
    homeKit: { primary: "#034694", secondary: "#FFFFFF", trim: "#DBA111", pattern: "solid" },
    awayKit: { primary: "#F8FAFC", secondary: "#034694", trim: "#EF4444", pattern: "pinstripes" },
  },
  "Coventry City": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/990.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Coventry_Derby_October_2021_-_2.jpg/1280px-Coventry_Derby_October_2021_-_2.jpg",
    homeKit: { primary: "#58B9E8", secondary: "#FFFFFF", trim: "#0D1B2A", pattern: "pinstripes" },
    awayKit: { primary: "#0D1B2A", secondary: "#58B9E8", trim: "#FFFFFF", pattern: "sash" },
  },
  "Crystal Palace": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/873.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/66/2023_09_09_arne_mueseler_17_18_07_00743-Verbessert-RR_%2853283239217%29.jpg/1280px-2023_09_09_arne_mueseler_17_18_07_00743-Verbessert-RR_%2853283239217%29.jpg",
    homeKit: { primary: "#1B458F", secondary: "#C4122E", trim: "#FFFFFF", pattern: "stripes" },
    awayKit: { primary: "#F8FAFC", secondary: "#1B458F", trim: "#C4122E", pattern: "sash" },
  },
  Everton: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/29.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Hill_Dickinson_Stadium%2C_Liverpool_Waterfront_-_geograph.org.uk_-_8170881.jpg/500px-Hill_Dickinson_Stadium%2C_Liverpool_Waterfront_-_geograph.org.uk_-_8170881.jpg",
    homeKit: { primary: "#003399", secondary: "#FFFFFF", trim: "#FBBF24", pattern: "solid" },
    awayKit: { primary: "#111827", secondary: "#F59E0B", trim: "#FFFFFF", pattern: "solid" },
  },
  Fulham: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/931.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Craven_Cottage_%28Fulham%29.jpg/1280px-Craven_Cottage_%28Fulham%29.jpg",
    homeKit: { primary: "#F8FAFC", secondary: "#111111", trim: "#CC0000", pattern: "sleeves" },
    awayKit: { primary: "#111111", secondary: "#CC0000", trim: "#FFFFFF", pattern: "sash" },
  },
  "Hull City": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/3008.png",
    stadiumImageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/d/d3/Match_day_at_the_KC_Stadium_-_geograph.org.uk_-_1497910.jpg",
    homeKit: { primary: "#F59E0B", secondary: "#111111", trim: "#FFFFFF", pattern: "stripes" },
    awayKit: { primary: "#111111", secondary: "#F59E0B", trim: "#FFFFFF", pattern: "sleeves" },
  },
  "Ipswich Town": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/677.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/Portman_Road_aerial_%28cropped%29.jpg/1280px-Portman_Road_aerial_%28cropped%29.jpg",
    homeKit: { primary: "#3A64A3", secondary: "#FFFFFF", trim: "#E11D48", pattern: "pinstripes" },
    awayKit: { primary: "#1E293B", secondary: "#38BDF8", trim: "#FFFFFF", pattern: "solid" },
  },
  "Leeds United": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/399.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/84/Leeds_United_-_31559864360.jpg/1280px-Leeds_United_-_31559864360.jpg",
    homeKit: { primary: "#F8FAFC", secondary: "#1D428A", trim: "#FFCD00", pattern: "solid" },
    awayKit: { primary: "#1D428A", secondary: "#FFCD00", trim: "#FFFFFF", pattern: "sleeves" },
  },
  Liverpool: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/31.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Liverpool_anfield_road_stadium.jpg/1280px-Liverpool_anfield_road_stadium.jpg",
    homeKit: { primary: "#C8102E", secondary: "#FFFFFF", trim: "#00B2A9", pattern: "solid" },
    awayKit: { primary: "#F8FAFC", secondary: "#111827", trim: "#C8102E", pattern: "pinstripes" },
  },
  "Manchester City": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/281.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b8/Etihad_Stadium.jpg/1280px-Etihad_Stadium.jpg",
    homeKit: { primary: "#6CABDD", secondary: "#FFFFFF", trim: "#1C2C5B", pattern: "sleeves" },
    awayKit: { primary: "#1C2C5B", secondary: "#FACC15", trim: "#6CABDD", pattern: "pinstripes" },
  },
  "Manchester United": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/985.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/2023_07_31_arne_mueseler_00060-Verbessert-RR_%2853106651455%29.jpg/1280px-2023_07_31_arne_mueseler_00060-Verbessert-RR_%2853106651455%29.jpg",
    homeKit: { primary: "#DA291C", secondary: "#FFFFFF", trim: "#FBE122", pattern: "solid" },
    awayKit: { primary: "#0F172A", secondary: "#FFFFFF", trim: "#DA291C", pattern: "pinstripes" },
  },
  "Newcastle United": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/762.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a2/Newcastle_st-james-park_stadium.jpg/1280px-Newcastle_st-james-park_stadium.jpg",
    homeKit: { primary: "#18181B", secondary: "#FFFFFF", trim: "#38BDF8", pattern: "stripes" },
    awayKit: { primary: "#065F46", secondary: "#FDE047", trim: "#FFFFFF", pattern: "solid" },
  },
  "Nottingham Forest": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/703.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/CityGroundFromAboveTrentBridgeCricketGround.jpg/1280px-CityGroundFromAboveTrentBridgeCricketGround.jpg",
    homeKit: { primary: "#DD0000", secondary: "#FFFFFF", trim: "#FFFFFF", pattern: "solid" },
    awayKit: { primary: "#1E293B", secondary: "#38BDF8", trim: "#FFFFFF", pattern: "sash" },
  },
  Sunderland: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/289.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/Sunderland_stadium_of_light.jpg/1280px-Sunderland_stadium_of_light.jpg",
    homeKit: { primary: "#EB172B", secondary: "#FFFFFF", trim: "#111111", pattern: "stripes" },
    awayKit: { primary: "#0F172A", secondary: "#EB172B", trim: "#FBBF24", pattern: "solid" },
  },
  "Tottenham Hotspur": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/148.png",
    stadiumImageUrl:
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/London_Tottenham_Hotspur_Stadium.jpg/1280px-London_Tottenham_Hotspur_Stadium.jpg",
    homeKit: { primary: "#F8FAFC", secondary: "#132257", trim: "#132257", pattern: "sleeves" },
    awayKit: { primary: "#132257", secondary: "#38BDF8", trim: "#FFFFFF", pattern: "solid" },
  },
  "River Plate": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/209.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#FFFFFF", secondary: "#EE1C25", trim: "#111111", pattern: "sash" },
    awayKit: { primary: "#111827", secondary: "#EE1C25", trim: "#FFFFFF", pattern: "sash" },
  },
  "Boca Juniors": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/189.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#002B49", secondary: "#FEE100", trim: "#FFFFFF", pattern: "sash" },
    awayKit: { primary: "#FFFFFF", secondary: "#002B49", trim: "#FEE100", pattern: "sash" },
  },
  "Celtic FC": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/371.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#008000", secondary: "#FFFFFF", trim: "#00482B", pattern: "stripes" },
    awayKit: { primary: "#F8FAFC", secondary: "#008000", trim: "#111111", pattern: "solid" },
  },
  "Rangers FC": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/124.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#0047AB", secondary: "#FFFFFF", trim: "#E30613", pattern: "solid" },
    awayKit: { primary: "#FFFFFF", secondary: "#0047AB", trim: "#E30613", pattern: "solid" },
  },
  Galatasaray: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/141.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#A90432", secondary: "#FDB912", trim: "#FFFFFF", pattern: "stripes" },
    awayKit: { primary: "#FFFFFF", secondary: "#A90432", trim: "#FDB912", pattern: "solid" },
  },
  Fenerbahçe: {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/36.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#002366", secondary: "#FFFF00", trim: "#FFFFFF", pattern: "stripes" },
    awayKit: { primary: "#FFFFFF", secondary: "#002366", trim: "#FFFF00", pattern: "solid" },
  },
  "Club América": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/3631.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#FFFF99", secondary: "#002B49", trim: "#E30613", pattern: "solid" },
    awayKit: { primary: "#002B49", secondary: "#FFFF99", trim: "#E30613", pattern: "solid" },
  },
  "Chivas Guadalajara": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/6711.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#E30613", secondary: "#FFFFFF", trim: "#002B49", pattern: "stripes" },
    awayKit: { primary: "#002B49", secondary: "#E30613", trim: "#FFFFFF", pattern: "solid" },
  },
  "Club Brugge KV": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/2282.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#002F6C", secondary: "#000000", trim: "#FFFFFF", pattern: "stripes" },
    awayKit: { primary: "#FFFFFF", secondary: "#002F6C", trim: "#000000", pattern: "solid" },
  },
  "RSC Anderlecht": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/58.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#56237D", secondary: "#FFFFFF", trim: "#FFFFFF", pattern: "sleeves" },
    awayKit: { primary: "#FFFFFF", secondary: "#56237D", trim: "#56237D", pattern: "solid" },
  },
  "FC Basel": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/26.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#E30613", secondary: "#002F6C", trim: "#FEE100", pattern: "stripes" },
    awayKit: { primary: "#FFFFFF", secondary: "#E30613", trim: "#002F6C", pattern: "solid" },
  },
  "Red Bull Salzburg": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/409.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#E30613", secondary: "#FFFFFF", trim: "#E30613", pattern: "sleeves" },
    awayKit: { primary: "#002F6C", secondary: "#E30613", trim: "#FFFFFF", pattern: "solid" },
  },
  "Olympiacos FC": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/683.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#E30613", secondary: "#FFFFFF", trim: "#E30613", pattern: "stripes" },
    awayKit: { primary: "#000000", secondary: "#E30613", trim: "#FFFFFF", pattern: "solid" },
  },
  "Shakhtar Donetsk": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/660.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#FF6600", secondary: "#000000", trim: "#FFFFFF", pattern: "stripes" },
    awayKit: { primary: "#FFFFFF", secondary: "#FF6600", trim: "#000000", pattern: "solid" },
  },
  "CA Peñarol": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/207.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#FEE100", secondary: "#000000", trim: "#FFFFFF", pattern: "stripes" },
    awayKit: { primary: "#000000", secondary: "#FEE100", trim: "#FFFFFF", pattern: "solid" },
  },
  "Club Nacional": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/206.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#FFFFFF", secondary: "#003399", trim: "#E30613", pattern: "sash" },
    awayKit: { primary: "#E30613", secondary: "#003399", trim: "#FFFFFF", pattern: "solid" },
  },
  "Ulsan HD": {
    badgeUrl: "https://tmssl.akamaized.net//images/wappen/head/3582.png",
    stadiumImageUrl: "",
    homeKit: { primary: "#002F6C", secondary: "#005BA6", trim: "#FEE100", pattern: "stripes" },
    awayKit: { primary: "#FFFFFF", secondary: "#002F6C", trim: "#005BA6", pattern: "solid" },
  },
};

export function getClubVisuals(
  club: Pick<Club, "name" | "primaryColor" | "secondaryColor" | "badgeUrl" | "stadiumImageUrl">
): ClubVisualSpec {
  const found = CLUB_VISUAL_CATALOG[club.name];
  if (found) {
    return {
      badgeUrl: club.badgeUrl || found.badgeUrl,
      stadiumImageUrl: club.stadiumImageUrl || found.stadiumImageUrl,
      homeKit: found.homeKit,
      awayKit: found.awayKit,
    };
  }
  return {
    badgeUrl: club.badgeUrl || "",
    stadiumImageUrl: club.stadiumImageUrl || "",
    homeKit: {
      primary: club.primaryColor,
      secondary: club.secondaryColor,
      trim: "#FFFFFF",
      pattern: "solid",
    },
    awayKit: {
      primary: club.secondaryColor,
      secondary: club.primaryColor,
      trim: "#FFFFFF",
      pattern: "solid",
    },
  };
}

export interface KitThemePalette {
  variant: "home" | "away";
  isLight: boolean;
  kit: KitSpec;
  bgBase: string;
  bgSurface: string;
  bgHeader: string;
  accentPrimary: string;
  accentSecondary: string;
  accentTrim: string;
  accentText: string;
  borderTint: string;
  pageBackgroundStyle: CSSProperties;
  headerStyle: CSSProperties;
  cssVars: CSSProperties;
}

function parseHexRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "").trim();
  if (c.length !== 6) return [15, 23, 42];
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mixHex(hexA: string, hexB: string, weightA: number): string {
  const [r1, g1, b1] = parseHexRgb(hexA);
  const [r2, g2, b2] = parseHexRgb(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  const r = Math.round(r1 * w + r2 * (1 - w));
  const g = Math.round(g1 * w + g2 * (1 - w));
  const b = Math.round(b1 * w + b2 * (1 - w));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function getKitThemePalette(
  club: Pick<Club, "name" | "primaryColor" | "secondaryColor" | "badgeUrl" | "stadiumImageUrl">,
  variant: "home" | "away" = "home"
): KitThemePalette {
  const visuals = getClubVisuals(club);
  const kit = variant === "home" ? visuals.homeKit : visuals.awayKit;
  const isLight = variant === "away";

  if (isLight) {
    // Light Theme (Uniforme 2 / Reserva)
    const bgBase = mixHex(kit.primary, "#f1f5f9", 0.05);
    const bgSurface = "#ffffff";
    const bgHeader = "#ffffff";
    const borderTint = "#e2e8f0";
    const accentPrimary = kit.primary;
    const accentText = relativeLuminance(accentPrimary) > 0.48 ? "#0f172a" : "#ffffff";

    const pageBackgroundStyle: CSSProperties = {
      backgroundColor: bgBase,
      backgroundImage: "none",
    };

    const headerStyle: CSSProperties = {
      backgroundColor: bgHeader,
      borderBottomColor: accentPrimary,
      borderBottomWidth: "2px",
    };

    const cssVars = {
      "--club-primary": accentPrimary,
      "--club-secondary": kit.secondary,
      "--club-trim": kit.trim,
      "--club-bg-base": bgBase,
      "--club-surface": bgSurface,
      "--club-border": borderTint,
      "--club-header": bgHeader,
    } as CSSProperties;

    return {
      variant,
      isLight: true,
      kit,
      bgBase,
      bgSurface,
      bgHeader,
      accentPrimary,
      accentSecondary: kit.secondary,
      accentTrim: kit.trim,
      accentText,
      borderTint,
      pageBackgroundStyle,
      headerStyle,
      cssVars,
    };
  }

  // Dark Theme (Uniforme 1 / Titular)
  const primLum = relativeLuminance(kit.primary);
  const secLum = relativeLuminance(kit.secondary);

  // Choose base tint color so white/very-light shirts (e.g. Spurs, Fulham, Leeds) still have rich dark club atmosphere
  const atmosphereSource =
    primLum > 0.62
      ? secLum < 0.55
        ? kit.secondary
        : kit.trim
      : kit.primary;

  const bgBase = mixHex(atmosphereSource, "#090d16", 0.22);
  const bgSurface = mixHex(atmosphereSource, "#111827", 0.18);
  const bgHeader = mixHex(atmosphereSource, "#060911", 0.32);

  // Ensure active accent pops cleanly against dark UI
  let accentPrimary = kit.primary;
  if (primLum < 0.055) {
    accentPrimary = secLum > 0.12 ? kit.secondary : kit.trim;
  }
  const accentText = relativeLuminance(accentPrimary) > 0.48 ? "#0f172a" : "#ffffff";
  const borderTint = mixHex(accentPrimary, "#1e293b", 0.35);

  const pageBackgroundStyle: CSSProperties = {
    backgroundColor: bgBase,
    backgroundImage: "none",
  };

  const headerStyle: CSSProperties = {
    backgroundColor: bgHeader,
    borderBottomColor: accentPrimary,
    borderBottomWidth: "2px",
  };

  const cssVars = {
    "--club-primary": accentPrimary,
    "--club-secondary": kit.secondary,
    "--club-trim": kit.trim,
    "--club-bg-base": bgBase,
    "--club-surface": bgSurface,
    "--club-border": borderTint,
    "--club-header": bgHeader,
  } as CSSProperties;

  return {
    variant,
    isLight: false,
    kit,
    bgBase,
    bgSurface,
    bgHeader,
    accentPrimary,
    accentSecondary: kit.secondary,
    accentTrim: kit.trim,
    accentText,
    borderTint,
    pageBackgroundStyle,
    headerStyle,
    cssVars,
  };
}

