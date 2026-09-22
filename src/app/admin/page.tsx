export const dynamic = "force-static";

export default function AdminPage() {
  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Super Admin</h1>
          <p className="text-sm text-icon-text-light">Not built yet.</p>
        </header>

        <div className="rounded-lg border border-icon-border p-5 text-sm text-icon-text-light">
          A super-admin view (impersonation/&quot;login as&quot;, account controls, tool
          enable/disable) needs real authentication and multi-tenancy first — neither exists yet.
          This page is a placeholder until that foundation is built; it currently has no access
          control of any kind, so nothing sensitive should ever be added here before auth exists.
        </div>
      </div>
    </div>
  );
}
