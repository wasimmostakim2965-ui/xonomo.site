import { router, json, error } from '@appdeploy/sdk';

function isTikTokUrl(value: string) {
    try {
        const parsed = new URL(value);
        return ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com', 'm.tiktok.com'].some(host =>
            parsed.hostname === host || parsed.hostname.endsWith('.' + host)
        ) && Boolean(parsed.pathname);
    } catch {
        return false;
    }
}

function isAllowedMediaHost(value: string) {
    try {
        const host = new URL(value).hostname.toLowerCase();
        const allowed = [
            'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokcdn-in.com',
            'tiktokv.com', 'tiktokv.us', 'tiktokv.eu', 'ibytedtos.com', 'muscdn.com', 'byteoversea.com',
            'kcdn-us.com', 'kcdn-eu.com', 'kcdn.com',
            'akamaized.net', 'tikwm.com'
        ];
        return allowed.some(domain => host === domain || host.endsWith('.' + domain));
    } catch {
        return false;
    }
}

type Media = { title?: string; videoUrl?: string; audioUrl?: string };

async function extractTikwm(url: string): Promise<Media> {
    const endpoint = 'https://www.tikwm.com/api/?url=' + encodeURIComponent(url) + '&hd=1';
    const response = await fetch(endpoint, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error('TikWM HTTP ' + response.status);
    const body = await response.json() as any;
    if (body?.code !== 0 || !body?.data) throw new Error(body?.msg || 'TikWM extraction failed');
    const data = body.data;
    const videoUrl = data.hdplay || data.play || data.wmplay;
    const audioUrl = data.music;
    if (!videoUrl && !audioUrl) throw new Error('TikWM returned no media URL');
    return { title: data.title || data.desc, videoUrl, audioUrl };
}

async function extractFallback(url: string): Promise<Media> {
    const endpoint = 'https://tdownv4.sl-bjs.workers.dev/?down=' + encodeURIComponent(url);
    const response = await fetch(endpoint, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error('Fallback extractor HTTP ' + response.status);
    const data = await response.json() as any;
    const videoUrl = data.download_url;
    const audioUrl = data.author?.audio_url;
    if (!videoUrl && !audioUrl) throw new Error('Fallback returned no media');
    return { title: data.title, videoUrl, audioUrl };
}

async function extractMedia(url: string): Promise<Media> {
    try {
        return await extractTikwm(url);
    } catch (firstError) {
        console.error('tikwm_extract_error', String(firstError));
        return await extractFallback(url);
    }
}

export const handler = router({
    'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

    'POST /api/download': [async ({ body }) => {
        const input = body as { url?: string };
        const url = typeof input?.url === 'string' ? input.url.trim() : '';
        if (!isTikTokUrl(url)) return error('Invalid TikTok URL', 400);
        try {
            const media = await extractMedia(url);
            return json({
                downloadUrl: media.videoUrl || media.audioUrl,
                hdUrl: media.videoUrl,
                sdUrl: media.videoUrl,
                audioUrl: media.audioUrl,
                filename: 'tiktok-video-hd.mp4',
                title: media.title || 'TikTok video',
                message: 'Your download is ready.'
            });
        } catch (err) {
            console.error('extract_media_error', String(err));
            return error('Could not extract this TikTok video right now. Please try the link again.', 502);
        }
    }],

    'GET /api/file': [async ({ query }) => {
        try {
            const source = typeof query?.url === 'string' ? query.url : '';
            const filename = typeof query?.filename === 'string' ? query.filename : 'tiktok-video.mp4';
            const kind = query?.kind === 'audio' ? 'audio' : 'video';
            const quality = query?.quality === 'sd' ? 'sd' : 'hd';
            if (!source || !isTikTokUrl(source)) return error('Invalid TikTok URL', 400);

            // Re-extract at click time because TikTok CDN URLs are temporary.
            const media = await extractMedia(source);
            const target = kind === 'audio' ? media.audioUrl : media.videoUrl;
            if (!target) return error('No downloadable media was returned.', 502);
            if (!isAllowedMediaHost(target)) return error('Unsupported media host: ' + new URL(target).hostname, 502);

            const upstream = await fetch(target, {
                redirect: 'follow',
                headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36', accept: '*/*', referer: 'https://www.tiktok.com/' }
            });
            if (!upstream.ok) throw new Error('Media fetch failed: ' + upstream.status);
            const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
            if (upstreamType.includes('text/html') || upstreamType.includes('application/json')) throw new Error('Upstream returned an error document');
            const bytes = await upstream.arrayBuffer();
            if (!bytes.byteLength) throw new Error('Media response was empty');
            const base64 = Buffer.from(bytes).toString('base64');
            const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const contentType = kind === 'audio' ? 'audio/mpeg' : 'video/mp4';
            return json({ data: base64, filename: safeFilename, contentType });
        } catch (err) {
            console.error('media_proxy_error', String(err));
            return error('The media file could not be downloaded. Please try again.', 502);
        }
    }]
});