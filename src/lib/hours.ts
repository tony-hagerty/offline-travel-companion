const DAYS: Record<string, string> = {
  Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun', PH: 'Holidays', SH: 'School holidays',
};

function to12h(time: string): string {
  const m = /^(\d{1,2}):(\d{2})(\+?)$/.exec(time);
  if (!m) return time;
  let h = Number(m[1]);
  const min = m[2];
  const suffix = h >= 12 && h < 24 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}${min === '00' ? '' : `:${min}`} ${suffix}${m[3] ? '+' : ''}`;
}

/**
 * Turns an OpenStreetMap opening_hours value into readable lines.
 * "Mo-Fr 09:00-17:00; Sa 10:00-14:00; PH off" →
 * ["Mon–Fri 9 AM–5 PM", "Sat 10 AM–2 PM", "Holidays closed"]
 * Values it can't make sense of are returned mostly unchanged.
 */
export function formatOsmHours(value: string, h12 = true): string[] {
  if (value.trim() === '24/7') return ['Open 24 hours'];
  return value
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) =>
      rule
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b/g, (d) => DAYS[d])
        .replace(/(\d{1,2}:\d{2}\+?)/g, (t) => (h12 ? to12h(t) : t))
        .replace(/(\S)-(\S)/g, '$1–$2')
        .replace(/\boff\b|\bclosed\b/gi, 'closed')
        .replace(/,(?=\S)/g, ', '),
    );
}
