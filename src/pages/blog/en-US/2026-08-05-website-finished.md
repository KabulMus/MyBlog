---
layout: '../../../layouts/Layout.astro'
title: 'My website is finally basically finished!!'
date: '2026-08-05'
draft: false
category: ['essays', 'studio']
tags: ['article', 'code']
---

## Come check it out!!

Main site: **[www.ethan929.com](https://www.ethan929.com/en-US)**

Blog: **[blog.ethan929.com](https://blog.ethan929.com/en-US)**

## Some ramblings

It's finally (almost) done😭😭😭

I started tinkering with this site back in May, and it's finally looking like somethin‘!!

> Hey hey Ethan, so what's the point of this website, anyway?

*(deepthinking...)*

i dunno. maybe just for fun — don't you think having your own domain and your own website is just really cool?! (doge)

## Why does this site exist?

Hmm... At first I just wanted a personal site + tool site to replace the messy pile of web tools I used while editing videos (plus an interactive [pitch PDF](/docs/2026-08-05-大调各音级一览.pdf) that I laid out in InDesign in literally half a minute<sup>???</sup>). But as I went along, features just kept piling up, and it turned into a personal site + tool site + blog + channel tracker + an **I-love-Charlie** site + ... (?)

Yeah, that's about it.

The early version actually looked like [this](https://a97f58be.mywebsite-16r.pages.dev/en_US)[^1] — one page to rule them all ()

[^1]: This one was actually one of the better versions, using the Google Fonts API... There was also an even older (read: extremely bare-bones) version, but I switched hosting platforms halfway through, so it's long gone from the current Cloudflare Pages.

## What's on the site?

### General features

- **🌍 Bilingual support**!! the i18n stuff ./
- **📱 Responsive design**, also optimized for mobile~
- **🌓 Light/dark mode**, follows your system by default, and you can toggle it manually in the bottom-right corner!
- **🔤 Killer typography**: hand-picked with top-tier taste[^2] for BEAUTIFUL fonts, quite pleasing to the eye~

[^2]: Self-proclaimed, of course 🤓

### Main site

- 🌟 My intro, contact info, and my journey so far;
- 📺 Real-time stats for each channel (Bilibili, YouTube, rednote);
- 🛠️ A few handy tools (scale visualizer, audio analyzer, online piano);
- ✨**Charlie! Zhou!!**

### Blog

- 🎵 In-sync moments (still **Charlie! Zhou!!**), music reviews (…which i'll probably manage to write once every half a lifetime), music theory;
- 🎬 Video creation and channel operations;
- 📝 Essays, rants, random musings;
- 🏆 Achievements and recaps;
- 🔍 On-site search, specially adapted for Chinese!
- 🏷️ Category & tag filtering;
- ❤️ Like system — hit that heart if you enjoy it~

### Tech stack...?

🤔 Hmm... I couldn't even tell you what I actually used... AI is just too good these days (DeepSeek is freaking incredible!! I can never repay Lord Liang[^3]'s kindness ✋😭🤚)

[^3]: Liang Wenfeng, CEO of DeepSeek.

Better check the [Tech & Copyright](https://www.ethan929.com/info) page~

---

## The fun (and weird) pitfalls

I hit a ton of pitfalls building this site... it nearly did me in (not really bruh

### The big-text design on the [Charlie page](https://www.ethan929.com/en-US/charlie)

![Placeholder](/images/2026-08-05-charlie-en.webp)
*I still maintain this was a stroke of genius...*

I must have spent a good half a day debugging this big text on and off. I wanted the "text embedded in the photo + white inner stroke" effect. At first I used `text-stroke` for the outline, but it turned out that only does a centered stroke — and since I was using a variable font, every single stroke of every glyph got outlined (OH NO! I'M ANGRY!!!). I asked every AI I could think of, went around in circles, and finally switched to SVG: first "erode" the glyph's alpha inward by 1px, then subtract the eroded shape from the original — leaving only a clean white line hugging the inner edge of the glyph, with adjustable thickness😋

Genius!

### Chinese has no real italics

So, Chinese doesn't have **real** italics, so for Chinese italics I use a serif (Song-style) font instead, paired with a serif italic. Honestly that's not bad... way better than fake-oblique italics!! (English, of course, gets real italics.)

Why Song-style, you ask? A wild accidental discovery (bro, my attention span is insane): in UN documents, Chinese body text is typeset in Song-style, matching the upright serif of English; and where English uses italic serif, the Chinese UN documents use Kai-style. But Kai looks terrible👎👎 on the web, and the Kai fonts on Google Fonts are hit-or-miss and don't match our beloved Source Han family — so I'd rather use *Source Han Serif*~

### Pagefind's Chinese support sucks!

The on-site search uses Pagefind, but by default it tokenizes by English words and basically can't handle Chinese — God knows how it splits the text, so you might search a keyword and find absolutely nothing. For example, searching <mark>阿拉</mark> would actually surface <mark>阿拉</mark>伯 (Arab), but searching 阿拉伯 itself would come up empty; searching <mark>中</mark>国 (China) would return <mark>中</mark>日文 (Chinese & Japanese), and happened to drag 一<mark>中</mark> (No.1 High School) along for the ride, but never <mark>中国</mark> itself.

After a lot of thinking, DeepSeek came up with a hack: before indexing, insert a zero-width space between every two CJK characters to trick it into treating each character as its own token, and on the search side auto-convert queries into exact phrases — problem solved!

That DeepSeek, it's a sly one.

---

## This site exists because of you

So, not bad, right?

I'm pretty satisfied with it myself~ There'll probably still be small updates down the road, though.

And thanks to all of you for giving me the chance to share my thoughts on this site!!

Love you all!!

