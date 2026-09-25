// 图片上传（编辑器里三处共用：正文粘贴 / 拖入、图片卡片里的「上传」、frontmatter 那行「题图」）
//
// 浏览器这边先转 webp：`canvas.toBlob('image/webp', 0.9)` 零依赖，不用装 sharp；
//   ⚠️ 唯独 GIF 不转 —— canvas 只能画第一帧，转完动图就成静图了。
// 🚨 转不了（浏览器不会编 / 文件本身解不开）就原样传，中间件按扩展名放行常见的图片格式。
// 落盘位置与重名处理都在中间件那侧（`scripts/lib/post-io.mjs` 的 saveImage ⇒ `public/images/`，重名补 -1）。

const API = '/__editor/api';

/** 卡片里那枚上传图标（跟 frontmatter「题图」那枚同一个图形：托盘 + 上箭头） */
export const UPLOAD_ICON =
	'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 24.0083V42H42V24" /><path d="M33 15L24 6L15 15" /><path d="M23.9917 32V6" /></svg>';

/**
 * 把文件转成要上传的二进制。返回 `{ blob, ext }`。
 * 顺带把超宽图缩到 ≤1600px（题图/正文都用不上更宽的），质量 0.9。
 */
export async function fileToWebp(file) {
	if (file.type === 'image/gif') return { blob: file, ext: 'gif' };
	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, 1600 / bitmap.width);
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('拿不到 2d context');
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.9));
		if (!blob || blob.type !== 'image/webp') throw new Error('这个浏览器不会编 webp');
		return { blob, ext: 'webp' };
	} catch {
		// 转不了就原样传，中间件按扩展名放行常见的图片格式
		const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
		return { blob: file, ext };
	}
}

/**
 * 上传一张图，返回中间件给的 `{ file, url, bytes }`。
 * `name` 只是**文件名建议**（真扩展名以转换结果为准）：中间件会清掉路径分隔符之类的字符，
 * 重名自动补 `-1`、`-2`。不传就用图片自己的文件名。
 */
export async function uploadImage(file, name) {
	const { blob, ext } = await fileToWebp(file);
	const base = String(name || file.name || 'image')
		.replace(/^.*[\\/]/, '')
		.replace(/\.[a-z0-9]+$/i, '')
		.trim();
	const res = await fetch(`${API}/image?name=${encodeURIComponent(`${base || 'image'}.${ext}`)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/octet-stream' },
		body: blob,
	});
	const out = await res.json();
	if (!res.ok || !out.url) throw new Error(out.error ?? 'HTTP ' + res.status);
	return out;
}
