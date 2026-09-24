/* FinDesk — 화면 렌더링 스크립트 (의존성 없음) */
(function () {
  "use strict";

  var C = window.FD_CONFIG || {};
  var D = window.FD_DATA || {};
  var LOCALE = C.locale || "kr";
  var DAY = 86400000;

  /* ── 유틸 ───────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    (function add(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c);
        else node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    })(Array.prototype.slice.call(arguments, 2));
    return node;
  }
  function kstNow() { return new Date(Date.now() + 9 * 3600000); } // UTC 필드로 KST를 읽기 위한 가짜 Date
  function kstDayNumber() { return Math.floor((Date.now() + 9 * 3600000) / DAY); }
  function kstDateStr(d) { d = d || kstNow(); return d.toISOString().slice(0, 10); }
  function num(v, digits) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!isFinite(n)) return "–";
    return n.toLocaleString("ko-KR", { minimumFractionDigits: digits == null ? 0 : digits, maximumFractionDigits: digits == null ? 2 : digits });
  }
  function fmtCycle(c) {
    c = String(c || "");
    if (/^\d{8}$/.test(c)) return c.slice(0, 4) + "." + c.slice(4, 6) + "." + c.slice(6);
    if (/^\d{6}$/.test(c)) return c.slice(0, 4) + "." + c.slice(4) + "월";
    var q = c.match(/^(\d{4})Q(\d)$/); if (q) return q[1] + "년 " + q[2] + "분기";
    return c;
  }
  function fmtStamp(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d)) return String(iso);
    var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.month + "/" + p.day + " " + (p.hour === "24" ? "00" : p.hour) + ":" + p.minute;
  }
  function ago(iso) {
    if (!iso) return "";
    var diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (!isFinite(diff)) return "";
    if (diff < 1) return "방금";
    if (diff < 60) return Math.floor(diff) + "분 전";
    if (diff < 60 * 24) return Math.floor(diff / 60) + "시간 전";
    return Math.floor(diff / 1440) + "일 전";
  }
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { return null; }
  }
  function mod(n, m) { return ((n % m) + m) % m; }
  function tvSymbolUrl(sym) { return "https://kr.tradingview.com/symbols/" + String(sym).replace(":", "-") + "/"; }

  /* ── 테마 ───────────────────────────────────────── */
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function theme() {
    var t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") return t;
    return mql && mql.matches ? "dark" : "light";
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    store("fd-theme", t);
    remountAll();
  }
  $("#themeToggle").addEventListener("click", function () { setTheme(theme() === "dark" ? "light" : "dark"); });
  if (mql && mql.addEventListener) mql.addEventListener("change", function () { if (!store("fd-theme")) remountAll(); });

  /* ── TradingView 위젯 ───────────────────────────── */
  var TV_BASE = "https://s3.tradingview.com/external-embedding/embed-widget-";
  var mounts = [];
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      var m = mounts.filter(function (x) { return x.slot === e.target; })[0];
      if (m && !m.mounted) mount(m);
    });
  }, { rootMargin: "300px 300px" }) : null;

  function tvWidget(slot, widget, cfgFn, fallbackUrl, opts) {
    var m = { slot: slot, widget: widget, cfgFn: cfgFn, fallbackUrl: fallbackUrl, mounted: false, eager: opts && opts.eager };
    mounts.push(m);
    slot.appendChild(h("div", { class: "skeleton" }));
    if (m.eager || !io) mount(m); else io.observe(slot);
    return m;
  }
  function mount(m) {
    m.mounted = true;
    var slot = m.slot;
    clearTimeout(m.timer);
    slot.innerHTML = "";
    var sk = h("div", { class: "skeleton" });
    var wrap = h("div", { class: "tradingview-widget-container" });
    var inner = h("div", { class: "tradingview-widget-container__widget", style: "height:calc(100% - 20px);width:100%" });
    var copy = h("div", { class: "tradingview-widget-copyright" },
      h("a", { href: "https://www.tradingview.com/", rel: "noopener nofollow", target: "_blank" }, h("span", { text: "Track all markets on TradingView" })));
    var s = document.createElement("script");
    s.type = "text/javascript"; s.async = true;
    s.src = TV_BASE + m.widget + ".js";
    s.innerHTML = JSON.stringify(m.cfgFn(theme()));
    s.onerror = function () { fail(m); };
    wrap.appendChild(inner); wrap.appendChild(copy); wrap.appendChild(s);
    slot.appendChild(sk); slot.appendChild(wrap);
    var started = Date.now();
    (function poll() {
      var f = wrap.querySelector("iframe");
      if (f) { f.addEventListener("load", function () { sk.remove(); }); setTimeout(function () { sk.remove(); }, 2500); return; }
      if (Date.now() - started > 12000) return fail(m);
      m.timer = setTimeout(poll, 300);
    })();
  }
  function fail(m) {
    if (m.slot.querySelector(".tv-fallback")) return;
    var sk = m.slot.querySelector(".skeleton"); if (sk) sk.remove();
    m.slot.appendChild(h("div", { class: "tv-fallback" },
      h("span", { text: "시세 위젯을 불러오지 못했습니다" }),
      m.fallbackUrl ? h("a", { href: m.fallbackUrl, target: "_blank", rel: "noopener" }, "TradingView에서 보기 →") : null));
  }
  function remountAll() { mounts.forEach(function (m) { if (m.mounted) mount(m); }); }

  function miniCfg(symbol) {
    return function (t) {
      return { symbol: symbol, width: "100%", height: "100%", locale: LOCALE, dateRange: C.miniChartRange || "1M",
        colorTheme: t, isTransparent: true, autosize: true, largeChartUrl: "", noTimeScale: false, chartOnly: false };
    };
  }
  function tvCard(item, groupName) {
    var slot = h("div", { class: "tv-slot" });
    var card = h("article", { class: "qcard", "data-group": item.group || "" },
      groupName ? h("div", { class: "qcard__label" }, h("span", { text: item.name }), h("span", { class: "qcard__group", text: groupName })) : null,
      slot);
    tvWidget(slot, "mini-symbol-overview", miniCfg(item.symbol), tvSymbolUrl(item.symbol));
    return card;
  }

  /* ── 헤더: 시계·장 상태·시세 띠 ─────────────────── */
  $("#siteName").textContent = C.siteName || "FinDesk";
  $("#tagline").textContent = C.tagline || "";
  var fmtDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
  var fmtTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  var HOLI = (D.schedule && D.schedule.holidays) || { KR: [], US: [] };
  function zoneParts(tz) {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return { wd: o.weekday, date: o.year + "-" + o.month + "-" + o.day, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
  }
  function isOpen(tz, open, close, holidays) {
    var z = zoneParts(tz);
    if (z.wd === "Sat" || z.wd === "Sun" || (holidays || []).indexOf(z.date) >= 0) return false;
    return z.min >= open && z.min < close;
  }
  function tick() {
    var now = new Date();
    $("#clockDate").textContent = fmtDate.format(now);
    $("#clockTime").textContent = fmtTime.format(now) + " KST";
    var kr = isOpen("Asia/Seoul", 540, 930, HOLI.KR), us = isOpen("America/New_York", 570, 960, HOLI.US);
    var st = $("#marketStatus");
    st.innerHTML = "";
    st.appendChild(h("span", { class: "pill" + (kr ? " is-open" : "") }, "한국 " + (kr ? "장중" : (HOLI.KR || []).indexOf(zoneParts("Asia/Seoul").date) >= 0 ? "휴장" : "장마감")));
    st.appendChild(h("span", { class: "pill" + (us ? " is-open" : "") }, "뉴욕 " + (us ? "장중" : "장마감")));
  }
  tick(); setInterval(tick, 1000);

  tvWidget($("#tickerTape"), "ticker-tape", function (t) {
    return { symbols: C.tickerTape || [], showSymbolLogo: true, isTransparent: true, displayMode: "adaptive", colorTheme: t, locale: LOCALE };
  }, "https://kr.tradingview.com/markets/", { eager: true });

  /* ── 시장 데이터 (ECOS) ─────────────────────────── */
  var market = D.market || { rows: [], series: {} };
  var rowsByName = {};
  (market.rows || []).forEach(function (r) { rowsByName[r.name] = r; });

  function sparkline(points, cls) {
    if (!points || points.length < 2) return null;
    var vals = points.map(function (p) { return p[1]; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = max - min || 1;
    var W = 240, H = 48;
    var d = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * W, y = H - ((v - min) / span) * (H - 4) - 2;
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "최근 " + vals.length + "영업일 추이");
    var area = document.createElementNS(ns, "path");
    area.setAttribute("d", d + " L" + W + " " + H + " L0 " + H + " Z");
    area.setAttribute("fill", "currentColor"); area.setAttribute("opacity", ".08");
    var line = document.createElementNS(ns, "path");
    line.setAttribute("d", d); line.setAttribute("fill", "none"); line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.8"); line.setAttribute("vector-effect", "non-scaling-stroke"); line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(area); svg.appendChild(line);
    var wrap = h("div", { class: "ecos__spark " + cls }); wrap.appendChild(svg);
    return wrap;
  }

  function ecosCard(item, groupName) {
    var series = (market.series || {})[item.key] || [];
    var row = rowsByName[item.rowName];
    var last = series.length ? series[series.length - 1] : null;
    var value = row ? parseFloat(row.value) : last ? last[1] : NaN;
    var cycle = row ? row.cycle : last ? last[0] : "";
    // 전일 대비: 시계열에서 기준일 직전 값을 찾음
    var prev = null;
    for (var i = series.length - 1; i >= 0; i--) { if (series[i][0] < String(cycle)) { prev = series[i][1]; break; } }
    var chg = prev != null && isFinite(value) ? value - prev : null;
    var pct = chg != null ? (chg / prev) * 100 : null;
    var cls = chg == null ? "flat" : chg > 0 ? "up" : chg < 0 ? "down" : "flat";
    var arrow = chg == null ? "" : chg > 0 ? "▲ " : chg < 0 ? "▼ " : "";
    return h("article", { class: "qcard", "data-group": item.group },
      h("div", { class: "qcard__label" }, h("span", { text: "한국은행 ECOS" }), h("span", { class: "qcard__group", text: groupName })),
      h("div", { class: "ecos" },
        h("div", { class: "ecos__name", text: item.name }),
        h("div", { class: "ecos__value mono", text: num(value, 2) }),
        h("div", { class: "ecos__chg mono " + cls, text: chg == null ? "전일 대비 정보 없음" : arrow + num(Math.abs(chg), 2) + " (" + (pct > 0 ? "+" : "") + num(pct, 2) + "%)" }),
        sparkline(series.slice(-20), cls),
        h("div", { class: "ecos__foot" },
          h("span", { text: fmtCycle(cycle) + " 종가" }),
          item.link ? h("a", { href: item.link, target: "_blank", rel: "noopener" }, "실시간 시세 →") : null)));
  }

  /* ── 지수 캐러셀 ────────────────────────────────── */
  (function buildIndices() {
    var track = $("#indexCarousel"), tabs = $("#indexTabs");
    var groups = C.indexGroups || [];
    var firstCard = {};
    groups.forEach(function (g, gi) {
      g.items.forEach(function (it, ii) {
        it.group = g.id;
        var card = it.kind === "ecos" ? ecosCard(it, g.name) : tvCard(it, g.name);
        if (ii === 0) firstCard[g.id] = card;
        track.appendChild(card);
      });
      tabs.appendChild(h("button", { class: "tab", type: "button", role: "tab", "aria-selected": gi === 0 ? "true" : "false", "data-group": g.id,
        onclick: function () { var c = firstCard[g.id]; if (c) track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: "smooth" }); } }, g.name));
    });
    document.querySelectorAll("[data-scroll]").forEach(function (b) {
      b.addEventListener("click", function () { track.scrollBy({ left: parseInt(b.dataset.scroll, 10) * track.clientWidth * 0.8, behavior: "smooth" }); });
    });
    var raf;
    track.addEventListener("scroll", function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        var left = track.scrollLeft + track.offsetLeft + 20, current = groups[0] && groups[0].id;
        Array.prototype.forEach.call(track.children, function (c) { if (c.offsetLeft <= left) current = c.dataset.group; });
        if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4 && groups.length) current = groups[groups.length - 1].id;
        tabs.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", t.dataset.group === current ? "true" : "false"); });
      });
    }, { passive: true });
  })();

  /* ── 원자재 ─────────────────────────────────────── */
  (function buildCommodities() {
    var grid = $("#commodityGrid");
    (C.commodities || []).forEach(function (it) {
      var card = tvCard(it, it.unit);
      grid.appendChild(card);
    });
    var steel = h("article", { class: "qcard qcard--steel" }, h("div", { class: "steel" },
      h("h3", { text: "철강 (열연·철근·철광석)" }),
      h("p", { text: "철강 선물(CME·상하이)은 무료 위젯에서 제공되지 않아 전문 사이트 바로가기로 대신합니다." }),
      h("ul", null, (C.steelLinks || []).map(function (l) { return h("li", null, h("a", { href: l.url, target: "_blank", rel: "noopener" }, l.name + " →")); }))));
    grid.appendChild(steel);
  })();

  /* ── 환율·금리·거시 ─────────────────────────────── */
  (function buildRates() {
    var fx = $("#fxGrid");
    (C.fx || []).forEach(function (it) { fx.appendChild(tvCard(it, "실시간")); });

    function row(tbody, label, name, fmt) {
      var r = rowsByName[name];
      if (!r) return;
      tbody.appendChild(h("tr", null, h("th", { scope: "row", text: label }),
        h("td", null, fmt ? fmt(r) : num(r.value) + (r.unit === "%" ? "%" : ""), h("small", { text: fmtCycle(r.cycle) }))));
    }
    var rt = $("#rateTable tbody");
    [["한국은행 기준금리", "한국은행 기준금리"], ["콜금리 (익일물)", "콜금리(익일물)"], ["CD 91일", "CD수익률(91일)"], ["통안증권 364일", "통안증권수익률(364일)"],
     ["국고채 3년", "국고채수익률(3년)"], ["국고채 5년", "국고채수익률(5년)"], ["회사채 3년 AA-", "회사채수익률(3년,AA-)"], ["KORIBOR 3개월", "KORIBOR(3개월)"]]
      .forEach(function (x) { row(rt, x[0], x[1], function (r) { return num(r.value, 2) + "%"; }); });

    var mt = $("#macroTable tbody");
    var won = function (r) { return num(r.value, 2) + "원"; };
    var eok = function (div) { return function (r) { return num(parseFloat(r.value) / div, 1) + "억 달러"; }; };
    row(mt, "원/달러 (종가)", "원/달러 환율(종가)", won);
    row(mt, "원/100엔 (매매기준율)", "원/엔(100엔) 환율(매매기준율)", won);
    row(mt, "원/유로 (매매기준율)", "원/유로 환율(매매기준율)", won);
    row(mt, "원/위안 (종가)", "원/위안 환율(종가)", won);
    row(mt, "실질 GDP 성장률 (전기비)", "경제성장률(실질, 계절조정 전기대비)", function (r) { return num(r.value, 1) + "%"; });
    row(mt, "소비자물가지수 (2020=100)", "소비자물가지수", function (r) { return num(r.value, 2); });
    row(mt, "경상수지", "경상수지", eok(100));      // 백만달러 → 억달러
    row(mt, "외환보유액", "외환보유액", eok(100000)); // 천달러 → 억달러
    row(mt, "실업률", "실업률", function (r) { return num(r.value, 1) + "%"; });
    row(mt, "두바이유 (월평균)", "Dubai유(현물)", function (r) { return "$" + num(r.value, 2); });

    $("#ratesMeta").textContent = "한국은행 ECOS" + (market.fetched_at ? " · 수집 " + fmtStamp(market.fetched_at) : "") + (market.snapshot ? " (초기 스냅샷)" : "");
  })();

  /* ── 오늘의 경제용어 ────────────────────────────── */
  (function buildTerm() {
    var list = (D.terms && D.terms.terms) || [];
    if (!list.length) { $("#termCard").hidden = true; return; }
    var offset = 0, expanded = false;
    var body = $("#termBody"), more = $("#termMore"), caution = $("#termCaution");
    function render() {
      var t = list[mod(kstDayNumber() + offset, list.length)];
      $("#termWord").textContent = t.word;
      body.textContent = t.content;
      var long = t.content.length > 180;
      expanded = false;
      body.classList.toggle("clamp", long);
      more.hidden = !long; more.textContent = "전체 설명 보기";
      caution.hidden = !t.caution; caution.textContent = t.caution || "";
      $("#h-term .eyebrow").textContent = offset === 0 ? "오늘의 경제용어" : "경제용어";
    }
    more.addEventListener("click", function () { expanded = !expanded; body.classList.toggle("clamp", !expanded); more.textContent = expanded ? "접기" : "전체 설명 보기"; });
    document.querySelectorAll("[data-term]").forEach(function (b) { b.addEventListener("click", function () { offset += parseInt(b.dataset.term, 10); render(); }); });
    render();
  })();

  /* ── 오늘의 명언 ────────────────────────────────── */
  (function buildQuote() {
    var list = (D.quotes && D.quotes.quotes) || [];
    if (!list.length) { $("#quoteCard").hidden = true; return; }
    var offset = 0, showOrig = false;
    var badgeText = { "true": ["출처 확인", "badge--ok"], "partial": ["출처 일부 불확실", "badge--partial"], "false": ["출처 불확실", "badge--no"] };
    function render() {
      var q = list[mod(kstDayNumber() * 7 + offset, list.length)];
      $("#quoteText").textContent = "“" + q.ko + "”";
      $("#quoteOrig").textContent = q.original;
      $("#quoteOrig").hidden = !showOrig;
      $("#quoteWho").textContent = q.speaker;
      $("#quoteRole").textContent = q.role || "";
      var b = badgeText[String(q.verified)] || badgeText["partial"];
      var badge = $("#quoteBadge"); badge.textContent = b[0]; badge.className = "badge " + b[1];
      $("#quoteSrc").textContent = [q.source, q.year].filter(Boolean).join(", ");
      $("#quoteNote").hidden = !q.note; $("#quoteNote").textContent = q.note || "";
      $("#h-quote .eyebrow").textContent = offset === 0 ? "오늘의 명언" : "명언";
    }
    $("#quoteToggle").addEventListener("click", function (e) { showOrig = !showOrig; e.currentTarget.textContent = showOrig ? "원문 숨기기" : "원문 보기"; render(); });
    document.querySelectorAll("[data-quote]").forEach(function (b) { b.addEventListener("click", function () { offset += parseInt(b.dataset.quote, 10); render(); }); });
    render();
  })();

  /* ── 채권·크레딧 타일 ───────────────────────────── */
  (function buildBonds() {
    var box = $("#bondTiles"); if (!box) return;
    var ktb = rowsByName["국고채수익률(3년)"], corp = rowsByName["회사채수익률(3년,AA-)"], cd = rowsByName["CD수익률(91일)"], base = rowsByName["한국은행 기준금리"];
    function tile(label, value, sub, cls) {
      return h("div", { class: "tile" + (cls ? " " + cls : "") }, h("span", { class: "tile__label", text: label }), h("strong", { class: "tile__value mono", text: value }), h("small", { text: sub || "" }));
    }
    if (ktb) box.appendChild(tile("국고채 3년", num(ktb.value, 3) + "%", fmtCycle(ktb.cycle)));
    if (corp) box.appendChild(tile("회사채 3년 AA-", num(corp.value, 3) + "%", fmtCycle(corp.cycle)));
    if (ktb && corp) {
      var bp = (parseFloat(corp.value) - parseFloat(ktb.value)) * 100;
      box.appendChild(tile("신용스프레드 (AA- − 국고 3년)", num(bp, 1) + "bp", ktb.cycle === corp.cycle ? fmtCycle(ktb.cycle) + " 기준" : "기준일 다름", "tile--accent"));
    }
    if (cd) box.appendChild(tile("CD 91일", num(cd.value, 2) + "%", fmtCycle(cd.cycle)));
    if (base) box.appendChild(tile("한국은행 기준금리", num(base.value, 2) + "%", fmtCycle(base.cycle)));
  })();

  /* ── 소비자동향조사 (한국은행) ─────────────────────── */
  (function buildCsi() {
    var sm = market.sentiment, grid = $("#csiGrid");
    if (!grid || !sm || !(sm.items || []).length) return;
    var last = null;
    sm.items.forEach(function (it) {
      var s = it.series || []; if (!s.length) return;
      var cur = s[s.length - 1], prev = s.length > 1 ? s[s.length - 2] : null;
      last = last && last > cur[0] ? last : cur[0];
      var diff = prev ? cur[1] - prev[1] : null;
      var cls = diff == null || diff === 0 ? "flat" : diff > 0 ? "up" : "down";
      var isIndex = it.code === "FME";
      var hint = isIndex ? (cur[1] >= 100 ? "장기평균보다 낙관" : "장기평균보다 비관")
        : (cur[1] > 100 ? "상승·개선 응답 우세" : cur[1] < 100 ? "하락·악화 응답 우세" : "응답 균형");
      grid.appendChild(h("div", { class: "csi__item" + (isIndex ? " csi__item--main" : "") },
        h("span", { class: "csi__name", text: it.name }),
        h("div", { class: "csi__row" },
          h("strong", { class: "mono", text: num(cur[1], isIndex ? 1 : 0) }),
          h("span", { class: "mono " + cls, text: diff == null ? "" : diff === 0 ? "보합" : (diff > 0 ? "▲ " : "▼ ") + num(Math.abs(diff), isIndex ? 1 : 0) })),
        sparkline(s, cls),
        h("small", { text: hint })));
    });
    $("#csiMeta").textContent = (last ? fmtCycle(last) + " 조사 · 전월 대비" : "") + " · 출처: 한국은행 ECOS";
    $("#csiBox").hidden = false;
  })();

  /* ── 미국채 (미 재무부) + 한미 금리차 ─────────────────── */
  (function buildUst() {
    var U = D.ust || {}, rows = U.rows || [], tb = $("#ustTable tbody");
    if (!tb || rows.length < 2) return;
    var tenors = U.tenors || ["3M", "2Y", "5Y", "10Y", "30Y"];
    var LABEL = { "3M": "3개월", "2Y": "2년", "5Y": "5년", "10Y": "10년", "30Y": "30년" };
    var cur = rows[rows.length - 1], prev = rows[rows.length - 2];
    // 한 달 전: 약 21영업일 전 (없으면 가장 오래된 값)
    var monthAgo = rows[Math.max(0, rows.length - 22)];
    function bp(a, b) { return a == null || b == null ? null : Math.round((a - b) * 1000) / 10; }
    function bpCell(v) {
      if (v == null) return h("td", { text: "–" });
      return h("td", { class: v > 0 ? "up" : v < 0 ? "down" : "flat", text: (v > 0 ? "+" : "") + num(v, 1) + "bp" });
    }
    tenors.forEach(function (t, i) {
      var c = cur[i + 1];
      tb.appendChild(h("tr", null, h("th", { text: LABEL[t] || t }), h("td", { text: c == null ? "–" : num(c, 2) + "%" }), bpCell(bp(c, prev[i + 1])), bpCell(bp(c, monthAgo[i + 1]))));
    });
    var idx = function (t) { return tenors.indexOf(t) + 1; };
    function tile(label, value, sub, cls) {
      return h("div", { class: "tile" + (cls ? " " + cls : "") }, h("span", { class: "tile__label", text: label }), h("strong", { class: "tile__value mono", text: value }), h("small", { text: sub || "" }));
    }
    function sgn(v) { return (v > 0 ? "+" : "") + num(v, 1) + "bp"; }
    var box = $("#ustTiles");
    var s210 = bp(cur[idx("10Y")], cur[idx("2Y")]), s310 = bp(cur[idx("10Y")], cur[idx("3M")]);
    if (s210 != null) box.appendChild(tile("장단기 금리차 (10년 − 2년)", sgn(s210), s210 < 0 ? "역전: 경기 둔화 신호로 해석되곤 함" : "정상(우상향) 곡선"));
    if (s310 != null) box.appendChild(tile("10년 − 3개월", sgn(s310), s310 < 0 ? "역전 구간" : "정상 구간"));
    // 한미 10년 금리차: 같은 날짜의 국고 10년(ECOS)과 비교
    var ktb = (market.series || {}).KTB10Y || [];
    if (ktb.length) {
      var byDate = {}; rows.forEach(function (r) { byDate[r[0].replace(/-/g, "")] = r; });
      var pair = null;
      for (var k = ktb.length - 1; k >= 0 && !pair; k--) { var r = byDate[ktb[k][0]]; if (r && r[idx("10Y")] != null) pair = [ktb[k], r]; }
      if (!pair) pair = [ktb[ktb.length - 1], cur];
      var gap = bp(pair[0][1], pair[1][idx("10Y")]);
      var same = pair[0][0] === pair[1][0].replace(/-/g, "");
      box.appendChild(tile("한미 10년 금리차 (국고 − 미국채)", sgn(gap), "국고 " + num(pair[0][1], 3) + "% · 미 " + num(pair[1][idx("10Y")], 2) + "% · " + (same ? fmtCycle(pair[0][0]) + " 기준" : "기준일 다름"), "tile--accent"));
    }
    if (U.fetched_at) $("#ustMeta").textContent = cur[0].replace(/-/g, ".") + " 기준 (미국 시간)" + (U.snapshot ? " · 초기 스냅샷" : "");
    $("#ustBox").hidden = false;
  })();

  /* ── 이번 주 금융 도서 (운영자 코멘트) ─────────────────── */
  var BOOK_LEVEL = { intro: "입문", mid: "중급", pro: "실무" };
  function bookLinks(b) {
    var q = encodeURIComponent(b.title + (b.author ? " " + b.author : ""));
    var qt = encodeURIComponent(b.title);
    return h("div", { class: "book__links" },
      h("a", { href: b.link || ("https://search.kyobobook.co.kr/search?keyword=" + q), target: "_blank", rel: "noopener nofollow" }, "서점에서 보기"),
      h("a", { href: "https://www.nl.go.kr/NL/contents/search.do?kwd=" + qt, target: "_blank", rel: "noopener nofollow" }, "국립중앙도서관 검색"));
  }
  function bookMeta(b) {
    return [b.author, b.publisher, b.year].filter(Boolean).join(" · ");
  }
  function bookTags(b) {
    var t = [];
    if (b.level && BOOK_LEVEL[b.level]) t.push(BOOK_LEVEL[b.level]);
    (b.audience || []).forEach(function (a) { t.push(a); });
    if (b.time) t.push(b.time);
    (b.tags || []).forEach(function (a) { t.push("#" + a); });
    return h("div", { class: "book__tags" }, t.map(function (x) { return h("span", { class: "book__tag", text: x }); }));
  }
  (function buildBook() {
    var weeks = ((D.books && D.books.weeks) || []).slice().sort(function (a, b) { return a.week < b.week ? 1 : -1; });
    var today = kstDateStr();
    var w = weeks.filter(function (x) { return x.week <= today; })[0];
    if (!w || !(w.books || []).length) return;
    var start = new Date(w.week + "T00:00:00Z"), end = new Date(start.getTime() + 6 * DAY);
    $("#bookRange").textContent = (start.getUTCMonth() + 1) + "/" + start.getUTCDate() + " – " + (end.getUTCMonth() + 1) + "/" + end.getUTCDate();
    if (w.theme) { $("#bookTheme").textContent = w.theme; $("#bookTheme").hidden = false; }
    var main = w.books.filter(function (b) { return b.role === "main"; })[0] || w.books[0];
    var subs = w.books.filter(function (b) { return b !== main; });
    var comment = h("p", { class: "book__comment clamp", text: main.comment || "" });
    var more = h("button", { class: "btn-link", type: "button", text: "코멘트 더 보기", onclick: function () { var c = comment.classList.toggle("clamp"); more.textContent = c ? "코멘트 더 보기" : "접기"; } });
    $("#bookMain").appendChild(h("article", { class: "book__main" },
      h("h3", { class: "book__title", text: main.title }),
      h("p", { class: "book__meta", text: bookMeta(main) }),
      bookTags(main),
      main.reason ? h("div", { class: "book__block" }, h("b", { text: "추천 이유" }), h("p", { text: main.reason })) : null,
      main.comment ? h("div", { class: "book__block" }, h("b", { text: "운영자 코멘트" }), comment, (main.comment || "").length > 120 ? more : null) : null,
      main.disclosure ? h("p", { class: "book__disc", text: main.disclosure }) : null,
      bookLinks(main)));
    var ul = $("#bookSubs");
    subs.forEach(function (b) {
      ul.appendChild(h("li", null, h("b", { text: b.title }), h("small", { text: bookMeta(b) }), b.reason ? h("p", { text: b.reason }) : null, b.disclosure ? h("p", { class: "book__disc", text: b.disclosure }) : null, bookLinks(b)));
    });
    $("#bookCard").hidden = false;
  })();

  /* ── 섹터 등락: 미국(TradingView 위젯) + 한국(공공데이터, 전 영업일) ── */
  (function buildSectors() {
    var hm = $("#usHeatmap"), mv = $("#usMovers");
    if (hm) tvWidget(hm, "stock-heatmap", function (t) {
      return { dataSource: "SPX500", grouping: "sector", blockSize: "market_cap_basic", blockColor: "change", locale: LOCALE, colorTheme: t,
        hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: "100%", height: "100%" };
    }, "https://kr.tradingview.com/heatmap/stock/");
    if (mv) tvWidget(mv, "hotlists", function (t) {
      return { exchange: "US", dateRange: "1D", showChart: false, locale: LOCALE, colorTheme: t, isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false, width: "100%", height: "100%" };
    }, "https://kr.tradingview.com/markets/stocks-usa/market-movers-gainers/");
    var K = D.krx;
    if (!K || !(K.sectors || []).length) return;
    function li(name, sub, v) {
      var cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
      return h("li", null, h("b", { text: name }), sub ? h("small", { text: sub }) : null, h("span", { class: cls, text: (v > 0 ? "+" : "") + num(v, 2) + "%" }));
    }
    var sec = K.sectors.slice().sort(function (a, b) { return b.chg - a.chg; });
    var ol = $("#krSectorRank");
    sec.slice(0, 5).forEach(function (x) { ol.appendChild(li(x.name, x.market, x.chg)); });
    if (sec.length > 10) ol.appendChild(h("li", { class: "rank__sep", text: "···" }));
    sec.slice(Math.max(5, sec.length - 5)).forEach(function (x) { ol.appendChild(li(x.name, x.market, x.chg)); });
    var m = $("#krMovers");
    (K.gainers || []).slice(0, 5).forEach(function (x) { m.appendChild(li(x.name, x.market, x.chg)); });
    m.appendChild(h("li", { class: "rank__sep", text: "하락 상위" }));
    (K.losers || []).slice(0, 5).forEach(function (x) { m.appendChild(li(x.name, x.market, x.chg)); });
    $("#krMeta").textContent = fmtCycle(K.date) + " 종가 기준 (전 영업일)";
    $("#krSectors").hidden = false; $("#krSectorFallback").hidden = true;
  })();

  /* ── 디지털자산 ─────────────────────────────────── */
  (function buildCrypto() {
    var grid = $("#cryptoGrid"); if (!grid) return;
    (C.crypto || []).forEach(function (it) { grid.appendChild(tvCard(it, "24시간")); });
    grid.appendChild(h("article", { class: "qcard" }, h("div", { class: "steel" },
      h("h3", { text: "스테이블코인·온체인" }),
      h("p", { text: "스테이블코인 시가총액과 발행량, 가상자산 공시는 전문 사이트에서 확인하세요." }),
      h("ul", null, (C.cryptoLinks || []).map(function (l) { return h("li", null, h("a", { href: l.url, target: "_blank", rel: "noopener" }, l.name + " →")); })))));
  })();

  /* ── 편집 브리핑 (운영자가 직접 쓴 코멘트 + 원문 링크) ─────── */
  var SESSIONS = [
    { id: "morning", label: "모닝 브리핑", range: "05:00–08:00", desc: "간밤 미국·유럽 증시 마감 + 전일 국내 마감 이후 이슈" },
    { id: "pre", label: "개장 전", range: "08:00–09:00", desc: "넥스트레이드 프리마켓·장 시작 전 동시호가·환율 개장" },
    { id: "intraday", label: "장중", range: "09:00–15:30", desc: "개장 시황·특징주·수급" },
    { id: "close", label: "국내 마감", range: "15:30–20:00", desc: "마감 시황·수급·장 마감 후 공시·실적" },
    { id: "global", label: "글로벌", range: "20:00–05:00", desc: "유럽 증시·미국 개장 전후·지표 발표" }
  ];
  var SEC_LABEL = { market: "증시", commodity: "원자재", macro: "매크로", bond: "채권", crypto: "디지털자산", policy: "정책" };
  function currentSessionId() {
    var z = zoneParts("Asia/Seoul"), m = z.min;
    var id = m >= 300 && m < 480 ? "morning" : m >= 480 && m < 540 ? "pre" : m >= 540 && m < 930 ? "intraday" : m >= 930 && m < 1200 ? "close" : "global";
    var holiday = z.wd === "Sat" || z.wd === "Sun" || (HOLI.KR || []).indexOf(z.date) >= 0;
    return { id: id, holiday: holiday && id !== "global" };
  }
  var BRIEF = { data: D.briefing || { editions: [] }, pick: null };
  function sessionInfo(id) { return SESSIONS.filter(function (s) { return s.id === id; })[0] || { id: id, label: id, range: "", desc: "" }; }
  function todayEditions() { var t = kstDateStr(); return (BRIEF.data.editions || []).filter(function (e) { return e.date === t; }); }
  function fmtIso(iso) { return iso ? fmtStamp(iso) : ""; }
  function linkList(links) {
    return h("ul", { class: "golinks" }, (links || []).map(function (l) {
      return h("li", null, h("a", { href: l.url, target: "_blank", rel: "noopener" }, h("b", { text: l.name }), l.desc ? h("small", { text: l.desc }) : null));
    }));
  }
  function itemLi(it, showSec) {
    return h("li", { class: "bitem" },
      showSec ? h("span", { class: "bitem__sec bitem__sec--" + it.sec, text: SEC_LABEL[it.sec] || it.sec }) : null,
      h("div", { class: "bitem__body" },
        h("p", { class: "bitem__text", text: it.comment }),
        h("a", { class: "bitem__src", href: it.url, target: "_blank", rel: "noopener nofollow" }, "원문: " + (it.source || "기사") + " ↗")));
  }
  function renderBrief() {
    var cur = currentSessionId();
    var today = todayEditions();
    var bySession = {}; today.forEach(function (e) { if (!bySession[e.session]) bySession[e.session] = e; });
    if (!BRIEF.pick) BRIEF.pick = bySession[cur.id] ? cur.id : (today[0] ? today[0].session : cur.id);
    var info = sessionInfo(cur.id);
    $("#sessionPill").textContent = cur.holiday ? "지금: 휴장일" : "지금: " + info.label + " (" + info.range + ")";
    $("#newsStatus").textContent = BRIEF.data.updated_at ? "마지막 게시 " + fmtIso(BRIEF.data.updated_at) : "";
    var ol = $("#sessionTimeline"); ol.innerHTML = "";
    SESSIONS.forEach(function (x) {
      ol.appendChild(h("li", null, h("button", {
        type: "button", class: "tl" + (x.id === cur.id ? " is-now" : "") + (x.id === BRIEF.pick ? " is-pick" : "") + (bySession[x.id] ? " has-brief" : ""),
        "aria-pressed": x.id === BRIEF.pick ? "true" : "false", title: x.desc,
        onclick: function () { BRIEF.pick = x.id; renderBrief(); }
      }, h("span", { class: "tl__label", text: x.label }), h("span", { class: "tl__range mono", text: x.range }), x.id === cur.id ? h("span", { class: "tl__now", text: "지금" }) : null)));
    });
    // 선택한 세션의 브리핑
    var box = $("#edition"); box.innerHTML = "";
    var ed = bySession[BRIEF.pick];
    var pickInfo = sessionInfo(BRIEF.pick);
    if (!ed) {
      var last = (BRIEF.data.editions || [])[0];
      box.appendChild(h("div", { class: "edition__empty" },
        h("p", null, h("b", { text: pickInfo.label }), " 브리핑이 아직 올라오지 않았어요. 아래 '지금 볼 곳'에서 바로 확인할 수 있어요."),
        last ? h("button", { class: "linkish", type: "button", onclick: function () { showEdition(last, true); } }, "가장 최근 브리핑 보기 (" + last.date.slice(5).replace("-", "/") + " " + sessionInfo(last.session).label + ")") : null,
        autoLine()));
    } else showEdition(ed, false);
    // 지금 볼 곳
    var go = $("#goLinks"); go.innerHTML = "";
    $("#goTitle").textContent = "지금 볼 곳 · " + (cur.holiday ? "휴장일" : info.label);
    go.appendChild(linkList((C.sessionLinks || {})[cur.holiday ? "holiday" : cur.id] || (C.sessionLinks || {}).global));
    renderSectionPicks();
  }
  // 운영자 브리핑이 없을 때 보여줄 '숫자로 보는 시장' (수치만, 자동 생성)
  function autoLine() {
    var parts = [];
    function chgOf(series) { if (!series || series.length < 2) return null; var a = series[series.length - 1][1], b = series[series.length - 2][1]; return (a / b - 1) * 100; }
    function pct(v) { return (v > 0 ? "+" : "") + num(v, 2) + "%"; }
    var ks = (market.series || {}).KOSPI, kq = (market.series || {}).KOSDAQ;
    if (ks && ks.length) parts.push("코스피 " + num(ks[ks.length - 1][1], 2) + (chgOf(ks) != null ? "(" + pct(chgOf(ks)) + ")" : ""));
    if (kq && kq.length) parts.push("코스닥 " + num(kq[kq.length - 1][1], 2) + (chgOf(kq) != null ? "(" + pct(chgOf(kq)) + ")" : ""));
    var fx = rowsByName["원/달러 환율(종가)"]; if (fx) parts.push("원/달러 " + num(fx.value, 1) + "원");
    var kt = rowsByName["국고채수익률(3년)"]; if (kt) parts.push("국고 3년 " + num(kt.value, 3) + "%");
    var U = D.ust || {}, ur = U.rows || [];
    if (ur.length > 1) { var i10 = (U.tenors || []).indexOf("10Y") + 1; if (i10 > 0) { var c = ur[ur.length - 1][i10], p = ur[ur.length - 2][i10]; parts.push("美 10년 " + num(c, 2) + "%(" + (c - p >= 0 ? "+" : "") + num((c - p) * 100, 0) + "bp)"); } }
    var K = D.krx; if (K && (K.sectors || []).length) { var s = K.sectors.slice().sort(function (a, b) { return b.chg - a.chg; }); parts.push("강세 업종 " + s[0].name + " · 약세 " + s[s.length - 1].name); }
    if (!parts.length) return null;
    var base = ks && ks.length ? fmtCycle(ks[ks.length - 1][0]) + " 종가 기준" : "최근 발표 기준";
    return h("div", { class: "edition__auto" }, h("b", { text: "숫자로 보는 시장 · " + base + " (자동)" }), parts.join(" · "));
  }
  function showEdition(ed, stale) {
    var box = $("#edition"); box.innerHTML = "";
    box.appendChild(h("div", { class: "edition__head" },
      h("span", { class: "ai__tag", text: "편집 브리핑" }), h("strong", { text: sessionInfo(ed.session).label }),
      h("span", { class: "ai__desc", text: (stale ? "지난 브리핑 · " : "") + ed.date.slice(5).replace("-", "/") + " " + fmtIso(ed.published_at).split(" ")[1] + " 게시 · " + ed.items.length + "건" })));
    if (ed.summary && ed.summary.length) box.appendChild(h("div", { class: "edition__summary" }, ed.summary.map(function (s) { return h("p", { text: s }); })));
    box.appendChild(h("ol", { class: "bitems" }, ed.items.map(function (it) { return itemLi(it, true); })));
  }
  function renderSectionPicks() {
    var today = todayEditions();
    document.querySelectorAll(".secnews").forEach(function (box) {
      var sec = box.dataset.sec, title = box.dataset.title;
      var items = []; today.forEach(function (e) { e.items.forEach(function (it) { if (it.sec === sec) items.push(it); }); });
      box.innerHTML = "";
      box.appendChild(h("div", { class: "secnews__head" }, title ? h("h3", { class: "sub", text: title }) : null, h("span", { class: "meta", text: items.length ? "오늘 브리핑 " + items.length + "건" : "" })));
      if (items.length) box.appendChild(h("ol", { class: "bitems bitems--compact" }, items.slice(0, 6).map(function (it) { return itemLi(it, false); })));
      if (sec === "policy" && (D.policy && D.policy.items || []).length) {
        box.appendChild(h("h3", { class: "sub sub--gap", text: "금융위원회 보도자료" }));
        box.appendChild(h("ul", { class: "press" }, D.policy.items.slice(0, 8).map(function (p) {
          return h("li", null, h("a", { href: p.url, target: "_blank", rel: "noopener", text: p.title }), h("small", { text: " " + (p.date || "").slice(5).replace("-", "/") }));
        })));
      }
      var links = (C.sectionLinks || {})[sec];
      if (links && links.length) box.appendChild(h("div", { class: "secgo" }, h("span", { class: "secgo__label", text: "관련 뉴스 보러가기" }),
        links.map(function (l) { return h("a", { href: l.url, target: "_blank", rel: "noopener", text: l.name }); })));
    });
  }
  // 해외 뉴스 (TradingView 공식 위젯)
  tvWidget($("#globalNews"), "timeline", function (t) {
    return { feedMode: "all_symbols", isTransparent: true, displayMode: "compact", width: "100%", height: "100%", colorTheme: t, locale: LOCALE };
  }, "https://kr.tradingview.com/news/");
  renderBrief();
  // 최신 브리핑 파일을 다시 읽어 반영 (배포 직후 캐시 대비)
  fetch("data/briefing.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && (j.updated_at || "") !== (BRIEF.data.updated_at || "")) { BRIEF.data = j; BRIEF.pick = null; renderBrief(); } }).catch(function () {});
  setInterval(function () { if (!document.hidden) renderBrief(); }, 60000);

  /* ── 주간 일정 (월~일) ──────────────────────────── */
  var WD = ["일", "월", "화", "수", "목", "금", "토"];
  function isoAdd(iso, days) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  function weekOf(offset) {
    var today = kstDateStr(), d = new Date(today + "T00:00:00Z"), wd = d.getUTCDay();
    var mon = isoAdd(today, -((wd + 6) % 7) + 7 * offset);
    return { start: mon, end: isoAdd(mon, 6) };
  }
  function md(iso) { var d = new Date(iso + "T00:00:00Z"); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); }
  function mdw(iso) { var d = new Date(iso + "T00:00:00Z"); return md(iso) + " (" + WD[d.getUTCDay()] + ")"; }
  function rangeLabel(w) { return md(w.start) + "(월) – " + md(w.end) + "(일)"; }
  var SCHED = D.schedule || { market: [], exams: [] };
  var calMounted = false;

  (function buildWeek() {
    var tabs = $("#weekTabs"), list = $("#weekList"), cal = $("#econCalendar");
    var state = 0;
    function render() {
      tabs.querySelectorAll(".chip").forEach(function (b, i) { b.setAttribute("aria-selected", i === state ? "true" : "false"); });
      if (state === 2) {
        list.hidden = true; cal.hidden = false; $("#weekRange").textContent = "세부 지표";
        if (!calMounted) {
          calMounted = true;
          tvWidget(cal, "events", function (t) {
            return { colorTheme: t, isTransparent: true, width: "100%", height: "100%", locale: LOCALE, importanceFilter: "0,1", countryFilter: C.calendarCountries || "kr,us" };
          }, "https://kr.tradingview.com/economic-calendar/", { eager: true });
        }
        return;
      }
      list.hidden = false; cal.hidden = true;
      var w = weekOf(state), today = kstDateStr();
      $("#weekRange").textContent = rangeLabel(w);
      var evs = (SCHED.market || []).filter(function (e) { return e.date >= w.start && e.date <= w.end; });
      list.innerHTML = "";
      if (!evs.length) { list.appendChild(h("p", { class: "muted", text: "등록된 일정이 없습니다." })); return; }
      var byDate = {};
      evs.forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });
      Object.keys(byDate).sort().forEach(function (d) {
        list.appendChild(h("div", { class: "day" + (d === today ? " is-today" : d < today ? " is-past" : "") },
          h("div", { class: "day__head" }, h("span", { text: mdw(d) }), d === today ? h("span", { class: "today", text: "오늘" }) : null),
          h("ul", null, byDate[d].map(function (e) {
            var title = e.url ? h("a", { href: e.url, target: "_blank", rel: "noopener", text: e.title }) : h("span", { text: e.title });
            return h("li", { class: "ev ev--" + (e.kind === "통화정책" ? "policy" : e.kind === "휴장" ? "holiday" : e.kind === "시장" ? "market" : "data") },
              h("span", { class: "ev__time mono", text: e.time || "–" }),
              h("span", { class: "region", text: e.region }),
              h("div", { class: "ev__body" }, title, e.note ? h("small", { text: e.note }) : null));
          }))));
      });
    }
    ["이번 주", "다음 주", "전체 지표"].forEach(function (label, i) {
      tabs.appendChild(h("button", { class: "chip", type: "button", role: "tab", onclick: function () { state = i; render(); } }, label));
    });
    render();
  })();

  (function buildExams() {
    var tabs = $("#examTabs"), list = $("#examList");
    var exams = SCHED.exams || [];
    var state = 0;
    function examRange(x) { return Array.isArray(x.exam) ? x.exam : [x.exam, x.exam]; }
    function phasesIn(w) {
      var out = [];
      exams.forEach(function (x) {
        var ap = x.apply;
        if (ap) {
          var s = ap[0], e = ap[1];
          if (s && s >= w.start && s <= w.end) out.push({ date: s, phase: "접수 시작", cls: "apply", x: x, sub: e ? "~" + md(e) + " 마감" : "" });
          if (e && e >= w.start && e <= w.end && e !== s) out.push({ date: e, phase: "접수 마감", cls: "deadline", x: x });
          if (s && e && s < w.start && e > w.end) out.push({ date: w.start, phase: "접수 중", cls: "apply", x: x, sub: "~" + md(e) + " 마감" });
        }
        var er = examRange(x);
        if (er[0] <= w.end && er[1] >= w.start) out.push({ date: er[0] < w.start ? w.start : er[0], phase: "시험", cls: "exam", x: x, sub: er[0] !== er[1] ? md(er[0]) + "~" + md(er[1]) : "" });
        if (x.result && x.result >= w.start && x.result <= w.end) out.push({ date: x.result, phase: "합격 발표", cls: "result", x: x });
      });
      return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    }
    function row(p, today) {
      return h("li", { class: "exrow" + (p.date < today ? " is-past" : "") },
        h("span", { class: "exrow__date mono", text: mdw(p.date) }),
        h("span", { class: "phase phase--" + p.cls, text: p.phase }),
        h("div", { class: "exrow__body" }, h("a", { href: p.x.url, target: "_blank", rel: "noopener", text: p.x.name + " " + p.x.round }),
          h("small", { text: p.x.org + (p.sub ? " · " + p.sub : "") })));
    }
    function render() {
      tabs.querySelectorAll(".chip").forEach(function (b, i) { b.setAttribute("aria-selected", i === state ? "true" : "false"); });
      list.innerHTML = "";
      var today = kstDateStr();
      if (state < 2) {
        var w = weekOf(state); $("#examRange").textContent = rangeLabel(w);
        var ps = phasesIn(w);
        if (!ps.length) { list.appendChild(h("p", { class: "muted", text: "이 주에는 접수·시험·발표 일정이 없습니다." })); return; }
        list.appendChild(h("ul", { class: "exlist" }, ps.map(function (p) { return row(p, today); })));
        return;
      }
      $("#examRange").textContent = "다가오는 일정";
      var up = exams.filter(function (x) { var er = examRange(x); return (x.result || er[1]) >= today; })
        .sort(function (a, b) { return examRange(a)[0] < examRange(b)[0] ? -1 : 1; });
      var cats = {};
      up.forEach(function (x) { (cats[x.category] = cats[x.category] || []).push(x); });
      Object.keys(cats).forEach(function (c) {
        list.appendChild(h("div", { class: "excat" }, h("div", { class: "excat__head", text: c }),
          h("ul", null, cats[c].map(function (x) {
            var er = examRange(x), parts = [];
            if (x.apply) parts.push("접수 " + (x.apply[0] ? md(x.apply[0]) + "~" : "~") + md(x.apply[1]));
            parts.push("시험 " + (er[0] === er[1] ? md(er[0]) : md(er[0]) + "~" + md(er[1])));
            if (x.result) parts.push("발표 " + md(x.result));
            return h("li", null, h("a", { href: x.url, target: "_blank", rel: "noopener", text: x.name + " " + x.round }), h("small", { text: parts.join(" · ") }));
          }))));
      });
      if ((SCHED.unconfirmed || []).length) {
        list.appendChild(h("div", { class: "excat excat--muted" }, h("div", { class: "excat__head", text: "일정 미확인" }),
          h("ul", null, SCHED.unconfirmed.map(function (u) { return h("li", null, h("a", { href: u.url, target: "_blank", rel: "noopener", text: u.name }), h("small", { text: u.note })); }))));
      }
    }
    ["이번 주", "다음 주", "다가오는 일정"].forEach(function (label, i) {
      tabs.appendChild(h("button", { class: "chip", type: "button", role: "tab", onclick: function () { state = i; render(); } }, label));
    });
    render();
  })();

  /* ── 자주 쓰는 사이트 (분야별 대표 3곳) ─────────── */
  (function buildSiteMini() {
    var box = $("#siteMiniList"); if (!box) return;
    ((D.links && D.links.categories) || []).forEach(function (c) {
      box.appendChild(h("div", { class: "mini-cat" }, h("span", { class: "mini-cat__name", text: c.name }),
        h("div", { class: "mini-cat__links" }, c.links.slice(0, 3).map(function (l) { return h("a", { href: l.url, target: "_blank", rel: "noopener", title: l.desc, text: l.name }); }))));
    });
  })();

  /* ── 데이터 안내 ────────────────────────────────── */
  (function buildInfo() {
    var ul = $("#dataInfo");
    function li(k, v) { ul.appendChild(h("li", null, h("b", { text: k + " " }), v)); }
    li("브리핑", "운영자가 직접 선별·작성 (원문 링크 제공)");
    li("국내 지표", market.fetched_at ? fmtStamp(market.fetched_at) + " 수집" + (market.snapshot ? " (초기 스냅샷)" : "") : "–");
    li("정책 보도자료", D.policy && D.policy.fetched_at ? fmtStamp(D.policy.fetched_at) + " 수집 (금융위원회)" : "수집 대기");
    li("경제용어", ((D.terms && D.terms.terms) || []).length + "개 순환");
    li("일정", "주관 기관 공지 기준 (" + ((SCHED.updated) || "") + ")");
  })();

})();
