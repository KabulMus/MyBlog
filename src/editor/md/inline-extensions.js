// 行内「特殊样式」的扩展：站点正文里那几种靠行内 HTML 写的格式
//
//   <mark>高亮</mark>   <sup>上标</sup>   <sub>下标</sub>   <kbd>Ctrl</kbd>   脚注引用 [^1]
//
// 这些在 markdown 里都是「行内 HTML / GFM 脚注」写法。编辑器原来只能把它们当生文本保护起来
// （结果画面上是一串占位符），现在给它们真格式：
//   · 标签名单里的那几个 → 一个带 tag 属性的 mark，序列化时原样写回 <tag>…</tag>；
//   · 脚注引用 → 一个行内原子节点，序列化时原样写回 [^N]。
// 样式全部沿用 main.css 里 .typography-body 那套（编辑器正文容器就带这个类）。
//
// 注：`<ruby>汉<rt>hàn</rt></ruby>` 的**内层**（rt/rp）单独走一种 mark（htmlInlineRt），见下面 RICH_TAGS/RT_TAGS。
// ⚠️ 本文件是 .js：Vite 只对 .ts 剥离类型，.js 是原样发给浏览器的 ⇒ **不要写 TS 类型标注**（会 SyntaxError）。

import { Extension, Mark, Node } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** 能当「真格式」用的行内 HTML 标签（markdown-io 那边也按这个名单识别成对标签）
 *  ⚠️ 加新标签前先想清楚「会不会叠在同一段文字上」：这里每个标签都用 htmlInline 这一种 mark，
 *     而 ProseMirror 不允许**同一种 mark** 在一个 text node 上出现两次
 *     （会抛 RangeError: Invalid collection of marks）。
 *     所以嵌套标签（ruby 套 rt）必须把内层单独做成另一种 mark，见下面 RT_TAGS。 */
export const RICH_TAGS = ['mark', 'sup', 'sub', 'kbd', 'ruby'];

/** 嵌套在 ruby 里的那两种：rt = 注音，rp = 不支持 ruby 时的兼容括号
 *  ⚠️ 必须是**另一种 mark**（htmlInlineRt），不能并进 RICH_TAGS：理由同上。
 *     声明顺序也重要 —— htmlInline 在前，序列化时才会先写 <ruby> 再写 <rt>。 */
export const RT_TAGS = ['rt', 'rp'];

/** 两个名单的并集：markdown-io 拿去识别成对标签 */
export const INLINE_TAG_MARKS = [...RICH_TAGS, ...RT_TAGS];

/** 造一个「带 tag 属性的 mark」：渲染成对应标签、序列化时原样写回 <tag>…</tag>，样式交给 main.css */
const makeInlineMark = (name, tags) =>
	Mark.create({
		name,
		addAttributes() {
			return { tag: { default: tags[0] } };
		},
		parseHTML() {
			return tags.map((tag) => ({ tag, getAttrs: (el) => ({ tag: el.tagName.toLowerCase() }) }));
		},
		renderHTML({ mark }) {
			return [mark.attrs.tag, 0]; // 直接渲染成对应的标签，样式交给 main.css
		},
		addStorage() {
			return {
				markdown: {
					// ⚠️ tiptap-markdown 的 mark 序列化格式就是 { open, close, parse }
					serialize: {
						open: (state, mark) => '<' + mark.attrs.tag + '>',
						close: (state, mark) => '</' + mark.attrs.tag + '>',
						parse: {},
					},
				},
			};
		},
	});

/** <mark> <sup> <sub> <kbd> <ruby>：同一种 mark，用 tag 属性区分 */
export const HtmlInline = makeInlineMark('htmlInline', RICH_TAGS);

/** <rt> <rp>：ruby 里面那层，必须是另一种 mark（否则跟 <ruby> 撞"同类型不能叠"的规则） */
export const HtmlInlineRt = makeInlineMark('htmlInlineRt', RT_TAGS);

/** 脚注引用 [^1]（行内原子节点；定义行 [^1]: … 就是「引用节点 + 冒号 + 文字」） */
export const FootnoteRef = Node.create({
	name: 'footnoteRef',
	group: 'inline',
	inline: true,
	atom: true,
	selectable: false,
	addAttributes() {
		return {
			label: {
				default: '1',
				parseHTML: (el) => el.getAttribute('data-footnote-ref') ?? '1',
			},
		};
	},
	parseHTML() {
		return [{ tag: 'sup[data-footnote-ref]' }];
	},
	/**
	 * ⚠️ 星标：让脚注引用**能删**。
	 * 这个节点是 atom + selectable:false ⇒ 默认 Backspace 的处理是「先把前一个节点选中，再删」，
	 * 而它偏偏选不中 ⇒ **什么也不发生**（光标原地不动，用户以为卡住了）。
	 * 试过改成 selectable:true：更糟 —— Backspace 会把整个定义段落**并进上一块**（内容被搅乱）。
	 * 所以这里显式接管：光标紧贴引用节点时，Backspace / Delete 直接删掉这一个节点的范围；
	 * 其余任何位置都返回 false，交回默认行为（在正文里删字不受影响）。
	 * 另外：如果删的是**定义段首那个标记**（段落第一个子节点、后面紧跟 ': '），
	 * 就连这一整段一起删 —— 单删标记会剩下一个孤零零的「: 正文」，没有任何意义。
	 */
	addKeyboardShortcuts() {
		const deleteNeighbor = (dir) => () => {
			const { state, view } = this.editor;
			const sel = state.selection;
			if (!sel.empty || !sel.$cursor) return false;
			const ref = dir < 0 ? sel.$cursor.nodeBefore : sel.$cursor.nodeAfter;
			if (!ref || ref.type.name !== this.name) return false;
			const para = sel.$cursor.parent;
			// ⚠️ 用 para.child(1)：ProseMirror 的 Node 上没有 nextSibling（那是 DOM 的 API，会拿到 null）
			const next = para.childCount > 1 ? para.child(1) : null;
			const isDefMarker = para.type.name === 'paragraph' && para.firstChild === ref &&
				!!next && next.isText && next.text.startsWith(':');
			let tr = state.tr;
			if (isDefMarker) {
				tr = tr.delete(sel.$cursor.before(), sel.$cursor.after());
				// 万一把整篇删空了，补一个空段落（doc 不能没有块）
				if (!tr.doc.content.size) tr = tr.insert(0, state.schema.nodes.paragraph.create());
			} else {
				const from = dir < 0 ? sel.from - ref.nodeSize : sel.from;
				tr = tr.delete(from, from + ref.nodeSize);
			}
			view.dispatch(tr);
			return true;
		};
		return { Backspace: deleteNeighbor(-1), Delete: deleteNeighbor(1) };
	},
	renderHTML({ node }) {
		return ['sup', { class: 'md-fn-ref', 'data-footnote-ref': node.attrs.label }, node.attrs.label];
	},
	addStorage() {
		return {
			markdown: {
				serialize(state, node) {
					state.write('[^' + node.attrs.label + ']');
				},
				parse: {},
			},
		};
	},
});

/**
 * 脚注**定义段落**的护栏：段首那个引用节点不能被「并进别的段落」。
 *
 * 为什么需要：定义段落是靠「段落第一个子节点是 footnoteRef、紧跟 ': '」被识别的。
 * 一旦被 Backspace / Delete 合并进上一段，`[^N]: …` 就落到行中间，remark-gfm 不再认它是定义
 * ⇒ **存出去文章里的脚注就坏了**（静默损坏，最坑）。实测：光标放在定义段首按一下 Backspace 就会这样。
 *
 * 规则：事务前凡是「定义段首」的引用节点，只要事务后**还在文档里**，就必须仍然是某个段落的第一个子节点；
 * 否则整笔事务拒掉。（引用节点被整体删掉是允许的 —— 那是用户确实要删这个脚注。）
 */
export const FootnoteDefGuard = Extension.create({
	name: 'footnoteDefGuard',
	addProseMirrorPlugins() {
		// 「定义段」= 第一个子节点是 footnoteRef、且紧跟的文字以 ':' 开头的那种段落
		const isDef = (node) => {
			if (node.type.name !== 'paragraph') return false;
			if (!node.firstChild || node.firstChild.type.name !== 'footnoteRef') return false;
			const next = node.childCount > 1 ? node.child(1) : null;
			return !!next && next.isText && next.text.startsWith(':');
		};
		const defStarts = (doc) => {
			const set = new Set();
			doc.descendants((node, pos, parent, index) => {
				if (node.type.name === 'footnoteRef' && parent && parent.type.name === 'paragraph' && index === 0) set.add(node);
				return true;
			});
			return set;
		};
		const firstChildFlags = (doc) => {
			const map = new Map();
			doc.descendants((node, pos, parent, index) => {
				if (node.type.name === 'footnoteRef') map.set(node, !!parent && parent.type.name === 'paragraph' && index === 0);
				return true;
			});
			return map;
		};
		return [
			new Plugin({
				// ⚠️ 用 tr.doc（Transaction 已经算好的结果），**不要**用 state.apply(tr)：
				//    apply 会再跑一遍 filterTransaction ⇒ 无限递归 → 爆栈（踩过）。
				filterTransaction(tr, state) {
					const before = defStarts(state.doc);
					if (!before.size) return true;
					const after = firstChildFlags(tr.doc);
					for (const ref of before) {
						if (after.has(ref) && after.get(ref) === false) return false;
					}
					return true;
				},
			}),
			// 给定义段打个 .is-fn-def 类，供 CSS 上「注释」样式（副文本色、小一号）。
			// ⚠️ 为什么不用纯 CSS：CSS 区分不了「段首就是引用」和「引用在段中」
			//    —— 段首那截正文是文字节点，选择器看不见它（:first-child 只数元素）。
			new Plugin({
				props: {
					decorations(state) {
						const decos = [];
						state.doc.descendants((node, pos) => {
							if (isDef(node)) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-fn-def' }));
							return true;
						});
						return DecorationSet.create(state.doc, decos);
					},
				},
			}),
		];
	},
});

/**
 * 脚注自动编号：按「正文里引用的出现顺序」重排 `[^N]`，定义段跟着一起改。
 *
 * 为什么需要：remark-gfm 渲染时是按**引用的出现顺序**编号的（所以部署后永远看着是 1-2-3），
 * 但编辑器里显示的是原文的 `[^N]` —— 中间插一条、或删掉一条，就会变成 1-3-2 这种看着像坏了的编号。
 *
 * 规则：先按文档顺序收集**行内引用**（定义段首那个是定义标记，不算），编号 1…N；
 *      行内引用 + 「有对应引用的定义标记」按**旧编号**去映射表里换新号；
 *      「没有对应引用的孤立定义」不参与重排，直接排到 N 之后（既不撞号，也能一眼看出是没用的定义）。
 * 只有真需要改时才返回事务（否则打字、选区变化都要被它算一遍），所以幂等、不会自激循环。
 */
export const FootnoteRenumber = Extension.create({
	name: 'footnoteRenumber',
	addProseMirrorPlugins() {
		return [
			new Plugin({
				appendTransaction(trs, oldState, newState) {
					if (!trs.some((tr) => tr.docChanged)) return null;
					const body = [];                 // 行内引用的旧编号（按出现顺序）
					const isMarker = (parent, index) => !!parent && parent.type.name === 'paragraph' && index === 0;
					newState.doc.descendants((node, pos, parent, index) => {
						if (node.type.name === 'footnoteRef' && !isMarker(parent, index)) body.push(String(node.attrs.label));
						return true;
					});
					if (!body.length) return null;
					const bodySet = new Set(body);
					const map = new Map();
					body.forEach((old, i) => {
						if (!map.has(old)) map.set(old, String(i + 1));
					});
					let extra = body.length;          // 孤立定义往后排
					const decide = (old, marker) => {
						if (!marker) return map.get(old) || null;
						return bodySet.has(old) ? map.get(old) || null : String(++extra);
					};
					let tr = null;
					newState.doc.descendants((node, pos, parent, index) => {
						if (node.type.name !== 'footnoteRef') return true;
						const next = decide(String(node.attrs.label), isMarker(parent, index));
						if (!next || next === String(node.attrs.label)) return true;
						tr = (tr || newState.tr).setNodeMarkup(pos, undefined, { ...node.attrs, label: next });
						return true;
					});
					return tr;
				},
			}),
		];
	},
});
