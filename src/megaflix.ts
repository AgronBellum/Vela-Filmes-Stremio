import axios from 'axios';
import * as cheerio from 'cheerio';
import { MetaInfo, SearchMatch } from './types';

const MAIN_URL = "https://megafrixapi.com";

function normalizeTitle(value: string): string {
    if (!value) return "";
    const noAccents = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return noAccents.replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    let current = new Array(b.length + 1);
    for (let i = 0; i < a.length; i++) {
        current[0] = i + 1;
        for (let j = 0; j < b.length; j++) {
            const cost = a[i] === b[j] ? 0 : 1;
            current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost);
        }
        previous = [...current];
    }
    return previous[b.length];
}

export async function getMetaDetails(type: string, imdbId: string): Promise<MetaInfo | null> {
    try {
        // Usando o endpoint oficial v3 do Cinemeta
        const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
        console.log(`[Cinemeta] Buscando metadados para ${type} ID: ${imdbId}`);
        
        const response = await axios.get(url, { timeout: 5000 });
        const meta = response.data && response.data.meta;
        
        if (meta) {
            console.log(`[Cinemeta] Encontrado com sucesso: "${meta.name}" (${meta.year})`);
            return {
                title: meta.name,
                year: meta.year ? String(meta.year).substring(0, 4) : ""
            };
        }
    } catch (error: any) {
        console.error("[Cinemeta] Erro ao buscar metadados:", error.message);
    }
    
    // Fallback de segurança: se a API falhar, usa o próprio ID limpo para a busca
    return {
        title: imdbId,
        year: ""
    };
}

export async function findMegaFlixItem(targetTitle: string, targetYear: string, isSeries: boolean): Promise<SearchMatch | null> {
    const candidates = await searchMegaFlix(targetTitle);
    if (candidates.length === 0) {
        console.log(`[MegaFlix] Nenhum candidato encontrado para o título: "${targetTitle}"`);
        return null;
    }

    const targetKey = normalizeTitle(targetTitle);
    let bestMatch: { match: SearchMatch; score: number; distance: number } | null = null;

    for (const candidate of candidates) {
        const candidateKey = normalizeTitle(candidate.title);
        const exactTitle = candidateKey === targetKey;
        const titleStartsWith = candidateKey.startsWith(targetKey);
        const targetStartsWith = targetKey.startsWith(candidateKey);
        const sameYear = targetYear !== '' && candidate.year === targetYear;
        const distance = levenshtein(candidateKey, targetKey);

        let score = 0;
        if (exactTitle) score += 1000;
        if (sameYear) score += 500;
        if (titleStartsWith) score += 120;
        if (targetStartsWith) score += 80;
        score -= Math.min(Math.abs(candidateKey.length - targetKey.length), 100);
        score -= Math.min(distance * 5, 300);

        if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && distance < bestMatch.distance)) {
            bestMatch = { match: candidate, score, distance };
        }
    }

    if (bestMatch) {
        console.log(`[MegaFlix] Melhor correspondência: "${bestMatch.match.title}" (ID: ${bestMatch.match.id}, Ano: ${bestMatch.match.year})`);
    }
    return bestMatch?.match || null;
}

async function searchMegaFlix(title: string): Promise<SearchMatch[]> {
    const encoded = encodeURIComponent(title.trim());
    const urls = [
        `${MAIN_URL}/desktop/1.2.2/?page=searchItem&title=${encoded}`,
        `${MAIN_URL}/desktop/1.2.1/?page=searchItem&title=${encoded}`
    ];

    for (const url of urls) {
        try {
            console.log(`[MegaFlix] Pesquisando URL: ${url}`);
            const res = await axios.get(url, { headers: { 'Referer': `${MAIN_URL}/`, 'User-Agent': 'Mozilla/5.0' } });
            const html = res.data;
            if (!html) continue;

            const $ = cheerio.load(html);
            const results: SearchMatch[] = [];
            $('a.card.card-movie[onclick*=openItem], .item-card[onclick*=openItem]').each((_, el) => {
                const onclick = $(el).attr('onclick') || '';
                const idMatch = onclick.match(/openItem\s*\(\s*(\d+)\s*\)/);
                if (!idMatch?.[1]) return;
                const id = idMatch[1];
                const titleText = $(el).find('h3.title, .title').text().trim();
                if (!titleText) return;

                const yearText = $(el).find('.card-body li, .list-inline-item').first().text().trim();
                const yearMatch = yearText.match(/\d{4}/);
                const year = yearMatch ? yearMatch[0] : '';
                const type = $(el).find('.card-type').text().trim();

                results.push({ id, title: titleText, year, type });
            });

            if (results.length > 0) {
                console.log(`[MegaFlix] Encontrados ${results.length} resultados na busca.`);
                return results;
            }
        } catch (err: any) {
            console.error(`[MegaFlix] Erro na busca ${url}:`, err.message);
        }
    }
    return [];
}

export async function getMegaFlixEmbeds(imdbId: string, season: number, episode: number, isSeries: boolean): Promise<Array<{ url: string; label: string }>> {
    const metaInfo = await getMetaDetails(isSeries ? "series" : "movie", imdbId);
    if (!metaInfo) return [];

    const item = await findMegaFlixItem(metaInfo.title, metaInfo.year, isSeries);
    const itemId = item ? item.id : imdbId;
    console.log(`[MegaFlix] Usando ID interno/fallback: ${itemId} para ${isSeries ? 'Série' : 'Filme'}`);

    let embedUrls: Array<{ url: string; label: string }> = [];
    try {
        if (isSeries) {
            const epUrl = `${MAIN_URL}/desktop/1.2.2/?page=getEpisodes&season=${season}&idItem=${itemId}`;
            console.log(`[MegaFlix] Buscando episódios via POST: ${epUrl}`);
            const res = await axios.post(epUrl, "userEpisodes=[]", {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': 'https://megaflix.name/',
                    'Origin': 'https://megaflix.name',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                }
            });
            const html = res.data;
            const episodeBlockRegex = /openEpisode\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
            let match;
            while ((match = episodeBlockRegex.exec(html)) !== null) {
                const block = match[1];
                const epNumMatch = block.match(/episode_num\s*:\s*["']?(\d+)["']?/);
                if (epNumMatch && parseInt(epNumMatch[1], 10) === Number(episode)) {
                    const brMatch = block.match(/br\s*:\s*["']([^"']+)["']/)?.[1] || '';
                    brMatch.split(',').forEach((u: string) => {
                        let finalUrl = u.trim();
                        if (finalUrl) {
                            if (finalUrl.includes('cnvs') && !finalUrl.startsWith('http')) {
                                finalUrl = `${MAIN_URL}/cnvs/` + encodeURIComponent(finalUrl);
                            }
                            embedUrls.push({ url: finalUrl, label: '[Dub] Vela Filmes' });
                        }
                    });
                }
            }
        } else {
            const viewUrl = `${MAIN_URL}/desktop/1.2.2/?page=viewItem&id=${itemId}`;
            console.log(`[MegaFlix] Buscando filme via GET: ${viewUrl}`);
            const res = await axios.get(viewUrl, { headers: { 'Referer': `${MAIN_URL}/` } });
            const optionsMatch = res.data.match(/openOptions\s*\(\s*\{([\s\S]*?)\}\s*\)/);
            const brGroup = optionsMatch?.[1]?.match(/br:\s*['"]([^'"]*)['"]/)?.[1] || '';
            brGroup.split(',').forEach((u: string) => {
                let finalUrl = u.trim();
                if (finalUrl) {
                    if (finalUrl.includes('cnvs') && !finalUrl.startsWith('http')) {
                        finalUrl = `${MAIN_URL}/cnvs/` + encodeURIComponent(finalUrl);
                    }
                    embedUrls.push({ url: finalUrl, label: '[Dub] Vela Filmes' });
                }
            });
        }
    } catch (e: any) {
        console.error("[MegaFlix] Erro extração servidores:", e.message);
    }

    console.log(`[MegaFlix] Total de links brutos de embed encontrados: ${embedUrls.length}`);
    return embedUrls;
}
