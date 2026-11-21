import { createFileRoute, Link } from "@tanstack/react-router";
import { Prose, PublicShell } from "@/components/public-layout";
import { SITE, seo } from "@/lib/site";

export const Route = createFileRoute("/docs")({
  head: () => seo({ title: "Documentation — How to use Zapa MUBAS", description: "A step-by-step guide to Zapa MUBAS: profiles, finding classmates, programme rooms, messages, Showcase, Zapa Watch, Zapa Library, notifications and safety.", path: "/docs" }),
  component: Docs,
});

const TOC = [
  ["start", "Getting started"], ["profile", "Your profile"], ["people", "Finding people"], ["rooms", "Programme rooms"], ["messages", "Messages"],
  ["showcase", "Showcase"], ["watch", "Zapa Watch"], ["library", "Zapa Library"], ["updates", "MUBAS Updates"], ["safety", "Safety and privacy"], ["stewards", "For stewards"], ["help", "Troubleshooting"],
] as const;

function Docs() {
  return (
    <PublicShell>
      <Prose>
        <p className="text-xs font-semibold tracking-widest text-denim-deep">DOCUMENTATION</p>
        <h1 className="mt-1 font-display text-4xl">How to use {SITE.name}</h1>
        <p>{SITE.name} brings MUBAS students, lecturers and staff together. This guide walks through each part. For links to official university systems, see the <Link to="/guide">Help Centre</Link>.</p>
        <nav aria-label="On this page" className="panel mt-6 p-4">
          <p className="text-sm font-semibold">On this page</p>
          <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">{TOC.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ul>
        </nav>

        <h2 id="start">Getting started</h2>
        <ul>
          <li>Choose <strong>Join Zapa</strong>, enter your name, email and a password of at least 8 characters.</li>
          <li>Tell Zapa your school, programme, level, study mode and year. This is how classmates find you.</li>
          <li>Optionally add your <strong>@mubas.ac.mw</strong> address and confirm it with the code we send. It shows you control that mailbox.</li>
          <li>Install the app: on Android, see the <Link to="/download">download page</Link>; on other devices use your browser&apos;s &quot;Add to home screen&quot;.</li>
        </ul>

        <h2 id="profile">Your profile</h2>
        <p>Open <strong>More → My profile</strong> to add a photo, cover picture, bio, interests and skills. Photos are shrunk automatically. Choose whether everyone on Zapa or only friends can see your profile. Your email is never shown.</p>

        <h2 id="people">Finding people</h2>
        <p><strong>Discover</strong> suggests people in this order: same programme and year, same programme, same department, same school, same study mode, then other MUBAS members. Use the filters to narrow the list. Send a friend request, follow someone, or open their profile to message them. Friend requests you receive appear at the top of Discover.</p>

        <h2 id="rooms">Programme rooms</h2>
        <p><strong>Communities</strong> has a room for each programme and school. Join a room to post questions, start study groups and share resources. Leave any time.</p>

        <h2 id="messages">Messages</h2>
        <p>Open a chat from a profile, or create a group from <strong>Messages → Group</strong> by picking friends. You see unread counts, can reply to a message and delete your own messages. New messages appear within a few seconds.</p>

        <h2 id="showcase">Showcase</h2>
        <p>Showcase is where you share talent and knowledge: a photo of your work, a link to your video, or a written post. Pick a category, add a title and press <strong>Share</strong>. Others can like and comment. You can delete your posts at any time. Share only your own work or things you have permission to share.</p>

        <h2 id="watch">Zapa Watch</h2>
        <p>Share links to tutorials, lectures and student stories. YouTube links play inside Zapa when you press play, and thumbnails are skipped when data saver is on. Subscribe to creators and save videos to playlists.</p>

        <h2 id="library">Zapa Library</h2>
        <p>Browse learning resources from approved providers. To run a library, open <strong>Library → Become a provider</strong>, accept the rules and apply. A steward reviews each application. Approved owners add resources by link, with a subject, category and who can open it.</p>

        <h2 id="updates">MUBAS Updates</h2>
        <p>Announcements always show their source. Items marked <strong>Official source</strong> link to the original university notice. Community posts are labelled as not official.</p>

        <h2 id="safety">Safety and privacy</h2>
        <ul>
          <li>Use <strong>Report</strong> on a post, photo or profile, and <strong>Block</strong> anyone who bothers you.</li>
          <li><strong>Settings</strong> lets you choose notifications, turn on data saver, download your data, or leave Zapa.</li>
          <li>Read the <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms and Conditions</Link>.</li>
        </ul>

        <h2 id="stewards">For stewards</h2>
        <p>Stewards open <strong>Steward</strong> to review library applications and reports, confirm lecturer or staff roles, and suspend or restore accounts. Every action is logged. The Showcase page has a storage check that tests the Hugging Face dataset connection.</p>

        <h2 id="help">Troubleshooting</h2>
        <ul>
          <li><strong>I did not get my code:</strong> check spam, make sure the address ends in @mubas.ac.mw, then request a new code.</li>
          <li><strong>A photo will not upload:</strong> choose a JPEG or PNG; very large photos are shrunk automatically.</li>
          <li><strong>The page looks stuck:</strong> reload it. If it keeps happening, tell a steward.</li>
        </ul>
      </Prose>
    </PublicShell>
  );
}
