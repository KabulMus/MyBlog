// 列表页共用的文章工具：日期/时间格式化、引号处理、文章链接
// ⚠️ 中英文站各一套（靠 lang 区分），改一处两边一起生效

export type Lang = 'zh' | 'en';

export function formatDate(dateStr: string, lang: Lang): string {
    if (!dateStr) return '';
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return dateStr.replace(/-/g, '.');
    const [, y, mo, d] = m;
    if (lang === 'en') {
        // 英文日期：Aug 2, 2020（May/June/July 不缩写，其余缩写）
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
        return `${months[+mo - 1]} ${+d}, ${+y}`;
    }
    // 中文日期：2020年8月2日（月日不补零），纯文本。中西之间的那点空隙交给浏览器
    // （原生 text-autospace，或者 Layout 里 cjk-latin-gap 那套），跟正文一致。
    return `${+y}年${+mo}月${+d}日`;
}

export function formatTime(dateStr: string, lang: Lang): string {
    if (!dateStr) return '';
    const m = dateStr.match(/[T ](\d{1,2}):(\d{2})/);
    if (!m) return '';
    if (lang === 'en') {
        // 英文时间：12 小时制 2:32 PM
        const h = +m[1];
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${m[2]} ${ampm}`;
    }
    // 中文时间：24 小时制 14:32，纯文本（冒号的位置交给字体的上下文替换）
    return `${+m[1]}:${m[2]}`;
}

export function smartQuotes(text: string): string {
    // 双引号对：标准处理
    text = text.replace(/"([^"\n]*)"/g, '\u201C$1\u201D');
    const chars = text.split('');
    const positions: number[] = [];
    for (let i = 0; i < chars.length; i++) {
        if (chars[i] === "'") positions.push(i);
    }
    if (positions.length === 0) return text;
    const isAlnum = (ch: string) => /[A-Za-z0-9]/.test(ch);
    // 状态机：inQuote 表示当前是否处于开引号内部。
    // 规则：
    //   不在引号内：前是字母 → 撇号（it's）；否则 → 开引号 ‘
    //   在引号内：后是字母 → 撇号；后是空白/结尾 → 闭引号 ’
    //   在引号内后跟标点：若后面还有 ' → 是撇号（如 somethin'.' 中间那个），否则是闭引号
    let inQuote = false;
    for (let i = 0; i < chars.length; i++) {
        if (chars[i] !== "'") continue;
        const prev = i > 0 ? chars[i - 1] : '';
        const next = i < chars.length - 1 ? chars[i + 1] : '';
        if (inQuote) {
            if (isAlnum(next)) {
                chars[i] = '\u2019'; // 后是字母 → 撇号（it's）
            } else if (next === '' || /\s/.test(next)) {
                chars[i] = '\u2019'; // 后是空白/结尾 → 闭引号
                inQuote = false;
            } else {
                // 后是标点：若后面还有 ' → 当前是撇号（最后那个才是闭引号）
                if (positions.some((p) => p > i)) {
                    chars[i] = '\u2019';
                } else {
                    chars[i] = '\u2019'; // 闭引号
                    inQuote = false;
                }
            }
        } else {
            if (isAlnum(prev)) {
                chars[i] = '\u2019'; // 前是字母 → 撇号（it's）
            } else {
                // 候选开引号：只有后面存在“闭引号候选”（某个 ' 后是非字母/结尾）才当开引号，
                // 否则是开头撇号缩写（'cause / 'Twas / 'em / 'til）
                const hasClosing = positions.some(
                    (j) => j > i && (j === chars.length - 1 || !isAlnum(chars[j + 1]))
                );
                if (hasClosing) {
                    chars[i] = '\u2018'; // 开引号
                    inQuote = true;
                } else {
                    chars[i] = '\u2019'; // 开头撇号（'cause 等）
                }
            }
        }
    }
    return chars.join('');
}

/**
 * 标题里的「行内标记」支持。
 *
 * 为什么需要：frontmatter.title 里可能写 `<i>xxx</i>` 这类行内标记（中文斜体、强调等）。
 * 之前内文页的 <h1> 走 set:html 能渲染出来，而主页卡片用 {title} 插值（会自动转义），
 * 同一份标题在两边表现不同 —— 卡片上会直接显示成 `<i>soaa</i>` 这串字面文本。
 *
 * 现在两边都走 renderTitleHtml()，并且：
 *   - 只放行少量**行内**标签（白名单），其余尖括号一律转义，避免误写的 `<` 破版；
 *   - smartQuotes / emoji 包 span 只作用在**文本片段**上（不碰标签本身，避免改坏属性里的引号）。
 *
 * 需要**纯文本**的场合（<title>、og:title / twitter:title、RSS、aria-label）请用 titleToText()，
 * 否则标签会原样出现在浏览器标签页、搜索结果和分享卡片里。
 */
const TITLE_INLINE_TAGS = new Set([
    'i', 'em', 'b', 'strong', 'u', 's', 'del', 'ins', 'mark', 'small',
    'sup', 'sub', 'code', 'kbd', 'br', 'span', 'abbr', 'cite', 'q',
]);
// 与 Layout 的标题渲染保持一致（emoji 单独包 span 以重置颜色，不分割渐变）
const TITLE_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu;

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderTitleHtml(raw: string): string {
    const text = String(raw ?? '');
    const emitText = (seg: string) =>
        seg ? smartQuotes(seg).replace(TITLE_EMOJI, '<span class="emoji">$&</span>') : '';
    let out = '';
    let last = 0;
    const tagRe = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(text))) {
        out += emitText(text.slice(last, m.index));
        out += TITLE_INLINE_TAGS.has(m[1].toLowerCase()) ? m[0] : escapeHtml(m[0]);
        last = m.index + m[0].length;
    }
    return out + emitText(text.slice(last));
}

/** 剥掉行内标签，给 <title> / og:title / RSS / aria-label 用 */
export function titleToText(raw: string): string {
    return String(raw ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

// 文章链接：优先用 Astro 给的 url，兜底按文件路径拼（blog/ 下的层级原样保留，rants 也在里面）
export function getPostUrl(post: any, lang: Lang): string {
    if (post?.url) return post.url;
    const file = String(post?.file || '').replace(/\\/g, '/');
    const hit = /(?:^|\/)pages\/(.+?)\.md$/.exec(file);
    if (hit) return '/' + hit[1];
    const name = file.split('/').pop()?.replace('.md', '') || '';
    return lang === 'en' ? `/blog/en-US/${name}` : `/blog/${name}`;
}
