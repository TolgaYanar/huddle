import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for WeHuddle and the Huddle for Netflix extension.",
  // No canonical: this page is noindex (see layout.tsx) and excluded from the
  // sitemap, so a self-referencing canonical would be a contradictory signal.
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen flex flex-col bg-linear-to-b from-slate-900 via-slate-950 to-black text-slate-200">
      <header className="h-16 flex items-center justify-between px-6 lg:px-8 border-b border-white/10 backdrop-blur-md bg-black/30 sticky top-0 z-50">
        <Link
          href="/"
          className="font-semibold text-lg sm:text-xl flex items-center gap-2 text-slate-50 tracking-tight"
        >
          <picture>
            <source srcSet="/favicon.svg?v=2" type="image/svg+xml" />
            <img
              src="/favicon.svg?v=2"
              alt="WeHuddle"
              width={24}
              height={24}
              className="h-6 w-6 rounded"
            />
          </picture>
          <span>WeHuddle</span>
        </Link>
        <Link
          href="/"
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors flex items-center"
        >
          Back to home
        </Link>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-slate-400">Last updated: 2026-06-13</p>
        </header>

        <div className="space-y-8 text-slate-200">
          <section className="space-y-3">
            <p>
              These Terms of Service (“Terms”) govern your use of WeHuddle,
              including the website at{" "}
              <a
                className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                href="https://wehuddle.tv/"
              >
                wehuddle.tv
              </a>{" "}
              and the “Huddle for Netflix” browser extension (together, the
              “Service”). By using the Service, you agree to these Terms. If you
              do not agree, please do not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              1) Eligibility
            </h2>
            <p>
              You must be at least 13 years old (or the minimum age required in
              your jurisdiction) to use the Service. By using it, you confirm
              that you meet this requirement.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              2) The Service
            </h2>
            <p>
              WeHuddle helps people watch content together by synchronizing
              playback (e.g., play/pause/seek) and enabling room-based chat and
              optional voice/video calls and screen sharing. WeHuddle does not
              host, stream, or provide the third-party video content you watch;
              that content comes from the services you use it with (for example,
              YouTube or Netflix), under their own terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              3) Accounts
            </h2>
            <p>
              An account is optional — rooms work without one. If you create an
              account, you are responsible for keeping your credentials secure
              and for activity that happens under your account. Choose a strong,
              unique password.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              4) Acceptable use
            </h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                share, stream, or transmit content that is illegal, infringing,
                harassing, abusive, or otherwise harmful;
              </li>
              <li>
                share content you do not have the rights to share, or that
                violates the terms of the third-party services you use it with;
              </li>
              <li>
                attempt to disrupt, overload, reverse-engineer, or gain
                unauthorized access to the Service or other users; or
              </li>
              <li>impersonate others or misrepresent your affiliation.</li>
            </ul>
            <p>
              You are solely responsible for the content you stream, share, or
              send in chat, and for ensuring you have the rights to do so.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              5) Rooms and moderation
            </h2>
            <p>
              Rooms are created and joined using Room IDs. A room’s host can
              moderate participants, including removing (kicking) users.
              WeHuddle may also remove content or restrict access where
              necessary to operate the Service, prevent abuse, or comply with
              the law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              6) Service availability and changes
            </h2>
            <p>
              The Service may change, be updated, or be discontinued at any
              time, in whole or in part, without notice. We do not guarantee
              that the Service will be uninterrupted, error-free, or available
              at any particular time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              7) Disclaimer of warranties
            </h2>
            <p>
              The Service is provided “as is” and “as available,” without
              warranties of any kind, whether express or implied, including but
              not limited to implied warranties of merchantability, fitness for
              a particular purpose, and non-infringement. You use the Service at
              your own risk.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              8) Limitation of liability
            </h2>
            <p>
              To the maximum extent permitted by law, WeHuddle and its operators
              will not be liable for any indirect, incidental, special,
              consequential, or punitive damages, or for any loss of data, use,
              or goodwill, arising out of or relating to your use of the
              Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              9) Privacy
            </h2>
            <p>
              Our handling of your information is described in our{" "}
              <Link
                href="/privacy"
                className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              . By using the Service, you also agree to that policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              10) Changes to these Terms
            </h2>
            <p>
              We may update these Terms from time to time. When we do, we will
              update the “Last updated” date above. Continued use of the Service
              after changes take effect means you accept the updated Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">
              11) Contact
            </h2>
            <p>Questions about these Terms can be sent to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Website:{" "}
                <a
                  className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                  href="https://wehuddle.tv/"
                >
                  https://wehuddle.tv/
                </a>
              </li>
              <li>
                Email:{" "}
                <a
                  className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                  href="mailto:support@wehuddle.tv"
                >
                  support@wehuddle.tv
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="py-4 px-6 border-t border-white/5 flex items-center justify-center text-xs text-slate-500">
        © {new Date().getFullYear()} WeHuddle
      </footer>
    </div>
  );
}
