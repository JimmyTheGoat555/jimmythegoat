import { useEffect, useMemo, useState } from 'react';
import { fullEvolutionGradient } from '../../utils/tierTheme';
import { roundToTenth } from '../../utils/units';
import { EXPERIENCE_LEVELS, GENDERS, TRAINING_DAYS_MIN, TRAINING_DAYS_MAX } from '../../utils/onboarding';
import { PRIVACY_POLICY_SECTIONS, TERMS_OF_SERVICE_SECTIONS, LAST_UPDATED } from '../../content/legalContent';
import LegalDocument from '../legal/LegalDocument';
import ScrollWheelPicker from '../shared/ScrollWheelPicker';
import BodyWeightWheel from '../shared/BodyWeightWheel';
import HeightFeetWheel from '../shared/HeightFeetWheel';
import DateWheel from '../shared/DateWheel';

// The whole sign-up experience — a hyper-minimalist, one-topic-per-screen
// character-creation wizard. AuthScreen renders this in place of
// everything for `mode === 'signup'`; it owns every answer in local state
// and only writes anything (via onComplete -> useAuth.signUp) on the final
// step, so a user who bails halfway leaves nothing behind.
//
// Order: role -> experience -> commitment -> gender -> birthday -> height
// -> weight -> email -> account. The email address is asked ONCE (no
// confirm field); Firebase fires a verification link at account creation
// (see useAuth.signUp) — a typed-code pre-account flow would need a Cloud
// Function + an email transport, which this project doesn't have wired.
//
// Transitions: the step wrapper is remounted on every `step` change
// (keyed) so the CSS enter animation replays; `data-dir` picks the slide
// direction. See index.css `.onboard-step`.

const GRADIENT = fullEvolutionGradient(135);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERROR_BORDER = '#f43f5e';
const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;

const STEPS = ['role', 'experience', 'commitment', 'gender', 'birthday', 'height', 'weight', 'email', 'account'];

// Tactile feedback: a light [40] ms pulse on every discrete tap — card
// select, unit toggle, Next, Back, submit, the sign-in link. The wheels
// keep their own lighter per-notch tick.
const buzz = () => navigator.vibrate?.([40]);

const JIMMY_LINES = {
  role: "First — which side of the whistle are you on?",
  experience: 'How much iron have you moved?',
  commitment: "Don't lie to me.",
  gender: 'Quick one — it helps me calibrate.',
  birthday: 'When did the legend begin?',
  height: 'Stand up straight for this one.',
  weight: "Real number. The scale doesn't negotiate.",
  email: 'Where do I send the good news?',
  account: 'Lock it in. This is your character now — no take-backs.',
};

function JimmyBubble({ children }) {
  return (
    <div className="mb-6 flex shrink-0 items-start gap-2">
      <span className="text-2xl leading-none">🐐</span>
      <p className="rounded-2xl rounded-tl-sm border border-white/15 bg-white/12 px-3 py-2 text-sm text-white/90 backdrop-blur-sm">
        {children}
      </p>
    </div>
  );
}

// Large, glowing, touch-friendly choice card — never a dropdown.
function GlowCard({ active, onClick, icon, title, hint }) {
  return (
    <button
      type="button"
      onClick={() => {
        buzz();
        onClick();
      }}
      style={active ? { background: GRADIENT } : undefined}
      className={`flex w-full items-center gap-3 rounded-2xl px-5 py-5 text-left font-bold transition active:scale-[0.98] ${
        active
          ? 'text-white shadow-[0_0_30px_rgba(124,58,237,0.55)]'
          : 'border border-white/15 bg-white/10 text-white/80 backdrop-blur-sm hover:border-white/30'
      }`}
    >
      {icon && <span className="text-3xl">{icon}</span>}
      <span className="flex flex-col">
        <span className="text-base leading-tight">{title}</span>
        {hint && (
          <span className={`text-xs font-medium ${active ? 'text-white/80' : 'text-white/45'}`}>{hint}</span>
        )}
      </span>
    </button>
  );
}

function UnitToggle({ options, value, onChange }) {
  return (
    <div className="mx-auto flex w-40 rounded-xl border border-white/15 bg-white/5 p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wide transition ${
            value === o ? 'bg-white/20 text-white' : 'text-white/50'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, error, showError, ...props }) {
  const invalid = Boolean(showError && error);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/55">{label}</span>
      <div className="rounded-xl p-[2px]" style={{ background: invalid ? ERROR_BORDER : GRADIENT }}>
        <input
          className="w-full rounded-[10px] bg-neutral-950/85 px-3.5 py-3 text-base text-neutral-50 placeholder-neutral-500 outline-none backdrop-blur-sm"
          aria-invalid={invalid}
          {...props}
        />
      </div>
      {invalid && <span className="mt-1 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}

export default function OnboardingFlow({ onComplete, onSwitchToSignIn }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState('fwd');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [legalDoc, setLegalDoc] = useState(null);

  // Every answer lives here until submit() — nothing is written before.
  const [role, setRole] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [targetDaysPerWeek, setTargetDaysPerWeek] = useState(4);
  const [gender, setGender] = useState('');
  const [birthday, setBirthday] = useState(''); // YYYY-MM-DD, seeded by DateWheel
  const [heightUnit, setHeightUnit] = useState('cm');
  const [height, setHeight] = useState(175); // in heightUnit
  const [weightUnit, setWeightUnit] = useState('kg');
  const [weight, setWeight] = useState(75); // in weightUnit
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [trainerCode, setTrainerCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [touched, setTouched] = useState({});
  const [triedSubmit, setTriedSubmit] = useState(false);

  // A friend's share link (`?ref=CODE`) pre-fills the referral field so
  // the invited person never has to type it — see useAuth.js's signUp /
  // functions/referral.js for what actually happens with it. Reading
  // location.search directly (not react-router) since this runs before
  // there's any real route to read it from.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) setReferralCode(ref.trim().toUpperCase());
  }, []);

  // Unit toggles convert the current value once so the number keeps its
  // meaning — never derive-from-canonical each render (that feeds a lossy
  // round-trip back through the wheel and the readout drifts).
  const chooseHeightUnit = (u) => {
    if (u === heightUnit) return;
    buzz();
    setHeight(u === 'in' ? Math.round(height / CM_PER_IN) : Math.round(height * CM_PER_IN));
    setHeightUnit(u);
  };
  const chooseWeightUnit = (u) => {
    if (u === weightUnit) return;
    buzz();
    setWeight(u === 'lb' ? Math.round(weight * LB_PER_KG) : roundToTenth(weight / LB_PER_KG));
    setWeightUnit(u);
  };

  const heightCm = heightUnit === 'in' ? Math.round(height * CM_PER_IN) : Math.round(height);
  const weightKg = weightUnit === 'lb' ? roundToTenth(weight / LB_PER_KG) : roundToTenth(weight);

  const emailValid = EMAIL_RE.test(email.trim());

  const accountErrors = useMemo(() => {
    const e = {};
    const dn = displayName.trim();
    if (!dn) e.displayName = 'Jimmy needs a name to yell.';
    else if (dn.length < 2) e.displayName = 'A little longer than that.';
    if (!password) e.password = 'Password required.';
    else if (password.length < 6) e.password = 'At least 6 characters.';
    if (!confirmPassword) e.confirmPassword = 'Confirm your password.';
    else if (password !== confirmPassword) e.confirmPassword = "Passwords don't match.";
    return e;
  }, [displayName, password, confirmPassword]);

  const accountValid = Object.keys(accountErrors).length === 0;
  const stepKey = STEPS[step];
  const isAccount = stepKey === 'account';
  const showErr = (k) => (triedSubmit || touched[k]) && accountErrors[k];
  const markTouched = (k) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  // Choice/entry steps gate Next; the wheels always hold a value (the
  // weight check is therefore just belt-and-suspenders — see submit()'s
  // comment for why it's still required, not optional, all the way to the
  // database); the account step never disables its button (a tap reveals
  // all errors).
  const canAdvance = () => {
    if (stepKey === 'role') return Boolean(role);
    if (stepKey === 'experience') return Boolean(experienceLevel);
    if (stepKey === 'gender') return Boolean(gender);
    if (stepKey === 'weight') return weightKg > 0;
    if (stepKey === 'email') return emailValid;
    return true;
  };

  const go = (delta) => {
    buzz();
    setSubmitError(null);
    setDir(delta < 0 ? 'back' : 'fwd');
    setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + delta)));
  };

  const submit = async () => {
    buzz();
    setBusy(true);
    setSubmitError(null);
    try {
      await onComplete({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        role,
        trainerCode: trainerCode.trim(),
        referralCode: referralCode.trim(),
        onboarding: {
          experienceLevel,
          targetDaysPerWeek,
          gender,
          birthday,
          heightCm,
          weightKg,
        },
      });
      // Success -> AuthScreen unmounts this whole tree.
    } catch (err) {
      setSubmitError(err.message?.replace(/^Firebase:\s*/, '') ?? 'Could not create your account.');
      setBusy(false);
    }
  };

  const handlePrimary = () => {
    if (!isAccount) {
      if (canAdvance()) go(1);
      else if (stepKey === 'email') setEmailTouched(true);
      return;
    }
    setTriedSubmit(true);
    if (accountValid) submit();
    else buzz();
  };

  const primaryLabel = busy ? 'Summoning Jimmy…' : isAccount ? 'Create My Goat' : 'Next →';

  return (
    <div className="relative min-h-screen overflow-hidden text-white" style={{ background: GRADIENT }}>
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/50 to-black/80" />

      <div className="relative flex h-screen flex-col items-center px-5 py-6">
        <div className="mb-4 flex shrink-0 gap-1">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-5 bg-white' : i < step ? 'w-1.5 bg-white/70' : 'w-1.5 bg-white/25'
              }`}
            />
          ))}
        </div>

        <div
          key={step}
          data-dir={dir === 'back' ? 'back' : 'fwd'}
          className="onboard-step flex w-full max-w-sm flex-1 flex-col overflow-y-auto"
        >
          <JimmyBubble>{JIMMY_LINES[stepKey]}</JimmyBubble>

          {stepKey === 'role' && (
            <div className="my-auto flex w-full flex-col gap-3">
              <h2 className="mb-1 text-2xl font-extrabold">Trainee or Trainer?</h2>
              <GlowCard active={role === 'trainee'} onClick={() => setRole('trainee')} icon="🏋️" title="I'm a Trainee" hint="Here to get stronger" />
              <GlowCard active={role === 'trainer'} onClick={() => setRole('trainer')} icon="📋" title="I'm a Trainer" hint="Here to coach lifters" />
            </div>
          )}

          {stepKey === 'experience' && (
            <div className="my-auto flex w-full flex-col gap-3">
              <h2 className="mb-1 text-2xl font-extrabold">How long have you been lifting?</h2>
              {EXPERIENCE_LEVELS.map((lv) => (
                <GlowCard
                  key={lv.id}
                  active={experienceLevel === lv.id}
                  onClick={() => setExperienceLevel(lv.id)}
                  icon={lv.icon}
                  title={lv.label}
                  hint={lv.hint}
                />
              ))}
            </div>
          )}

          {stepKey === 'commitment' && (
            <div className="my-auto flex w-full flex-col gap-5">
              <h2 className="text-2xl font-extrabold">Days a week you'll commit to Jimmy?</h2>
              <ScrollWheelPicker
                label="Training days"
                unit={targetDaysPerWeek === 1 ? 'day' : 'days'}
                value={targetDaysPerWeek}
                onChange={setTargetDaysPerWeek}
                min={TRAINING_DAYS_MIN}
                max={TRAINING_DAYS_MAX}
                precision={0}
              />
            </div>
          )}

          {stepKey === 'gender' && (
            <div className="my-auto flex w-full flex-col gap-3">
              <h2 className="mb-1 text-2xl font-extrabold">Gender</h2>
              {GENDERS.map((g) => (
                <GlowCard key={g.id} active={gender === g.id} onClick={() => setGender(g.id)} title={g.label} />
              ))}
            </div>
          )}

          {stepKey === 'birthday' && (
            <div className="my-auto flex w-full flex-col gap-5">
              <h2 className="text-2xl font-extrabold">Your birthday</h2>
              <DateWheel value={birthday} onChange={setBirthday} />
            </div>
          )}

          {stepKey === 'height' && (
            <div className="my-auto flex w-full flex-col gap-5">
              <h2 className="text-2xl font-extrabold">How tall are you?</h2>
              <UnitToggle options={['cm', 'in']} value={heightUnit} onChange={chooseHeightUnit} />
              {heightUnit === 'in' ? (
                // `height` is total inches here — HeightFeetWheel splits it
                // into a feet dial + an inches dial and emits total inches
                // back, so the cm conversion (× 2.54) is unchanged.
                <HeightFeetWheel value={height} onChange={setHeight} />
              ) : (
                <ScrollWheelPicker
                  label="Height"
                  unit="cm"
                  value={height}
                  onChange={setHeight}
                  min={130}
                  max={220}
                  precision={0}
                />
              )}
            </div>
          )}

          {stepKey === 'weight' && (
            <div className="my-auto flex w-full flex-col gap-5">
              <h2 className="text-2xl font-extrabold">And your body weight?</h2>
              <UnitToggle options={['kg', 'lb']} value={weightUnit} onChange={chooseWeightUnit} />
              {weightUnit === 'kg' ? (
                <BodyWeightWheel value={weight} onChange={setWeight} min={35} max={200} />
              ) : (
                <ScrollWheelPicker
                  label="Body weight"
                  unit="lb"
                  value={weight}
                  onChange={setWeight}
                  min={80}
                  max={440}
                  precision={0}
                />
              )}
            </div>
          )}

          {stepKey === 'email' && (
            <div className="my-auto flex w-full flex-col gap-3">
              <h2 className="mb-1 text-2xl font-extrabold">Your email</h2>
              <Field
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                error="That doesn't look like an email."
                showError={emailTouched && !emailValid}
                placeholder="you@email.com"
              />
              <p className="text-xs leading-snug text-white/50">
                Asked once. Jimmy sends a verification link here right after you create the account —
                click it to unlock friend features.
              </p>
            </div>
          )}

          {stepKey === 'account' && (
            <div className="my-auto flex w-full flex-col gap-3">
              <h2 className="mb-1 text-2xl font-extrabold">Claim your account</h2>
              <Field
                label="Display name"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => markTouched('displayName')}
                error={accountErrors.displayName}
                showError={showErr('displayName')}
                placeholder="Big Dave"
              />
              <Field
                label="Password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => markTouched('password')}
                error={accountErrors.password}
                showError={showErr('password')}
                placeholder="6+ characters"
              />
              <Field
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => markTouched('confirmPassword')}
                error={accountErrors.confirmPassword}
                showError={showErr('confirmPassword')}
                placeholder="Type it again"
              />
              {role === 'trainee' && (
                <Field
                  label="Trainer code (optional)"
                  autoComplete="off"
                  value={trainerCode}
                  onChange={(e) => setTrainerCode(e.target.value)}
                  placeholder="Ask your coach"
                />
              )}
              <Field
                label="Referral code (optional)"
                autoComplete="off"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="A friend's code — they get 150 coins"
              />
              <p className="mt-1 text-[11px] leading-snug text-white/50">
                Signing up as <span className="font-semibold text-white/70">{email.trim() || 'your email'}</span>. By
                continuing you agree to our{' '}
                <button type="button" className="underline" onClick={() => setLegalDoc('privacy')}>
                  Privacy Policy
                </button>{' '}
                and{' '}
                <button type="button" className="underline" onClick={() => setLegalDoc('terms')}>
                  Terms
                </button>
                .
              </p>
            </div>
          )}
        </div>

        {submitError && <p className="mt-3 w-full max-w-sm shrink-0 text-sm text-rose-300">{submitError}</p>}

        <div className="mt-4 flex w-full max-w-sm shrink-0 flex-col gap-2">
          <button
            type="button"
            disabled={busy || (!isAccount && !canAdvance())}
            onClick={handlePrimary}
            style={{ background: GRADIENT }}
            className="w-full rounded-2xl py-4 text-lg font-extrabold text-white shadow-lg transition active:scale-[0.98] animate-[rainbow-glow-pulse_2.6s_ease-in-out_infinite] disabled:animate-none disabled:opacity-40"
          >
            {primaryLabel}
          </button>
          {step > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => go(-1)}
              className="py-1 text-center text-sm text-white/70 disabled:opacity-40"
            >
              ← Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                buzz();
                onSwitchToSignIn();
              }}
              className="py-1 text-center text-sm text-white/70"
            >
              Already have an account? <span className="font-bold text-white">Sign in</span>
            </button>
          )}
        </div>
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
