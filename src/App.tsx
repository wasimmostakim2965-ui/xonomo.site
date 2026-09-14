import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { AudioLines, Download, Link2, Loader2, ShieldCheck, Sparkles, Video } from 'lucide-react';

type Result = { downloadUrl?: string; hdUrl?: string; sdUrl?: string; audioUrl?: string; filename?: string; title?: string; message?: string };

function App() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [error, setError] = useState('');
    const timer = useRef<number | null>(null);

    async function processUrl(value: string) {
        const trimmed = value.trim();
        if (!trimmed || !/^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|m\.tiktok\.com)\//i.test(trimmed)) {
            setResult(null);
            setError(trimmed ? 'Please enter a valid TikTok video link.' : '');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const response = await api.post('/api/download', { url: trimmed });
            setResult(response.data);
        } catch {
            setError('We could not process this TikTok link. Please check it and try again.');
        } finally {
            setLoading(false);
        }
    }

    async function downloadMedia(filename: string, kind: 'video' | 'audio', quality: 'hd' | 'sd') {
        if (!url.trim()) return;
        setError('');
        try {
            const endpoint = '/api/file?url=' + encodeURIComponent(url.trim()) + '&filename=' + encodeURIComponent(filename) + '&kind=' + encodeURIComponent(kind) + '&quality=' + quality;
            const response = await api.get(endpoint);
            const encoded = response.data?.data;
            if (!encoded) throw new Error('No media bytes returned');
            const binary = atob(encoded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const mediaBlob = new Blob([bytes], { type: response.data?.contentType || (kind === 'audio' ? 'audio/mpeg' : 'video/mp4') });
            if (!mediaBlob.size) throw new Error('Empty media file');
            const objectUrl = URL.createObjectURL(mediaBlob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = filename;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        } catch (err) {
            console.error('download_error', err);
            setError('Download failed. Please try the button again.');
        }
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (timer.current) window.clearTimeout(timer.current);
        processUrl(url);
    }

    useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

    return (
        <main className="min-h-screen bg-[#f7f8fa] text-[#15171a]">
            <div className="mx-auto min-h-screen max-w-5xl px-4 pb-12 sm:px-6">
                <header className="flex h-20 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111318] text-white shadow-sm"><Sparkles size={18} /></div>
                        <div><div className="text-lg font-extrabold tracking-tight">TikSave</div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">TikTok Downloader</div></div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><ShieldCheck size={15} /> Safe & simple</div>
                </header>

                <section className="mx-auto max-w-3xl pt-12 text-center sm:pt-16">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"><Video size={25} /></div>
                    <h1 className="text-4xl font-extrabold tracking-[-0.04em] sm:text-6xl">TikTok Video Downloader</h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">Download TikTok videos in high quality. Just paste the link below — your download options will appear automatically.</p>

                    <form onSubmit={handleSubmit} className="mx-auto mt-9">
                        <div className="flex items-center rounded-2xl bg-white p-1.5 shadow-[0_12px_40px_rgba(15,23,42,0.10)] ring-1 ring-slate-200 focus-within:ring-slate-300">
                            <Link2 className="ml-3 shrink-0 text-slate-400" size={19} />
                            <input aria-label="TikTok video link" value={url} onChange={e => { setUrl(e.target.value); setResult(null); setError(''); }} onPaste={e => { const value = e.clipboardData.getData('text'); setTimeout(() => processUrl(value), 50); }} placeholder="Paste TikTok video link here..." className="min-w-0 flex-1 bg-transparent px-3 py-4 text-sm outline-none placeholder:text-slate-400" />
                            <button type="submit" disabled={loading} className="hidden rounded-xl bg-[#111318] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-60 sm:block">{loading ? 'Processing…' : 'Download'}</button>
                        </div>
                        <button type="submit" disabled={loading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111318] px-6 py-3.5 text-sm font-bold text-white sm:hidden">{loading ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />} {loading ? 'Processing…' : 'Download'}</button>
                    </form>

                    {loading && <div className="mx-auto mt-5 flex max-w-xl items-center justify-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Preparing download options…</div>}
                    {error && <div role="alert" className="mx-auto mt-5 max-w-xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">{error}</div>}

                    {result?.downloadUrl && !loading && (
                        <div className="mx-auto mt-7 max-w-2xl overflow-hidden rounded-2xl bg-white text-left shadow-[0_10px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
                            <div className="border-b border-slate-100 px-5 py-4"><p className="text-sm font-bold">Download options</p><p className="mt-1 truncate text-xs text-slate-500">{result.title || 'Choose the format you need.'}</p></div>
                            <div className="grid gap-3 p-4 sm:grid-cols-3">
                                <button type="button" onClick={() => downloadMedia('tiktok-video-hd.mp4', 'video', 'hd')} className="group rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-400 hover:shadow-sm"><p className="text-sm font-bold">Without Watermark</p><p className="mt-1 text-xs text-slate-500">HD · MP4</p><span className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-[#111318] py-2.5 text-xs font-bold text-white"><Download size={14} /> Download HD</span></button>
                                <button type="button" onClick={() => downloadMedia('tiktok-video-720p.mp4', 'video', 'sd')} className="group rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-400 hover:shadow-sm"><p className="text-sm font-bold">Without Watermark</p><p className="mt-1 text-xs text-slate-500">720p · MP4</p><span className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-slate-100 py-2.5 text-xs font-bold text-slate-800"><Download size={14} /> Download 720p</span></button>
                                <button type="button" onClick={() => downloadMedia('tiktok-audio.mp3', 'audio', 'hd')} className="group rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-400 hover:shadow-sm"><p className="text-sm font-bold">Audio Only</p><p className="mt-1 text-xs text-slate-500">MP3 · Audio</p><span className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-slate-100 py-2.5 text-xs font-bold text-slate-800"><AudioLines size={14} /> Download MP3</span></button>
                            </div>
                        </div>
                    )}

                    <div className="mx-auto mt-12 flex max-w-2xl items-center justify-center gap-6 border-t border-slate-200 pt-6 text-[11px] font-medium text-slate-400"><span>HD Quality</span><span>•</span><span>MP4 & MP3</span><span>•</span><span>No account</span></div>
                </section>

                <footer className="mx-auto mt-24 max-w-3xl border-t border-slate-200 pt-6 text-center text-[11px] leading-5 text-slate-400">TikSave is an independent utility and is not affiliated with TikTok. Download only content you own or are authorized to save, and respect copyright and platform terms.</footer>
            </div>
        </main>
    );
}

export default App;