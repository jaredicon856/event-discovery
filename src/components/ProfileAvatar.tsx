"use client";

import { useState } from "react";

export function ProfileAvatar({
  src,
  name,
  sizeClass = "h-9 w-9",
}: {
  src: string | null;
  name: string;
  sizeClass?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-icon-primary text-xs font-bold text-white ${sizeClass}`}>
      {src && src !== failedSrc ? (
        // Private storage uses short-lived signed URLs; failure falls back safely.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${name} profile`} className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span aria-label={`${name} initials`}>{initials}</span>
      )}
    </span>
  );
}
