export type MediaType = 'movie' | 'series';

export interface StreamArgs {
    type: MediaType;
    id: string; // Ex: tt1234567 ou tt1234567:1:2
}

export interface MetaInfo {
    title: string;
    year: string;
}

export interface StreamResult {
    url?: string;
    externalUrl?: string;
    title: string;
    description: string;
    behaviorHints?: {
        proxyHeaders?: {
            request: Record<string, string>;
        };
    };
}

export interface SearchMatch {
    id: string;
    title: string;
    year: string;
    type: string;
}