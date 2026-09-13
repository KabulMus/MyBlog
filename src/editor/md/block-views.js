// 自定义块的「就地编辑」视图（M2）
//
// 背景：abc / 简谱 / 公式 / 表格 / 单独成行的图片不能交给富文本内核（会被解析坏），
// 所以它们统统是 rawBlock 节点 —— source 属性里存着**原文**，序列化时原样吐回。
// M2 把这张卡片做成**能就地改**的控件，但守住同一条底线：
//   · 用户没碰的行，一个字符都不动（每行都记着原始 raw 串，只有改过的行才重写）；
//   · 所有控件最终只写回 rawBlock.source 这一个属性 ⇒ markdown 往返依旧无损。
//
// 乐谱头部（abc 的 X/T/C/M/L/Q/K、简谱的 title/key/beat/time/…）不让人手写：
// 摆成小表单，空着就是不写这一行（"用不着的参数就留空"）。

const h = (tag, cls, text) => {
	const el = document.createElement(tag);
	if (cls) el.className = cls;
	if (text != null) el.textContent = text;
	return el;
};

/** 每种块在卡片头上的徽标 + 配色（配色取站点成对的 --color-*-bg / --color-* token） */
const BADGE = {
	abc: { label: 'abc 乐谱', color: 'indigo' },
	jianpu: { label: '简谱', color: 'amber' },
	code: { label: '代码块', color: 'blue' },
	math: { label: '公式块', color: 'purple' },
	table: { label: '表格', color: 'cyan' },
	image: { label: '图片', color: 'green' },
	html: { label: '原始 HTML', color: 'red' },
	raw: { label: '源码块', color: 'blue' },
};

/**
 * 头部字段表（[字段名, 中文标签, 提示]）。
 * · abc 常用那 7 个（其余 R/P/O/Z… 不铺开：源里出现了就落到「其他头部行」里，照样能改）
 * · 简谱 = 站点 Layout.astro 里 parseJianpuSource 认的那 9 个
 * placeholder 写的是「不写这行时渲染器会用什么默认值」，空着就等于用默认值。
 */
const SPECS = {
	abc: {
		fields: [
			['X', '编号', '谱子编号，通常 1'],
			['T', '标题', '曲名；可写多行标题（第二行请到「其他头部行」里加）'],
			['C', '作曲', '作曲 / 来源'],
			['M', '拍号', '不写默认 4/4'],
			['L', '默认时值', '不写默认 1/8'],
			['Q', '速度', '每分钟多少拍，如 90'],
			['K', '调号', '必填，且必须是头部的最后一行'],
		],
		wide: ['T'],
		placeholders: { X: '1', T: '曲名', C: '作曲 / 来源', M: '4/4', L: '1/4', Q: '90', K: 'C' },
		// 字段名区分大小写；K: 之后的行归正文（abc 标准：头部到 K: 为止）
		lineRe: /^\s*([A-Za-z])\s*[:：]\s*(.*)$/,
		sameKey: (a, b) => a === b,
		stopAfter: (key) => key === 'K',
	},
	jianpu: {
		fields: [
			['title', '标题', '曲名'],
			['composer', '作曲', '作曲'],
			['lyricist', '作词', '作词'],
			['key', '调号', '如 C / G / F'],
			['beat', '拍数', '拍号分子（每小节几拍）'],
			['time', '拍值', '拍号分母（以几分音符为一拍）'],
			['tempo', '速度', '每分钟多少拍'],
			['lyric', '歌词', '可写多行歌词（第二行请到「其他头部行」里加）'],
			['wrap', '每行小节', 'off / 4 / 3 / 2'],
		],
		wide: ['title', 'lyric'],
		placeholders: { title: '曲名', composer: '作曲', lyricist: '作词', key: 'C', beat: '4', time: '4', tempo: '90', lyric: '歌词', wrap: 'off / 4 / 3 / 2' },
		// 只认站点解析器认的那几个键（否则谱面里带冒号的行会被误判成字段）
		lineRe: /^\s*(title|composer|lyricist|key|beat|time|tempo|lyric|wrap)\s*[:：]\s*(.*)$/i,
		sameKey: (a, b) => a.toLowerCase() === b.toLowerCase(),
		stopAfter: null,
	},
};

const FENCE_OPEN_RE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const IMAGE_LINE_RE = /^(\s*)!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)(\{[^}]*\})?(\s*)$/;
/**
 * 图注行 = 单独一句 markdown 斜体（跟 astro.config.mjs 里 remarkFigure 认的那条一致）。
 * ⚠️ 只认 `*…*`：站点那侧 markdown-it 也吃 `_…_`，但编辑器是按行认的，多认一种写法
 * 就得多一套转义判断，而全站图注都写的星号。
 */
export const CAPTION_LINE_RE = /^\s*\*([^*]+)\*\s*$/;

/** 围栏源码 → { open, lang, body, close }（open/close 是原始行文本，body 是原始行数组） */
export function splitFence(source) {
	const lines = String(source).split('\n');
	const open = lines[0] ?? '';
	const m = FENCE_OPEN_RE.exec(open);
	const mark = m && m[2][0] === '~' ? '~' : '`';
	const min = m ? m[2].length : 3;
	const closeRe = new RegExp('^\\s*' + mark + '{' + Math.max(min, 3) + ',}\\s*$');
	const last = lines[lines.length - 1];
	const hasClose = lines.length > 1 && closeRe.test(last);
	return {
		open,
		lang: m ? m[3].trim().split(/\s+/)[0] : '',
		body: hasClose ? lines.slice(1, -1) : lines.slice(1),
		close: hasClose ? last : null,
	};
}

/**
 * body 行 → { rows, gap, score }：
 * 开头连续的字段行收集成 rows（每行记住原始 raw），中间的空行记为 gap，其余是谱面。
 * 认不出字段行的（普通代码块）spec 为 null ⇒ rows 空、全部当谱面。
 */
export function splitHeader(body, spec) {
	const rows = [];
	let i = 0;
	if (spec) {
		for (; i < body.length; i++) {
			const m = spec.lineRe.exec(body[i]);
			if (!m) break;
			rows.push({ key: m[1], value: m[2], raw: body[i] });
			if (spec.stopAfter && spec.stopAfter(m[1])) {
				i++;
				break;
			}
		}
	}
	let gap = 0;
	while (i + gap < body.length && body[i + gap].trim() === '') gap++;
	return { rows, gap, score: body.slice(i + gap) };
}

/**
 * rows → 头部行数组。规则：
 * · raw 为 null 的行 = 空字段 / 被删掉的行 ⇒ **不写进源**（"用不着的参数就留空"）；
 * · **源里原有的行**位置原样保留（一个字符都不动）；
 * · **表单新填的行**（added）按字段表的规范顺序插进去 —— abc 的 K 必须是头部的最后一行，
 *   漏了这个判断新字段就会落在 K 后面，而 K 之后按 abc 标准算「正文」⇒ 重新打开时
 *   那个字段会跑到谱面代码里去（踩过）。
 */
function buildHeader(rows, spec) {
	const out = rows.filter((r) => r.raw && !r.added).map((r) => ({ key: r.key, raw: r.raw }));
	const rank = (key) => {
		const idx = spec.fields.findIndex((f) => spec.sameKey(f[0], key));
		return idx < 0 ? spec.fields.length : idx;
	};
	for (const row of rows) {
		if (!row.added || !row.raw) continue;
		const idx = (() => {
			const tail = spec.fields.findIndex((f) => spec.sameKey(f[0], 'K'));
			const tailAt = tail < 0 || !spec.stopAfter ? -1 : out.findIndex((o) => spec.sameKey(o.key, 'K'));
			for (let i = 0; i < out.length; i++) if (rank(out[i].key) > rank(row.key)) return i;
			return tailAt >= 0 ? tailAt : out.length;
		})();
		out.splice(idx, 0, { key: row.key, raw: row.raw });
	}
	return out.map((r) => r.raw);
}

/**
 * 图片块 → { indent, alt, src, title, cls, cap, gap, tail, rest }
 * （认不出图片行就返回 null，退回纯文本框）。块可能带图注，见 splitBody。
 */
export function parseImageLine(source) {
	const lines = String(source).split('\n');
	const m = IMAGE_LINE_RE.exec(lines[0] ?? '');
	if (!m) return null;
	// 图注 = 跳过紧跟的空行后，第一行非空行要是「单独一句斜体」
	let gap = 0;
	while (lines[1 + gap] != null && lines[1 + gap].trim() === '') gap++;
	const capLine = lines[1 + gap];
	const capM = capLine != null ? CAPTION_LINE_RE.exec(capLine) : null;
	return {
		indent: m[1],
		alt: m[2],
		src: m[3],
		title: m[4],
		cls: m[5] ?? '',
		tail: m[6],
		// 没有图注（或那行不是图注）⇒ 空串，卡片里就是个空输入框
		cap: capM ? capM[1] : '',
		// 图注跟图片之间隔了几个空行：原样保留（用户没碰过的行不改一个字）
		gap: capM ? gap : 0,
		// 除图注之外多出来的行：原样留着
		rest: lines.slice(capM ? 2 + gap : 1),
	};
}

const buildImageLine = (o) => {
	// ⚠️ title 得带上：以前这里只拼 src，`![a](x "标题")` 里那个标题一改别的字段就没了
	const out = [`${o.indent}![${o.alt}](${o.src}${o.title != null ? ` "${o.title}"` : ''})${o.cls}${o.tail}`];
	if (o.cap) {
		out.push(...Array(o.gap ?? 0).fill(''));
		out.push(`${o.indent}*${o.cap}*`);
	}
	out.push(...o.rest);
	return out.join('\n');
};

/** GFM 表格行 → 单元格数组（去掉首尾竖线，逐格 trim） */
const splitTableRow = (line) => {
	let s = line.trim();
	if (s.startsWith('|')) s = s.slice(1);
	if (s.endsWith('|')) s = s.slice(0, -1);
	return s.split('|').map((c) => c.trim());
};

/** 对齐：`---` 默认（左）/ `:--` 左 / `:-:` 中 / `--:` 右 */
const ALIGN = [
	{ id: 'none', label: '默认', cell: '---' },
	{ id: 'left', label: '左', cell: ':--' },
	{ id: 'center', label: '中', cell: ':-:' },
	{ id: 'right', label: '右', cell: '--:' },
];
const alignOf = (c) => (/^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : 'none');
// ⚠️ 必须和 ALIGN 能写出来的东西对得上：GFM 分隔格是 `:?-+:?`（**一个**短横也算），
//    原来写成 `-{2,}` ⇒ 中心对齐的 `:-:` 自己写出去、自己认不出来，网格会退化成文本框（踩过）。
const isDelimCell = (c) => /^:?-+:?$/.test(c.replace(/\s+/g, ''));

/**
 * RawBlock 的 NodeView：一张卡片 = 徽标 + 元信息 + 就地编辑控件。
 * 所有控件最终都只写回 node.attrs.source（⇒ 往返依旧无损）。
 */
export function createBlockNodeView({ node: initialNode, getPos, editor }) {
	let node = initialNode;
	/** 当前 DOM 里呈现的那份源码：用户自己敲的改动要同步进来，否则 update() 会重建 DOM 把光标顶掉 */
	let rendered = null;
	/** 表格卡片的「源码」开关（网格 ↔ 原文），按卡片记着 */
	let tableSource = false;

	const dom = h('div', 'md-block');
	dom.contentEditable = 'false';
	const head = h('div', 'md-block-head');
	const bodyHost = h('div', 'md-block-body');
	dom.append(head, bodyHost);

	/** 自适应高度；⚠️ 还没挂进文档 / 代码字体刚换进来时 scrollHeight 不准，所以带重试 */
	const growArea = (ta, retry = 8) => {
		if (!ta.isConnected) {
			if (retry > 0) requestAnimationFrame(() => growArea(ta, retry - 1));
			return;
		}
		ta.style.height = 'auto';
		ta.style.height = ta.scrollHeight + 'px';
	};

	/** 多行源码输入：软换行；行号画在同一份文本的覆盖层上，跟着换行自动对齐 */
	const makeArea = (host, value, onInput, cls = 'md-input') => {
		const box = h('div', 'md-code');
		const lines = h('div', 'md-lines');
		lines.setAttribute('aria-hidden', 'true');
		const ta = h('textarea', cls);
		ta.spellcheck = false;
		ta.wrap = 'soft';
		ta.value = value;

		const paint = () => {
			const src = ta.value.split('\n');
			for (let i = 0; i < src.length; i++) {
				let line = lines.children[i];
				if (!line) {
					line = h('span', 'md-line');
					line.append(h('span', 'md-line-n'), document.createTextNode(''));
					lines.append(line);
				}
				line.firstChild.textContent = String(i + 1);
				// 空行也给个零宽空格，否则覆盖层少一行，后面的行号全往上错
				line.lastChild.nodeValue = src[i] || '\u200b';
			}
			while (lines.children.length > src.length) lines.lastElementChild.remove();
		};

		ta.addEventListener('input', () => {
			paint();
			growArea(ta);
			onInput(ta.value);
		});
		paint();
		box.append(lines, ta);
		host.append(box);
		requestAnimationFrame(() => growArea(ta));
		document.fonts?.ready.then(() => growArea(ta));
		return ta;
	};

	// ⚠️ 不用 title：浏览器自带的悬浮提示用户明确不要。改用 aria-label，读屏还在、悬浮不弹。
	const makeField = (value, placeholder, onInput, cls = '', tip = '') => {
		const input = h('input', 'md-field-input' + (cls ? ' ' + cls : ''));
		input.type = 'text';
		input.value = value;
		input.placeholder = placeholder;
		input.spellcheck = false;
		if (tip) input.setAttribute('aria-label', tip);
		input.addEventListener('input', () => onInput(input.value));
		return input;
	};

	/** 重建卡片头 */
	const makeHead = (label, color) => {
		head.replaceChildren();
		const badge = h('span', 'md-block-badge', label);
		badge.dataset.color = color;
		head.append(badge);
	};

	const makeDeleteBtn = () => {
		const del = h('button', 'md-block-mini', '删除');
		del.type = 'button';
		del.setAttribute('aria-label', '删掉整块（可 Ctrl+Z 撤销）');
		del.addEventListener('click', () => {
			const pos = getPos();
			if (typeof pos === 'number') editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
		});
		return del;
	};

	/** 写回源码。⚠️ 先认领 rendered 再到 PM 里改属性：顺序反了会走「外部刷新」分支，把光标顶掉 */
	const write = (next) => {
		if (next === node.attrs.source) return;
		rendered = next;
		const pos = getPos();
		if (typeof pos !== 'number') return;
		editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, source: next }));
	};

	// ── 围栏卡片（代码块 / abc / 简谱共用）──────────────────────
	function renderFence(source) {
		const { open, lang, body, close } = splitFence(source);
		const spec = /^(jianpu|jp)$/i.test(lang) ? SPECS.jianpu : /^abc/i.test(lang) ? SPECS.abc : null;
		const meta = spec === SPECS.jianpu ? BADGE.jianpu : spec ? BADGE.abc : BADGE.code;
		makeHead(spec || !lang ? meta.label : meta.label + ' · ' + lang, meta.color);

		const { rows, gap, score } = splitHeader(body, spec);
		let scoreArea = null;
		let langInput = null;
		const curScore = () => (scoreArea ? scoreArea.value : score.join('\n'));

		const rebuild = () => {
			const m = FENCE_OPEN_RE.exec(open);
			const nextLang = langInput ? langInput.value : lang;
			const openLine = m ? m[1] + m[2] + nextLang : open;
			const lines = [openLine, ...buildHeader(rows, spec), ...Array(gap).fill('')];
			const scoreText = curScore();
			if (scoreText !== '') lines.push(...scoreText.split('\n'));
			if (close != null) lines.push(close);
			write(lines.join('\n'));
		};

		if (spec) {
			// 乐谱两块就是「一个 abc 一个 jianpu」⇒ 语言不用人填（要新建就直接用工具条上的两个按钮）
			head.append(makeDeleteBtn());
		} else {
			// ⚠️ 用普通输入框、**不挂 datalist**：挂了之后 Chrome 会在右端画一个原生的下拉小三角，
			//    跟站点的控件语言完全不是一回事（用户：没用，删掉）。
			langInput = makeField(lang, '语言（js / python / css …）', () => rebuild(), 'md-lang-input');
			langInput.setAttribute('aria-label', '围栏语言（第一行 ``` 后面的那个词）');
			head.append(langInput, makeDeleteBtn());
		}

		if (spec) {
			/** 找这个字段对应的行；没有就现建一个「虚拟行」（raw 为 null，填了才写进源） */
			const entryOf = (key) => {
				let row = rows.find((r) => spec.sameKey(r.key, key));
				if (!row) {
					row = { key, value: '', raw: null, added: true };
					rows.push(row);
				}
				return row;
			};

			const fields = h('div', 'md-fields');
			const grid = h('div', 'md-fields-grid');
			for (const [key, label, tip] of spec.fields) {
				const cell = h('label', 'md-cell' + (spec.wide.includes(key) ? ' md-cell--wide' : ''));
				const name = h('span', 'md-cell-label', label);
				// 字段说明原来挂在 label 的 title 上（悬浮提示）；现在改挂到 input 的 aria-label（见下面的 makeField），
				// 标签只剩「K」「beat」这种可见缩写，鼠标悬浮不再弹提示。
				const row = rows.find((r) => spec.sameKey(r.key, key));
				const input = makeField(row ? row.value : '', spec.placeholders?.[key] ?? key, (v) => {
					const entry = entryOf(key);
					entry.value = v;
					// 清空 = 这一行不写（"用不着的参数就留空嘛"）；原样没动过的行连 raw 都不换
					entry.raw = v === '' ? null : `${entry.key}: ${v}`;
					rebuild();
				}, 'md-cell-input', tip);
				cell.append(name, input);
				grid.append(cell);
			}
			fields.append(grid);

			// 「其他头部行」：字段表之外的（abc 的 R/P/O/Z…）+ 手动加的行
			const extras = h('div', 'md-extras');
			const renderExtras = () => {
				extras.replaceChildren();
				for (const row of rows.filter((r) => !spec.fields.some((f) => spec.sameKey(f[0], r.key)))) {
					const line = h('div', 'md-field');
					const keyInput = makeField(row.key, '字段名', (v) => {
						row.key = v;
						row.raw = v && row.value !== '' ? `${v}: ${row.value}` : null;
						renderExtras();
						rebuild();
					}, 'md-field-key');
					const valInput = makeField(row.value, '值', (v) => {
						row.value = v;
						row.raw = row.key && v !== '' ? `${row.key}: ${v}` : null;
						rebuild();
					}, 'md-field-val');
					const rm = h('button', 'md-field-del', '×');
					rm.type = 'button';
					rm.setAttribute('aria-label', '删掉这一行');
					rm.addEventListener('click', () => {
						const at = rows.indexOf(row);
						if (at >= 0) rows.splice(at, 1);
						renderExtras();
						rebuild();
					});
					line.append(h('label', 'md-field-label', '附加字段'), keyInput, valInput, rm);
					extras.append(line);
				}
			};

			const addBtn = h('button', 'md-field-add', '+ 其他头部行');
			addBtn.type = 'button';
			addBtn.setAttribute('aria-label', '字段表之外的头部行（比如 abc 的 R: 曲风、T: 第二行标题）');
			addBtn.addEventListener('click', () => {
				rows.push({ key: '', value: '', raw: null, added: true });
				renderExtras();
				const keys = extras.querySelectorAll('.md-field-key');
				keys[keys.length - 1]?.focus();
			});
			renderExtras();
			fields.append(extras, addBtn);
			bodyHost.append(fields);
		}

		scoreArea = makeArea(bodyHost, score.join('\n'), () => rebuild(), 'md-input md-input--score');
	}

	// ── 图片卡片 ────────────────────────────────────────────
	function renderImage(source) {
		const info = parseImageLine(source);
		if (!info) return renderPlain(source, BADGE.image); // 认不出来就退回纯文本框，绝不乱猜
		makeHead(BADGE.image.label, BADGE.image.color);
		head.append(makeDeleteBtn());

		const wrap = h('div', 'md-image');
		const thumb = h('div', 'md-image-thumb');
		thumb.dataset.state = 'loading';
		const img = h('img', 'md-image-preview');
		img.alt = info.alt;
		img.loading = 'lazy';
		img.src = info.src;
		img.addEventListener('load', () => { thumb.dataset.state = 'ok'; });
		img.addEventListener('error', () => { thumb.dataset.state = 'missing'; });
		thumb.append(img, h('span', 'md-image-note md-image-note--missing', '找不到文件'), h('span', 'md-image-note md-image-note--loading', '读取中…'));

		const fields = h('div', 'md-fields');
		const put = (key, label, placeholder) => {
			const line = h('div', 'md-field');
			line.append(h('label', 'md-field-label', label));
			const input = makeField(info[key] ?? '', placeholder, (v) => {
				info[key] = v;
				if (key === 'src') {
					thumb.dataset.state = 'loading';
					img.src = v;
				}
				write(buildImageLine(info));
			}, 'md-field-val');
			line.append(input);
			fields.append(line);
		};
		// ⚠️ 只有「路径 / 尺寸 / 图注」三栏：「说明」（alt）那栏删了 —— 插入时默认就是 Placeholder
		// 那种，留着也没人填（alt 依旧原样保留在源里，改别的字段不会弄丢它）。
		put('src', '路径', '/images/2026-01-01-slug-name.webp');
		// 图注写的是**纯文字**，两侧的星号由 buildImageLine 自己套（空着就不写这一行）
		put('cap', '图注', '配图说明，留空就不写');

		// 尺寸做成下拉：站点只有 .img-sm（40%）/ .img-md（65%）两个类，不写类就是满宽（大）
		const sizeLine = h('div', 'md-field');
		sizeLine.append(h('label', 'md-field-label', '尺寸'));
		const sizeSel = document.createElement('select');
		// 复用工具条/顶栏那套 select（.editor-select 在 @supports (appearance: base-select) 里统一定制了
		// 弹层卡片样式与描边箭头）—— 别再自己写一套原生样式的下拉
		sizeSel.className = 'editor-select md-card-select';
		const SIZES = [['{.img-sm}', '小'], ['{.img-md}', '中'], ['', '大（不写类，默认）']];
		for (const [value, label] of SIZES) {
			const o = document.createElement('option');
			o.value = value;
			o.textContent = label;
			sizeSel.append(o);
		}
		// 源文件里要是写了别的类（手写的），原样挂一项进去，千万别给它弄丢
		if (!SIZES.some((s) => s[0] === info.cls)) {
			const o = document.createElement('option');
			o.value = info.cls;
			o.textContent = '原样保留：' + (info.cls || '（空）');
			sizeSel.append(o);
		}
		sizeSel.value = info.cls;
		sizeSel.addEventListener('change', () => {
			info.cls = sizeSel.value;
			write(buildImageLine(info));
		});
		sizeLine.append(sizeSel);
		fields.append(sizeLine);

		wrap.append(thumb, fields);
		bodyHost.append(wrap);
	}

	/** 其余块（公式 / 表格 / HTML / 兜底）：整段源码直接改 */
	function renderPlain(source, badge) {
		makeHead(badge.label, badge.color);
		head.append(makeDeleteBtn());
		makeArea(bodyHost, source, (v) => write(v));
	}

	// ── 表格卡片（GFM 网格编辑）──────────────────────────────
	function renderTable(source) {
		const lines = String(source).split('\n');
		const rows = lines.map((raw) => {
			const cells = splitTableRow(raw);
			return { cells, raw, delim: cells.length > 0 && cells.every(isDelimCell) };
		});
		const delimRow = rows.find((r) => r.delim) ?? null;
		const delimAt = delimRow ? rows.indexOf(delimRow) : -1;
		const align = delimRow ? delimRow.cells.map(alignOf) : [];
		let cols = Math.max(1, ...rows.filter((r) => !r.delim).map((r) => r.cells.length));
		const sepLine = () => '| ' + Array.from({ length: cols }, (_, i) => (ALIGN.find((a) => a.id === align[i]) ?? ALIGN[0]).cell).join(' | ') + ' |';
		const lineOf = (cells) => '| ' + cells.join(' | ') + ' |';
		// 只重写「碰过」的行（raw 为 null 的），其余原样吐回
		const rebuild = () => write(rows.map((r) => (r.raw ? r.raw : r.delim ? sepLine() : lineOf(r.cells))).join('\n'));

		makeHead(BADGE.table.label, BADGE.table.color);
		const srcBtn = h('button', 'md-block-mini', tableSource ? '表格' : '源码');
		srcBtn.type = 'button';
		srcBtn.setAttribute('aria-label', tableSource ? '切回网格编辑' : '切到原文（改复杂结构时用）');
		srcBtn.addEventListener('click', () => {
			tableSource = !tableSource;
			render();
		});
		head.append(srcBtn, makeDeleteBtn());

		if (tableSource) {
			makeArea(bodyHost, source, (v) => write(v));
			return;
		}

		const grid = h('div', 'md-table-grid');
		grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(92px, 1fr))';
		let rowNo = 0;

		// 对齐行（在网格里占一整行；对齐符只在改过时才重写）
		if (delimRow) {
			for (let i = 0; i < cols; i++) {
				const cell = h('label', 'md-table-align');
				const sel = document.createElement('select');
				for (const a of ALIGN) {
					const o = document.createElement('option');
					o.value = a.id;
					o.textContent = a.label;
					sel.append(o);
				}
				sel.value = align[i] ?? 'none';
				sel.setAttribute('aria-label', '第 ' + (i + 1) + ' 列对齐');
				sel.addEventListener('change', () => {
					align[i] = sel.value;
					delimRow.raw = null;
					rebuild();
				});
				cell.append(sel);
				grid.append(cell);
			}
		}

		rows.forEach((row, ri) => {
			if (row.delim) return;
			const isHead = delimAt >= 0 && ri < delimAt;
			rowNo += 1; // 行号按「看得见的行」数（分隔行不占号）
			for (let ci = 0; ci < cols; ci++) {
				if (ci >= row.cells.length) {
					grid.append(h('span', 'md-table-gap')); // 参差不齐的行：占位，别把后面几行顶错列
					continue;
				}
				const input = h('input', 'md-table-cell');
				input.type = 'text';
				input.value = row.cells[ci];
				input.dataset.head = isHead ? '1' : '0';
				input.setAttribute('aria-label', '第 ' + rowNo + ' 行 · 第 ' + (ci + 1) + ' 列');
				input.addEventListener('input', () => {
					if (row.cells[ci] === input.value) return;
					row.cells[ci] = input.value;
					row.raw = null;
					rebuild();
				});
				grid.append(input);
			}
		});

		const tools = h('div', 'md-table-tools');
		const tool = (label, tip, fn) => {
			const b = h('button', 'md-block-mini', label);
			b.type = 'button';
			b.setAttribute('aria-label', tip);
			b.addEventListener('click', fn);
			tools.append(b);
		};
		// 结构变了 ⇒ 整个网格重画（此时所有行都得重写）
		const restructure = (mutate) => {
			mutate();
			for (const r of rows) r.raw = null;
			cols = Math.max(1, ...rows.filter((r) => !r.delim).map((r) => r.cells.length));
			rebuild();
			render();
		};
		tool('＋ 行', '在末尾加一行', () => restructure(() => rows.push({ cells: Array.from({ length: cols }, () => ''), raw: null })));
		tool('－ 行', '删掉最后一行', () =>
			restructure(() => {
				for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].delim && rows.length > 1) { rows.splice(i, 1); break; }
			})
		);
		tool('＋ 列', '在末尾加一列', () =>
			restructure(() => {
				for (const r of rows) r.cells.push('');
				align.push('none');
			})
		);
		tool('－ 列', '删掉最后一列', () =>
			restructure(() => {
				if (cols <= 1) return;
				for (const r of rows) if (r.cells.length) r.cells.pop();
				align.pop();
			})
		);

		const scroll = h('div', 'md-table-scroll');
		scroll.append(grid);
		bodyHost.append(scroll, tools);
	}

	function render() {
		const kind = node.attrs.kind;
		const source = node.attrs.source;
		rendered = source;
		dom.dataset.kind = kind;
		head.replaceChildren();
		bodyHost.replaceChildren();

		if (kind === 'fence') {
			// 连开引号都认不出来（极端情况）⇒ 纯文本框
			return FENCE_OPEN_RE.test(splitFence(source).open) ? renderFence(source) : renderPlain(source, BADGE.code);
		}
		if (kind === 'image') return renderImage(source);
		if (kind === 'math') return renderPlain(source, BADGE.math);
		if (kind === 'table') return renderTable(source);
		if (kind === 'html') return renderPlain(source, BADGE.html);
		return renderPlain(source, BADGE.raw);
	}

	render();

	return {
		dom,
		// 卡片里全是表单控件：事件别让 ProseMirror 插手（否则输入会被吞/被拦）
		stopEvent: () => true,
		// DOM 的变动（图片加载、value 更新…）由我们自己管，PM 不用管
		ignoreMutation: () => true,
		update(next) {
			if (next.type !== node.type) return false;
			node = next;
			if (next.attrs.source !== rendered || next.attrs.kind !== dom.dataset.kind) render();
			return true;
		},
	};
}
