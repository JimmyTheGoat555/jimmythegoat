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

export function bodyTypeLabel(id) {
  return BODY_TYPES.find((t) => t.id === id)?.label ?? null;
}

export function fitnessGoalLabel(id) {
  return FITNESS_GOALS.find((g) => g.id === id)?.label ?? null;
}
