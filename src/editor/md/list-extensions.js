// 任务列表（- [x] …）的两个扩展
//
// 为什么要自己接一层序列化：
//   tiptap-markdown 自带的 TaskList 序列化直接复用「无序列表」那套 `renderList`，
//   而它的 TaskItem 又用 `state.write('[x] ')` 开头 —— `write()` 会先 `flushClose()`（默认 size=2），
//   于是**每一项之间都会被塞一个空行**（普通无序/有序列表都不会，只有任务列表会）：
//       - [x] A\n\n- [ ] B\n\n- [ ] C        ← 存回去就多出空行，往返不再逐字一致
//   这里改成：列表层自己写 `- [x] ` 前缀、项之间只 flushClose(1)（紧凑），
//   item 层只渲染内容（不再写一遍复选框，否则会变成 `- [x] [x] 内容`）。
import { TaskItem, TaskList } from '@tiptap/extension-list';

export const ListTaskList = TaskList.extend({
	addStorage() {
		return {
			markdown: {
				// ⚠️ 只接管 serialize：**不要**写 `parse: {}` ——
				//    任务列表的解析（markdown-it-task-lists + DOM 上的 data-type 改写）是 tiptap-markdown 注进去的，
				//    写个空的 parse 会把那套吃掉，`- [x] A` 就退化成「文字是 [x] A 的普通无序列表」。
				serialize(state, node) {
					node.forEach((item, _offset, index) => {
						if (index) state.flushClose(1); // 紧凑：项间只收一个换行
						state.write('- ' + (item.attrs.checked ? '[x] ' : '[ ] '));
						state.renderContent(item);
					});
					state.closeBlock(node);
				},
			},
		};
	},
});

export const ListTaskItem = TaskItem.extend({
	addStorage() {
		return {
			markdown: {
				serialize(state, node) {
					state.renderContent(node); // 复选框交给 ListTaskList 写
				},
			},
		};
	},
});
