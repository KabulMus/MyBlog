---
layout: '../../layouts/Layout.astro'
title: '🧪 全语法测试文章'
date: '2026-07-29'
tags: ['life', 'channel', 'academic', 'insync', 'nation', 'tutorial', 'achievement', 'essays', 'rant']
---

## 标题层级

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

---

## 文本样式

普通段落，这里是 **粗体文字**，*斜体文字*，~~删除线~~，***粗斜体***，<mark>高亮文字</mark>，`行内代码`，<sub>下标</sub> 和 <sup>上标</sup>。

这是一段很长的文本用来测试自动换行效果。The quick brown fox jumps over the lazy dog. 敏捷的棕色狐狸跳过了懒惰的狗。中日文混排测试：日本語のテスト文章です。

---

## 引用块

> 这是一级引用。
>
> > 这是二级嵌套引用。
> >
> > > 这是三级嵌套引用，可以用来展示层层递进的结构。

---

## 列表

### 无序列表

- 项目一
- 项目二
  - 嵌套子项目 A
  - 嵌套子项目 B
- 项目三

### 有序列表

1. 第一步
2. 第二步
3. 第三步
   1. 子步骤 3.1
   2. 子步骤 3.2

### 任务列表

- [x] 已完成任务
- [ ] 未完成任务
- [ ] 另一个待办事项

---

## 代码

行内代码：使用 `console.log('Hello World')` 输出信息。

代码块：

```javascript
function greet(name) {
    return `Hello, ${name}!`;
}

// 这是一个 JavaScript 示例
const result = greet('Ethan');
console.log(result);
```

```python
def fibonacci(n):
    """生成斐波那契数列"""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

# 测试
print(list(fibonacci(10)))
```

```css
.tag-filter-btn {
    display: flex;
    align-items: center;
    border-radius: 999px;
    transition: all 0.3s ease;
}
```

---

## 表格

| 语言 | 类型 | 评级 |
|:---|:---:|---:|
| JavaScript | 动态 | A |
| Python | 动态 | A+ |
| TypeScript | 静态 | A+ |
| Rust | 静态 | S |

| 标签名 | 中文名 | 颜色 |
|:---|---:|:---:|
| channel | 频道 | 蓝色 |
| academic | 学业 | 绿色 |
| rant | 吐槽 | 玫红 |

---

## 链接与图片

这是一个[行内链接](https://example.com)示例。

图片测试（使用外部图片）：

![Placeholder](https://images.pexels.com/photos/31107292/pexels-photo-31107292.jpeg)

---

## 数学公式（KaTeX）

行内公式：$E = mc^2$

块级公式：

$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

---

## 键盘按键

按 <kbd>Ctrl</kbd> + <kbd>C</kbd> 复制，按 <kbd>Ctrl</kbd> + <kbd>V</kbd> 粘贴。

---

## 分割线

---

***

___

---

## 注脚

这是一个带注脚[^1]的句子[^2]。

[^1]: 这是注脚的解释内容，可以在这里补充说明。
[^2]: 本文仅用于测试。本文仅用于测试。本文仅用于测试。本文仅用于测试。本文仅用于测试。本文仅用于测试。本文仅用于测试。本文仅用于测试。本文仅用于测试。

---

## 长文本排版测试

这是一段用于测试中文两端对齐效果的长文本。它包含了中文汉字、English words、阿拉伯数字 12345 以及混排内容。根据排版理论，中文等宽方块字在两端对齐时能够获得非常整齐的左右边缘，从而提升阅读体验。然而当文本中混入了西文单词或阿拉伯数字时，浏览器的 CJK 排版引擎会自动优先在汉字之间调整间距，避免西文单词之间出现过大间隙。例如这段话里有 English 词汇、2026 年份数字、以及像 iPhone 16 Pro Max 这样的混合名词，还有 GPT-4o、Wi-Fi 6E、UHD 等含有符号和数字的术语，都能很好地处理。

The quick brown fox jumps over the lazy dog. 这只敏捷的棕色狐狸跳过了那只懒惰的狗。Pack my box with five dozen liquor jugs. 请在我的箱子里装入五打酒壶。12345 67890 各种各样的字符交织在一起 abcd 一二三四五，可以看到浏览器引擎如何 smartly handle 这种 mixed-language typesetting scenario。

多一点文字来观察换行效果。重复一遍——根据排版理论，中文等宽方块字在两端对齐时能够获得非常整齐的左右边缘。但英文如果也使用两端对齐，则会在单词之间插入不规则的空白间隙，形成所谓的「河流」(rivers)，破坏阅读节奏。因此本站采用中文两端对齐、英文左对齐的混合策略，这是兼顾两种语言文字特性的最优解。End of test.

以上就是 Markdown 所有常见语法的展示。这篇文章同时也打满了全部 9 种标签，用于测试标签筛选功能。
