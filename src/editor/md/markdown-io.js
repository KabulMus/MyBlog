// Markdown ⇄ TipTap 文档的「无损往返」层（M1 的核心，防毁文保险丝）
//
// 思路：进编辑器之前先把正文切两半 ——
//   · 编辑器认识的普通 Markdown（段落/标题/列表/引用/粗斜/链接/图片…）→ 交给 markdown-it；
//   · 不认识的块（```围栏（含 abc/简谱）、$$ 公式块、裸 HTML 块）→ 整块塞进 rawBlock 节点，
//     原文照抄、序列化时原样吐回，一个字符都不动。
// 这样 abc 乐谱 / 简谱 / 短代码这类东西永远不会被富文本内核改写。
import { Node } from '@tiptap/core';

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
/** 内联 HTML 标签（<sub>…</sub> 这种）：解析器要么丢掉、要么转义，所以整标签换成占位符，写回时原样还原 */
const INLINE_TAG_RE = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g;
/** 本次 loadBody 保护起来的片段原文（dumpBody 时还原） */
let savedTags = [];
/** 行首列表项里的任务勾选框 `- [x] ` —— markdown-it 不认（remark-gfm 认），不保护会被转义成 \[x\] 把任务列表弄坏 */
const TASK_ITEM_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm;
/** 脚注引用/定义 `[^1]` —— 本站走 remark-gfm 脚注，被转义成 \[^1\] 就废了 */
const FOOTNOTE_RE = /\[\^[^\]\n]*\]/g;

const protectInline = (text) => {
	const keep = (m) => {
		savedTags.push(m);
		return TOK + (savedTags.length - 1) + TOK;
	};
	return text
		.replace(/\\\$/g, DALLAR)
		.replace(TASK_ITEM_RE, (m, pre, mark) => pre + keep('[' + mark + ']'))
		.replace(FOOTNOTE_RE, keep)
		.replace(INLINE_TAG_RE, keep);
};
const restoreInline = (text) =>
	text
		.replace(/\u203A(\d+)\u203A/g, (_, i) => savedTags[Number(i)] ?? '')
		// 本站正文里的 `~` 是当装饰用的（markdown-it 会多此一举转义成 \~），还原成裸字符
		.replace(/\\~/g, '~')
		.replace(/\uE000/g, '\\$');

/** 源码块节点：编辑里只看不写，序列化原样吐回 */
export const RawBlock = Node.create({
	name: 'rawBlock',
	group: 'block',
	atom: true,
	selectable: true,
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
			parts.push({ type: 'raw', kind: 'image', text: line });
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

/** 正文 → 编辑器（顺带返回切分结果，便于排查） */
export function loadBody(editor, body) {
	savedTags = [];
	const parts = splitBody(body);
	editor.commands.setContent(partsToMarkdown(parts), { emitUpdate: false });
	applySentinels(editor, parts);
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
