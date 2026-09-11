// Choice lists for the onboarding questionnaire (sign-up step 2) and the
// Profile "Details" card that edits the same fields later. Single source
// of truth so AuthScreen, ProfileView, and TraineeDetail (the trainer's
// read-only view) never drift on what a stored id means.

export const BODY_TYPES = [
  { id: 'slim', label: 'Slim' },
  { id: 'average', label: 'Average' },
  { id: 'stocky', label: 'Stocky' },
  { id: 'athletic', label: 'Athletic' },
];

export const FITNESS_GOALS = [
  { id: 'hypertrophy', label: 'Muscle Gain', icon: '💪' },
  { id: 'strength', label: 'Strength', icon: '🏋️' },
  { id: 'fat_loss', label: 'Fat Loss', icon: '🔥' },
  { id: 'general_fitness', label: 'General Fitness', icon: '⚡' },
];

// A row of tap targets rather than a free number input — keeps the answer
// to a small known set the trainer-side view can render as a clean label,
// and matches how Body Type/Fitness Goal are picked (one tap, no typing).
export const WEEKLY_TARGETS = [2, 3, 4, 5, 6, 7];

// --- Gamified onboarding flow (components/auth/OnboardingFlow.jsx) ------
// These drive the step-by-step sign-up experience and are persisted on the
// user doc at signup (see hooks/useAuth.js). Kept here, beside the older
// questionnaire lists, so every screen that renders a stored id — Profile,
// the trainer's read-only Trainee view — resolves it the same way.

// kg/lbs + cm/in. Only the id is stored; conversion at display sites is a
// later change (see utils/units.js' NOTE) — today everything is still kg.
export const UNIT_SYSTEMS = [
  { id: 'metric', label: 'Metric', hint: 'kg · cm' },
  { id: 'imperial', label: 'Imperial', hint: 'lb · in' },
];

// "How long have you been lifting?" — three broad bands, not an exact
// number of years. Ids are what get stored on users/{uid}; keep them
// stable (the labels can be reworded freely).
export const EXPERIENCE_LEVELS = [
  { id: 'beginner', label: 'Beginner', hint: 'New to the iron', icon: '🌱' },
  { id: 'intermediate', label: 'Intermediate', hint: 'A year or two deep', icon: '💪' },
  { id: 'gym_rat', label: 'Gym Rat', hint: 'The gym is my second home', icon: '🐐' },
];

// Primary training focus. Ids intentionally match FITNESS_GOALS above so
// the value doubles as the older `fitnessGoal` field — Profile already
// knows how to render these.
export const PRIMARY_GOALS = FITNESS_GOALS;

// Build-your-own vs. follow Jimmy's ready-made routines.
export const ROUTINE_STYLES = [
  { id: 'custom', label: 'Build my own', hint: 'I know what I want to train', icon: '🛠️' },
  { id: 'templates', label: "Use Jimmy's templates", hint: 'Just tell me what to do', icon: '📋' },
];

// Planned training days per week — the wheel picker's range on the
// Commitment step.
export const TRAINING_DAYS_MIN = 1;
export const TRAINING_DAYS_MAX = 7;

// Gender — its own single-topic screen in the wizard. Stored id only.
export const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
];

// Birthday wheel bounds. 13 is the floor we let people pick (well under
// any realistic user, but a hard stop); 90 years back is plenty of range.
export const MIN_SIGNUP_AGE = 13;
export const MAX_SIGNUP_AGE = 90;

export function genderLabel(id) {
  return GENDERS.find((g) => g.id === id)?.label ?? null;
}

export function bodyTypeLabel(id) {
  return BODY_TYPES.find((t) => t.id === id)?.label ?? null;
}

export function fitnessGoalLabel(id) {
  return FITNESS_GOALS.find((g) => g.id === id)?.label ?? null;
}

export function experienceLevelLabel(id) {
  return EXPERIENCE_LEVELS.find((e) => e.id === id)?.label ?? null;
}

export function routineStyleLabel(id) {
  return ROUTINE_STYLES.find((s) => s.id === id)?.label ?? null;
}

export function unitSystemLabel(id) {
  return UNIT_SYSTEMS.find((u) => u.id === id)?.label ?? null;
}
