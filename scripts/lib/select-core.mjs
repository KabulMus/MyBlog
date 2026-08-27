// 交互式多选的核心状态机（纯逻辑，便于单元测试）
// 逻辑：↑↓ 移动高亮、空格 勾选/取消（ordered 时记录勾选顺序）、回车 提交、Ctrl+C 退出
// 可选“自定义行”：opts.custom 给出行文案（如 '✚ 自定义标签…'）时，列表末尾多一行，
//   在该行按 空格/回车 返回 { action: 'custom' }，由调用方收集输入后调用 addCustom() 加入选择。

export function createSelectState(choices, { multi = true, ordered = true, preSelected = [], custom = null } = {}) {
  return {
    choices,
    multi,
    ordered,
    custom,
    cursor: 0,
    order: [...preSelected],
    chosen: new Set(preSelected),
  };
}

// 列表总行数（含可选的“自定义”行）
export function rowCount(state) {
  return state.choices.length + (state.custom ? 1 : 0);
}

// 把自定义项加入选择（按给定顺序追加；已选的跳过）
export function addCustom(state, keys) {
  for (const k of keys) {
    if (k && !state.chosen.has(k)) {
      state.chosen.add(k);
      if (state.ordered) state.order.push(k);
    }
  }
}

// 处理一个按键，返回动作：'submit' | 'exit' | 'custom' | 'render' | 'ignore'
export function handleSelectKey(state, str, key) {
  if (key.ctrl && key.name === 'c') return { action: 'exit' };
  const isCustomRow = state.custom && state.cursor === state.choices.length;
  if (key.name === 'return' || key.name === 'enter') {
    return isCustomRow ? { action: 'custom' } : { action: 'submit' };
  }
  if (key.name === 'up') {
    if (state.cursor > 0) state.cursor--;
    return { action: 'render' };
  }
  if (key.name === 'down') {
    if (state.cursor < rowCount(state) - 1) state.cursor++;
    return { action: 'render' };
  }
  if (key.name === 'space' || (str && str === ' ')) {
    if (isCustomRow) return { action: 'custom' };
    const c = state.choices[state.cursor];
    if (c) {
      if (state.chosen.has(c.key)) {
        state.chosen.delete(c.key);
        const i = state.order.indexOf(c.key);
        if (i !== -1) state.order.splice(i, 1);
      } else {
        state.chosen.add(c.key);
        if (state.ordered) state.order.push(c.key);
      }
    }
    return { action: 'render' };
  }
  return { action: 'ignore' };
}
