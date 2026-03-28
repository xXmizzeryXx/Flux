const FLUX_VERSION = '1.0.0';

let WORKER_URL = 'https://flux-worker.eclipseservice.workers.dev';

function encodeUrl(url) {
    return btoa(unescape(encodeURIComponent(url)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('message', e => {
    const { type, workerUrl } = e.data || {};
    if (type === 'SET_WORKER') {
        WORKER_URL = workerUrl;
        e.ports[0]?.postMessage({ type: 'OK' });
    } else if (type === 'PING') {
        e.ports[0]?.postMessage({ type: 'PONG', version: FLUX_VERSION, workerUrl: WORKER_URL });
    }
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (!WORKER_URL) return;
    if (url.pathname === '/flux-sw.js') return;
    if (url.origin === self.location.origin && !url.pathname.startsWith('/proxy/')) return;
    if (url.pathname.startsWith('/proxy/')) {
        e.respondWith(handleProxy(e.request, url));
    }
});

async function handleProxy(request, url) {
    const encodedTarget = url.pathname.slice('/proxy/'.length);
    if (!encodedTarget) {
        return new Response('No target URL', { status: 400 });
    }

    let targetUrl;
    try {
        targetUrl = decodeURIComponent(encodedTarget);
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl;
        }
        new URL(targetUrl);
    } catch {
        return new Response('Invalid URL', { status: 400 });
    }

    const workerFetchUrl = `${WORKER_URL}/fetch/${encodeUrl(targetUrl)}`;

    const headers = new Headers();
    for (const [key, val] of request.headers.entries()) {
        const lower = key.toLowerCase();
        if (lower === 'host' || lower === 'origin' || lower === 'referer') continue;
        headers.set(key, val);
    }

    try {
        const res = await fetch(workerFetchUrl, {
            method:  request.method,
            headers,
            body:    request.method !== 'GET' && request.method !== 'HEAD'
                        ? await request.arrayBuffer()
                        : undefined,
            redirect: 'follow',
        });
        return res;
    } catch (e) {
        return new Response(`Flux error: ${e.message}`, { status: 502 });
    }
}
