// 编辑器扩展清单（单一来源）
//
// ⚠️ 必须让「真编辑器」和「往返自检页」用**同一套**扩展：
//    自检页当初是自己另建了一个 Editor，扩展列表少了几项，
//    结果任务列表在自检里被当成「文字是 [x] …的普通无序列表」，报出一个其实不存在的差异（踩过）。
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { RawBlock } from './markdown-io.js';
import { FootnoteDefGuard, FootnoteRef, FootnoteRenumber, HtmlInline, HtmlInlineRt, PunctFullWidth } from './inline-extensions.js';
import { ListTaskItem, ListTaskList } from './list-extensions.js';

export const editorExtensions = [
	// ⚠️ 链接必须关掉 openOnClick：默认值 true 时**在编辑器里点一下链接就把整个标签页带走**
	//    （点开一个链接想改文字，结果跳去别的网站）⇒ 普通点击只放光标，想打开走
	//    弹层里的「打开」或 Ctrl/⌘ + 点击（index.astro 里自己接管）。
	//    linkOnPaste: true = 选中文字后直接粘贴一个网址就成链接，保留。
	StarterKit.configure({ codeBlock: false, link: { openOnClick: false, linkOnPaste: true } }),
	Markdown.configure({ html: false, linkify: false, breaks: false, tightLists: true }),
	RawBlock,
	// 行内特殊样式：<mark>/<sup>/<sub>/<kbd>/<ruby>（真格式）+ 脚注引用 [^1]
	// ⚠️ HtmlInline 必须排在 HtmlInlineRt 前面：mark 的先后就是 schema 里的声明顺序，
	//    而序列化按这个顺序写 ⇒ 才能先写 <ruby> 再写 <rt>（反了就成了 <rt>…</rt></ruby>）。
	HtmlInline,
	HtmlInlineRt,
	FootnoteRef,
	// 护栏：脚注定义段落不能被合并进别的段落（否则 [^N]: … 会跑到行中间、站点就不认了）
	FootnoteDefGuard,
	// 自动编号：按正文里引用的出现顺序重排 [^N]（编辑器里就不会出现 1-3-2 这种编号）
	FootnoteRenumber,
	// 开明式标点：句末点号（。！？）全角，跟站点渲染层一致（只挂装饰，不改文档内容）
	PunctFullWidth,
	// 任务列表：自己接了一层序列化（项间不插空行）
	ListTaskList,
	ListTaskItem.configure({ nested: true }),
];
