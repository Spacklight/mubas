import { createFileRoute } from "@tanstack/react-router";
import { Contact, Prose, PublicShell } from "@/components/public-layout";
import { SITE, seo } from "@/lib/site";

export const Route = createFileRoute("/privacy")({
  head: () => seo({ title: "Privacy Policy — Zapa MUBAS", description: "How Zapa MUBAS collects, uses, stores and protects your personal information, and the choices you have.", path: "/privacy" }),
  component: Privacy,
});

function Privacy() {
  return (
    <PublicShell>
      <Prose>
        <p className="text-xs font-semibold tracking-widest text-denim-deep">LAST UPDATED {SITE.updated.toUpperCase()}</p>
        <h1 className="mt-1 font-display text-4xl">Privacy Policy</h1>
        <p>This policy explains what personal information {SITE.name} collects, why, who it is shared with, and the choices you have. {SITE.name} is an independent community platform for people connected to the Malawi University of Business and Applied Sciences (MUBAS). It is not run by, or endorsed by, MUBAS.</p>

        <h2>1. What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your name, email address and a password. Passwords are stored only as a one-way hash, never in readable form.</li>
          <li><strong>Profile details you choose to add:</strong> school, programme, study level and mode, year, role, interests, skills, a short bio, a profile photo and a cover photo, and an optional MUBAS email address.</li>
          <li><strong>Zapa AI:</strong> the questions you ask, the answers you receive, and a short text summary of any PDF you attach (the PDF itself is not kept).</li>
          <li><strong>Things you share:</strong> posts, comments, replies, Zapa Content videos, photos, stories and posts, Zapa AI conversations and file summaries, video and library links, reports, and messages you send to other members.</li>
          <li><strong>Connections and activity:</strong> friend requests, follows, blocks, likes, saved items, notifications, and when you were last active.</li>
          <li><strong>Technical records:</strong> a sign-in cookie, short-lived counters that limit spam (action type and time), and standard server logs kept by our hosting provider (such as IP address and browser type).</li>
        </ul>

        <h2>2. Why we use it</h2>
        <ul>
          <li>To create your account and show your profile to other members according to your visibility setting.</li>
          <li>To suggest classmates, rooms and content that fit your programme and year.</li>
          <li>To deliver messages, notifications and the features you use.</li>
          <li>To keep the community safe: handling reports, preventing spam and abuse, and enforcing our <a href="/terms">Terms and Conditions</a>.</li>
          <li>To confirm control of a MUBAS email address. This shows you can read that mailbox. It does not prove enrolment.</li>
        </ul>
        <p>We do not sell your information and we do not show advertising. We do not currently use advertising or analytics trackers.</p>

        <h2>3. Who can see what</h2>
        <ul>
          <li>Your email address is never shown on your public profile.</li>
          <li>Your profile, posts and Zapa Content items are visible to other signed-in members. You can limit your profile to friends only in Settings.</li>
          <li>Messages are visible to the people in the conversation. They are stored on our servers and are <strong>not end-to-end encrypted</strong>. We do not read private messages as a matter of routine. A message may be reviewed if it is reported, or if the law requires it.</li>
          <li>Stewards (moderators) can see reports, accounts and basic profile details needed to run the community. Their actions are logged.</li>
        </ul>

        <h2>4. Services that process your information</h2>
        <ul>
          <li><strong>Cloudflare</strong> hosts the website and its database, and processes connection data such as IP addresses.</li>
          <li><strong>Hugging Face</strong> stores the videos, photos and story images you add to Zapa Content in a private dataset. Files are served back only to signed-in members through our servers, and are deleted when you delete the post or your account.</li>
          <li><strong>SmartBase</strong> sends the confirmation code to your MUBAS email address, so it receives that address and your name.</li>
          <li><strong>Google (Gemini)</strong> receives the questions and PDFs you send to Zapa AI so it can write answers and, if you choose HD voice, produce audio. Do not put passwords or private information in Zapa AI.</li>
          <li><strong>Google Fonts</strong> serves the typefaces used on the site, which means your browser contacts Google when pages load.</li>
          <li><strong>YouTube (privacy-enhanced mode)</strong> loads only if you press play on an embedded video. Other video and library links open on the website that hosts them, under that site&apos;s own policy.</li>
        </ul>
        <p>These providers may process data outside Malawi. We use them only to run {SITE.name}.</p>

        <h2>5. Cookies and local storage</h2>
        <p>We use a sign-in cookie that is essential for the site to work, and small items in your browser to remember your theme, data-saver choice and whether you dismissed the app prompt. We do not use advertising cookies.</p>

        <h2>6. How long we keep it</h2>
        <p>We keep your information while your account is open. If you leave {SITE.name} (Settings, then Leave Zapa), your profile details, posts, comments, messages, Zapa Content items and stored photos are deleted or anonymised. Spam counters are short-lived. Backups held by our providers may take a short time to expire.</p>

        <h2>7. Your choices and rights</h2>
        <ul>
          <li><strong>See and correct</strong> your details in My profile.</li>
          <li><strong>Download</strong> a copy of your data in Settings.</li>
          <li><strong>Delete</strong> your account in Settings.</li>
          <li><strong>Control</strong> who sees your profile and which notifications you receive.</li>
          <li><strong>Block or report</strong> anyone who bothers you.</li>
          <li>You may also ask us questions about your information, object to how it is used, or complain to the data protection authority in Malawi.</li>
        </ul>

        <h2>8. Security</h2>
        <p>We use encrypted connections, hashed passwords, access controls, rate limiting and audit logs. No online service is perfectly secure. Please use a strong, unique password and sign out on shared devices.</p>

        <h2>9. Children</h2>
        <p>{SITE.name} is for university students, lecturers and staff. It is not intended for anyone under 16. If we learn that a younger child has an account, we will remove it.</p>

        <h2>10. Changes</h2>
        <p>If we change this policy in a way that matters, we will post the new version here and update the date above. Continuing to use {SITE.name} means you accept the updated policy.</p>

        <h2>11. Contact</h2>
        <Contact />
        <p>This page is a plain-language policy and not legal advice.</p>
      </Prose>
    </PublicShell>
  );
}
