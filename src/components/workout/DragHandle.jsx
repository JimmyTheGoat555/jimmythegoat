// The six-dot grip that starts a drag in ReorderableList.
//
// Shared because there are now two lists you can reorder — the live
// logger's exercise cards and the planner's compact rows — and a handle
// that looks like a different affordance in each would be a small lie
// about them doing the same thing. Sizing differs (a 68px card wants a
// bigger target than a 44px row), which is what `className` is for.
//
// Only rendered when a drag is actually possible: a handle that cannot do
// anything is worse than no handle.
export default function DragHandle({ label, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-label={`Reorder ${label ?? 'item'}`}
      className={`flex shrink-0 cursor-grab items-center justify-center text-neutral-500 active:cursor-grabbing active:text-neutral-200 ${className}`}
      {...props}
    >
      <svg viewBox="0 0 10 16" className="h-4 w-2.5" aria-hidden="true">
        {[0, 1, 2].map((row) =>
          [0, 1].map((col) => (
            <circle key={`${row}-${col}`} cx={col * 6 + 2} cy={row * 6 + 2} r="1.5" fill="currentColor" />
          )),
        )}
      </svg>
    </button>
  );
}
