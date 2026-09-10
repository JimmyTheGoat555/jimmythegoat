import { useState } from 'react';
import { fullEvolutionGradient } from '../../utils/tierTheme';
import { BODY_TYPES, FITNESS_GOALS, WEEKLY_TARGETS } from '../../utils/onboarding';
import { PRIVACY_POLICY_SECTIONS, TERMS_OF_SERVICE_SECTIONS, LAST_UPDATED } from '../../content/legalContent';
import LegalDocument from '../legal/LegalDocument';

// Horizontal (90°) so each color stop lines up with the character column
// beneath it.
const EVOLUTION_GRADIENT = fullEvolutionGradient(90);

// The "Jimmy Evolution Showcase" — four tiers, left (just starting) to right
// (maxed out), each with its own real sprite. Mock data: thresholds/labels
// aren't needed here, just the art + the color each tier represents.
// (The original 5th/starting tier, "Kid Goat," was removed at the user's
// request — see utils/evolutionTiers.js for the full change.)
const TIERS = [
  { id: 'goat', image: '/assets/jimmy-goat.png' },
  { id: 'buff', image: '/assets/jimmy-buff.png' },
  { id: 'titan', image: '/assets/jimmy-titan.png' },
  { id: 'legend', image: '/assets/jimmy-legend.png' },
];

// A gradient-bordered, glowing input — same trick everywhere on this
// screen: a padded gradient box behind a near-opaque dark field.
function GlowField({ as = 'input', className = '', ...props }) {
  const Field = as;
  return (
    <div
      className="p-[2px] rounded-2xl animate-[rainbow-glow-pulse_4s_ease-in-out_infinite]"
      style={{ background: EVOLUTION_GRADIENT }}
    >
      <Field
        className={`w-full bg-neutral-950/85 text-neutral-50 placeholder-neutral-500 rounded-[14px] px-4 py-3.5 text-base outline-none backdrop-blur-sm ${className}`}
        {...props}
      />
    </div>
  );
}

function roleButtonClass(active) {
  return `py-3.5 rounded-2xl text-base font-semibold transition ${
    active
      ? 'text-white shadow-lg'
      : 'bg-white/10 text-white/70 backdrop-blur-sm'
  }`;
}

// Same visual language as roleButtonClass, generalized for the smaller
// onboarding pill choices (body type, weekly target) — active fills with
// the evolution gradient, inactive stays glass.
function pillButtonClass(active, extra = '') {
  return `rounded-2xl text-sm font-semibold transition ${
    active ? 'text-white shadow-lg' : 'bg-white/10 text-white/70 backdrop-blur-sm'
  } ${extra}`;
}

const TOTAL_SIGNUP_STEPS = 2;

export default function AuthScreen({ onSignUp, onSignIn, onResetPassword }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [step, setStep] = useState(1); // signup only: 1 = account, 2 = onboarding
  const [role, setRole] = useState('trainee');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [trainerCode, setTrainerCode] = useState('');
  // Onboarding questionnaire (sign-up step 2) — height/weight are
  // required (native HTML5 `required`+`min`/`max` below block submitting
  // step 2 without valid numbers, same pattern already used for step 1's
  // name/email/password); body type/fitness goal/weekly target stay
  // optional. Kept as a second step rather than folded into step 1 so the
  // account form itself stays as fast as it always was.
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [fitnessGoal, setFitnessGoal] = useState('');
  const [weeklyTarget, setWeeklyTarget] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [brokenTiers, setBrokenTiers] = useState({});
  // "Forgot password?" — a separate status from the main form's busy/error
  // above so the two can never visually collide (e.g. a sign-in attempt
  // failing right as a reset email is being sent). null | 'busy' | 'sent'
  // | { error }.
  const [resetStatus, setResetStatus] = useState(null);
  // Which legal document overlay is open, if any — null | 'privacy' | 'terms'.
  const [legalDoc, setLegalDoc] = useState(null);

  const switchMode = () => {
    setMode(mode === 'signup' ? 'signin' : 'signup');
    setStep(1);
    setError(null);
    setResetStatus(null);
  };

  // Reuses whatever's already typed in the email field above — Firebase
  // Auth owns the entire rest of this flow (the emailed link goes to a
  // Firebase-hosted reset page, not anything in this app), so this is
  // genuinely just "trigger the email and say so."
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

    // Step 1 of sign-up just advances to the onboarding questionnaire —
    // native HTML5 validation (the `required` fields below) already ran
    // before this handler fires, so reaching here means name/email/
    // password/role are all valid.
    if (mode === 'signup' && step === 1) {
      setStep(2);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        await onSignUp({
          email,
          password,
          displayName,
          role,
          trainerCode,
          onboarding: { weightKg, heightCm, bodyType, fitnessGoal, weeklyTarget },
        });
      } else {
        await onSignIn(email, password);
      }
    } catch (err) {
      setError(err.message.replace(/^Firebase:\s*/, ''));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = busy
    ? 'Please wait…'
    : mode === 'signin'
      ? 'Enter the Gym'
      : step === 1
        ? 'Next →'
        : 'Join the Herd';

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: EVOLUTION_GRADIENT }}>
      {/* Five-column evolution showcase: one full sprite per tier, the
          gradient behind them doing the actual color transition so there
          are no hard seams between columns. Pinned to the bottom half only
          (not the full screen) — stretching them full-height made their
          head position drift with viewport height, sometimes landing right
          behind the centered form panel. Capping the band keeps heads
          safely below the panel on any screen. */}
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
      {/* Legibility scrim over the character lineup */}
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
          {mode === 'signup' && (
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-white/60 -mb-1">
              Step {step} of {TOTAL_SIGNUP_STEPS} · {step === 1 ? 'Your Account' : 'Tell Us About You'}
            </p>
          )}

          {mode === 'signup' && step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('trainee')}
                  style={role === 'trainee' ? { background: EVOLUTION_GRADIENT } : undefined}
                  className={roleButtonClass(role === 'trainee')}
                >
                  I'm a Trainee
                </button>
                <button
                  type="button"
                  onClick={() => setRole('trainer')}
                  style={role === 'trainer' ? { background: EVOLUTION_GRADIENT } : undefined}
                  className={roleButtonClass(role === 'trainer')}
                >
                  I'm a Trainer
                </button>
              </div>
              <GlowField placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </>
          )}

          {(mode === 'signin' || step === 1) && (
            <>
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
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />

              {mode === 'signin' && (
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
              )}
            </>
          )}

          {mode === 'signup' && step === 1 && role === 'trainee' && (
            <GlowField
              placeholder="Trainer code (optional — ask your coach)"
              value={trainerCode}
              onChange={(e) => setTrainerCode(e.target.value)}
            />
          )}

          {mode === 'signup' && step === 2 && (
            <>
              <p className="text-sm text-white/70 -mt-1">
                Height and weight are required — everything below that is optional, but it helps{' '}
                {role === 'trainer' ? 'track your own training' : 'your coach'} tailor things to you.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <GlowField
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="1"
                  max="500"
                  placeholder="Weight (kg) *"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  required
                />
                <GlowField
                  type="number"
                  inputMode="numeric"
                  min="50"
                  max="272"
                  placeholder="Height (cm) *"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  required
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-1.5">Body Type</p>
                <div className="grid grid-cols-4 gap-2">
                  {BODY_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setBodyType(bodyType === type.id ? '' : type.id)}
                      style={bodyType === type.id ? { background: EVOLUTION_GRADIENT } : undefined}
                      className={pillButtonClass(bodyType === type.id, 'py-2.5')}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-1.5">Fitness Goal</p>
                <div className="grid grid-cols-2 gap-2">
                  {FITNESS_GOALS.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setFitnessGoal(fitnessGoal === goal.id ? '' : goal.id)}
                      style={fitnessGoal === goal.id ? { background: EVOLUTION_GRADIENT } : undefined}
                      className={pillButtonClass(fitnessGoal === goal.id, 'py-2.5 flex items-center justify-center gap-1.5')}
                    >
                      <span>{goal.icon}</span> {goal.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-1.5">
                  Weekly Workout Target
                </p>
                <div className="grid grid-cols-6 gap-1.5">
                  {WEEKLY_TARGETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setWeeklyTarget(weeklyTarget === n ? '' : n)}
                      style={weeklyTarget === n ? { background: EVOLUTION_GRADIENT } : undefined}
                      className={pillButtonClass(weeklyTarget === n, 'py-2.5')}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-rose-300 px-1">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            style={{ background: EVOLUTION_GRADIENT }}
            className="w-full text-white text-lg font-bold py-4 rounded-2xl active:scale-[0.98] transition disabled:opacity-50 disabled:animate-none mt-2 shadow-lg animate-[rainbow-glow-pulse_2.4s_ease-in-out_infinite]"
          >
            {submitLabel}
          </button>

          {mode === 'signup' && step === 2 && (
            <button type="button" onClick={() => setStep(1)} className="text-center text-sm text-white/70 -mt-1">
              ← Back
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={switchMode}
          className="text-center text-sm text-white/80"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}
        >
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <span className="font-bold text-white">{mode === 'signup' ? 'Sign in' : 'Sign up'}</span>
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
