/**
 * 吐槽信息流（/rants）的瀑布布局
 *
 * 要的效果：两列，但一篇排完之后下一篇就紧贴着跟上来 —— 不能像普通网格那样按行对齐，
 * 否则同一行里另一张卡太高，短的那列下面就空一大块。
 *
 * 做法：列数按容器宽度算，每张卡量出自然高度后**按顺序塞进当前最矮的那一列**（并排的两张都在顶部，往下各自续）。
 * ⚠️ 用绝对定位而不是网格行 span：行 span 只能按 grid-auto-rows 的粒度取整，纵向间距会比横向大几像素。
 *    这里直接用 left/top/width 定位，纵向间距就精确等于横向间距。
 * ⚠️ 没有这段 JS 也不会坏：CSS 那边本来就是两列网格，只是会按行对齐（下面留白）。
 */
(function () {
    'use strict';

    const grid = document.querySelector('.rants-grid');
    if (!grid) return;
    const cards = Array.prototype.slice.call(grid.querySelectorAll('.rant-card'));
    if (!cards.length) return;

    const MIN_COL = 320; // 单列最小宽，跟 CSS 里 minmax 的 320px 对齐
    const MAX_COL = 3;

    let lastWidth = -1;
    let timer = 0;

    function readGap() {
        const g = parseFloat(getComputedStyle(grid).columnGap);
        return isNaN(g) ? 16 : g;
    }

    function layout() {
        const gap = readGap();
        const width = grid.clientWidth;
        if (!width) return;
        lastWidth = width;

        const cols = Math.max(1, Math.min(MAX_COL, Math.floor((width + gap) / (MIN_COL + gap))));
        const colW = (width - gap * (cols - 1)) / cols;

        // ⚠️ 不要「先脱流复位再量」：卡片本来就是内容驱动高度，脱流会让它当场跳一下
        //    （重排时会闪，自动化点按也会因为「元素一直在动」而点不中）。
        //    顺序：先定宽（绝对定位）→ 一次性量高 → 再摆位，全程不脱离定位状态。
        cards.forEach((card) => {
            card.style.position = 'absolute';
            card.style.width = colW + 'px';
        });
        const heights = cards.map((card) => card.getBoundingClientRect().height);
        // 记下这一轮的高度，供下面的 ResizeObserver 比对（卡片变高就得重排）
        heights.forEach((h, i) => {
            cards[i].dataset.rantH = String(Math.round(h));
        });

        // 每一列已经堆到的高度
        const used = [];
        for (let c = 0; c < cols; c++) used.push(0);

        cards.forEach((card, i) => {
            let col = 0;
            for (let c = 1; c < cols; c++) {
                if (used[c] < used[col] - 0.5) col = c;   // 挑当前最矮的那一列
            }
            card.style.left = col * (colW + gap) + 'px';
            card.style.top = used[col] + 'px';
            used[col] += heights[i] + gap;
        });

        // 容器自己不长高（卡片已经脱流）⇒ 手动给网格撑出总高度
        grid.style.height = Math.max(0, Math.max.apply(null, used) - gap) + 'px';
    }

    // ⚠️ 用 setTimeout 而不是 requestAnimationFrame：后台标签页里 rAF 根本不触发，
    //    而简谱/五线谱是在加载后才渲染的 —— 那时页可能已经切到后台，用 rAF 就会一直用旧高度摆位。
    function schedule() {
        if (timer) return;
        timer = setTimeout(() => {
            timer = 0;
            layout();
        }, 60);
    }

    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    window.addEventListener('load', schedule);
    window.addEventListener('resize', schedule);
    if ('ResizeObserver' in window) {
        // ⚠️ 只在**宽度**变了才重排：重排本身会改网格高度，不然会自己触发自己
        new ResizeObserver(() => {
            if (grid.clientWidth !== lastWidth) schedule();
        }).observe(grid);
        // ⚠️ 卡片高度也会变：简谱/五线谱是加载后才渲染的（一张卡能长 200px），字体就绪也会撑一点。
        //    高度变了就重量，不然摆位是按旧高度算的，会重叠。
        const cardObserver = new ResizeObserver(() => {
            if (cards.some((card) => Math.abs(card.getBoundingClientRect().height - Number(card.dataset.rantH || 0)) > 1)) {
                schedule();
            }
        });
        cards.forEach((card) => cardObserver.observe(card));
    }
})();
