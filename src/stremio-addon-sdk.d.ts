// src/stremio-addon-sdk.d.ts
declare module 'stremio-addon-sdk' {
    export class addonBuilder {
        constructor(manifest: any);
        defineStreamHandler(handler: (args: any) => Promise<any> | any): void;
        getInterface(): any;
    }
    export function serveHTTP(addonInterface: any, options?: { port?: number }): void;
}
