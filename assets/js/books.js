/* FinDesk 주간 금융 도서 모음 페이지 */
(function () {
  "use strict";
  var D = window.FD_DATA || {};
  function $(s) { return document.querySelector(s); }
  function h(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
    (function add(l) { for (var i = 0; i < l.length; i++) { var c = l[i]; if (c == null || c === false) continue; if (Array.isArray(c)) add(c); else n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); } })(Array.prototype.slice.call(arguments, 2));
    return n;
  }
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function theme() { var t = document.documentElement.dataset.theme; return t === "light" || t === "dark" ? t : (mql && mql.matches ? "dark" : "light"); }
  $("#themeToggle").addEventListener("click", function () { var t = theme() === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; try { localStorage.setItem("fd-theme", t); } catch (e) {} });

  var LEVEL = { intro: "입문", mid: "중급", pro: "실무" };
  var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  var weeks = ((D.books && D.books.weeks) || []).filter(function (w) { return w.week <= today && (w.books || []).length; })
    .sort(function (a, b) { return a.week < b.week ? 1 : -1; });
  var total = weeks.reduce(function (s, w) { return s + w.books.length; }, 0);
  $("#bookCount").textContent = weeks.length ? weeks.length + "주 · " + total + "권" : "";

  function range(week) {
    var s = new Date(week + "T00:00:00Z"), e = new Date(s.getTime() + 6 * 864e5);
    return s.getUTCFullYear() + "." + (s.getUTCMonth() + 1) + "." + s.getUTCDate() + " – " + (e.getUTCMonth() + 1) + "." + e.getUTCDate();
  }
  function links(b) {
    var q = encodeURIComponent(b.title + (b.author ? " " + b.author : "")), qt = encodeURIComponent(b.title);
    return h("div", { class: "book__links" },
      h("a", { href: b.link || ("https://search.kyobobook.co.kr/search?keyword=" + q), target: "_blank", rel: "noopener nofollow" }, "서점에서 보기"),
      h("a", { href: "https://www.nl.go.kr/NL/contents/search.do?kwd=" + qt, target: "_blank", rel: "noopener nofollow" }, "국립중앙도서관 검색"));
  }
  function tagList(b) {
    var t = [];
    if (LEVEL[b.level]) t.push(LEVEL[b.level]);
    (b.audience || []).forEach(function (a) { t.push(a); });
    if (b.time) t.push(b.time);
    (b.tags || []).forEach(function (a) { t.push("#" + a); });
    return t;
  }
  function card(b) {
    return h("article", { class: "bcard" + (b.role === "main" ? " bcard--main" : "") },
      h("div", { class: "bcard__role", text: b.role === "main" ? "이번 주 메인" : "함께 읽기" }),
      h("h3", { class: "book__title", text: b.title }),
      h("p", { class: "book__meta", text: [b.author, b.publisher, b.year].filter(Boolean).join(" · ") }),
      h("div", { class: "book__tags" }, tagList(b).map(function (x) { return h("span", { class: "book__tag", text: x }); })),
      b.reason ? h("div", { class: "book__block" }, h("b", { text: "추천 이유" }), h("p", { text: b.reason })) : null,
      b.comment ? h("div", { class: "book__block" }, h("b", { text: "운영자 코멘트" }), h("p", { text: b.comment })) : null,
      b.disclosure ? h("p", { class: "book__disc", text: b.disclosure }) : null,
      links(b));
  }

  // 필터 칩: 난이도 + 자주 쓰인 주제
  var state = { f: "all", q: "" };
  var tagCount = {};
  weeks.forEach(function (w) { w.books.forEach(function (b) { (b.tags || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); }); });
  var filters = [["all", "전체"], ["lv:intro", "입문"], ["lv:mid", "중급"], ["lv:pro", "실무"], ["au:취준생", "취준생"], ["au:실무자", "실무자"]]
    .concat(Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; }).slice(0, 12).map(function (t) { return ["tg:" + t, "#" + t]; }));
  var chips = $("#bookChips");
  filters.forEach(function (f) {
    chips.appendChild(h("button", { class: "chip", type: "button", role: "tab", "aria-selected": f[0] === "all" ? "true" : "false", "data-f": f[0],
      onclick: function () { state.f = f[0]; chips.querySelectorAll(".chip").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.f === f[0] ? "true" : "false"); }); render(); } }, f[1]));
  });
  $("#bookSearch").addEventListener("input", function (e) { state.q = e.target.value.trim().toLowerCase(); render(); });

  function match(b) {
    var f = state.f;
    if (f.indexOf("lv:") === 0 && b.level !== f.slice(3)) return false;
    if (f.indexOf("au:") === 0 && (b.audience || []).indexOf(f.slice(3)) < 0) return false;
    if (f.indexOf("tg:") === 0 && (b.tags || []).indexOf(f.slice(3)) < 0) return false;
    if (state.q) {
      var hay = [b.title, b.author, b.publisher, b.reason, b.comment, (b.tags || []).join(" ")].join(" ").toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    return true;
  }
  function render() {
    var box = $("#bookWeeks"); box.innerHTML = "";
    var shown = 0;
    weeks.forEach(function (w) {
      var list = w.books.filter(match);
      if (!list.length) return;
      shown += list.length;
      box.appendChild(h("section", { class: "bweek" },
        h("div", { class: "bweek__head" }, h("h2", { text: range(w.week) }), w.theme ? h("span", { text: w.theme }) : null),
        h("div", { class: "bgrid" }, list.map(card))));
    });
    $("#bookEmpty").hidden = shown > 0;
    $("#bookEmpty").textContent = weeks.length ? "조건에 맞는 도서가 없어요." : "첫 추천 도서를 준비하고 있어요.";
  }
  render();
})();
