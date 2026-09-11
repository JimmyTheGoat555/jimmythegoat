import { useState } from 'react';
import { fullEvolutionGradient } from '../../utils/tierTheme';
import { PRIVACY_POLICY_SECTIONS, TERMS_OF_SERVICE_SECTIONS, LAST_UPDATED } from '../../content/legalContent';
import LegalDocument from '../legal/LegalDocument';
import OnboardingFlow from './OnboardingFlow';

// Horizontal (90°) so each color stop lines up with the character column
// beneath it.
const EVOLUTION_GRADIENT = fullEvolutionGradient(90);

// The "Jimmy Evolution Showcase" — four tiers, left (just starting) to right
// (maxed out), each with its own real sprite. Mock data: thresholds/labels
// aren't needed here, just the art + the color each tier represents.
const TIERS = [
  { id: 'goat', image: '/assets/jimmy-goat.png' },
  { id: 'buff', image: '/assets/jimmy-buff.png' },
  { id: 'titan', image: '/assets/jimmy-titan.png' },
  { id: 'legend', image: '/assets/jimmy-legend.png' },
];

// A gradient-bordered, glowing input — a padded gradient box behind a
// near-opaque dark field.
function GlowField({ className = '', ...props }) {
  return (
    <div
      className="p-[2px] rounded-2xl animate-[rainbow-glow-pulse_4s_ease-in-out_infinite]"
      style={{ background: EVOLUTION_GRADIENT }}
    >
      <input
        className={`w-full bg-neutral-950/85 text-neutral-50 placeholder-neutral-500 rounded-[14px] px-4 py-3.5 text-base outline-none backdrop-blur-sm ${className}`}
        {...props}
      />
    </div>
  );
}

// Sign-IN only. Sign-up is a full-screen character-creation wizard — see
// OnboardingFlow, which this swaps in wholesale for `mode === 'signup'`
// and which calls `onSignUp` itself once its account step validates.
export default function AuthScreen({ onSignUp, onSignIn, onResetPassword }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [brokenTiers, setBrokenTiers] = useState({});
  // "Forgot password?" — its own status so it can never visually collide
  // with the main form's error. null | 'busy' | 'sent' | { error }.
  const [resetStatus, setResetStatus] = useState(null);
  const [legalDoc, setLegalDoc] = useState(null);

  if (mode === 'signup') {
    return <OnboardingFlow onComplete={onSignUp} onSwitchToSignIn={() => setMode('signin')} />;
  }

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setResetStatus({ error: 'Enter your email above first.' });
      return;
    }
    setResetStatus('busy');
    try {
      await onResetPassword(email.trim());
      setResetStatus('sent');
    } catch (err) {
      setResetStatus({ error: err.message.replace(/^Firebase:\s*/, '') });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSignIn(email, password);
    } catch (err) {
      setError(err.message.replace(/^Firebase:\s*/, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: EVOLUTION_GRADIENT }}>
      {/* Four-column evolution showcase, pinned to the bottom band so heads
          stay clear of the centered form on any screen height. */}
      <div className="absolute inset-x-0 bottom-0 h-[32%] grid grid-cols-4">
        {TIERS.map((tier) =>
          brokenTiers[tier.id] ? (
            <div key={tier.id} />
          ) : (
            <img
              key={tier.id}
              src={tier.image}
              alt=""
              onError={() => setBrokenTiers((prev) => ({ ...prev, [tier.id]: true }))}
              className="w-full h-full object-contain object-bottom"
            />
          ),
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/70" />

      <div className="relative flex flex-col items-center min-h-screen px-4 py-10 gap-6">
        <h1
          className="text-center text-3xl leading-tight font-extrabold text-white uppercase tracking-tight max-w-xs mt-4"
          style={{ textShadow: '0 2px 24px rgba(0,0,0,0.85), 0 0 40px rgba(124,58,237,0.5)' }}
        >
          Join the Evolution,
          <br />
          Get to the Top.
        </h1>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 w-full max-w-sm mx-auto backdrop-blur-2xl bg-white/10 border border-white/20 rounded-[28px] p-5 shadow-2xl mt-10"
        >
          <GlowField
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <GlowField
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            minLength={6}
            required
          />

          <div className="text-right -mt-1.5">
            {resetStatus === 'sent' ? (
              <p className="text-xs text-emerald-300">Check your inbox for a reset link.</p>
            ) : (
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetStatus === 'busy'}
                className="text-xs font-medium text-white/70 disabled:opacity-50"
              >
                {resetStatus === 'busy' ? 'Sending…' : 'Forgot password?'}
              </button>
            )}
            {resetStatus?.error && <p className="text-xs text-rose-300 mt-1">{resetStatus.error}</p>}
          </div>

          {error && <p className="text-sm text-rose-300 px-1">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            style={{ background: EVOLUTION_GRADIENT }}
            className="w-full text-white text-lg font-bold py-4 rounded-2xl active:scale-[0.98] transition disabled:opacity-50 disabled:animate-none mt-2 shadow-lg animate-[rainbow-glow-pulse_2.4s_ease-in-out_infinite]"
          >
            {busy ? 'Please wait…' : 'Enter the Gym'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode('signup');
            setError(null);
            setResetStatus(null);
          }}
          className="text-center text-sm text-white/80"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}
        >
          Don't have an account? <span className="font-bold text-white">Sign up</span>
        </button>

        <p className="text-center text-xs text-white/60 max-w-xs -mt-3" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}>
          By continuing, you agree to our{' '}
          <button type="button" onClick={() => setLegalDoc('privacy')} className="underline font-semibold text-white/80">
            Privacy Policy
          </button>{' '}
          and{' '}
          <button type="button" onClick={() => setLegalDoc('terms')} className="underline font-semibold text-white/80">
            Terms of Service
          </button>
          .
        </p>
      </div>

      {legalDoc === 'privacy' && (
        <LegalDocument
          title="Privacy Policy"
          sections={PRIVACY_POLICY_SECTIONS}
          lastUpdated={LAST_UPDATED}
          onClose={() => setLegalDoc(null)}
        />
      )}
      {legalDoc === 'terms' && (
        <LegalDocument
          title="Terms of Service"
          sections={TERMS_OF_SERVICE_SECTIONS}
          lastUpdated={LAST_UPDATED}
          onClose={() => setLegalDoc(null)}
        />
      )}
    </div>
  );
}
