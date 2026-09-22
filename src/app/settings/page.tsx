export const dynamic = "force-static";

export default function SettingsPage() {
  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-icon-text-light">Account and workspace settings.</p>
        </header>

        <div className="rounded-lg border border-icon-border p-5 text-sm text-icon-text-light">
          Nothing here yet — this page will hold account details, API keys (if we expose one to
          customers), and notification preferences once user accounts exist.
        </div>
      </div>
    </div>
  );
}
