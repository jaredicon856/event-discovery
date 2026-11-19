import type { Metadata } from "next";
import Link from "next/link";
import { LegalContact, LegalList, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | Event Scout",
  description: "The terms that apply when you use Event Scout.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms are an agreement between you and Project ICON (“we”, “us”) for your use of Event Scout. By creating an account or using the service you agree to them. If you do not agree, please do not use Event Scout."
    >
      <LegalSection title="1. Who can use Event Scout">
        <p>
          Event Scout is a business service for adults aged 18 or over. If you use it for a company, you confirm
          you can bind that company to these terms. Access may be by invitation, free trial, paid plan, or through
          the Speaker Island Portal.
        </p>
      </LegalSection>

      <LegalSection title="2. What the service does, and its limits">
        <p>
          Event Scout uses AI to search the public web for speaking and networking opportunities and for
          organizer contact details. Results are generated automatically from public sources and may be
          incomplete, out of date or wrong. A deadline may have passed, an event may have changed, and a contact
          may no longer be correct. You are responsible for checking anything important before you rely on it.
          We do not promise that any opportunity is open, that any organizer will reply, or that you will be
          booked.
        </p>
      </LegalSection>

      <LegalSection title="3. Your account">
        <p>
          Keep your sign-in details secure and do not share your account. You are responsible for activity under
          your account. Tell us promptly if you think it has been accessed without permission. Provide accurate
          information, and use only one free trial per person.
        </p>
      </LegalSection>

      <LegalSection title="4. Credits, plans and billing">
        <LegalList
          items={[
            "Searches and contact reveals use credits. The cost is shown before you run them. Credits are taken before the work starts.",
            "If a search or contact lookup fails, the credits are refunded to your balance automatically.",
            "The free trial includes one search and two contact reveals and ends 7 days after you verify your email. Unused trial actions then expire.",
            "Paid plans renew each billing period until cancelled. Plan credits are added each month, including on annual plans. Unused plan credits roll over while your plan is active, up to twice your monthly allowance, and end when your paid period ends.",
            "Credit packs and credits we give you never expire.",
            "Prices are shown at checkout and exclude any taxes that apply. We may change prices for future billing periods and will give notice first.",
            "Payments are processed by Stripe. You can manage or cancel your plan at any time from the Billing page, and cancellation takes effect at the end of the period you have paid for.",
            "Except for failed-search refunds above, or where the law requires otherwise, payments are not refundable.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Acceptable use and organizer contact details">
        <p>You agree to use Event Scout lawfully. In particular, you will not:</p>
        <LegalList
          items={[
            "contact organizers in a way that breaks the law, including anti-spam and privacy rules such as CAN-SPAM, CASL and GDPR. Make outreach relevant, identify yourself, and honor opt-out requests;",
            "harass, deceive or spam anyone using details from Event Scout;",
            "resell, publish, or bulk-share organizer contact data or exports from Event Scout;",
            "copy the service at scale with bots or scrapers, or try to get around credits, trial limits or access controls;",
            "attempt to break, probe or reverse engineer the service, or use it to build a competing product.",
          ]}
        />
        <p>
          See our <Link href="/privacy" className="font-medium text-icon-primary hover:underline">Privacy Policy</Link>{" "}
          for how organizer information is collected.
        </p>
      </LegalSection>

      <LegalSection title="6. Speaker Island members">
        <p>
          If you arrive through the Speaker Island Portal, you receive a monthly allowance of free actions, each
          of which can be a search or a contact lookup. The allowance renews each calendar month. We may change or
          end this allowance. These terms apply to you as well.
        </p>
      </LegalSection>

      <LegalSection title="7. Ownership">
        <p>
          We own Event Scout and everything in it, other than your content. You keep ownership of the searches
          and notes you enter. You give us permission to process them to run the service. You may use the
          results for your own business purposes, subject to section 5.
        </p>
      </LegalSection>

      <LegalSection title="8. Third-party services">
        <p>
          Event Scout relies on third parties such as Stripe, Google, Supabase, Vercel, Anthropic and Resend, and
          links to third-party websites. We are not responsible for them, and their own terms apply to your use
          of them.
        </p>
      </LegalSection>

      <LegalSection title="9. Suspension and ending your account">
        <p>
          You can stop using Event Scout at any time, and you can ask us to delete your account. We may suspend or
          end access if you break these terms, misuse the service, put it or other users at risk, or do not pay.
          We may also change or discontinue features.
        </p>
      </LegalSection>

      <LegalSection title="10. Disclaimers">
        <p>
          Event Scout is provided “as is” and “as available”. To the fullest extent the law allows, we disclaim
          all warranties, including that results are accurate, complete or fit for a particular purpose, and that
          the service will be uninterrupted or error-free.
        </p>
      </LegalSection>

      <LegalSection title="11. Limit of liability">
        <p>
          To the fullest extent the law allows, we are not liable for indirect, incidental, special or
          consequential damages, or for lost profits, lost opportunities or lost data. Our total liability for
          any claim relating to the service is limited to the amount you paid us in the 12 months before the
          claim arose. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes to these terms">
        <p>
          We may update these terms. When we make a significant change we will update the date at the top and,
          where appropriate, tell you by email or in the app. If you keep using Event Scout after a change takes
          effect, you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>
          Questions about these terms: contact <LegalContact />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
