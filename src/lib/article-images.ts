import type { ImageMetadata } from 'astro';

const articleImages = import.meta.glob('/src/pages/blog/**/images/*.{avif,gif,jpeg,jpg,png,webp}', {
    eager: true,
    import: 'default',
}) as Record<string, ImageMetadata>;

export function getArticleImage(postUrl: string | undefined, source: string | undefined): ImageMetadata | undefined {
    if (!postUrl || !source) return undefined;
    if (!/^(?:\.{1,2}\/|images\/)/.test(source)) return undefined;
    const route = postUrl.replace(/\/+$/, '');
    if (!route.startsWith('/blog/')) return undefined;
    const parts = `/src/pages${route}`.split('/').filter(Boolean);
    for (const segment of source.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (parts.length <= 3) return undefined;
            parts.pop();
        } else {
            parts.push(segment);
        }
    }
    const key = `/${parts.join('/')}`;
    if (!key.includes('/images/')) return undefined;
    return articleImages[key];
}
