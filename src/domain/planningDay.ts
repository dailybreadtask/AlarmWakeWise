/** After mid-afternoon the day being planned is tomorrow. Before that it is today. */
export function dayBeingPlanned(now: Date): { word: 'Today' | 'Tomorrow'; date: Date } {
  if (now.getHours() < 15) return { word: 'Today', date: now };
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return { word: 'Tomorrow', date: tomorrow };
}
