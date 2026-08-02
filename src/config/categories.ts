// 分类定义（一级分类，中英文统一在一处维护）
// 新增分类时：在 categories 数组里加一项即可（id 用全小写无连字符）
export const categories: { id: string; zh: string; en: string }[] = [
    { id: 'music', zh: '音乐', en: 'Music' },
    { id: 'studio', zh: '创作', en: 'Studio' },
    { id: 'essays', zh: '随笔', en: 'Essays' },
    { id: 'achievements', zh: '成就', en: 'Achievements' },
];

// 按 id 取分类显示名（用于文章页 ro、卡片）
export function getCategoryName(id: string, lang: 'zh' | 'en'): string {
    const cat = categories.find(c => c.id === id);
    if (!cat) return id;
    return lang === 'en' ? cat.en : cat.zh;
}

// 把单值或数组的分类字段统一成数组（frontmatter.category 现在可以是字符串或数组）
export function toCatArray(cat: string | string[] | undefined | null): string[] {
    if (Array.isArray(cat)) return cat.filter(Boolean);
    return cat ? [cat] : [];
}

// 中文分类名映射（主页卡片显示用）
export const categoryNamesZh: Record<string, string> = {};
// 英文分类名映射（主页卡片显示用）
export const categoryNamesEn: Record<string, string> = {};
// 分类固定顺序（tag 分组排序用）
export const catOrder: Record<string, number> = {};
categories.forEach((c, i) => {
    categoryNamesZh[c.id] = c.zh;
    categoryNamesEn[c.id] = c.en;
    catOrder[c.id] = i;
});
