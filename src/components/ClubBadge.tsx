import React from "react";
import type { Club } from "../types/game";

interface ClubBadgeProps {
  club: Pick<Club, "shortName" | "primaryColor" | "secondaryColor" | "name">;
  size?: "sm" | "md" | "lg";
}

export const ClubBadge: React.FC<ClubBadgeProps> = ({ club, size = "md" }) => {
  const dims =
    size === "lg"
      ? "w-14 h-14 text-xs"
      : size === "md"
      ? "w-9 h-9 text-[10px]"
      : "w-6 h-6 text-[8px]";

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
