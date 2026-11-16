import React, { useId } from "react";
import type { Club } from "../types/game";
import { getClubVisuals } from "../utils/clubVisuals";

interface ClubKitProps {
  club: Pick<
    Club,
    "shortName" | "primaryColor" | "secondaryColor" | "name" | "badgeUrl" | "stadiumImageUrl"
  >;
  variant?: "home" | "away";
  size?: "xs" | "sm" | "md" | "lg";
  number?: string | number;
  label?: string;
}

export const ClubKit: React.FC<ClubKitProps> = ({
  club,
  variant = "home",
  size = "md",
  number,
  label,
}) => {
  const uid = useId().replace(/:/g, "");
  const visuals = getClubVisuals(club);
  const kit = variant === "home" ? visuals.homeKit : visuals.awayKit;

  const sizeClass =
    size === "lg"
      ? "w-16 h-16"
      : size === "md"
      ? "w-11 h-11"
      : size === "sm"
      ? "w-8 h-8"
      : "w-6 h-6";

  const isLightPrimary = (() => {
    const c = kit.primary.replace("#", "");
    if (c.length !== 6) return false;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 175;
  })();

  const numberFill = isLightPrimary ? "#0f172a" : "#ffffff";

  return (
    <div className="inline-flex flex-col items-center select-none" title={`${club.name} (${variant === "home" ? "Titular" : "Reserva"})`}>
      <svg viewBox="0 0 64 64" className={`${sizeClass} drop-shadow-md`}>
        <defs>
          <clipPath id={`kit-body-${uid}`}>
            <path d="M20 8 L26 11 C29 13 35 13 38 11 L44 8 L58 17 L53 31 L46 27 L46 56 L18 56 L18 27 L11 31 L6 17 Z" />
          </clipPath>
          <linearGradient id={`kit-shade-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="55%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <g clipPath={`url(#kit-body-${uid})`}>
          {/* Base jersey fill */}
          <rect x="0" y="0" width="64" height="64" fill={kit.primary} />

          {/* Pattern overlays */}
          {kit.pattern === "stripes" && (
            <g fill={kit.secondary}>
              <rect x="19" y="6" width="6" height="54" />
              <rect x="30" y="6" width="6" height="54" />
              <rect x="41" y="6" width="6" height="54" />
            </g>
          )}

          {kit.pattern === "pinstripes" && (
            <g stroke={kit.secondary} strokeWidth="1.2" strokeOpacity="0.75">
              <line x1="21" y1="6" x2="21" y2="58" />
              <line x1="26" y1="6" x2="26" y2="58" />
              <line x1="32" y1="6" x2="32" y2="58" />
              <line x1="38" y1="6" x2="38" y2="58" />
              <line x1="43" y1="6" x2="43" y2="58" />
            </g>
          )}

          {kit.pattern === "sleeves" && (
            <g fill={kit.secondary}>
              <polygon points="4,15 19,8 19,33 4,33" />
              <polygon points="60,15 45,8 45,33 60,33" />
            </g>
          )}

          {kit.pattern === "sash" && (
            <polygon points="16,8 26,8 48,56 38,56" fill={kit.secondary} fillOpacity="0.92" />
          )}

          {/* Subtle fabric shading */}
          <rect x="0" y="0" width="64" height="64" fill={`url(#kit-shade-${uid})`} />
        </g>

        {/* Jersey outline */}
        <path
          d="M20 8 L26 11 C29 13 35 13 38 11 L44 8 L58 17 L53 31 L46 27 L46 56 L18 56 L18 27 L11 31 L6 17 Z"
          fill="none"
          stroke={isLightPrimary ? "#334155" : "rgba(255,255,255,0.28)"}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* Collar trim */}
        <path
          d="M24 9.5 C28 14 36 14 40 9.5"
          fill="none"
          stroke={kit.trim}
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Chest badge circle (when no big centered number) */}
        {number === undefined && (
          <circle
            cx="39"
            cy="24"
            r="3.2"
            fill={kit.trim}
            stroke={isLightPrimary ? "#0f172a" : "#ffffff"}
            strokeWidth="0.9"
          />
        )}

        {/* Optional centered shirt text/number */}
        {number !== undefined && (
          <text
            x="32"
            y="38"
            textAnchor="middle"
            fontSize="13"
            fontWeight="900"
            fill={numberFill}
            stroke={isLightPrimary ? "#ffffff" : "#020617"}
            strokeWidth="0.8"
            paintOrder="stroke"
          >
            {number}
          </text>
        )}
      </svg>
      {label && (
        <span className="mt-1 text-[10px] font-bold text-slate-400">{label}</span>
      )}
    </div>
  );
};
