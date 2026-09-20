import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import FounderMessageSheet from '../src/components/shared/FounderMessageSheet';
import { tierCssVars } from '../src/utils/tierTheme';

// The founder's direct-message sheet on a fixture — what a user sees the
// next time they open the app after the Founder Console messages them.
//
//   ?title=…   ?body=…   override the copy
//   ?count=2   queue two messages, to see the second follow the first
//
// Dev only — this page is never built.
const params = new URLSearchParams(location.search);
const COUNT = Math.max(1, Number(params.get('count')) || 1);
const QUEUE = Array.from({ length: COUNT }, (_, i) => ({
  id: `m-${i}`,
  title: params.get('title') ?? (i === 0 ? 'You made the leaderboard 🏆' : ''),
  body:
    params.get('body') ??
    (i === 0
      ? 'Hey Dana — you closed last week at #3 on the lifetime board. Your hip thrust volume is unreal.\n\nKeep it up, and tell me if the new Noir sticker gives you any trouble.'
      : 'One more: your Volume Queen badge is live on your shelf now.'),
  createdAt: new Date(Date.now() - i * 60000).toISOString(),
}));

function Harness() {
  const [queue, setQueue] = useState(QUEUE);
  const [log, setLog] = useState([]);
  const message = queue[0] ?? null;
  const read = () => {
    if (!message) return;
    setLog((l) => [...l, `${message.id} read at ${new Date().toLocaleTimeString()}`]);
    setQueue((q) => q.slice(1));
  };
  return (
    <div className="mx-auto max-w-md px-4 pt-8" style={tierCssVars('titan')}>
      <h1 className="text-xl font-bold text-neutral-50">Founder message harness</h1>
      <p className="mt-1 text-sm text-neutral-400">{queue.length} unread in the queue.</p>
      <button
        type="button"
        id="requeue"
        onClick={() => setQueue(QUEUE)}
        className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-200"
      >
        Re-queue
      </button>
      <ul id="read-log" className="mt-4 flex flex-col gap-1 text-xs text-neutral-500">
        {log.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <FounderMessageSheet message={message} onRead={read} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
