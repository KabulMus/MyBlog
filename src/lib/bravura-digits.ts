/**
 * Bravura **雕刻数字**（SMuFL 的 `timeSig0`–`timeSig9`，U+E080–E089）排版助手。
 *
 * 为什么用它：这套字形是专为拍号画的数字，笔画是雕刻风格、**骑在基线上**（asc≈desc），
 * 简谱的拍号 / 速度数字、ABC 的速度数字都统一用它（用户要求，视觉上与谱面一致）。
 *
 * ⚠️⚠️ **所有度量都用常量，不在渲染时用 canvas 量**（血的教训）：
 *   - 字体没就绪时 canvas 会**静默落到兜底字体**（实测 serif 在 40px 下 asc+desc = 41 而不是 20）→ 算出荒唐字号；
 *   - simple-notation **每次渲染都会往 SVG 里注入一个新的 @font-face**，注入瞬间它是 loading →
 *     `document.fonts.check()` 与 canvas 度量**在渲染过程中都会瞬时用不上字形**（同一帧里前 false 后 true）；
 *   - 组合起来的结果：数字被排成 13.7px、或者一直退回正文数字（实测反复折腾了好几轮）。
 *   而这套字形的尺寸/墨迹/字宽本来就是设计死的（40px 时墨迹高 20、advance 17.4～18.7），写成常量反而**完全确定**；
 *   字形本身带 `font-display: block`（见 main.css 里 `Bravura-Digits` 的 @font-face），
 *   字体没就绪时先不画、就绪后自动出现 —— **不需要为了「画出来」而重排**。
 *
 * ⚠️ 族名故意叫 `Bravura-Digits`（不是 `Bravura`）：与库自己注入的那份彻底解耦；
 *   且**名字里不能有空格**（带空格的名字写进 `font-family` 属性时不合法，整个声明会被丢掉 → 字形不生效）。
 * ⚠️ 子集字体 `public/fonts/Bravura-Symbols.woff2` 的码位在 `scripts/build-bravura-font.mjs` 里手动列
 *   （②b 段，U+E080–E089）—— 库自己不会引用这些码位，升级库后重跑脚本时别丢。
 */

/** 字形族名（见上：不能有空格，也不跟库撞名） */
export const BRAVURA_DIGITS_FAMILY = 'Bravura-Digits';

/** 字号 = 正文字号 × 该系数（Bravura 拍号数字墨迹高 ≈0.5em、正文衬线数字 ≈0.7em → 16⇒22.4、20⇒28） */
export const BRAVURA_DIGIT_SCALE = 1.4;

/** 单个字形墨迹在基线上/下各占字号的多少（骑在基线上，asc ≈ desc ≈ 0.25em），仅当数字表里查不到时的兑底 */
export const BRAVURA_DIGIT_INK = 0.25;

/**
 * **逐字真实字宽**（em，`timeSig0`–`timeSig9`）：实测自 Bravura-Digits 100px。
 * ⚠️ 必须逐字，不能取统一字宽：统一的话「1」（0.334em）这种窄字后面会多出一块空白，
 *    多位数如「12」「10」看着就是「1 空一格 2」（用户实测否掉过）。
 */
const DIGIT_ADVANCE = [0.47, 0.334, 0.446, 0.421, 0.47, 0.403, 0.434, 0.441, 0.436, 0.434];

/** 逐字墨迹 [基线上方 asc, 下方 desc]（em）—— 这套字形骑在基线上，两者都 ≈0.25～0.26 */
const DIGIT_INK: [number, number][] = [
	[0.26, 0.25],
	[0.26, 0.25],
	[0.26, 0.26],
	[0.25, 0.26],
	[0.26, 0.25],
	[0.25, 0.26],
	[0.26, 0.25],
	[0.25, 0.25],
	[0.26, 0.26],
	[0.26, 0.25],
];

/** 单位（em），仅当数字表里查不到时的兑底 */
export const BRAVURA_DIGIT_ADVANCE = 0.45;

/** 相邻字形之间额外加减的间距（负 = 收紧；多位数拍号 12/8、速度 120 等） */
export const BRAVURA_DIGIT_TRACKING = 0;

export interface BravuraDigitMetrics {
	/** 整组最上 / 最下的墨迹（相对基线） */
	asc: number;
	desc: number;
	/** 整组总宽（含字距调整） */
	total: number;
}

/** 字号：简谱信息区传 16、ABC 速度行传各自的 font-size */
export function bravuraDigitSize(fontSize: number): number {
	return fontSize * BRAVURA_DIGIT_SCALE;
}

/** 按常量表算出整组数字的墨迹与总宽（不依赖字体是否就绪） */
export function bravuraDigitMetrics(digits: string, size: number): BravuraDigitMetrics {
	const chars = Array.from(digits);
	let total = 0;
	let asc = 0;
	let desc = 0;
	chars.forEach((c, i) => {
		const d = Number(c);
		total += size * (DIGIT_ADVANCE[d] ?? BRAVURA_DIGIT_ADVANCE);
		if (i < chars.length - 1) total += BRAVURA_DIGIT_TRACKING;
		const ink = DIGIT_INK[d] ?? [BRAVURA_DIGIT_INK, BRAVURA_DIGIT_INK];
		asc = Math.max(asc, size * ink[0]);
		desc = Math.max(desc, size * ink[1]);
	});
	return { asc, desc, total };
}

/**
 * 用 Bravura 雕刻数字画一串数字（每字一个 tspan）。
 *
 * ⚠️ **多位数必须每字一个 tspan**：`0xE080 + Number("12")` 会算出 `timeSigPlus` ✗（`12` = timeSig1 + timeSig2 相邻排）。
 *
 * @param parent   目标元素（`<text>` / `<tspan>`）
 * @param digits   纯数字串（调用方用正则保证）
 * @param size     Bravura 字号（`bravuraDigitSize()` 反推）
 * @param x        起点 x；`centre = true` 时表示「以 x 为整组中心」；**null = 不写 x**（顺着前面的字自然排）
 * @param centre   是否以 x 为中心（仅 `x !== null` 时有意义）
 * @param baseline `relative=false` → 绝对 `y`；`true` → 只给第一个字写 `dy`
 *                 （⚠️ 行后面还会被改 `dy` 时**必须**用相对值，否则数字会留在原地）
 * @returns 整组的墨迹与总宽
 */
export function drawBravuraDigits(
	parent: Element,
	digits: string,
	size: number,
	x: number | null,
	centre: boolean,
	baseline: number,
	relative = false
): BravuraDigitMetrics {
	const m = bravuraDigitMetrics(digits, size);
	let left = x === null ? 0 : centre ? x - m.total / 2 : x;
	Array.from(digits).forEach((ch, i) => {
		const s = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
		// ⚠️ 逐字给了绝对 x 时必须 start：父级 anchor=middle 会让每个字各自居中
		s.setAttribute('text-anchor', 'start');
		if (x !== null) s.setAttribute('x', String(left));
		if (relative) {
			if (i === 0) s.setAttribute('dy', String(baseline));
		} else {
			s.setAttribute('y', String(baseline));
		}
		s.setAttribute('font-family', BRAVURA_DIGITS_FAMILY);
		s.setAttribute('font-size', String(size));
		s.textContent = String.fromCodePoint(0xe080 + Number(ch));
		parent.appendChild(s);
		left += size * (DIGIT_ADVANCE[Number(ch)] ?? BRAVURA_DIGIT_ADVANCE) + BRAVURA_DIGIT_TRACKING;
	});
	return m;
}

/**
 * 等 Bravura **真正可用**后回调一次（只有「按字形宽度定位」的变音记号需要；数字本身不需要，见文件头）。
 *
 * ⚠️ 不要只写 `document.fonts.load(...).then(...)`：实测它有时会在字形真正可用**之前**就 resolve。
 * ⚠️ 也不要用 `requestAnimationFrame` 做重试：**后台/不可见的标签页里 rAF 完全不触发**（实测回调从未执行）。
 *    所以用 `setTimeout` 轮询（后台会被降频但仍然会跑）+ 封顶次数。
 */
export function whenBravuraReady(cb: () => void): void {
	const probe = '\uE080';
	const ready = () => document.fonts.check(`20px ${BRAVURA_DIGITS_FAMILY}`, probe);
	try {
		document.fonts.load(`20px ${BRAVURA_DIGITS_FAMILY}`, probe).catch(() => {
			/* 加载失败就靠下面的轮询收尾 */
		});
	} catch {
		/* 环境不支持就靠下面的轮询 */
	}
	let tries = 0;
	const poll = () => {
		if (ready()) {
			cb();
			return;
		}
		if (++tries < 12) window.setTimeout(poll, 250); // 最多 ~3s
	};
	poll();
}
