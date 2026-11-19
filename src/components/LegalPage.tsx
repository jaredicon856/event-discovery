import Image from "next/image";
import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  let signedIn = false;
  try {
    const auth = await getSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }
  const home = signedIn ? "/" : "/login";

  return (
    <div className="theme-panel min-h-screen bg-icon-background text-icon-text">
      <header className="bg-[#061b1c] px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={home} aria-label="Event Scout home">
            <Image src="/brand/icon-logo.webp" alt="Project ICON" width={112} height={40} priority />
          </Link>
          <Link href={home} className="text-sm font-medium text-[#e5c98e] hover:underline">
            {signedIn ? "Back to Event Scout" : "Sign in"}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-icon-primary">Event Scout</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-icon-text-light">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 text-base leading-7">{intro}</p>
        <div className="mt-10 space-y-10">{children}</div>
      </main>

      <footer className="border-t border-icon-border px-6 py-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 text-sm text-icon-text-light">
          <span>Project ICON</span>
          <Link href="/privacy" className="hover:text-icon-text hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-icon-text hover:underline">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 space-y-3 text-base leading-7 text-icon-text/90">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalContact() {
  if (LEGAL_CONTACT_EMAIL) {
    return (
      <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-icon-primary hover:underline">
        {LEGAL_CONTACT_EMAIL}
      </a>
    );
  }
  return <>the Project ICON team by replying to any email we have sent you</>;
}
