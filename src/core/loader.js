export class CoreLoader {
    static VERSION = 'v2';
    
    static SOURCES = {
        gba: {
            js: [
                'https://cdn.jsdelivr.net/gh/endrift/gbajs@master/js/gba.js',
                'https://raw.githubusercontent.com/endrift/gbajs/master/js/gba.js'
            ]
        },
        nds: {
            js: [
                'https://cdn.jsdelivr.net/gh/44670/melonDS-wasm@master/wasm-port/a.out.js',
                '/cores/melonDS.js'
            ],
            wasm: [
                'https://cdn.jsdelivr.net/gh/44670/melonDS-wasm@master/wasm-port/a.out.wasm',
                '/cores/melonDS.wasm'
            ]
        },
        psp: {
            js: [
                '/cores/jspspemu.js'
            ]
        }
    };

    static getCacheName(systemType) {
        return `${systemType}-core-cache-${this.VERSION}`;
    }

    static async loadCore(systemType, onProgress = () => {}) {
        const sources = this.SOURCES[systemType];
        if (!sources) throw new Error(`Unsupported system: ${systemType}`);

        const result = { blobs: [] };

        if (sources.wasm) {
            onProgress(`Starting ${systemType.toUpperCase()} WASM download...`);
            const wasmBlob = await this.fetchWithCacheAndFallback(systemType, sources.wasm, onProgress, 'WASM');
            result.wasmUrl = URL.createObjectURL(wasmBlob);
            result.blobs.push(result.wasmUrl);
        }

        if (sources.js) {
            onProgress(`Starting ${systemType.toUpperCase()} JS engine download...`);
            const jsBlob = await this.fetchWithCacheAndFallback(systemType, sources.js, onProgress, 'JS');
            result.jsUrl = URL.createObjectURL(jsBlob);
            result.blobs.push(result.jsUrl);
        }

        onProgress(`Core ${systemType.toUpperCase()} initialized.`);
        return result;
    }

    static async fetchWithCacheAndFallback(systemType, urls, onProgress, typeLabel) {
        const cache = await caches.open(this.getCacheName(systemType));

        for (const url of urls) {
            try {
                const cachedRes = await cache.match(url);
                if (cachedRes) {
                    onProgress(`Loaded from cache: ${typeLabel} (${url.split('/').pop()})`);
                    return await cachedRes.blob();
                }

                // Apply timeout logic
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); 

                const response = await fetch(url, { mode: 'cors', signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                // Real progress tracking
                const contentLength = response.headers.get('content-length');
                const total = contentLength ? parseInt(contentLength, 10) : 0;
                let loaded = 0;

                const reader = response.body.getReader();
                const stream = new ReadableStream({
                    async start(streamController) {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                streamController.close();
                                break;
                            }
                            loaded += value.byteLength;
                            if (total) {
                                const percent = Math.round((loaded / total) * 100);
                                // Throttle UI updates smoothly
                                if (percent % 5 === 0 || percent === 100) {
                                    onProgress(`Downloading ${typeLabel}: ${percent}%`);
                                }
                            } else {
                                onProgress(`Downloading ${typeLabel}: ${(loaded / 1024 / 1024).toFixed(2)} MB`);
                            }
                            streamController.enqueue(value);
                        }
                    }
                });

                const newResponse = new Response(stream);
                const blob = await newResponse.blob();
                
                // Save to cache asynchronously to not block
                cache.put(url, new Response(blob)).catch(err => console.warn('Cache write failed', err));

                return blob;
            } catch (err) {
                console.warn(`Failed to fetch ${typeLabel} from ${url}:`, err.message);
                onProgress(`Switching to fallback CDN for ${typeLabel}...`);
            }
        }

        throw new Error(`All CDN sources failed for ${typeLabel}. Check network connection.`);
    }

    static injectScript(blobUrl, scriptId = null) {
        return new Promise((resolve, reject) => {
            if (scriptId) {
                const existing = document.getElementById(scriptId);
                if (existing) {
                    existing.remove();
                }
            }
            const script = document.createElement('script');
            if (scriptId) {
                script.id = scriptId;
            }
            script.src = blobUrl;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to parse core JS module.'));
            document.head.appendChild(script);
        });
    }

    static revokeUrls(coreAssets) {
        if (!coreAssets?.blobs) return;
        coreAssets.blobs.forEach(url => URL.revokeObjectURL(url));
    }
}

