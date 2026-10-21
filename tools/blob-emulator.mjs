/**
 * Supply the ETag omitted by the official emulator's GET response, using its
 * listing API. Local callers must serialize requests; production never uses
 * this bridge and reads the atomic value/ETag pair directly from Netlify.
 */
export function emulatorFetch(address, fetcher = globalThis.fetch) {
  return async (input, options) => {
    const response = await fetcher(input, options);
    const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
    const parts = url.pathname.split('/').filter(Boolean);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === new URL(address).port;
    if (!local || options?.method?.toUpperCase() === 'PUT' || response.status !== 200 || response.headers.has('etag') || !parts[1]?.startsWith('site:') || parts.length < 3) return response;
    const listURL = new URL(url);
    listURL.pathname = `/${parts.slice(0, 2).join('/')}`;
    const listing = await (await fetcher(listURL)).json();
    const key = decodeURIComponent(parts.slice(2).join('/'));
    const etag = listing.blobs?.find((blob) => blob.key === key)?.etag;
    if (!etag) return response;
    const headers = new Headers(response.headers);
    headers.set('etag', etag);
    return new Response(response.body, { status: response.status, headers });
  };
}
