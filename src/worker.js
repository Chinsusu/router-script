import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';

export default {
  async fetch(request, env, ctx) {
    try {
      const customMapper = req => {
        // SPA-ish routing: serve index.html for directories and unknown paths
        return mapRequestToAsset(req, { mapRequestToAsset: (r) => {
          const url = new URL(r.url);
          if (url.pathname.endsWith('/')) {
            url.pathname += 'index.html';
          }
          return new Request(url.toString(), r);
        }});
      };

      const res = await getAssetFromKV({ request, waitUntil: p => ctx.waitUntil(p) }, { mapRequestToAsset: customMapper });
      const newHeaders = new Headers(res.headers);
      if (newHeaders.get('content-type')?.includes('text/html')) {
        newHeaders.set('cache-control', 'no-store');
      } else {
        newHeaders.set('cache-control', 'public, max-age=31536000, immutable');
      }
      return new Response(res.body, { headers: newHeaders, status: res.status, statusText: res.statusText });
    } catch (err) {
      return new Response('Not found', { status: 404 });
    }
  }
};
