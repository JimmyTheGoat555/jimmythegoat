export default function FirebaseSetupNeeded() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] px-6 text-center gap-4">
      <span className="text-5xl">🔧</span>
      <h1 className="text-2xl font-bold text-neutral-50">Firebase isn't configured yet</h1>
      <p className="text-neutral-400 max-w-sm">
        Copy <code className="text-neutral-200">.env.example</code> to{' '}
        <code className="text-neutral-200">.env.local</code>, fill in your Firebase project's web
        config, then restart the dev server.
      </p>
      <p className="text-neutral-600 text-sm max-w-sm">
        See FIREBASE_SETUP.md for step-by-step instructions.
      </p>
    </div>
  );
}
