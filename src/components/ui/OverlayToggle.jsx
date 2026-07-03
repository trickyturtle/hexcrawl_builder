// Toggle buttons for map overlays
export default function OverlayToggle({ label, active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`px-2 py-0.5 rounded border text-xs transition-colors ${
        active
          ? 'border-blue-500 text-blue-300 bg-blue-900/30'
          : 'border-slate-600 text-slate-400 hover:border-slate-400'
      }`}
    >
      {label}
    </button>
  )
}
