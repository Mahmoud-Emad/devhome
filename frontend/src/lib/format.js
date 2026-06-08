// Shared formatting helpers.

// "Jun 8, 14:30" — compact local date+time for history rows etc.
export const formatWhen = (at) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// "512 KB" / "3.4 MB" — human file size (empty string for 0/undefined).
export function formatSize(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

// "1:05" — mm:ss from a millisecond duration.
export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
