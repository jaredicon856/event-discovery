export default function AppLoading() {
  return (
    <div className="min-h-screen animate-pulse px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="h-4 w-28 rounded bg-icon-border" />
        <div className="mt-4 h-10 w-80 max-w-full rounded bg-icon-border" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 rounded-xl border border-icon-border bg-icon-surface" />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-xl border border-icon-border bg-icon-surface" />
      </div>
    </div>
  );
}
