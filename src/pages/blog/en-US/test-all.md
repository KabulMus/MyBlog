---
layout: '../../../layouts/Layout.astro'
title: '🧪 Full Syntax Test Post'
date: '2026-07-29'
tags: ['life', 'channel', 'academic', 'insync', 'nation', 'tutorial', 'achievement', 'essays', 'rant']
---

## Heading Levels

### Level 3 Heading

#### Level 4 Heading

##### Level 5 Heading

###### Level 6 Heading

---

## Text Styles

Normal paragraph here, with **bold text**, *italic text*, ~~strikethrough~~, ***bold italic***, <mark>highlighted text</mark>, `inline code`, <sub>subscript</sub> and <sup>superscript</sup>.

A long text for line wrap testing. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. 中日文混排没有问题。

---

## Blockquotes

> Level 1 blockquote.
>
> > Level 2 nested blockquote.
> >
> > > Level 3 nested blockquote for demonstration.

---

## Lists

### Unordered List

- Item one
- Item two
  - Nested sub-item A
  - Nested sub-item B
- Item three

### Ordered List

1. First step
2. Second step
3. Third step
   1. Sub-step 3.1
   2. Sub-step 3.2

### Task List

- [x] Completed task
- [ ] Incomplete task
- [ ] Another todo item

---

## Code

Inline code: Use `console.log('Hello World')` to output.

Code blocks:

```javascript
function greet(name) {
    return `Hello, ${name}!`;
}

// JavaScript example
const result = greet('Ethan');
console.log(result);
```

```python
def fibonacci(n):
    """Generate Fibonacci sequence"""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

# Test
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

## Tables

| Language | Type | Rating |
|:---|---:|:---:|
| JavaScript | Dynamic | A |
| Python | Dynamic | A+ |
| TypeScript | Static | A+ |
| Rust | Static | S |

| Tag | Name | Color |
|:---|---:|:---:|
| channel | Channel | Blue |
| academic | Academic | Green |
| rant | Rant | Rose |

---

## Links & Images

This is an [inline link](https://example.com).

Image test (external):

![Placeholder](https://images.pexels.com/photos/31107292/pexels-photo-31107292.jpeg)

---

## Math (KaTeX)

Inline: $E = mc^2$

Block:

$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

---

## Keyboard Keys

Press <kbd>Ctrl</kbd> + <kbd>C</kbd> to copy, <kbd>Ctrl</kbd> + <kbd>V</kbd> to paste.

---

## Horizontal Rules

---

***

___

---

## Footnotes

A sentence with a footnote[^1].

[^1]: This is the footnote content with additional explanation.

---

## Conclusion

This post demonstrates all common Markdown syntax elements and includes all 9 tags for testing the tag filter feature.
