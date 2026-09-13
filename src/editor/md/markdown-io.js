// Markdown ⇄ TipTap 文档的「无损往返」层（M1 的核心，防毁文保险丝）
//
// 思路：进编辑器之前先把正文切两半 ——
//   · 编辑器认识的普通 Markdown（段落/标题/列表/引用/粗斜/链接/图片…）→ 交给 markdown-it；
//   · 不认识的块（```围栏（含 abc/简谱）、$$ 公式块、裸 HTML 块）→ 整块塞进 rawBlock 节点，
//     原文照抄、序列化时原样吐回，一个字符都不动。
// 这样 abc 乐谱 / 简谱 / 短代码这类东西永远不会被富文本内核改写。
import { Node } from '@tiptap/core';
import { createBlockNodeView, CAPTION_LINE_RE } from './block-views.js';
import { INLINE_TAG_MARKS, RT_TAGS } from './inline-extensions.js';

const FENCE_RE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const HTML_BLOCK_RE = /^<([a-zA-Z][\w-]*|\/[a-zA-Z][\w-]*|!--|!DOCTYPE)/;
const sentinel = (i) => `ZZRAWSENTINEL${i}ZZ`;
const SENTINEL_RE = /^\s*ZZRAWSENTINEL(\d+)ZZ\s*$/;
// \$ 先换成私用区字符再交给解析器：markdown-it 会把 \$ 解成裸 $，而本站的 remark-math 把 $ 当公式定界符 ⇒
// 不保护的话「(≈ \$400–\$1,400)」会变成公式。（U+E000 不会被 markdown 序列化器转义）
const DALLAR = '\uE000';
// ⚠️ 占位符必须用「标点」字符包裹（U+203A）：markdown-it 的强调 flanking 判定把私用区字符
//    既不当空格也不当标点，直接贴若在 `**xxx**` / `*xxx <sup>y</sup>*` 边上会把强调弄丢。
const TOK = '\u203A';
/** 能当「真格式」用的行内 HTML 标签（进去后变成 mark，不是死文本） */
const RICH_TAG_RE = new RegExp('<(\\/?)(' + INLINE_TAG_MARKS.join('|') + ')\\s*>', 'gi');
/** 其他行内 HTML 标签（<ruby> <br> …）：解析器要么丢掉、要么转义，所以整标签换成占位符，写回时原样还原 */
const INLINE_TAG_RE = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g;
/**
 * 本次 loadBody 保护起来的片段（dumpBody 时还原）。每项都带 raw = 原文：
 *   · raw       —— 整个片段原样吐回（未知标签、认不出的东西）
 *   · open/close —— 成对的 mark/sup/sub/kbd，加载后换成真 mark（pair 是配对号）
 *   · footnote   —— 脚注引用，加载后换成 footnoteRef 节点
 * 万一哪个占位符没被换成格式（比如没有配对的闭合标签），dump 时会回退成 raw ⇒ 不会漏字。
 */
let savedInline = [];
/** 脚注引用/定义 `[^1]` —— 本站走 remark-gfm 脚注，被转义成 \[^1\] 就废了 */
const FOOTNOTE_RE = /\[\^[^\]\n]*\]/g;

const protectInline = (text) => {
	const keepRaw = (raw) => {
		savedInline.push({ type: 'raw', raw });
		return TOK + (savedInline.length - 1) + TOK;
	};
	const stack = []; // 配对的标签栈（按名字找最近的同名开标签）
	return text
		.replace(/\\\$/g, DALLAR)
		.replace(FOOTNOTE_RE, (m) => {
			savedInline.push({ type: 'footnote', raw: m, label: m.slice(2, -1) });
			return TOK + (savedInline.length - 1) + TOK;
		})
		.replace(RICH_TAG_RE, (m, slash, rawTag) => {
			const tag = rawTag.toLowerCase();
			if (!slash) {
				// ⚠️ 配对就用「开标签在 savedInline 里的下标」：它天然全局唯一。
				//    别用「本片段内自增的配对号」—— 每个 md 片段都会从 0 重新数，
				//    跨片段撞号会把先出现的那组配对顶掉（test-all 里就是 <mark>/<sub>/<sup> 没换成格式）。
				const index = savedInline.length;
				savedInline.push({ type: 'open', tag, raw: m });
				stack.push({ tag, index });
				return TOK + index + TOK;
			}
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].tag === tag) {
					const item = stack.splice(i, 1)[0];
					savedInline.push({ type: 'close', tag, raw: m, openIndex: item.index });
					return TOK + (savedInline.length - 1) + TOK;
				}
			}
			return keepRaw(m); // 没配对的闭合标签 ⇒ 当普通原文保护
		})
		.replace(INLINE_TAG_RE, keepRaw);
};
const restoreInline = (text) =>
	text
		.replace(/\u203A(\d+)\u203A/g, (_, i) => savedInline[Number(i)]?.raw ?? '')
		// 本站正文里的 `~` 是当装饰用的（markdown-it 会多此一举转义成 \~），还原成裸字符
		.replace(/\\~/g, '~')
		.replace(/\uE000/g, '\\$');

/**
 * 源码块节点：源文存 attrs.source，序列化原样吐回（一个字符都不改）。
 * renderHTML 只是 HTML 兜底（复制/导出用）；编辑里真正显示的是 block-views.js 的就地编辑卡片。
 */
export const RawBlock = Node.create({
	name: 'rawBlock',
	group: 'block',
	atom: true,
	// ⚠️ 刻意**不让点选**：卡片里全是表单控件，点一下就会被 PM 判成「节点选择」，
	//    此时再按键盘输入/插入内容会把整张卡片换掉（踩过）。删除走卡片头上的「删除」按钮。
	selectable: false,
	addAttributes() {
		return {
			source: { default: '' },
			kind: { default: 'raw' },
		};
	},
	parseHTML() {
		return [{ tag: 'div[data-raw-block]' }];
	},
	renderHTML({ node }) {
		return ['div', { 'data-raw-block': '', class: 'md-raw-block', 'data-kind': node.attrs.kind }, ['pre', { class: 'md-raw-pre' }, node.attrs.source]];
	},
	addNodeView() {
		return createBlockNodeView;
	},
	addStorage() {
		return {
			markdown: {
				serialize(state, node) {
					state.write(node.attrs.source);
					state.closeBlock(node);
				},
				parse: {},
			},
		};
	},
});

/**
 * 把正文字符串切成片段数组，顺序与原文一致。
 * @returns {Array<{type:'md'|'raw', kind?:string, text:string}>}
 */
export function splitBody(body) {
	const lines = String(body).replace(/\r\n?/g, '\n').split('\n');
	const parts = [];
	let buf = [];
	const flush = () => {
		if (buf.length) {
			parts.push({ type: 'md', text: buf.join('\n') });
			buf = [];
		}
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const fence = FENCE_RE.exec(line);
		if (fence) {
			flush();
			const mark = fence[2][0] === '~' ? '~' : '`';
			const min = fence[2].length;
			const closeRe = new RegExp('^\\s*' + (mark === '`' ? '`' : '~') + '{' + min + ',}\\s*$');
			const block = [line];
			for (i++; i < lines.length; i++) {
				block.push(lines[i]);
				if (closeRe.test(lines[i])) break;
			}
			parts.push({ type: 'raw', kind: 'fence', text: block.join('\n') });
			continue;
		}

		if (/^\s*\$\$\s*$/.test(line)) {
			flush();
			const block = [line];
			for (i++; i < lines.length; i++) {
				block.push(lines[i]);
				if (/^\s*\$\$\s*$/.test(lines[i])) break;
			}
			parts.push({ type: 'raw', kind: 'math', text: block.join('\n') });
			continue;
		}

		if (/^\s*!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?\s*$/.test(line)) {
			// 单独占一行的图片（可能带 {.img-sm} 尺寸类）⇒ 整行原样保留：
			// 它常跟下一行的斜体图注贴在一起（remarkFigure 会把图注并进 figure），
			// 交给富文本内核反而会把图片行并走/丢掉。
			flush();
			const block = [line];
			// 紧跟着那行若正好是「单独一句斜体」，那就是图注 ⇒ 一起吃进这一块，卡片里才改得动。
			// 不吃的话它在编辑器里只是一条普通段落，卡片管不着它（在卡片上改图注就成两处了）。
			// ⚠️ 中间可以隔空行：站点那侧认的就是「下一段」，空行在 AST 里根本不存在
			// ⇒ 编辑器也得认，否则同一份文件在两边判定不一样。
			// ⚠️ 图注得「自己站成一段」：它后面要是接着别的文字，那就不是图注。
			let gap = 1;
			while (lines[i + gap] != null && lines[i + gap].trim() === '') gap++;
			const cap = lines[i + gap];
			const afterCap = lines[i + gap + 1];
			if (cap != null && CAPTION_LINE_RE.test(cap) && (afterCap == null || afterCap.trim() === '')) {
				for (let k = 1; k <= gap; k++) block.push(lines[i + k]);
				i += gap;
			}
			parts.push({ type: 'raw', kind: 'image', text: block.join('\n') });
			continue;
		}

		if (/^\s*\|.*\|\s*$/.test(line)) {
			// GFM 表格：markdown-it 这里没装表格插件，进去会被拍成一串文字 ⇒ 整块原样保留
			flush();
			const block = [];
			for (; i < lines.length; i++) {
				if (!/^\s*\|/.test(lines[i])) break;
				block.push(lines[i]);
			}
			i--;
			parts.push({ type: 'raw', kind: 'table', text: block.join('\n') });
			continue;
		}

		if (HTML_BLOCK_RE.test(line.trim())) {
			flush();
			const block = [];
			for (; i < lines.length; i++) {
				if (lines[i].trim() === '') break;
				block.push(lines[i]);
			}
			i--; // 退到空行，交给外层继续
			parts.push({ type: 'raw', kind: 'html', text: block.join('\n') });
			continue;
		}

		buf.push(line);
	}
	flush();
	return parts;
}

/** 片段数组 → 交给 markdown-it 的整段 markdown（raw 块换成哨兵段落占位） */
export function partsToMarkdown(parts) {
	const joined = parts.map((p, i) => (p.type === 'raw' ? sentinel(i) : protectInline(p.text))).join('\n\n');
	return joined.replace(/\n{3,}/g, '\n\n');
}

/** 把哨兵段落换成真正的 rawBlock 节点（从后往前替换，避免位置漂移） */
function applySentinels(editor, parts) {
	const rawType = editor.schema.nodes.rawBlock;
	if (!rawType) return;
	const hits = [];
	editor.state.doc.descendants((node, pos) => {
		if (!node.isTextblock) return;
		const m = SENTINEL_RE.exec(node.textContent || '');
		if (!m) return;
		const part = parts[Number(m[1])];
		if (part && part.type === 'raw') hits.push({ pos, size: node.nodeSize, source: part.text, kind: part.kind || 'raw' });
	});
	if (!hits.length) return;
	const tr = editor.state.tr;
	for (const h of hits.reverse()) tr.replaceWith(h.pos, h.pos + h.size, rawType.create({ source: h.source, kind: h.kind }));
	editor.view.dispatch(tr);
}

/**
 * 把行内占位符换成真格式：
 *   ① 成对的 mark/sup/sub/kbd → 给中间那段文字打上 htmlInline mark，然后删掉两个占位符；
 *   ② 脚注引用 → 换成 footnoteRef 原子节点。
 * ⚠️ 先 addMark（不改位置），再**从后往前**做替换/删除（这样前面算好的位置不会被后面动过的文档推偏）。
 */
function applyInlineRich(editor) {
	const markType = editor.schema.marks.htmlInline;
	const rtType = editor.schema.marks.htmlInlineRt;
	const fnType = editor.schema.nodes.footnoteRef;
	if (!savedInline.length || (!markType && !fnType)) return;
	// 标签 → mark 类型：嵌套的 rt/rp 用另一种 mark，否则跟 <ruby> 撞「同类型不能叠」的规则
	const typeFor = (tag) => (RT_TAGS.includes(tag) ? rtType : markType);

	const RE = /\u203A(\d+)\u203A/g;
	const ops = [];
	editor.state.doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		RE.lastIndex = 0;
		let m;
		while ((m = RE.exec(node.text))) {
			const info = savedInline[Number(m[1])];
			if (!info || info.type === 'raw') continue;
			ops.push({ start: pos + m.index, end: pos + m.index + m[0].length, info });
		}
	});
	if (!ops.length) return;

	// 按「开标签下标」配对（唯一），不用数字配对号（那玩意儿会跨片段撞号）
	const opens = new Map();
	const singles = [];
	const closed = [];
	for (const op of ops) {
		if (op.info.type === 'open') opens.set(op.info, op);
		else if (op.info.type === 'footnote') singles.push(op);
	}
	for (const op of ops) {
		if (op.info.type !== 'close') continue;
		const open = opens.get(savedInline[op.info.openIndex]);
		if (open) closed.push({ tag: op.info.tag, open, close: op });
	}

	const tr = editor.state.tr;
	for (const rec of closed) {
		const t = typeFor(rec.tag);
		if (t) tr.addMark(rec.open.end, rec.close.start, t.create({ tag: rec.tag }));
	}

	const kills = [...singles, ...closed.flatMap((r) => [r.open, r.close])].sort((a, b) => b.start - a.start);
	for (const op of kills) {
		if (op.info.type === 'footnote' && fnType) tr.replaceWith(op.start, op.end, fnType.create({ label: op.info.label }));
		else tr.delete(op.start, op.end);
	}
	if (tr.docChanged) editor.view.dispatch(tr);
}

/** 正文 → 编辑器（顺带返回切分结果，便于排查） */
export function loadBody(editor, body) {
	savedInline = [];
	const parts = splitBody(body);
	editor.commands.setContent(partsToMarkdown(parts), { emitUpdate: false });
	applySentinels(editor, parts);
	applyInlineRich(editor);
	return parts;
}

/** 编辑器 → 正文 */
export function dumpBody(editor) {
	const md = editor.storage.markdown.getMarkdown();
	return restoreInline(md)
		// 序列化器把硬换行写成行尾 `\`，本站正文习惯是两个空格 ⇒ 改回两个空格
		.replace(/\\\n/g, '  \n');
}

/** 宽松归一化：只用于比较（换行/行尾空格/连续空行差异不算改动） */
export function normalize(text) {
	return String(text)
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** 第一处实质差异（用于报告/保存前 diff 预览） */
export function firstDiff(a, b) {
	const la = String(a).replace(/\r\n?/g, '\n').split('\n');
	const lb = String(b).replace(/\r\n?/g, '\n').split('\n');
	const n = Math.max(la.length, lb.length);
	for (let i = 0; i < n; i++) {
		if ((la[i] ?? '') !== (lb[i] ?? '')) {
			return { line: i + 1, before: la[i] ?? '(无)', after: lb[i] ?? '(无)' };
		}
	}
	return null;
}

/** 无编辑往返自检（比较用归一化文本：首尾空行/连续空行/行尾空格不算差异） */
export function roundTrip(editor, body) {
	loadBody(editor, body);
	const out = dumpBody(editor);
	const a = normalize(body);
	const b = normalize(out);
	const same = a === b;
	return { out, same, diff: same ? null : firstDiff(a, b) };
}
