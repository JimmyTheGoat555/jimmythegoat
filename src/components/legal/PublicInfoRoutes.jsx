import { useLocation } from 'react-router-dom';
import PublicInfoPage from './PublicInfoPage';
import {
  CONTACT_EMAIL,
  LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  TERMS_LAST_UPDATED,
  TERMS_OF_SERVICE_SECTIONS,
} from '../../content/legalContent';
import { SUPPORT_EMAIL, SUPPORT_INTRO, SUPPORT_RESPONSE_TIME, SUPPORT_SECTIONS } from '../../content/supportContent';

// Wraps <App/> and intercepts the handful of paths that must work with no
// account: the URLs given to App Store Connect.
//
// It sits OUTSIDE App (see main.jsx) rather than inside its <Routes>,
// because App returns <AuthScreen/> for every path when nobody is signed
// in — so a reviewer opening /privacy would get a sign-in form, which is
// exactly the rejection this is here to avoid. Being outside also means
// Firebase, App Check and the whole account tree never boot for a visitor
// who only came to read a policy.

function MailLink({ children }) {
  return (
    <a className="text-neutral-200 underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
      {children ?? CONTACT_EMAIL}
    </a>
  );
}

const PAGES = {
  '/privacy': () => (
    <PublicInfoPage
      title="Privacy Policy"
      meta={`Last updated ${LAST_UPDATED}`}
      sections={PRIVACY_POLICY_SECTIONS}
      footnote={
        <>
          Questions about your data, or want a copy of it? Email <MailLink />.
        </>
      }
    />
  ),
  '/terms': () => (
    <PublicInfoPage
      title="Terms of Service"
      meta={`Last updated ${TERMS_LAST_UPDATED}`}
      sections={TERMS_OF_SERVICE_SECTIONS}
      footnote={
        <>
          Questions about these terms? Email <MailLink />.
        </>
      }
    />
  ),
  '/support': () => (
    <PublicInfoPage
      title="Support"
      meta={SUPPORT_RESPONSE_TIME}
      intro={SUPPORT_INTRO}
      sections={SUPPORT_SECTIONS}
      footnote={
        <>
          Still stuck? Email{' '}
          <a className="text-neutral-200 underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{' '}
          and tell us your device and what happened.
        </>
      }
    />
  ),
};

export default function PublicInfoRoutes({ children }) {
  const { pathname } = useLocation();
  // Tolerate a trailing slash: these get typed, pasted into App Store
  // Connect and linked from elsewhere, and /privacy/ is the same page.
  const key = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const page = PAGES[key];
  return page ? page() : children;
}
