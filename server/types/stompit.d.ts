/** The parts of the stompit STOMP client that the Darwin listener uses. */
declare module 'stompit' {
  export interface Frame {
    on(event: 'data', listener: (chunk: Buffer) => void): void;
    on(event: 'end', listener: () => void): void;
  }
  export interface Client {
    subscribe(headers: Record<string, string>, callback: (error: Error | null, message: Frame) => void): void;
    on(event: 'error' | 'close', listener: (error?: Error) => void): void;
    disconnect(callback?: () => void): void;
  }
  export function connect(
    options: { host: string; port: number; connectHeaders: Record<string, string> },
    callback: (error: Error | null, client: Client) => void,
  ): void;
}
