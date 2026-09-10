// A scrollable legal-text overlay — same visual language as
// SettingsPanel.jsx's own modal (sticky header, rounded card, click-
// outside or ✕ to close) so it reads as part of the same app rather than
// a bolted-on legal page. `sections` is PRIVACY_POLICY_SECTIONS or
// TERMS_OF_SERVICE_SECTIONS from content/legalContent.js — plain
// {heading, body} data, kept separate from this component so the actual
// wording can be edited without touching any rendering logic.
export default function LegalDocument({ title, sections, lastUpdated, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl bg-neutral-950 border border-white/10 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-950 flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-neutral-50">{title}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Last updated {lastUpdated}</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 text-2xl leading-none px-1">
            ✕
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5">
          {sections.map((section) => (
            <div key={section.heading}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">
                {section.heading}
              </h3>
              <p className="text-sm text-neutral-300 whitespace-pre-line leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
