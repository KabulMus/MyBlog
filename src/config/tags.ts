// tag 显示名词典（中英文统一在一处维护）
// 新增 tag 时：在 zh / en 两个对象里各加一行即可；
// 未收录的 tag 会回退显示原始英文 id（tagNames[tag] || tag 的兜底逻辑）
export const tagNamesZh: Record<string, string> = {
    insync: '同频',
    musictheory: '乐理',
    review: '乐评',
    channel: '频道',
    tutorial: '教程',
    video: '视频',
    code: '代码',
    resource: '资源',
    rant: '吐槽',
    article: '手记',
    log: '日志',
    quote: '语录',
    academic: '学业',
    competition: '竞赛',
    scholarship: '奖学金',
    admission: '录取',
    sports: '体育',
    arts: '艺术',
    award: '获奖',
    volunteer: '志愿',
    recap: '回顾',
};

export const tagNamesEn: Record<string, string> = {
    insync: 'In-sync',
    musictheory: 'Music Theory',
    review: 'Review',
    channel: 'Channel',
    tutorial: 'Tutorial',
    video: 'Video',
    code: 'Code',
    resource: 'Resource',
    rant: 'Rant',
    article: 'Notes',
    log: 'Log',
    quote: 'Quote',
    academic: 'Academic',
    competition: 'Competition',
    scholarship: 'Scholarship',
    admission: 'Admission',
    sports: 'Sports',
    arts: 'Arts',
    award: 'Award',
    volunteer: 'Volunteer',
    recap: 'Recap',
};

// 按语言取词典
export function getTagNames(lang: 'zh' | 'en'): Record<string, string> {
    return lang === 'en' ? tagNamesEn : tagNamesZh;
}
