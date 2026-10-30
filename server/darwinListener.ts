/**
 * Keeps a live connection to the Darwin Push Port and feeds the forecast store.
 * Credentials come from server/.env.local. Nothing here runs on the phone.
 */
import { ForecastStore, decodeMessage, parseForecasts, parseSchedules } from './darwinFeed';

export interface ListenerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  topic: string;
}

/** Connects with STOMP and keeps `store` up to date. Resolves when the connection is closed. */
export async function runListener(config: ListenerConfig, store: ForecastStore, onStatus: (s: { messages: number; trains: number }) => void): Promise<void> {
  const stompit = (await import('stompit')).default ?? (await import('stompit'));
  return new Promise((resolve, reject) => {
    stompit.connect(
      {
        host: config.host,
        port: config.port,
        connectHeaders: { host: '/', login: config.username, passcode: config.password, 'client-id': `${config.username}-wakewise`, 'heart-beat': '0,0' },
      },
      (connectError, client) => {
        if (connectError) return reject(connectError);
        let messages = 0;
        client.subscribe({ destination: `/topic/${config.topic}`, ack: 'auto', 'activemq.subscriptionName': 'wakewise' }, (subError, message) => {
          if (subError) return reject(subError);
          const chunks: Buffer[] = [];
          message.on('data', (chunk: Buffer) => chunks.push(chunk));
          message.on('end', () => {
            try {
              const xml = decodeMessage(Buffer.concat(chunks));
              store.apply(parseSchedules(xml));
              store.apply(parseForecasts(xml));
              messages += 1;
              onStatus({ messages, trains: store.size });
            } catch {
              // A message we cannot read is skipped. Its content is never logged.
            }
          });
        });
        client.on('error', reject);
        client.on('close', () => resolve());
      },
    );
  });
}
