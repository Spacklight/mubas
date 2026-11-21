import { createFileRoute } from "@tanstack/react-router";
import { Contact, Prose, PublicShell } from "@/components/public-layout";
import { SITE, seo } from "@/lib/site";

export const Route = createFileRoute("/terms")({
  head: () => seo({ title: "Terms and Conditions — Zapa MUBAS", description: "The rules for using Zapa MUBAS: accounts, acceptable use, your content, moderation and more.", path: "/terms" }),
  component: Terms,
});

function Terms() {
  return (
    <PublicShell>
      <Prose>
        <p className="text-xs font-semibold tracking-widest text-denim-deep">LAST UPDATED {SITE.updated.toUpperCase()}</p>
        <h1 className="mt-1 font-display text-4xl">Terms and Conditions</h1>
        <p>By creating an account or using {SITE.name}, you agree to these terms. If you do not agree, please do not use the platform.</p>

        <h2>1. About {SITE.name}</h2>
        <p>{SITE.name} is an independent community for people connected to the Malawi University of Business and Applied Sciences (MUBAS). It is <strong>not</strong> an official MUBAS service, and nothing here should be read as an official statement of the university. Always check official MUBAS channels for decisions about admissions, fees, examinations and results.</p>

        <h2>2. Who can use it</h2>
        <ul>
          <li>You must be at least 16 and connected to MUBAS as a student, lecturer or staff member, or be approved by a steward.</li>
          <li>Give accurate information. Confirming a MUBAS email shows you control that mailbox; it does not prove enrolment.</li>
          <li>Keep your password private. You are responsible for activity on your account.</li>
          <li>One person, one account. Do not pretend to be someone else, a lecturer, or a university office.</li>
        </ul>

        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>harass, threaten, bully, or discriminate against anyone;</li>
          <li>post sexual, violent, hateful or illegal content;</li>
          <li>spam, scam, or advertise without permission;</li>
          <li>share exam papers before they are released, other people&apos;s private information, or material you do not have the right to share;</li>
          <li>break copyright, trademark or other rights, or upload viruses or try to break the platform;</li>
          <li>post misleading information as if it were official university communication.</li>
        </ul>

        <h2>4. Your content</h2>
        <p>You keep ownership of what you post, including Showcase photos, videos and posts. You give {SITE.name} permission to store it and show it to other members as part of the service. You promise that you own it or have permission to share it, and that it follows these terms. You can delete your content at any time.</p>

        <h2>5. Showcase and Library</h2>
        <p>Showcase is for sharing your own talents, projects and knowledge. Zapa Library providers must be approved and must only share material they are allowed to share. We remove material after a valid copyright complaint and may end a library or account that repeatedly infringes.</p>

        <h2>6. Moderation</h2>
        <p>Members can report content and accounts. Stewards may hide content, warn, suspend or remove accounts that break these terms, and keep a log of their actions. We may act without notice when safety or the law requires it. If you think we made a mistake, contact us.</p>

        <h2>7. Messages and links</h2>
        <p>Messages are between the people in a conversation. Links to other websites are provided for convenience; we do not control and are not responsible for them.</p>

        <h2>8. Availability and changes</h2>
        <p>We work to keep {SITE.name} available, but it is provided &quot;as is&quot; and may be interrupted, changed or discontinued. We may update features and these terms; the date above shows the latest version.</p>

        <h2>9. Responsibility</h2>
        <p>To the fullest extent the law allows, {SITE.name} and its operators are not liable for losses that come from using the platform, from content posted by members, or from decisions you make based on information found here. Nothing in these terms limits rights you have under Malawian law that cannot be limited.</p>

        <h2>10. Ending your account</h2>
        <p>You can leave at any time in Settings. We may suspend or end accounts that break these terms.</p>

        <h2>11. Governing law</h2>
        <p>These terms are governed by the laws of Malawi.</p>

        <h2>12. Contact</h2>
        <Contact />
        <p>See also our <a href="/privacy">Privacy Policy</a>. This page is a plain-language set of terms and not legal advice.</p>
      </Prose>
    </PublicShell>
  );
}
