import * as Application from 'expo-application';

import { pushEnvironment } from '../../src/watch/watchService';

jest.mock('expo-application', () => ({ getIosPushNotificationServiceEnvironmentAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({}));

const ask = Application.getIosPushNotificationServiceEnvironmentAsync as jest.Mock;

describe('pushEnvironment', () => {
  it('uses the build entitlement: production for TestFlight and the App Store', async () => {
    ask.mockResolvedValue('production');
    expect(await pushEnvironment()).toBe('production');
  });

  it('uses sandbox for a development entitlement, even in a release build', async () => {
    ask.mockResolvedValue('development');
    expect(await pushEnvironment()).toBe('sandbox');
  });

  it('falls back to the build type when the entitlement cannot be read', async () => {
    ask.mockRejectedValue(new Error('unavailable'));
    expect(await pushEnvironment()).toBe(__DEV__ ? 'sandbox' : 'production');
    ask.mockResolvedValue(null);
    expect(await pushEnvironment()).toBe(__DEV__ ? 'sandbox' : 'production');
  });
});
