import type { JourneyAssessment, SavedJourney } from './journeyCheck';

const clock = (at: Date, tz: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(at);

/** What the card says. Every status names its source and the time the feed was checked. */
export function journeyText(a: JourneyAssessment, j: SavedJourney, checkedAt: string | null): { headline: string; detail: string } {
  const tz = j.timezone;
  const checked = checkedAt ? `Checked ${clock(new Date(checkedAt), tz)} with National Rail Enquiries.` : 'Source: National Rail Enquiries.';
  switch (a.status) {
    case 'on_time':
      return { headline: 'On time', detail: `Your train leaves at ${clock(j.departsAt, tz)}. ${checked}` };
    case 'delayed_still_ok':
      return { headline: 'Delayed, but you still make it', detail: `Now expected at ${a.expectedDepartAt ? clock(a.expectedDepartAt, tz) : 'a later time'}. Your wake-up stays as it is. ${checked}` };
    case 'at_risk':
      return { headline: 'Your train is delayed', detail: `It would now get you there too late. ${checked}` };
    case 'cancelled':
      return { headline: 'Your train is cancelled', detail: checked };
    case 'not_on_board':
      return { headline: "I can't see your train right now", detail: `I will not guess. Your wake-up stays at ${clock(j.wakeAt, tz)}. ${checked}` };
  }
}

/** The proposal in words. Nothing changes until the person approves it. */
export function proposalText(p: { trainId: string; departsAt: Date; wakeAt: Date }, tz: string): string {
  return `A later train, leaving at ${clock(p.departsAt, tz)}, still gets you there. To catch it, move your alarm to ${clock(p.wakeAt, tz)}.`;
}
