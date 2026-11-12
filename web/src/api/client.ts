import type { components } from './schema';

/** Everything the UI shows. Generated from the server's OpenAPI schema (`npm run api:types`). */
export type Snapshot = components['schemas']['Snapshot'];
export type Range = Snapshot['range'];

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}`);
  return res;
}

export const api = {
  snapshot: async (range: Range): Promise<Snapshot> => (await send('GET', `/api/snapshot?range=${encodeURIComponent(range)}`)).json(),
  /** Run an action the snapshot offers (a section's or an object's action key). */
  act: (key: string) => send('POST', `/api/actions/${encodeURIComponent(key)}`),
  /** Flip one of Pantheon's own flags: acked, silenced, off, sched, notif. */
  toggle: (group: string, key: string) => send('POST', `/api/toggles/${encodeURIComponent(group)}/${encodeURIComponent(key)}`),
  setPrice: (value: string) => send('PUT', '/api/settings/price', { value }),
  /** Calls `onChange` whenever the server reports that something changed. */
  subscribe(onChange: () => void): () => void {
    const events = new EventSource('/api/events');
    events.onmessage = onChange;
    return () => events.close();
  },
};
