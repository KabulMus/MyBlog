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

这是一个带注脚的句子[^1]。

[^1]: 这是注脚的解释内容，可以在这里补充说明。

---

## 结语

以上就是 Markdown 所有常见语法的展示。这篇文章同时也打满了全部 9 种标签，用于测试标签筛选功能。
