import { MUSCLE_GROUPS } from '../../data/exercises';

export default function MuscleGroupPicker({ selectedGroup, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
      {MUSCLE_GROUPS.map((group) => {
        const active = group.id === selectedGroup;
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelect(group.id)}
            className={`shrink-0 px-4 py-2.5 rounded-full text-base font-medium transition ${
              active ? 'bg-[var(--ember)] text-white' : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {group.label}
          </button>
        );
      })}
    </div>
  );
}
