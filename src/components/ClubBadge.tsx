import React, { useEffect, useState } from "react";
import type { Club } from "../types/game";
import { getClubVisuals } from "../utils/clubVisuals";

interface ClubBadgeProps {
  club: Pick<
    Club,
    "shortName" | "primaryColor" | "secondaryColor" | "name" | "badgeUrl" | "stadiumImageUrl"
  >;
  size?: "sm" | "md" | "lg";
}

export const ClubBadge: React.FC<ClubBadgeProps> = ({ club, size = "md" }) => {
  const visuals = getClubVisuals(club);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [visuals.badgeUrl]);

  const dims =
    size === "lg"
      ? "w-14 h-14 p-1.5 text-xs"
      : size === "md"
      ? "w-9 h-9 p-1 text-[10px]"
      : "w-6 h-6 p-0.5 text-[8px]";

  if (visuals.badgeUrl && !failed) {
    return (
      <div
        className={`${dims} relative inline-flex shrink-0 items-center justify-center rounded-xl bg-white/95 shadow-md ring-1 ring-white/25 select-none`}
        title={club.name}
      >
        <img
          src={visuals.badgeUrl}
          alt={club.name}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`${dims} relative inline-flex shrink-0 items-center justify-center rounded-xl font-black tracking-tight shadow-md ring-1 ring-white/15 select-none`}
      style={{
        background: `linear-gradient(135deg, ${club.primaryColor} 0%, ${club.primaryColor} 68%, ${club.secondaryColor} 100%)`,
        color:
          club.primaryColor.toUpperCase() === "#FFCD00" ||
          club.primaryColor.toUpperCase() === "#F59E0B"
            ? "#0f172a"
            : "#ffffff",
      }}
      title={club.name}
    >
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">{club.shortName}</span>
    </div>
  );
};
