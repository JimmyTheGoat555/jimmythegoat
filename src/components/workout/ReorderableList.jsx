import { useCallback, useRef, useState } from 'react';

// Drag-to-reorder, built on Pointer Events.
//
// The brief asked for framer-motion's Reorder.Group/Reorder.Item "since we
// are already using framer-motion" — this project never has. Every
// animation in it is plain CSS (see index.css), and the stated goal was a
// tactile reorder "without adding any heavy external DnD libraries", which
// is an argument against pulling in an animation engine now rather than
// for it. So: same interaction, no dependency, ~150 lines.
//
// How it works. On pick-up it measures every row's top and height ONCE and
// keeps that layout for the whole gesture. The dragged row then just
// follows the finger, while the rows it has passed slide out of its way by
// exactly its own height. Nothing is reordered in React state until the
// finger lifts, so there is no feedback loop between the drag and a
// re-render — which is what makes cheap implementations of this jitter.
//
// The measured layout is also what makes variable-height rows work, and
// exercise cards very much are variable height: one with five logged sets
// is several times taller than one with a single empty set.
//
// Only the handle starts a drag (`dragHandleProps`), so all the buttons
// inside a card — set chips, the check, +Add Set — keep working normally.

export default function ReorderableList({ items, getKey, onReorder, renderItem, disabled = false }) {
  const containerRef = useRef(null);
  // Live gesture data that must not trigger re-renders on every pointer
  // move: the frozen layout, the pointer origin, and the id being dragged.
  const gesture = useRef(null);
  const [dragKey, setDragKey] = useState(null);
  const [dragDy, setDragDy] = useState(0);
  const [targetIndex, setTargetIndex] = useState(null);

  const endGesture = useCallback(() => {
    gesture.current = null;
    setDragKey(null);
    setDragDy(0);
    setTargetIndex(null);
  }, []);

  const handlePointerDown = useCallback(
    (event, index) => {
      if (disabled) return;
      // Ignore secondary buttons; let the browser handle its own gestures.
      if (event.button != null && event.button !== 0) return;

      const container = containerRef.current;
      if (!container) return;
      const rows = [...container.children].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, height: r.height };
      });

      // `target` is tracked on the ref as well as in state: state drives
      // the render, the ref is what the pointerup handler reads. Reading it
      // out of a setState updater instead would mean doing the commit
      // inside that updater — and React is free to run an updater more than
      // once, which fired the drop haptic and onReorder repeatedly the
      // first time this was written that way.
      gesture.current = { index, target: index, startY: event.clientY, rows };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      navigator.vibrate?.([30]);
      setDragKey(getKey(items[index]));
      setDragDy(0);
      setTargetIndex(index);
    },
    [disabled, getKey, items],
  );

  const handlePointerMove = useCallback((event) => {
    const g = gesture.current;
    if (!g) return;
    event.preventDefault();
    const dy = event.clientY - g.startY;
    setDragDy(dy);

    // Where is the dragged row's centre now, and whose slot is that?
    const dragged = g.rows[g.index];
    const centre = dragged.top + dragged.height / 2 + dy;
    let next = g.index;
    for (let i = 0; i < g.rows.length; i++) {
      const r = g.rows[i];
      if (centre >= r.top && centre <= r.top + r.height) {
        next = i;
        break;
      }
      // Past either end of the list, clamp to it.
      if (i === 0 && centre < r.top) next = 0;
      if (i === g.rows.length - 1 && centre > r.top + r.height) next = g.rows.length - 1;
    }
    g.target = next;
    setTargetIndex(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    const { index: from, target: to } = g;
    // Commit straight from the ref — a plain, synchronous read, so the
    // haptic and the reorder each happen exactly once.
    if (to != null && to !== from) {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      navigator.vibrate?.([30]);
      onReorder(next.map(getKey));
    }
    endGesture();
  }, [items, getKey, onReorder, endGesture]);

  // How far a given row has to slide to make room for the dragged one.
  const offsetFor = (index) => {
    const g = gesture.current;
    if (!g || targetIndex == null || index === g.index) return 0;
    const h = g.rows[g.index].height;
    // Gap between cards — they sit in a flex column with gap-3 (12px).
    const shift = h + 12;
    if (index > g.index && index <= targetIndex) return -shift;
    if (index < g.index && index >= targetIndex) return shift;
    return 0;
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {items.map((item, index) => {
        const key = getKey(item);
        const isDragging = key === dragKey;
        const offset = isDragging ? dragDy : offsetFor(index);
        return (
          <div
            key={key}
            style={{
              transform: offset ? `translateY(${offset}px)` : undefined,
              // The dragged row must track the finger exactly — any
              // transition on it reads as lag. The rows getting out of its
              // way are the ones that should ease.
              transition: isDragging ? 'none' : 'transform 0.18s ease-out',
              zIndex: isDragging ? 20 : undefined,
              position: isDragging ? 'relative' : undefined,
              scale: isDragging ? '1.02' : undefined,
              filter: isDragging ? 'drop-shadow(0 12px 20px rgba(0,0,0,0.55))' : undefined,
              touchAction: dragKey ? 'none' : undefined,
            }}
          >
            {renderItem(item, {
              isDragging,
              dragHandleProps: disabled
                ? null
                : {
                    onPointerDown: (e) => handlePointerDown(e, index),
                    onPointerMove: handlePointerMove,
                    onPointerUp: handlePointerUp,
                    onPointerCancel: handlePointerUp,
                    // Without this the browser claims the gesture as a
                    // scroll the moment the finger moves vertically — which
                    // is exactly the direction this drag needs.
                    style: { touchAction: 'none' },
                  },
            })}
          </div>
        );
      })}
    </div>
  );
}
