import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const CACHE = new Map<string, { url: string; time: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

export async function sniffM3U8(embedUrl: string): Promise<string | null> {
    const cached = CACHE.get(embedUrl);
    if (cached && (Date.now() - cached.time) < CACHE_TTL) return cached.url;

    let browser = null;
    try {
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
                "--no-zygote",
                "--single-process"
            ],
            executablePath: await chromium.executablePath(),
            headless: true, // Forçado como true para evitar erro de tipo no pacote
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        let foundUrl: string | null = null;
        page.on('request', req => {
            const url = req.url();
            if (url.includes('.m3u8') || url.includes('google-proxy') || url.includes('r66nv9ed.com') || url.includes('/hls/')) {
                foundUrl = url;
            }
        });

        await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 7000 });

        if (!foundUrl) {
            await page.mouse.click(100, 100);
            await new Promise(r => setTimeout(r, 1500));
        }

        if (foundUrl) {
            CACHE.set(embedUrl, { url: foundUrl, time: Date.now() });
        }

        return foundUrl;
    } catch (e: any) {
        console.error("Erro Sniff:", e.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}
