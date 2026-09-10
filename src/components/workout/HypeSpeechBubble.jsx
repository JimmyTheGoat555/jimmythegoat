import { useEffect, useState } from 'react';

// A rotating speech bubble above Jimmy — cycles through context-aware
// hype lines (real remaining-tonnage math, real friend activity, plus a
// couple of flavor lines) every few seconds with a quick fade.
export default function HypeSpeechBubble({ messages }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % messages.length);
        setVisible(true);
      }, 250);
    }, 4200);
    return () => clearInterval(id);
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`card px-4 py-3 max-w-[16rem] text-sm font-semibold text-neutral-50 text-center transition-opacity duration-250 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {messages[index % messages.length]}
      </div>
      <div
        className="w-3.5 h-3.5 -mt-[7px] rotate-45 border-r border-b border-white/14"
        style={{ background: 'rgba(20, 18, 24, 0.55)' }}
      />
    </div>
  );
}
