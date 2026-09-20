import { useEffect } from 'react';
import { dismissSplash } from '../../lib/splash';

// The standalone, SIGNED-OUT page shell behind /privacy, /terms and
// /support.
//
// These exist because App Store Connect requires a privacy-policy URL and
// a support URL, and Apple's reviewers open both — while signed out, from
// a desktop browser. The same words are already in the app (SettingsPanel
// opens LegalDocument as a modal), but a modal behind a sign-in wall is
// not a URL anyone can be given, which is why this is a real page rather
// than a link into the app.
//
// Rendered by PublicInfoRoutes BEFORE App mounts, so there is no auth
// gate, no Firebase, no tab bar and no account in the way — and so the
// page is fast and works for someone who has never installed anything.
// That also means nothing else will dismiss the launch screen, hence the
// effect below.
export default function PublicInfoPage({ title, meta, intro, sections, footnote }) {
  useEffect(() => {
    // App normally owns this. App is not mounted here.
    dismissSplash();
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | Jimmy the Goat`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="doc-prose min-h-[100dvh] bg-neutral-950 text-neutral-100">
      {/* Masthead. The logo is the same file as the app icon and the launch
          screen, so the page a reviewer opens is visibly the app they are
          reviewing. */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-5">
          <img
            src="/newlogo.zozo.png"
            alt=""
            width="40"
            height="40"
            className="h-10 w-10 shrink-0 rounded-[11px] object-cover"
          />
          <div className="min-w-0">
            <p
              className="text-lg uppercase italic leading-none tracking-tight text-neutral-50"
              style={{ fontFamily: 'var(--font-arcade)' }}
            >
              Jimmy the Goat
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              Strength Tracker
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-neutral-50 text-balance">{title}</h1>
        {meta && <p className="mt-2 text-xs text-neutral-500">{meta}</p>}
        {intro && <p className="mt-4 text-[15px] leading-relaxed text-neutral-300">{intro}</p>}

        <div className="mt-9 flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{section.heading}</h2>
              {/* whitespace-pre-line: the copy in content/*.js uses real
                  line breaks for its lists and numbered steps. */}
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-neutral-300">{section.body}</p>
            </section>
          ))}
        </div>

        {footnote && (
          <p className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-neutral-400">
            {footnote}
          </p>
        )}
      </main>

      {/* Plain <a>, not react-router <Link>: these are the URLs handed to
          Apple, and each one should survive being opened cold, copied, or
          bookmarked rather than depending on client-side routing state. */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-6 text-sm">
          <a className="text-neutral-400 underline underline-offset-4 hover:text-neutral-200" href="/privacy">
            Privacy Policy
          </a>
          <a className="text-neutral-400 underline underline-offset-4 hover:text-neutral-200" href="/terms">
            Terms of Service
          </a>
          <a className="text-neutral-400 underline underline-offset-4 hover:text-neutral-200" href="/support">
            Support
          </a>
          <a className="ml-auto font-semibold text-neutral-300 underline underline-offset-4 hover:text-white" href="/">
            Open the app
          </a>
        </div>
      </footer>
    </div>
  );
}
