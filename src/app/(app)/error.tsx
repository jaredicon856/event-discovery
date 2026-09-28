"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-12">
      <div className="max-w-md rounded-2xl border border-icon-border bg-icon-surface p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-icon-primary">Something went wrong</p>
        <h1 className="mt-3 text-2xl font-semibold">This view could not be loaded.</h1>
        <p className="mt-2 text-sm leading-6 text-icon-text-light">Your data is safe. Try loading the page again.</p>
        <button onClick={reset} className="mt-6 min-h-11 cursor-pointer rounded-lg bg-icon-primary px-5 text-sm font-semibold text-white hover:brightness-105">Try again</button>
      </div>
    </div>
  );
}
