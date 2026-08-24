import { useWsStore } from '../stores/ws';

export function ConnectionChip() {
  const connected = useWsStore((s) => s.connected);
  if (connected) return null;
  return (
    <div className="connection-chip">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      Live updates paused — reconnecting…
    </div>
  );
}
