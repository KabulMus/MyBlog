// select-core 逻辑单元测试：node scripts/test-select-core.mjs
import { createSelectState, handleSelectKey, addCustom } from './lib/select-core.mjs';

const key = (name, str, extra = {}) => ({ sequence: str, name, ctrl: false, meta: false, shift: false, ...extra });

let failed = 0;
function check(cond, msg) {
  if (cond) console.log('  ✅ ' + msg);
  else { failed++; console.error('  ❌ ' + msg); }
}

console.log('分类：多选 + 勾选顺序');
{
  const cats = [
    { key: 'music', label: '音乐 / Music' },
    { key: 'studio', label: '创作 / Studio' },
    { key: 'essays', label: '随笔 / Essays' },
    { key: 'achievements', label: '成就 / Achievements' },
  ];
  const s = createSelectState(cats, { multi: true, ordered: true, preSelected: ['essays'] });
  check(s.cursor === 0, '初始 cursor=0，高亮第一项');
  check(JSON.stringify(s.order) === JSON.stringify(['essays']), '预选 essays');

  handleSelectKey(s, ' ', key('space', ' ')); // 空格勾选 music（光标在 music）
  check(JSON.stringify(s.order) === JSON.stringify(['essays', 'music']), '勾选 music → 顺序 essays→music，实际 ' + s.order.join(','));

  handleSelectKey(s, undefined, key('down')); // 下移到 studio
  check(s.cursor === 1, 'down 后 cursor=1');
  handleSelectKey(s, ' ', key('space', ' ')); // 勾选 studio
  check(JSON.stringify(s.order) === JSON.stringify(['essays', 'music', 'studio']), '再勾选 studio → essays→music→studio');

  handleSelectKey(s, undefined, key('up')); // 上移到 music
  handleSelectKey(s, ' ', key('space', ' ')); // 取消 music
  check(JSON.stringify(s.order) === JSON.stringify(['essays', 'studio']), '取消 music → essays→studio，实际 ' + s.order.join(','));

  const r = handleSelectKey(s, '\r', key('return')); // 回车提交
  check(r.action === 'submit', '回车提交');
  check(JSON.stringify(s.order) === JSON.stringify(['essays', 'studio']), '提交结果 [' + s.order.join(', ') + ']');
}

console.log('标签：多选 + 顺序（无预选）');
{
  const tags = ['rant', 'article', 'note', 'quote', 'insync', 'review', 'musictheory'].map((k) => ({ key: k, label: k }));
  const t = createSelectState(tags, { multi: true, ordered: true });
  check(JSON.stringify(t.order) === JSON.stringify([]), '初始无预选');

  handleSelectKey(t, undefined, key('down')); // -> article
  handleSelectKey(t, ' ', key('space', ' ')); // 选 article
  handleSelectKey(t, undefined, key('down')); // -> note
  handleSelectKey(t, undefined, key('down')); // -> quote
  handleSelectKey(t, ' ', key('space', ' ')); // 选 quote
  check(JSON.stringify(t.order) === JSON.stringify(['article', 'quote']), '顺序 article→quote，实际 ' + t.order.join(','));

  handleSelectKey(t, ' ', key('space', ' ')); // 取消 quote
  check(JSON.stringify(t.order) === JSON.stringify(['article']), '取消 quote → 只剩 article');
}

console.log('边界：顶/底不越界');
{
  const s = createSelectState([{ key: 'a' }, { key: 'b' }], {});
  handleSelectKey(s, undefined, key('up'));
  check(s.cursor === 0, '在顶部按 ↑ 仍为 0');
  handleSelectKey(s, undefined, key('down'));
  handleSelectKey(s, undefined, key('down'));
  check(s.cursor === 1, '在底部按 ↓ 仍为 1');
}

console.log('Ctrl+C 返回 exit');
{
  const s = createSelectState([{ key: 'a' }], {});
  const r = handleSelectKey(s, undefined, { ctrl: true, name: 'c' });
  check(r.action === 'exit', 'Ctrl+C → exit');
}

console.log('自定义行（✚）：回车/空格进入输入、addCustom 平起平坐');
{
  const tags = ['rant', 'article', 'note', 'quote'].map((k) => ({ key: k, label: k }));
  const s = createSelectState(tags, { multi: true, ordered: true, custom: '自定义标签…' });

  // 一路 ↓ 到自定义行（第 4 行）
  handleSelectKey(s, undefined, key('down'));
  handleSelectKey(s, undefined, key('down'));
  handleSelectKey(s, undefined, key('down'));
  handleSelectKey(s, undefined, key('down'));
  check(s.cursor === 4, '↓ 四次后落在自定义行（cursor=4），实际 ' + s.cursor);

  // 在自定义行按 空格 → custom
  const rSpace = handleSelectKey(s, ' ', key('space', ' '));
  check(rSpace.action === 'custom', '自定义行按 空格 → action=custom');
  // 再进入，回车 → custom
  const s2 = createSelectState(tags, { multi: true, ordered: true, custom: '✚' });
  s2.cursor = 4;
  const rEnter = handleSelectKey(s2, '\r', key('return'));
  check(rEnter.action === 'custom', '自定义行按 回车 → action=custom');

  // 先勾选 article（顺序 0 位置），再加自定义 mytag（追加在 article 之后）
  const s3 = createSelectState(tags, { multi: true, ordered: true, custom: '✚' });
  s3.cursor = 1; // article
  handleSelectKey(s3, ' ', key('space', ' ')); // 勾选 article
  check(JSON.stringify(s3.order) === JSON.stringify(['article']), '勾选 article');
  addCustom(s3, ['mytag', 'rant', 'mytag']); // mytag 新加、rant 候选也加、mytag 重复跳过
  check(JSON.stringify(s3.order) === JSON.stringify(['article', 'mytag', 'rant']), 'addCustom 按序追加且去重，实际 ' + s3.order.join(','));
  check(s3.chosen.has('article') && s3.chosen.has('mytag') && s3.chosen.has('rant'), '三者均在已选中');
}

if (failed) { console.error(`\n共 ${failed} 项失败`); process.exit(1); }
else console.log('\n全部通过 ✅');
