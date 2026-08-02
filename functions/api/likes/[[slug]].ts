/// <reference types="@cloudflare/workers-types" />

/**
 * 点赞 API（Cloudflare Pages Functions + KV）
 *
 * - GET  /api/likes/<slug>   → { slug, count, liked }  读取点赞数 + 当前访客是否已赞
 * - POST /api/likes/<slug>   → 切换（点赞/取消），返回 { slug, count, liked }
 *
 * 访客标识：HttpOnly cookie `likes_visitor`（首次请求自动种下，1 年有效）
 * KV 结构：
 *   likes:<slug>             → 点赞总数
 *   liked:<visitorId>:<slug> → "1"（该访客已赞）
 */

interface Env {
  LIKES: KVNamespace;
}

const VISITOR_COOKIE = 'likes_visitor';

function getSlug(params: Record<string, string | string[]>): string {
  const raw = params.slug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug) return 'unknown';
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

/** KV key 安全化：仅保留 URL 友好字符，避免特殊字符/超长 key */
function sanitizeKey(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

/** 读取或创建访客 ID（种 cookie） */
async function getVisitorId(request: Request, headers: Headers): Promise<string> {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]+)`));
  if (m && m[1]) return m[1];
  const id = crypto.randomUUID();
  headers.append(
    'Set-Cookie',
    `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
  );
  return id;
}

function json(data: unknown, headers: Headers): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { headers: h });
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const slug = sanitizeKey(getSlug(params));
  const headers = new Headers();
  const visitorId = await getVisitorId(request, headers);

  const count = Number((await env.LIKES.get(`likes:${slug}`)) || 0);
  const liked = (await env.LIKES.get(`liked:${visitorId}:${slug}`)) === '1';

  return json({ slug, count, liked }, headers);
};

export const onRequestPost: PagesFunction<Env> = async ({ params, env, request }) => {
  const slug = sanitizeKey(getSlug(params));
  const headers = new Headers();
  const visitorId = await getVisitorId(request, headers);

  const likedKey = `liked:${visitorId}:${slug}`;
  const countKey = `likes:${slug}`;

  const wasLiked = (await env.LIKES.get(likedKey)) === '1';
  const current = Number((await env.LIKES.get(countKey)) || 0);

  let count: number;
  let liked: boolean;
  if (wasLiked) {
    // 取消点赞
    count = Math.max(0, current - 1);
    await env.LIKES.delete(likedKey);
    liked = false;
  } else {
    // 点赞
    count = current + 1;
    await env.LIKES.put(likedKey, '1');
    liked = true;
  }
  await env.LIKES.put(countKey, String(count));

  return json({ slug, count, liked }, headers);
};
