import React, { useState } from "react";

interface PlayerAvatarProps {
  name: string;
  imageUrl?: string;
  size?: "xs" | "sm" | "md" | "lg";
  accentColor?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  imageUrl,
  size = "sm",
  accentColor = "#10b981",
}) => {
  const [failed, setFailed] = useState(false);

  const sizeClass =
    size === "lg"
      ? "w-20 h-20 text-xl"
      : size === "md"
      ? "w-12 h-12 text-sm"
      : size === "xs"
      ? "w-7 h-7 text-[10px]"
      : "w-9 h-9 text-xs";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full object-cover bg-slate-800 border border-slate-700`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`${sizeClass} shrink-0 rounded-full flex items-center justify-center font-bold text-white border border-slate-700 select-none`}
      style={{
        backgroundColor: accentColor,
      }}
    >
      {initials || "?"}
    </div>
  );
};
