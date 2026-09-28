"use client";

import { useSyncExternalStore } from "react";
import { ACCOUNT_TIMEZONE } from "@/lib/timezone";

const subscribe = () => () => {};

function easternSalutation() {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: ACCOUNT_TIMEZONE,
  })
    .formatToParts(new Date())
    .find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function firstName(value: string, preserveCase: boolean) {
  const first = value.trim().split(/\s+/)[0] || "there";
  if (preserveCase) return first;
  return `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}`;
}

export function AnimatedGreeting({
  name,
  preserveCase = false,
}: {
  name: string;
  preserveCase?: boolean;
}) {
  const salutation = useSyncExternalStore(subscribe, easternSalutation, () => "Welcome back");

  return (
    <span className="greeting-reveal inline-flex flex-wrap items-baseline gap-x-3">
      <span>{salutation},</span>
      <span className="greeting-name">{firstName(name, preserveCase)}.</span>
    </span>
  );
}
