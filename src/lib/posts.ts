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
    // 中文日期：2020年8月2日（月日不补零）。
    // ⚠️ 这里返回的是 HTML，调用处请用 <Fragment set:html={formatDate(...)} />。
    // ⚠️ 外面那层 .date-text 不能省：日期容器（.post-meta-item / .date-group）是 inline-flex + gap，
    //    里头的元素全会被当成 flex item 而撑出 4px 缝；包成一个整体才只剩图标与日期之间那一处 4px。
    // ⚠️ 里头的 .date-cjk 给「年月日」单独压一档字重（汉字字形比 Montserrat 的数字压得满）。
    return `<span class="date-text">${+y}<span class="date-cjk">年</span>${+mo}<span class="date-cjk">月</span>${+d}<span class="date-cjk">日</span></span>`;
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
        return `<span class="time-value">${h12}<span class="time-colon">:</span>${m[2]} ${ampm}</span>`;
    }
    // 中文时间：24 小时制 14:32
    return `<span class="time-value">${+m[1]}<span class="time-colon">:</span>${m[2]}</span>`;
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

// 文章链接：优先用 Astro 给的 url，兜底按文件路径拼（blog/ 下的层级原样保留，rants 也在里面）
export function getPostUrl(post: any, lang: Lang): string {
    if (post?.url) return post.url;
    const file = String(post?.file || '').replace(/\\/g, '/');
    const hit = /(?:^|\/)pages\/(.+?)\.md$/.exec(file);
    if (hit) return '/' + hit[1];
    const name = file.split('/').pop()?.replace('.md', '') || '';
    return lang === 'en' ? `/blog/en-US/${name}` : `/blog/${name}`;
}
