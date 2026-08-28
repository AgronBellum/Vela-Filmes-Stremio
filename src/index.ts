import { addonBuilder, serveHTTP } from "stremio-addon-sdk";
import { sniffM3U8 } from "./sniffer";
import { getMegaFlixEmbeds } from "./megaflix";
import { StreamResult } from "./types";

const STREMIO_TIMEOUT = 9000; // 9 segundos

const manifest = {
    id: "com.velafilmes.dublado",
    version: "1.0.0",
    name: "Vela Filmes - Dublados",
    description: "Filmes e séries dublados via MegaFlix e Sniffer",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["imdb:"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args: { type: string; id: string }) => {
    const { type, id } = args;
    const parts = id.split(":");
    const cleanId = parts[0];
    const season = Number(parts[1]) || 1;
    const episode = Number(parts[2]) || 1;
    const isSeries = type === "series";

    const streams: StreamResult[] = [];

    // Foco total nos extratores e no Sniffer
    try {
        const embeds = await getMegaFlixEmbeds(cleanId, season, episode, isSeries);
        
        // Testa os primeiros embeds encontrados pelos extratores
        for (const item of embeds.slice(0, 3)) {
            const m3u8Url = await Promise.race([
                sniffM3U8(item.url),
                new Promise<null>(resolve => setTimeout(() => resolve(null), STREMIO_TIMEOUT))
            ]);

            if (m3u8Url) {
                streams.push({
                    url: m3u8Url,
                    title: `${item.label} 🎯`,
                    description: "✅ Extraído via Sniffer",
                    behaviorHints: {
                        proxyHeaders: {
                            request: {
                                "Referer": "https://megafrixapi.com/",
                                "User-Agent": "Mozilla/5.0"
                            }
                        }
                    }
                });
            }
        }
    } catch (err: any) {
        console.error("Erro nos extratores Vela Filmes:", err.message);
    }

    return { streams };
});

const port = Number(process.env.PORT) || 10000;
serveHTTP(builder.getInterface(), { port });
console.log(`Vela Filmes rodando na porta ${port}`);
