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

/**
 * text 的第 i 个字符是句末点号时，它该不该占全角。
 * 收尾也要压半宽：后面没东西、或后面紧跟边界（块末、硬换行、行内代码）时，
 * 它就是落在**行尾**的 —— 全角那半格会把版心右缘顶出一个凹陷。
 * ⚠️ 调用方必须先把一整块文字摊平（跨加粗/链接这类行内元素连起来，遇到硬换行和代码段插
 *    BOUNDARY），否则加粗里那个点号会被当成「节点末尾」而误判。
 */
export const keepsFullWidth = (text, i) => {
	const next = text[i + 1];
	if (next === undefined || next === BOUNDARY) return false;
	return !SENTENCE_END.has(next) && !CLOSERS.has(next);
};
