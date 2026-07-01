---
layout: '../../layouts/Layout.astro'
title: "全样式排版测试：验证你的博客 CSS 视觉规范"
date: "2026-07-01"
---

## 1. 标题层级演练 (Headings)

上面的大标题是 H1，下面我们将测试从 H2 到 H6 的级联表现。注意观察左侧的绝对定位井号（#）动效是否正常：

### 1.1 这是三级标题 (H3)
三级标题通常用于段落内部的子话题划分。

#### 1.2.1 这是四级标题 (H4)
四级标题的字号通常应该和正文相仿，但通过加粗或颜色变蓝来体现层级。

##### 1.2.1.1 这是五级标题 (H5)
很少用到，但在排版完备性上需要有对应样式。

###### 1.2.1.1.1 这是六级标题 (H6)
层级的最末端，通常带有灰色或倾斜质感。

---

## 2. 文本行内样式 (Inline Text Elements)

在排版中，文本的节奏感依赖于多变的行内强调：

- **这是粗体文字 (Strong/Bold)**：用于强烈的视觉强调。
- *这是斜体文字 (Emphasis/Italic)*：用于专有名词或外来语的轻度强调。
- ***这是粗斜体文字 (Bold & Italic)***：双重强调叠加。
- ~~这是删除线文字 (Strikethrough)~~：用于表达过时或修正的内容。
- 这里包含一个`行内代码高亮 (Inline Code)`：检查它是否带有淡淡的背景色和微小的圆角。
- 这是一个标准的[行内超链接 (Hyperlink)](https://www.ethan929.com)：**核心测试**：检查它在首页卡片和文章正文中的表现，是否带有所需的虚线或颜色，同时确保它不会污染首页卡片！

---

## 3. 各种列表排版 (Lists)

### 3.1 无序列表 (Unordered List)
* 摇滚乐 (Rock & Roll)
* 爵士乐 (Jazz)
  * 核心流派：比波普 (Bebop)
  * 核心流派：酷爵士 (Cool Jazz)
* 古典乐 (Classical)

### 3.2 有序列表 (Ordered List)
1. 打开冰箱门
2. 把大象放进冰箱
   1. 注意安全，不要挤压大象
   2. 确保大象呼吸顺畅
3. 把冰箱门关上

### 3.3 任务列表 (Task List)
- [x] 修复移动端汉堡菜单（已完成）
- [x] 实现卡片式竖向排列与全卡片点击（已完成）
- [ ] 丰富长文章的侧边栏目录功能（进行中）

---

## 4. 引用区块 (Blockquotes)

引用块用于承载长篇名言、旁注或者警告信息：

> “艺术就是长长的虚线，被我用 CSS 一句 `border-bottom: none` 无情地抹去。”
> 
> —— *某个通宵修 Bug 的博主*

> 嵌套引用测试：
> > 这里是引用的下一层级，检查层级线是否重叠或变深。

---

## 5. 代码块展示 (Code Blocks)

这里是一个标准带有语法高亮的 JavaScript 代码块，用来检查你 Astro 配置的 Shiki 或 Prism 高亮主题在亮/暗色模式下是否清晰易读：

```javascript
// 测试一段经典的临时主题切换逻辑
function toggleTheme() {
    const html = document.documentElement;
    const isDark = 啊但是媳妇仓库大理石减肥的辛苦啦好几次电脑死机复习课html.getAttribute('data-theme') === 'dark';
    
    if (isDark) {
        html.removeAttribute('data-theme');
    } else {
        html.setAttribute('data-theme', 'dark');
    }
    console.log(`主题已成功切换！当前暗色状态：${!isDark}`);
}
```

---

## 6. 数据表格表现 (Tables)

测试表格的描边、表头背景色（`<th>`）以及跨行对齐的表现：

| 模块类名 | 适用范围 | 是否带有井号 (#) | 点击热区范围 |
| :--- | :--- | ---: | :--- |
| 的`.typography-body h3` | 纯文章详情页正文 | **有**（悬浮浮现） | 仅限文字本身 |
| `.post-title-link h3` | 首页列表卡片 | **无**（彻底隔绝） | **全卡片 100% 撑满** |
| `.navbar a` | 顶部导航栏 | 无 | 仅限按钮导航区 |

---

## 7. 媒体与注脚 (Media & Footnotes)

### 7.1 图片测试 (Images)
检查图片是否支持响应式最大宽度（`max-width: 100%`），以及是否带有优雅的居中和圆角边框：

![测试占位图](https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&auto=format&fit=crop&q=60)


![这是图片的 Alt 替代文字，供 SEO 和加载失败时显示](/images/architecture.png)
*图 1：现代化博客系统架构设计图*

### 7.2 注脚测试 (Footnotes)
这是一个带有引用的句子[^1]，点击它应该能平滑跳转到页面最底部的注脚[^2]。

[^1]: 这里是注脚的详dkfhijuuyegolifjididkcsifkmcelpdjocf细说明内容。当你点击文章顶部的数字时，浏览器会自动带你来到这里。
[^2]: 亻尔女子。

## 🚀 Markdown 全元素终极美化测试

这是一段普通的正文段落。在这个段落中，我们 https://ethanshaw.com 可能会提到一些核心概念，比如 `const blog = "Astro"` 这是一个**行内代码**的展示。我们还需要给某些句子加上 <mark>极其重要的黄色荧光笔高亮效果</mark> 来提醒读者注意。有时候，有些过时的想法会被~~无情地删除掉~~。

如果你对全站的架构感兴趣，可以点击访问 [Ethan Shaw 的主页](https://github.com) 看看，注意看悬浮时的物理动画。

### 🛠️ 任务清单与行内元素的联动
* [x] 彻底搞定复选框与主题变量 `--on-primary` 的神仙联动
* [ ] 测试在任务列表内部嵌套一个 `inline-code` 的样式是否穿帮
* [x] 顺便看看~~删除线~~在列表里好不好使

---

## 🎩 隐藏的高阶视觉微调测试

### 1. 键盘按键与上标/下标
为了刷新页面，请按下键盘上的 <kbd>Ctrl</kbd> + <kbd>F5</kbd>。
水分子的化学式是 H<sub>2</sub>O，而 2 的 3 次方可以写作 2<sup>3</sup>=8。

### 2. 图像自适应测试
下面是一张普通段落中的小图标（比如表情包）：![emoji](https://api.iconify.design/twemoji:party-popper.svg) 它应该完美融入行内，而不是把这一行的上下行距粗暴地撑开。

### 3. 长英文与折行
这里有一串超级长的、没有空格的恶魔级连续英文单词：Supercalifragilisticexpialidocious. 它应该在容器边缘优雅地自动折行，而不是直接横向冲出屏幕。

著名的**傅里叶变换**公式如下所示：

$x+1=y$