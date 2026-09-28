"use client";

import { useEffect } from "react";

// The app shell scrolls inside <main>, and server-rendered sections stream in
// after the browser has already handled the URL fragment, so a hard load of a
// link like /billing#add-credits would otherwise stay at the top.
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;

    let attempts = 0;
    let frame = 0;
    const scrollWhenReady = () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
      if (attempts++ < 60) frame = requestAnimationFrame(scrollWhenReady);
    };

    frame = requestAnimationFrame(scrollWhenReady);
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
