export default {
  async fetch(request, env) {
    let res = await env.ASSETS.fetch(request);
    if (res.status === 404 && request.method === 'GET') {
      const url = new URL(request.url);
      res = await env.ASSETS.fetch(new Request(url.origin + '/index.html', request));
    }
    const h = new Headers(res.headers);
    if (h.get('content-type')?.includes('text/html')) h.set('cache-control','no-store');
    else if (!h.has('cache-control')) h.set('cache-control','public, max-age=31536000, immutable');
    return new Response(res.body, { status: res.status, headers: h });
  }
}
