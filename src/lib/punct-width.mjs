// 开明式标点的判定规则（单一来源）
//
// 站点渲染层（astro.config.mjs 的 rehypePunctFullWidth）和编辑器（md/inline-extensions.js
// 的 PunctFullWidth 装饰）都读这里，免得两处规则漂移 —— 漂移的后果就是「编辑器里看到的」
// 和「发出来的」不一样。
//
// 句末点号（。！？）只在**真的收尾**时才占全角：
//   · 连用时（！！！ ？！）只有最后一个占全角，前面的压半宽；
//   · 后面紧跟闭标号时（（？） 他说「真吗？」）也压半宽 —— 括号本身已经给出那半格气口了；
//   · 落在行尾时（块末、硬换行、行内代码之后）也压半宽 —— 全角那半格会把版心右缘顶出一个凹陷。
// 其余全角标点（，、；：括号书名号直角引号）不在这里管，它们一直吃 body 的 halt 半宽。

/** 句末点号：。 ！ ？ */
export const SENTENCE_END = new Set(['\u3002', '\uff01', '\uff1f']);

/** 闭标号：） 」 』 》 】 〕 〉 ｝ ］ 〗 ” ’ */
export const CLOSERS = new Set([
	'\uff09', '\u300d', '\u300f', '\u300b', '\u3011', '\u3015', '\u3009', '\uff5d', '\uff3d', '\u3017', '\u201d', '\u2019',
]);

/** 摊平成一串文字时插的边界哨兵：块首尾、硬换行（<br>）、行内代码那一段都用它隔开。
 *  选一个正文里经不会出现的控制字符，免得跟真实文字撞上。 */
export const BOUNDARY = '\u0002';

/** 注释序号（脚注引用 [^1]）哨兵：句末点号后面紧跟它时，点号也压半宽。 */
export const FOOTNOTE = '\u0003';

/**
 * text 的第 i 个字符是句末点号时，它该不该占全角。
 * 收尾也要压半宽：后面没东西、或后面紧跟边界（块末、硬换行、行内代码）时，
 * 它就是落在**行尾**的 —— 全角那半格会把版心右缘顶出一个凹陷。
 * ⚠️ 调用方必须先把一整块文字摊平（跨加粗/链接这类行内元素连起来，遇到硬换行和代码段插
 *    BOUNDARY），否则加粗里那个点号会被当成「节点末尾」而误判。
 */
export const keepsFullWidth = (text, i) => {
	const next = text[i + 1];
	if (next === undefined || next === BOUNDARY || next === FOOTNOTE) return false;
	return !SENTENCE_END.has(next) && !CLOSERS.has(next);
};

/**
 * text 的第 i 个字符是闭标号（右括号/右直角引号等）时，它该不该占全角。
 * 只有前面紧跟句末点号（。！？）的闭标号才全角（如「。」的右引号）；
 * 其余闭标号维持 body 的 halt 半宽。
 * ⚠️ 调用方同样要先把整块文字摊平，否则闭标号前面的点号可能被行内元素边界截断。
 */
export const keepsFullWidthCloser = (text, i) => {
	const prev = text[i - 1];
	if (prev === undefined || prev === BOUNDARY || prev === FOOTNOTE) return false;
	// 行末恒半形优先：闭标号自己落在行尾（块末/硬换行/注释序号之后）时也压半宽
	const next = text[i + 1];
	if (next === undefined || next === BOUNDARY || next === FOOTNOTE) return false;
	return SENTENCE_END.has(prev);
};
