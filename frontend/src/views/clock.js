const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');

function partOfDay(hour) {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function renderClock(el, date, use24h = true) {
  const minutes = pad(date.getMinutes());
  if (use24h) {
    el.textContent = `${pad(date.getHours())}:${minutes}`;
    return;
  }
  const hour = date.getHours() % 12 || 12;
  const suffix = date.getHours() < 12 ? 'AM' : 'PM';
  el.textContent = `${hour}:${minutes} ${suffix}`;
}

export function renderSubtitle(el, date, name) {
  const who = name ? `, ${name}` : '';
  const day = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  el.textContent = `Good ${partOfDay(date.getHours())}${who}  ·  ${day}`;
}
