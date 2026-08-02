// tag 定义（中英文统一在一处维护）
// 新增 tag 时：加一项即可；cats 为可选归属分类数组——
//   配置了 cats：该 tag 只出现在这些分类的筛选里；
//   未配置 cats：自动从文章 frontmatter（category + tags）动态提取归属。
export const tagDefs: Record<string, { zh: string; en: string; cats?: string[] }> = {
    insync: { zh: '同频', en: 'In-sync', cats: ['music'] },
    review: { zh: '乐评', en: 'Review', cats: ['music'] },
    musictheory: { zh: '乐理', en: 'Music Theory', cats: ['music'] },
    channel: { zh: '频道', en: 'Channel', cats: ['studio'] },
    tutorial: { zh: '教程', en: 'Tutorial', cats: ['studio'] },
    resource: { zh: '资源', en: 'Resource', cats: ['studio'] },
    video: { zh: '视频', en: 'Video', cats: ['studio'] },
    code: { zh: '代码', en: 'Code', cats: ['studio'] },
    rant: { zh: '吐槽', en: 'Rant', cats: ['essays'] },
    article: { zh: '长文', en: 'Article', cats: ['essays'] },
    log: { zh: '日志', en: 'Log', cats: ['essays'] },
    quote: { zh: '摘抄', en: 'Quote', cats: ['essays'] },
    recap: { zh: '回顾', en: 'Recap', cats: ['achievements'] },
    academic: { zh: '学业', en: 'Academic', cats: ['achievements'] },
    skill: { zh: '技能', en: 'Skill', cats: ['achievements'] },
    award: { zh: '获奖', en: 'Award', cats: ['achievements'] },
    habit: { zh: '习惯', en: 'Habit', cats: ['achievements'] },
};

// 主页 tag 筛选栏的显式排序（按分类分组，组内按此顺序显示）
// 未出现在此数组中的 tag 会排在末尾
export const tagOrder: string[] = [
    // music
    'insync', 'review', 'musictheory',
    // studio
    'channel', 'tutorial', 'resource', 'video', 'code',
    // essays
    'rant', 'article', 'log', 'quote',
    // achievements
    'recap', 'academic', 'skill', 'award', 'habit',
];

// —— 派生导出（保持向后兼容）——

// 显示名词典（zh / en）
export const tagNamesZh: Record<string, string> = {};
export const tagNamesEn: Record<string, string> = {};
// tag → 归属分类（仅含显式配置了 cats 的 tag）
export const tagCats: Record<string, string[]> = {};
Object.entries(tagDefs).forEach(([tag, def]) => {
    tagNamesZh[tag] = def.zh;
    tagNamesEn[tag] = def.en;
    if (def.cats) tagCats[tag] = def.cats;
});

// 按语言取显示名词典
export function getTagNames(lang: 'zh' | 'en'): Record<string, string> {
    return lang === 'en' ? tagNamesEn : tagNamesZh;
}

// 把文章的 tags 按归属 cat 分组（用于卡片/文章页标签展示）：
// 每组 = { cat, tags[] }——cat 与组内第一个 tag 之间无分隔号，
// 同组 tag 之间用 ·，不同组之间用组间符号（渲染层处理）。
// 归属 cat 不在文章 category 里的 tag 归到文章第一个分类（游离兜底）。
export function groupTagsByCat(
    cats: string[],
    tags: string[],
    tagCatsMap: Record<string, string[]> = tagCats
): { cat: string; tags: string[] }[] {
    const groups: { cat: string; tags: string[] }[] = [];
    const catTags: Record<string, string[]> = {};
    cats.forEach(c => { catTags[c] = []; });
    const loose: string[] = [];
    tags.forEach(t => {
        const cfg = tagCatsMap[t];
        const target = cfg && cfg.length ? cfg.find(c => cats.indexOf(c) !== -1) : undefined;
        if (target) catTags[target].push(t);
        else loose.push(t);
    });
    cats.forEach(c => {
        groups.push({ cat: c, tags: catTags[c] });
    });
    // 游离 tag 兜底：并入第一组（若有），否则自成一组
    if (loose.length > 0) {
        if (groups.length > 0) {
            groups[0].tags = groups[0].tags.concat(loose);
        } else {
            groups.push({ cat: cats[0] || '', tags: loose });
        }
    }
    return groups;
}
