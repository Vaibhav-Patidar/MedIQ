/* Utility helpers for MedIQ frontend */

/**
 * Map urgency level to CSS class suffix
 */
export function urgencyClass(urgency: string): string {
  switch (urgency?.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    default: return 'low';
  }
}

/**
 * Map risk score to CSS class for coloring
 */
export function riskClass(score: number | null): string {
  if (score === null) return '';
  if (score >= 80) return 'risk-critical';
  if (score >= 60) return 'risk-high';
  if (score >= 40) return 'risk-medium';
  return 'risk-low';
}

/**
 * Map threshold_adjustment_reason to human-readable label
 */
export function reasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'diabetic_lactate_sensitivity': return 'Diabetic';
    case 'elderly_reduced_reserve': return 'Elderly';
    default: return reason;
  }
}

/**
 * Format a risk score change string
 * null → "—" (first prediction), else render as-is with sign
 */
export function formatScoreChange(change: string | null): string {
  if (change === null || change === undefined) return '—';
  return change;
}

/**
 * Compute remaining time from a server ISO timestamp.
 * Returns { hours, minutes, seconds, expired }
 */
export function computeCountdown(windowClosesAt: string | null): {
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  total: number;
} {
  if (!windowClosesAt) {
    return { hours: 0, minutes: 0, seconds: 0, expired: true, total: 0 };
  }
  const remaining = new Date(windowClosesAt).getTime() - Date.now();
  if (remaining <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, expired: true, total: 0 };
  }
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: false,
    total: totalSeconds,
  };
}

/**
 * Format countdown as HH:MM:SS
 */
export function formatCountdown(windowClosesAt: string | null): string {
  const { hours, minutes, seconds, expired } = computeCountdown(windowClosesAt);
  if (expired) return 'WINDOW CLOSED';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Parse SHAP impact string to get numeric value and direction
 * "+145 points" → { value: 145, positive: true }
 * "-39 points" → { value: 39, positive: false }
 */
export function parseShapImpact(impact: string): { value: number; positive: boolean } {
  const match = impact.match(/([+-]?)(\d+)/);
  if (!match) return { value: 0, positive: false };
  return {
    value: parseInt(match[2], 10),
    positive: match[1] !== '-',
  };
}

/**
 * Format date for display
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * Format time for display
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format datetime for display
 */
export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}
