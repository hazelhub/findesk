/*
 * FinDesk 뉴스 선별 엔진 (브라우저에서 실행)
 *
 * 원본(네이버 뉴스 API·RSS) → ① 신뢰 매체만 남기기 → ② 세션 시간창으로 자르기 → ③ 광고·포토·칼럼 제거
 * → ④ 같은 사건 기사 묶기 → ⑤ 중요도 점수 → ⑥ 섹션·헤드라인·핫 종목·키워드 산출
 *
 * 점수 기준은 SCORE 객체에 모여 있어 운영자가 가중치를 쉽게 조정할 수 있습니다.
 */
(function (global) {
  "use strict";

  var HOUR = 3600e3, DAY = 86400e3;

  /* ── 매체 등급 ─────────────────────────────────────
     4 공식 발표(정부·중앙은행·거래소) / 3 통신사 / 2 주요 경제지·종합지·전문지
     이 목록에 없는 매체는 표시하지 않습니다(신뢰성 우선). */
  var SOURCES = {
    "korea.kr": ["정책브리핑", 4], "fsc.go.kr": ["금융위원회", 4], "fss.or.kr": ["금융감독원", 4], "bok.or.kr": ["한국은행", 4],
    "krx.co.kr": ["한국거래소", 4], "moef.go.kr": ["기획재정부", 4],
    "yna.co.kr": ["연합뉴스", 3], "einfomax.co.kr": ["연합인포맥스", 3], "news1.kr": ["뉴스1", 3], "newsis.com": ["뉴시스", 3],
    "hankyung.com": ["한국경제", 2], "mk.co.kr": ["매일경제", 2], "sedaily.com": ["서울경제", 2], "mt.co.kr": ["머니투데이", 2],
    "edaily.co.kr": ["이데일리", 2], "fnnews.com": ["파이낸셜뉴스", 2], "heraldcorp.com": ["헤럴드경제", 2], "asiae.co.kr": ["아시아경제", 2],
    "chosun.com": ["조선일보·조선비즈", 2], "joongang.co.kr": ["중앙일보", 2], "donga.com": ["동아일보", 2], "hani.co.kr": ["한겨레", 2],
    "khan.co.kr": ["경향신문", 2], "hankookilbo.com": ["한국일보", 2], "seoul.co.kr": ["서울신문", 2], "ajunews.com": ["아주경제", 2],
    "newspim.com": ["뉴스핌", 2], "bizwatch.co.kr": ["비즈니스워치", 2], "thebell.co.kr": ["더벨", 2], "dealsite.co.kr": ["딜사이트", 2],
    "investchosun.com": ["인베스트조선", 2], "etnews.com": ["전자신문", 2], "zdnet.co.kr": ["지디넷코리아", 2], "ddaily.co.kr": ["디지털데일리", 2],
    "wowtv.co.kr": ["한국경제TV", 2], "sentv.co.kr": ["서울경제TV", 2], "mbn.co.kr": ["MBN", 2], "ytn.co.kr": ["YTN", 2],
    "kbs.co.kr": ["KBS", 2], "sbs.co.kr": ["SBS", 2], "imbc.com": ["MBC", 2], "dailian.co.kr": ["데일리안", 2],
    "kukinews.com": ["쿠키뉴스", 2], "decenter.kr": ["디센터", 2], "blockmedia.co.kr": ["블록미디어", 2], "businesspost.co.kr": ["비즈니스포스트", 2],
    "infostockdaily.co.kr": ["인포스탁데일리", 2], "the-stock.kr": ["더스탁", 2], "yonhapnews.co.kr": ["연합뉴스", 3],
    "etoday.co.kr": ["이투데이", 2], "heraldm.com": ["헤럴드경제", 2]
  };

  /* ── 제외 규칙: 광고·홍보, 포토, 인사·부고, 칼럼·사설, 운세, 게시판 ── */
  var JUNK = /\[(포토|사진|인사|부고|알림|광고|AD|PR|카드뉴스|영상|게시판|오늘의 ?운세|운세|날씨|사설|칼럼|기고|시론|기자수첩|데스크|데스크칼럼|오피니언|이벤트|신간|책|만평|퀴즈|알립니다)\]|포토뉴스|\bAD\b|부고|오늘의 운세|궁합|로또|\?{2,}/;
  var SPECULATIVE = /(할까\?|일까\?|인가\?|될까\?|볼까\?)$/;

  /* ── 중요도 점수 기준 ───────────────────────────── */
  var SCORE = {
    perOutlet: 3, outletCap: 8,               // 같은 사건을 보도한 매체 수 × 3 (최대 8곳)
    tier: { 4: 8, 3: 3, 2: 1 },               // 가장 높은 매체 등급 가점
    recency: [[1, 3], [3, 2], [6, 1]],        // 최근 1시간 +3, 3시간 +2, 6시간 +1
    breaking: 2, exclusive: 2,                // 속보·단독
    sessionFocus: 4,                          // 현재 세션 핵심 검색어(예: 아침엔 '뉴욕증시 마감')
    keywords: [                               // 시장을 움직이는 키워드
      [/기준금리|금리 (인하|인상|동결)|금통위/, 5],
      [/FOMC|연준|파월|Fed/, 4],
      [/실적|영업이익|순이익|매출|어닝|가이던스/, 4],
      [/목표주가|투자의견|상향|하향|컨센서스|리포트/, 3],
      [/신용등급|강등|등급 (상향|하향)|디폴트|부도/, 3],
      [/수요예측|상장|IPO|공모|청약/, 3],
      [/유상증자|무상증자|M&A|인수|합병|매각|지분/, 3],
      [/규제|제재|과징금|검사|금융위|금감원|법안|시행령/, 3],
      [/환율|원·달러|원\/달러|달러 강세|엔화|위안/, 3],
      [/사상 최고|최고치|최저치|급등|급락|폭등|폭락|상한가|하한가|서킷|사이드카/, 3],
      [/외국인|기관|순매수|순매도|공매도/, 2],
      [/CPI|물가|고용|PCE|GDP|수출/, 2],
      [/관세|전쟁|제재|지정학|유가/, 2]
    ]
  };
  var BADGES = [
    [/실적|영업이익|순이익|어닝|가이던스/, "실적"],
    [/목표주가|투자의견|리포트|컨센서스|전망/, "전망·리포트"],
    [/공시/, "공시"],
    [/급등|급락|폭등|폭락|상한가|하한가|사상 최고|최고치/, "급등락"],
    [/수요예측|상장|IPO|공모|청약/, "IPO"]
  ];

  var STOP = ("지난 오늘 올해 이번 관련 대비 대한 위해 통해 따른 이후 이전 가운데 기자 속보 단독 종합 등 및 또 더 것 수 중 전 후 " +
    "증시 주가 시장 투자 기업 상승 하락 마감 개장 오전 오후 거래 종목 소폭 강보합 약보합 보합 기록 전망 발표 분석 가능성 우려 기대 " +
    "영향 확대 축소 전년 전월 전일 하루 이틀 만에 만 억 조 원 달러 포인트 퍼센트 증가 감소 뉴스 오늘의 특징주 브리핑 " +
    "강세 약세 사상 결정 시사 경신 발표해 잇따라 줄줄이 본격화 속도 논의").split(" ");
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });
  var JOSA = /(에서는|으로는|에게서|에서|으로|에게|까지|부터|보다|처럼|이며|이고|하고|했다|한다|하는|했던|된다|되는|됐다|이다|은|는|이|가|을|를|의|에|로|와|과|도|만|요)$/;

  /* ── 유틸 ─────────────────────────────────────── */
  function stripTags(s) {
    var t = String(s || "").replace(/<[^>]+>/g, "");
    t = t.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&middot;/g, "·").replace(/&amp;/g, "&");
    return t.replace(/\s+/g, " ").trim();
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\.|^m\./, ""); } catch (e) { return ""; } }
  function sourceOf(host) {
    if (SOURCES[host]) return SOURCES[host];
    for (var d in SOURCES) if (host === d || host.slice(-(d.length + 1)) === "." + d) return SOURCES[d];
    return null;
  }
  function tokens(title) {
    var t = title.replace(/\[[^\]]*\]|\([^)]*\)|<[^>]*>/g, " ").replace(/[“”"'‘’…·,.!?<>~:;|/\\=+%↑↓▲▼→…\-]/g, " ");
    var out = {}, n = 0;
    t.split(/\s+/).forEach(function (w) {
      if (!w) return;
      if (w.length > 2) w = w.replace(JOSA, "");
      if (ALIAS[w]) w = ALIAS[w];
      if (w.length < 2 || STOPSET[w] || /^\d+([.,]\d+)?$/.test(w)) return;
      if (!out[w]) { out[w] = 1; n++; }
    });
    out.__n = n;
    return out;
  }
  function overlap(a, b) {
    var inter = 0, long = false;
    for (var k in a) if (k !== "__n" && b[k]) { inter++; if (k.length >= 3) long = true; }
    var m = Math.min(a.__n, b.__n) || 1, u = a.__n + b.__n - inter || 1;
    return { inter: inter, min: inter / m, jac: inter / u, long: long };
  }
  // 같은 대상을 다르게 부르는 표현 통일 (묶기 정확도용)
  var ALIAS = { "한국은행": "한은", "금통위": "한은", "금융통화위원회": "한은", "연방준비제도": "연준", "Fed": "연준", "FOMC": "연준",
    "금융위원회": "금융위", "금융감독원": "금감원", "뉴욕증시": "뉴욕", "미국증시": "뉴욕", "美증시": "뉴욕", "원·달러": "환율", "원달러": "환율",
    "하이닉스": "SK하이닉스", "삼전": "삼성전자" };

  /* ── 한국시간 도우미 ─────────────────────────────── */
  function kst(ms) { return new Date(ms + 9 * HOUR); }            // UTC 필드로 KST 읽기
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function atKst(ms, h, m) { var d = kst(ms); d.setUTCHours(h, m, 0, 0); return d.getTime() - 9 * HOUR; }
  function isTradingDay(ms, holidays) { var d = kst(ms), w = d.getUTCDay(); return w !== 0 && w !== 6 && (holidays || []).indexOf(ymd(d)) < 0; }
  function prevTradingClose(ms, holidays) {
    var t = atKst(ms, 15, 0);
    do { t -= DAY; } while (!isTradingDay(t, holidays));
    return t;
  }

  var SESSIONS = [
    { id: "morning", label: "모닝 브리핑", range: "05:00–08:00", desc: "간밤 미국·유럽 증시 마감 + 전일 국내 증시 마감 이후 뉴스" },
    { id: "pre", label: "개장 전", range: "08:00–09:00", desc: "넥스트레이드 프리마켓(08:00~08:50)·장 시작 전 동시호가·환율 개장" },
    { id: "intraday", label: "장중", range: "09:00–15:30", desc: "개장 시황·특징주·수급·장중 속보" },
    { id: "close", label: "국내 마감", range: "15:30–20:00", desc: "마감 시황·수급·장 마감 후 공시·실적·애프터마켓" },
    { id: "global", label: "글로벌", range: "20:00–05:00", desc: "유럽 증시·미국 개장 전후·지표 발표" }
  ];

  /** 현재 세션과 뉴스 시간창 */
  function currentSession(nowMs, holidays) {
    var d = kst(nowMs), min = d.getUTCHours() * 60 + d.getUTCMinutes();
    var trading = isTradingDay(nowMs, holidays);
    var id = min >= 300 && min < 480 ? "morning" : min >= 480 && min < 540 ? "pre" : min >= 540 && min < 930 ? "intraday" : min >= 930 && min < 1200 ? "close" : "global";
    var start;
    if (!trading && id !== "global") {
      id = "holiday";
      start = prevTradingClose(nowMs + DAY, holidays); // 가장 최근 거래일 마감 이후
      if (nowMs - start > 3 * DAY) start = nowMs - DAY;
    } else if (id === "morning" || id === "pre") start = prevTradingClose(nowMs, holidays);
    else if (id === "intraday" || id === "close") start = atKst(nowMs, 8, 0);
    else start = min >= 1200 ? atKst(nowMs, 15, 30) : atKst(nowMs - DAY, 15, 30);
    var info = SESSIONS.filter(function (s) { return s.id === id; })[0] ||
      { id: "holiday", label: "휴장일", range: "", desc: "국내 증시 휴장 — 최근 거래일 마감 이후 뉴스와 해외 흐름" };
    // 섹션 뉴스: 세션 시간창과 같되 최소 12시간은 보여줌
    var sectionStart = Math.min(start, nowMs - 12 * HOUR);
    return { id: info.id, label: info.label, range: info.range, desc: info.desc, start: start, sectionStart: sectionStart };
  }

  /* ── 제목 키워드로 섹션·세션 분류 (RSS 원본용) ───────── */
  var SEC_RULES = [
    ["commodity", /유가|원유|WTI|브렌트|금값|금 가격|은값|구리|철강|철광석|리튬|니켈|알루미늄|원자재|LME|곡물|천연가스/],
    ["macro", /환율|원·달러|원\/달러|달러|엔화|위안|기준금리|금통위|한은|한국은행|연준|FOMC|파월|CPI|물가|고용|GDP|경상수지|수출|기재부|재정|ECB|BOJ|일본은행/],
    ["bond", /국고채|국채|회사채|채권|크레딧|신용등급|수요예측|CP|전단채|PF|유동화|스프레드/],
    ["crypto", /비트코인|이더리움|가상자산|암호화폐|코인|스테이블코인|STO|토큰증권|업비트|빗썸|리플|XRP/],
    ["policy", /금융위|금감원|금융감독원|금융위원회|금융당국|규제|제재|과징금|법안|시행령|감독|인가|공매도 제도/],
    ["market", /코스피|코스닥|증시|주가|특징주|상장|IPO|공모|외국인|기관|순매수|순매도|목표주가|실적|영업이익|뉴욕증시|나스닥|S&P|다우|ETF|넥스트레이드|프리마켓|시황/]
  ];
  var FOCUS_RULES = [
    ["morning", /뉴욕증시|뉴욕 증시|미 증시|나스닥|간밤|마감|장 마감/],
    ["pre", /프리마켓|넥스트레이드|개장 전|장 전|동시호가|출발|모닝/],
    ["intraday", /장중|특징주|오전|상승 중|하락 중|급등|급락/],
    ["close", /마감|종가|마감시황|장 마감|애프터마켓/],
    ["global", /유럽증시|뉴욕증시|나스닥 선물|선물|美|미국/]
  ];
  function classify(title, base) {
    var secs = [];
    SEC_RULES.forEach(function (r) { if (r[1].test(title)) secs.push(r[0]); });
    if (!secs.length && base) secs.push(base);
    var focus = [];
    FOCUS_RULES.forEach(function (r) { if (r[1].test(title)) focus.push(r[0]); });
    return { secs: secs, focus: focus };
  }
  function parseDate(s) {
    s = (s || "").trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +(m[6] || 0)); // 시간대 없는 표기는 한국시간으로 간주
    return Date.parse(s);
  }

  /* ── ① 원본 파싱 ─────────────────────────────────── */
  function parseRaw(raw) {
    var byUrl = {}, list = [];
    var meta = (raw && raw.meta) || {};
    var qmeta = {}; (meta.queries || []).forEach(function (q) { qmeta[q.key] = q; });
    var rmeta = {}; (meta.rss || []).forEach(function (r) { rmeta[r.key] = r; });
    function add(it) {
      var ex = byUrl[it.url];
      if (ex) {
        it.keys.forEach(function (k) { if (ex.keys.indexOf(k) < 0) ex.keys.push(k); });
        it.secs.forEach(function (k) { if (ex.secs.indexOf(k) < 0) ex.secs.push(k); });
        it.focus.forEach(function (k) { if (ex.focus.indexOf(k) < 0) ex.focus.push(k); });
        return;
      }
      byUrl[it.url] = it; list.push(it);
    }
    var naver = (raw && raw.naver) || {};
    Object.keys(naver).forEach(function (key) {
      var q = qmeta[key] || { sec: "market", focus: [] };
      var items = (naver[key] && naver[key].items) || [];
      items.forEach(function (x) {
        var url = x.originallink || x.link, host = hostOf(url), src = sourceOf(host);
        var time = Date.parse(x.pubDate);
        if (!src || !time) return;
        add({ title: stripTags(x.title), desc: stripTags(x.description), url: url, naverUrl: x.link, host: host, source: src[0], tier: src[1],
          time: time, keys: [key], secs: [q.sec], focus: (q.focus || []).slice() });
      });
    });
    var rss = (raw && raw.rss) || {};
    var parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;
    Object.keys(rss).forEach(function (key) {
      if (!parser) return;
      var r = rmeta[key] || { sec: "market", source: "" };
      var doc; try { doc = parser.parseFromString(rss[key], "text/xml"); } catch (e) { return; }
      Array.prototype.forEach.call(doc.getElementsByTagName("item"), function (n) {
        var get = function (t) { var e = n.getElementsByTagName(t)[0]; return e ? e.textContent : ""; };
        var url = get("link").trim(), host = hostOf(url), src = sourceOf(host);
        var time = parseDate(get("pubDate")) || parseDate(get("dc:date"));
        if (!url || !time) return;
        var title = stripTags(get("title")), cl = classify(title, r.sec);
        add({ title: title, desc: stripTags(get("description")).slice(0, 200), url: url, host: host,
          source: src ? src[0] : r.source, tier: src ? src[1] : (r.tier || 2), time: time, keys: [key], secs: cl.secs, focus: cl.focus });
      });
    });
    return list;
  }

  /* ── ④ 같은 사건 묶기 ───────────────────────────── */
  function cluster(items) {
    var sorted = items.slice().sort(function (a, b) { return b.time - a.time; });
    var groups = [];
    sorted.forEach(function (it) {
      it.tok = it.tok || tokens(it.title);
      var best = null, bestSim = 0;
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i], o = overlap(it.tok, g.tok);
        var same = (o.inter >= 3 && o.min >= 0.5) || o.jac >= 0.5 || (o.inter >= 2 && o.min >= 0.5 && o.long);
        if (same && o.min > bestSim) { best = g; bestSim = o.min; }
      }
      if (best) {
        best.items.push(it);
        if (best.items.length <= 3) for (var k in it.tok) if (k !== "__n" && !best.tok[k]) { best.tok[k] = 1; best.tok.__n++; }
      } else {
        var tk = {}; for (var k2 in it.tok) tk[k2] = it.tok[k2];
        groups.push({ items: [it], tok: tk });
      }
    });
    return groups;
  }

  /* ── ⑤ 점수 ──────────────────────────────────── */
  function scoreGroup(g, sessionId, nowMs) {
    var srcs = {}, maxTier = 0, secs = {}, focus = false, newest = 0, earliest = Infinity;
    g.items.forEach(function (it) {
      srcs[it.source] = 1; maxTier = Math.max(maxTier, it.tier);
      it.secs.forEach(function (s) { secs[s] = 1; });
      if (it.focus.indexOf(sessionId) >= 0) focus = true;
      newest = Math.max(newest, it.time); earliest = Math.min(earliest, it.time);
    });
    // 대표 기사: 가장 높은 등급 → 가장 먼저 보도
    var rep = g.items.slice().sort(function (a, b) { return (b.tier - a.tier) || (a.time - b.time); })[0];
    var outlets = Object.keys(srcs).length;
    var text = g.items.slice(0, 4).map(function (x) { return x.title; }).join(" ");
    var s = SCORE.perOutlet * Math.min(outlets, SCORE.outletCap) + (SCORE.tier[maxTier] || 0);
    var reasons = [];
    SCORE.keywords.forEach(function (k) { if (k[0].test(text)) s += k[1]; });
    var ageH = (nowMs - newest) / HOUR;
    for (var i = 0; i < SCORE.recency.length; i++) if (ageH <= SCORE.recency[i][0]) { s += SCORE.recency[i][1]; break; }
    var breaking = /\[속보\]|속보/.test(text), exclusive = /\[단독\]/.test(text);
    if (breaking) s += SCORE.breaking;
    if (exclusive) s += SCORE.exclusive;
    if (focus) s += SCORE.sessionFocus;
    var badges = [];
    if (maxTier === 4) badges.push({ t: "공식발표", k: "official" });
    if (outlets >= 3) badges.push({ t: outlets + "개 매체", k: "multi" });
    if (breaking) badges.push({ t: "속보", k: "breaking" });
    if (exclusive) badges.push({ t: "단독", k: "exclusive" });
    BADGES.forEach(function (b) { if (b[0].test(text) && badges.length < 4) badges.push({ t: b[1], k: "tag" }); });
    if (outlets >= 3) reasons.push(outlets + "개 매체가 동시에 보도");
    if (maxTier === 4) reasons.push("공식 발표");
    if (focus) reasons.push("이번 세션 핵심 이슈");
    return { id: rep.url, rep: rep, items: g.items, outlets: outlets, sources: Object.keys(srcs), secs: Object.keys(secs), score: s,
      badges: badges, reasons: reasons, newest: newest, earliest: earliest, tok: g.tok };
  }

  /* ── ⑥ 핫 종목·키워드 ───────────────────────────── */
  function hotStocks(groups, stocks) {
    var names = [];
    ((stocks && stocks.kr) || []).forEach(function (n) {
      if (!n) return;
      if (/^[A-Za-z]{1,2}$/.test(n)) return;                // LG·SK 같은 그룹명과 겹치는 짧은 영문명 제외
      if (n.length < 2) return;
      if (n.length === 2 && /[가-힣]/.test(n) && (stocks.short_ok || []).indexOf(n) < 0) return; // 일반 단어와 겹치는 두 글자명 제외
      names.push({ n: n, m: "KR" });
    });
    ((stocks && stocks.us) || []).forEach(function (n) { names.push({ n: n, m: "US" }); });
    names.sort(function (a, b) { return b.n.length - a.n.length; });
    var count = {};
    groups.forEach(function (g) {
      var text = g.items.slice(0, 5).map(function (x) { return x.title; }).join(" | ");
      var found = {};
      for (var i = 0; i < names.length; i++) {
        var nm = names[i].n;
        if (text.indexOf(nm) < 0) continue;
        // '메타버스'처럼 종목명 뒤에 다른 단어가 붙은 경우는 제외 (조사는 허용)
        var re = names[i].re || (names[i].re = new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:(?:은|는|이|가|을|를|의|에|와|과|도|로|만|측)?)(?![가-힣])"));
        if (!re.test(text)) continue;
        found[nm] = names[i].m; text = text.split(nm).join("\u0000");
      }
      Object.keys(found).forEach(function (nm) {
        var c = count[nm] || (count[nm] = { name: nm, market: found[nm], mentions: 0, groups: [] });
        c.mentions += g.outlets; c.groups.push(g);
      });
    });
    return Object.keys(count).map(function (k) { return count[k]; })
      .sort(function (a, b) { return (b.mentions - a.mentions) || (b.groups.length - a.groups.length); });
  }
  function keywords(groups, exclude) {
    var freq = {}, ex = {};
    (exclude || []).forEach(function (w) { ex[w] = 1; });
    groups.forEach(function (g) {
      for (var k in g.rep.tok || tokens(g.rep.title)) {
        if (k === "__n" || ex[k] || k.length < 2 || /^[a-z]/.test(k)) continue;
        freq[k] = (freq[k] || 0) + Math.min(g.outlets, 5);
      }
    });
    return Object.keys(freq).map(function (k) { return { word: k, n: freq[k] }; })
      .filter(function (x) { return x.n >= 3; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  /* ── 전체 처리 ─────────────────────────────────── */
  function process(raw, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var session = currentSession(now, opts.holidays);
    var all = parseRaw(raw);
    var clean = all.filter(function (it) {
      return it.time <= now + 5 * 60e3 && !JUNK.test(it.title) && !SPECULATIVE.test(it.title) && it.title.length >= 8;
    });
    var inSession = clean.filter(function (it) { return it.time >= session.start; });
    var inSections = clean.filter(function (it) { return it.time >= session.sectionStart; });

    var headGroups = cluster(inSession).map(function (g) { return scoreGroup(g, session.id, now); })
      .sort(function (a, b) { return (b.score - a.score) || (b.newest - a.newest); });
    var secGroups = cluster(inSections).map(function (g) { return scoreGroup(g, session.id, now); })
      .sort(function (a, b) { return (b.score - a.score) || (b.newest - a.newest); });

    var sections = {};
    ["market", "commodity", "macro", "bond", "crypto", "policy"].forEach(function (s) {
      sections[s] = secGroups.filter(function (g) { return g.secs.indexOf(s) >= 0; });
    });
    var hot = hotStocks(headGroups.length >= 10 ? headGroups : secGroups, opts.stocks);
    var kw = keywords(headGroups.slice(0, 60), hot.map(function (h) { return h.name; }));
    var srcCount = {}; inSession.forEach(function (i) { srcCount[i.source] = 1; });
    return {
      session: session, headlines: headGroups.slice(0, 8), allHead: headGroups, sections: sections, hot: hot.slice(0, 10), keywords: kw.slice(0, 10),
      stats: { raw: all.length, kept: inSession.length, sources: Object.keys(srcCount).length, clusters: headGroups.length }
    };
  }

  global.FDNews = { classify: classify, tokens: tokens, overlap: overlap, process: process, currentSession: currentSession, SESSIONS: SESSIONS, SCORE: SCORE, SOURCES: SOURCES, _t: { tokens: tokens, cluster: cluster, parseRaw: parseRaw } };
})(typeof window !== "undefined" ? window : globalThis);
