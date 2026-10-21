import { getStore } from '@netlify/blobs';
import { createGameHandler } from '../../game/netlify-handler.mjs';

// Netlify supplies the site-scoped Blobs credentials at invocation time.
export default async function game(request: Request): Promise<Response> {
  const store = getStore({ name: 'sketchy-alibis-rooms', consistency: 'strong' });
  return createGameHandler({ store })(request);
}
