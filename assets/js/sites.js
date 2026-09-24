/* FinDesk 사이트 모음 페이지 */
(function () {
  "use strict";
  if (window.FD_GATED) return; // 공개 전 준비 중 화면
  var D = window.FD_DATA || {};
  function $(s) { return document.querySelector(s); }
  function h(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
    (function add(l) { for (var i = 0; i < l.length; i++) { var c = l[i]; if (c == null || c === false) continue; if (Array.isArray(c)) add(c); else n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); } })(Array.prototype.slice.call(arguments, 2));
    return n;
  }
  // 테마
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function theme() { var t = document.documentElement.dataset.theme; return t === "light" || t === "dark" ? t : (mql && mql.matches ? "dark" : "light"); }
  $("#themeToggle").addEventListener("click", function () { var t = theme() === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; try { localStorage.setItem("fd-theme", t); } catch (e) {} });

  var cats = (D.links && D.links.categories) || [];
  var wrap = $("#siteGroups"), chips = $("#siteChips"), input = $("#siteSearch"), empty = $("#siteEmpty");
  var palette = ["#1d3557", "#2a6f97", "#6a4c93", "#0f766e", "#b45309", "#9f1239", "#3f6212", "#7c2d12", "#334155", "#a16207", "#0e7490", "#86198f", "#155e75", "#4d7c0f", "#9a3412"];
  var state = { cat: "all", q: "" };
  var total = cats.reduce(function (s, c) { return s + c.links.length; }, 0);
  $("#siteCount").textContent = total + "곳 · " + cats.length + "개 분야";
  $("#orderNote").textContent = (D.links && D.links.order_note) || "";
  var m = location.hash.match(/^#cat-(.+)$/); if (m) state.cat = m[1];

  function chip(id, label, count) {
    return h("button", { class: "chip", type: "button", role: "tab", "aria-selected": state.cat === id ? "true" : "false", "data-cat": id,
      onclick: function () { state.cat = id; chips.querySelectorAll(".chip").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.cat === id ? "true" : "false"); }); render(); } },
      label, h("span", { class: "count", text: String(count) }));
  }
  chips.appendChild(chip("all", "전체", total));
  cats.forEach(function (c) { chips.appendChild(chip(c.id, c.name, c.links.length)); });

  function render() {
    var q = state.q.trim().toLowerCase(), shown = 0;
    wrap.innerHTML = "";
    cats.forEach(function (c, ci) {
      if (state.cat !== "all" && state.cat !== c.id) return;
      var links = c.links.filter(function (l) { return !q || (l.name + " " + l.desc + " " + c.name + " " + l.url).toLowerCase().indexOf(q) >= 0; });
      if (!links.length) return;
      shown += links.length;
      var color = palette[ci % palette.length];
      wrap.appendChild(h("div", { class: "site-group", id: "cat-" + c.id },
        h("div", { class: "site-group__head" }, h("h2", { text: c.name }), h("span", { text: c.desc })),
        h("div", { class: "site-grid" }, links.map(function (l, i) {
          var letter = (l.name.match(/[A-Za-z가-힣0-9]/) || ["·"])[0].toUpperCase();
          return h("a", { class: "site" + (i < 3 ? " site--top" : ""), href: l.url, target: "_blank", rel: "noopener" },
            h("span", { class: "site__badge", style: "background:" + color, "aria-hidden": "true", text: letter }),
            h("span", null, h("span", { class: "site__name", text: l.name }), h("span", { class: "site__desc", text: l.desc })));
        }))));
    });
    empty.hidden = shown > 0;
  }
  var t;
  input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = input.value; render(); }, 120); });
  render();
})();
