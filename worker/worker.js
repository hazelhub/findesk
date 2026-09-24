/**
 * FinDesk 편집용 후보 기사 서버 (Cloudflare Worker, 단일 파일)
 *
 * 운영자 한 사람이 브리핑을 쓰기 위해 언론사 RSS를 "개인적으로" 읽어보는 용도입니다.
 *  - 편집 토큰(EDITOR_TOKEN)이 있어야만 응답합니다. 공개 사이트 방문자에게는 기사 원본을 제공하지 않습니다.
 *  - 기사를 저장하지 않습니다 (언론사 서버 응답을 2분간 캐시하는 것 외에는 보관하지 않음).
 *
 *  GET /candidates   (헤더 Authorization: Bearer <EDITOR_TOKEN>)  → 언론사 RSS 원문 묶음
 *  GET /health       → 설정 상태
 *
 * 설정: Cloudflare 대시보드 → 이 Worker → Settings → Variables and Secrets
 *  - EDITOR_TOKEN (Secret): 편집기에 입력할 긴 비밀 문자열
 *  - ALLOWED_ORIGIN (Text, 선택): 편집기 주소의 origin (예: https://아이디.github.io)
 */

// 개인 열람용 RSS 목록. 실패한 주소는 편집기에서 '실패'로 표시되며 나머지는 정상 동작합니다.
const RSS = [
  { key: "hk_fin", url: "https://www.hankyung.com/feed/finance", source: "한국경제", sec: "market" },
  { key: "hk_eco", url: "https://www.hankyung.com/feed/economy", source: "한국경제", sec: "macro" },
  { key: "hk_int", url: "https://www.hankyung.com/feed/international", source: "한국경제", sec: "macro" },
  { key: "se_mkt", url: "https://www.sedaily.com/rss/market", source: "서울경제", sec: "market" },
  { key: "se_fin", url: "https://www.sedaily.com/rss/finance", source: "서울경제", sec: "macro" },
  { key: "se_eco", url: "https://www.sedaily.com/rss/economy", source: "서울경제", sec: "macro" },
  { key: "se_int", url: "https://www.sedaily.com/rss/international", source: "서울경제", sec: "macro" },
  { key: "mk_stock", url: "https://www.mk.co.kr/rss/50200011/", source: "매일경제", sec: "market" },
  { key: "mk_eco", url: "https://www.mk.co.kr/rss/30100041/", source: "매일경제", sec: "macro" },
  { key: "yna_eco", url: "https://www.yna.co.kr/rss/economy.xml", source: "연합뉴스", sec: "macro" },
  { key: "yna_mkt", url: "https://www.yna.co.kr/rss/market.xml", source: "연합뉴스", sec: "market" },
  { key: "ed_all", url: "http://rss.edaily.co.kr/edaily_news.xml", source: "이데일리", sec: "market" },
  { key: "mt_all", url: "http://rss.mt.co.kr/mt_news.xml", source: "머니투데이", sec: "market" },
  { key: "fsc_press", url: "http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111", source: "금융위원회", sec: "policy", tier: 4 },
];

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
  };
}
function reply(body, env, status) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(env) },
  });
}
function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  return env.EDITOR_TOKEN && h === "Bearer " + env.EDITOR_TOKEN;
}
async function fetchFeed(f) {
  const r = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (FinDesk personal reader)" }, cf: { cacheTtl: 120 } });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/") {
      return reply({ ok: true, token_set: !!env.EDITOR_TOKEN, feeds: RSS.length }, env);
    }
    if (url.pathname === "/candidates") {
      if (!authorized(request, env)) return reply({ error: "unauthorized" }, env, 401);
      const res = await Promise.all(RSS.map((f) => fetchFeed(f).then((t) => [f.key, t, null]).catch((e) => [f.key, null, e.message])));
      // 파싱은 편집기(브라우저)에서 합니다. 여기서는 CPU를 거의 쓰지 않도록 이어붙이기만 합니다.
      const ok = res.filter((x) => x[1] !== null);
      const status = {}; res.forEach((x) => { status[x[0]] = x[2] ? "실패(" + x[2] + ")" : "정상"; });
      const body = '{"fetched_at":' + JSON.stringify(new Date().toISOString()) +
        ',"meta":' + JSON.stringify({ rss: RSS }) + ',"status":' + JSON.stringify(status) +
        ',"rss":{' + ok.map((x) => JSON.stringify(x[0]) + ":" + JSON.stringify(x[1])).join(",") + "}}";
      return reply(body, env);
    }
    return reply({ error: "not found" }, env, 404);
  },
};
