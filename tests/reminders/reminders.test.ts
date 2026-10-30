import type { TimelineEntry } from '../../src/domain/planner';
import { remindersFor } from '../../src/reminders/reminderPlan';
import { scheduleReminders, type ReminderBridge } from '../../src/reminders/reminderScheduler';

const entry = (id: string, kind: TimelineEntry['kind'], at: string, minutes = 30): TimelineEntry => ({
  id,
  label: id,
  kind,
  startsAt: new Date(at),
  minutes,
  source: 'estimated',
});

const timeline: TimelineEntry[] = [
  entry('wake', 'wake', '2026-10-30T06:50:00Z', 0),
  entry('get-ready', 'prep', '2026-10-30T06:50:00Z', 45),
  entry('walk', 'travel', '2026-10-30T07:35:00Z', 14),
  entry('arrive', 'arrive', '2026-10-30T08:46:00Z', 14),
];

describe('remindersFor', () => {
  it('makes a reminder for each preparation and travel step, not the wake-up or arrival', () => {
    const reminders = remindersFor(timeline, new Date('2026-10-30T06:00:00Z'));
    expect(reminders.map((r) => r.key)).toEqual(['get-ready', 'walk']);
    expect(reminders[1]).toMatchObject({ title: 'walk', body: '14 min. Time to start.' });
  });

  it('leaves out steps whose time has already passed', () => {
    const reminders = remindersFor(timeline, new Date('2026-10-30T07:00:00Z'));
    expect(reminders.map((r) => r.key)).toEqual(['walk']);
  });
});

function fakeBridge(opts: { permitted?: boolean; failFor?: string } = {}) {
  const scheduled: string[] = [];
  const cancelled: string[] = [];
  const bridge: ReminderBridge = {
    requestPermission: async () => opts.permitted ?? true,
    schedule: async (_at, title) => {
      if (title === opts.failFor) throw new Error('refused');
      scheduled.push(title);
      return `id-${title}`;
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
  };
  return { bridge, scheduled, cancelled };
}

describe('scheduleReminders', () => {
  const reminders = remindersFor(timeline, new Date('2026-10-30T06:00:00Z'));

  it('schedules every reminder when permission is given', async () => {
    const { bridge, scheduled } = fakeBridge();
    const result = await scheduleReminders(bridge, reminders);
    expect(result).toEqual({ scheduled: ['id-get-ready', 'id-walk'], failed: 0, permitted: true });
    expect(scheduled).toEqual(['get-ready', 'walk']);
  });

  it('schedules nothing without permission, and says so', async () => {
    const { bridge, scheduled } = fakeBridge({ permitted: false });
    expect(await scheduleReminders(bridge, reminders)).toEqual({ scheduled: [], failed: 0, permitted: false });
    expect(scheduled).toEqual([]);
  });

  it('counts a reminder that cannot be set, and still sets the others', async () => {
    const { bridge } = fakeBridge({ failFor: 'walk' });
    const result = await scheduleReminders(bridge, reminders);
    expect(result).toMatchObject({ scheduled: ['id-get-ready'], failed: 1, permitted: true });
  });
});
