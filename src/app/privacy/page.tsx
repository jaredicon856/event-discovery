import type { Metadata } from "next";
import { LegalContact, LegalList, LegalPage, LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Event Scout",
  description: "How Event Scout collects, uses and protects personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Event Scout is operated by Project ICON (“we”, “us”). This policy explains what personal information we collect, why, who we share it with, and the choices you have. It covers two groups of people: customers who use Event Scout, and event organizers whose public business contact details appear in our results."
    >
      <LegalSection title="1. Information we collect from customers">
        <LegalList
          items={[
            "Account details: your name, email address, company, job title, timezone, and an optional profile photo.",
            "Sign-in details: if you use Google sign-in, we receive your name and email from Google. If you come from the Speaker Island Portal, the Portal tells us your name, email and member type. We never see your Google password.",
            "Activity in the app: the searches you run (sectors, opportunity types, locations), results you save, contacts you unlock, lists and schedules you create, and your credit balance and credit history.",
            "Billing details: Stripe processes your payment. We receive your plan, payment status, and the last details Stripe shares with us. We do not receive or store your full card number.",
            "Technical data: basic request logs such as IP address and browser type, kept by our hosting provider for security and reliability.",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Information about event organizers">
        <p>
          Event Scout uses AI to research the public web for speaking and networking opportunities. For
          opportunities it finds, we may collect and store publicly available business information about the
          people who run them, such as an organizer’s name, role, work email address, and public professional
          profile link. We collect this from public sources only. Customers pay credits to reveal this contact
          information, and use it to contact organizers about speaking opportunities.
        </p>
        <p>
          If you are an organizer and want your information corrected or removed, contact <LegalContact />. We
          will remove it from future results and from customer workspaces where we are able to.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <LegalList
          items={[
            "To provide Event Scout: run searches, show results, reveal contacts, charge and refund credits, and manage your plan.",
            "To keep the service secure: prevent abuse, enforce trial limits, and investigate problems.",
            "To contact you: verification and password emails, receipts and billing notices, and reminders about your free trial. We do not send third-party advertising.",
            "To improve the service: understand what works and fix what does not, using usage and cost data.",
            "To meet legal obligations such as tax and accounting records.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Who we share information with">
        <p>We use trusted service providers to run Event Scout. They only receive what they need to do their job:</p>
        <LegalList
          items={[
            "Supabase: database and sign-in.",
            "Vercel: hosting.",
            "Stripe: payments and billing portal.",
            "Anthropic: AI research. We send search criteria and public web content for analysis. We do not send your account password or payment details.",
            "Resend: sending our emails.",
            "Google: only if you choose Google sign-in.",
            "Speaker Island Portal: only if you arrive through it, so it can link your membership.",
          ]}
        />
        <p>
          We do not sell your account information. We may share information if the law requires it, to protect
          our rights or users, or as part of a sale or reorganization of our business.
        </p>
      </LegalSection>

      <LegalSection title="5. Cookies">
        <p>
          We use only essential cookies, which keep you signed in and keep the service working. We do not use
          advertising or analytics cookies. You can block cookies in your browser, but you will not be able to
          sign in.
        </p>
      </LegalSection>

      <LegalSection title="6. How long we keep information">
        <p>
          We keep your account and workspace while your account is open. Your saved results stay in your
          workspace until you ask us to delete them. After you ask us to delete your account we remove or
          anonymize your personal information, except records we must keep for tax, accounting, fraud
          prevention or legal reasons.
        </p>
      </LegalSection>

      <LegalSection title="7. Your choices and rights">
        <p>
          Depending on where you live (for example California, Canada or the European Economic Area), you may
          have the right to access, correct, delete or export your personal information, to object to or
          restrict certain uses, and to withdraw consent. You can update your profile in the app under Profile
          &amp; Settings. For anything else, including a full account deletion, contact <LegalContact />. We
          will respond within the time the law requires and will not treat you differently for using your rights.
        </p>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          We use encrypted connections, access controls, signed webhooks, and per-customer data separation to
          protect your information. No system is perfectly secure, so please use a strong password and tell us
          straight away if you think your account has been misused.
        </p>
      </LegalSection>

      <LegalSection title="9. International transfers">
        <p>
          Our providers may process information in the United States and other countries. Where required, we rely
          on appropriate safeguards for those transfers.
        </p>
      </LegalSection>

      <LegalSection title="10. Children">
        <p>Event Scout is a business service for adults. It is not intended for anyone under 18.</p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>
          We may update this policy. When we make a significant change we will update the date at the top and,
          where appropriate, notify you by email or in the app.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact us">
        <p>
          Questions or requests about privacy: contact <LegalContact />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
