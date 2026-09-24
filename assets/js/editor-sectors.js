/* FinDesk 편집실 — 오늘의 섹터 (장 마감 후 업종 등락표 붙여넣기 → 상·하위 추출 → 게시) */
(function () {
  "use strict";
  var PATH = "data/sectors.json", KEEP = 60, PICK = 3;
  function $(s) { return document.querySelector(s); }
  function h(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (k === "value") n.value = v; else n.setAttribute(k, v === true ? "" : v); }
    (function add(l) { for (var i = 0; i < l.length; i++) { var c = l[i]; if (c == null || c === false) continue; if (Array.isArray(c)) add(c); else n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); } })(Array.prototype.slice.call(arguments, 2));
    return n;
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
  function cfg() { return { repo: store("fd-ed-repo") || "", gh: store("fd-ed-gh") || "" }; }

  /* ── 화면 전환 (#sectors) ── */
  function route() {
    var sec = location.hash === "#sectors";
    $("#briefView").hidden = sec; $("#sectorView").hidden = !sec;
    $("#navBrief").setAttribute("aria-current", sec ? "false" : "page");
    $("#navSectors").setAttribute("aria-current", sec ? "page" : "false");
    var top = document.querySelector(".ed-top label"); if (top) top.hidden = sec;
    if (sec) loadDays();
  }
  window.addEventListener("hashchange", route);

  /* ── 초안 ── */
  var draft;
  try { draft = JSON.parse(store("fd-ed-sec-draft") || "null"); } catch (e) { draft = null; }
  if (!draft || draft.date !== kstToday()) draft = { date: kstToday(), market: "코스피", up: [], down: [], comment: "" };
  function save() { store("fd-ed-sec-draft", JSON.stringify(draft)); $("#secSaved").textContent = "임시저장됨"; }
  $("#secDate").value = draft.date; $("#secMarket").value = draft.market; $("#secComment").value = draft.comment || "";
  $("#secDate").addEventListener("change", function (e) { draft.date = e.target.value; save(); });
  $("#secMarket").addEventListener("change", function (e) { draft.market = e.target.value; save(); });
  $("#secComment").addEventListener("input", function (e) { draft.comment = e.target.value; save(); });

  /* ── 붙여넣은 표 읽기 ── */
  function toNum(t) { var m = String(t).replace(/,/g, "").match(/[+\-−]?\d+(\.\d+)?/); return m ? parseFloat(m[0].replace("−", "-")) : null; }
  function parse(text) {
    var out = [];
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var toks = line.split(/\t+|\s{2,}/).map(function (t) { return t.trim(); }).filter(Boolean);
      if (toks.length < 2) toks = line.split(/\s+/);
      var nameParts = [], nums = [], pct = null;
      toks.forEach(function (t) {
        var isNum = /^[+\-−▲▼△▽]?\s*[\d,]+(\.\d+)?%?$/.test(t.replace(/\s/g, ""));
        if (!isNum && !nums.length) { nameParts.push(t); return; }
        if (!isNum) return;
        var v = toNum(t); if (v == null) return;
        if (/[▼▽]/.test(t) || /^−/.test(t)) v = -Math.abs(v);
        if (/%$/.test(t) && pct == null) pct = v;
        nums.push(v);
      });
      var name = nameParts.join(" ").replace(/[▲▼△▽]/g, "").trim();
      if (!name || /^(업종|지수명|종목명|구분)/.test(name)) return;
      if (pct == null) pct = nums.length >= 3 ? nums[2] : nums[nums.length - 1];
      if (pct == null || !isFinite(pct) || Math.abs(pct) > 30) return;
      if (/[▼▽]|하락/.test(line) && pct > 0) pct = -pct;
      out.push({ name: name.slice(0, 20), chg: Math.round(pct * 100) / 100 });
    });
    return out;
  }
  $("#secParse").addEventListener("click", function () {
    var rows = parse($("#secPaste").value);
    if (!rows.length) { $("#secParseMsg").textContent = "업종명과 등락률을 찾지 못했어요. 표를 다시 복사하거나 아래에 직접 입력하세요."; return; }
    rows.sort(function (a, b) { return b.chg - a.chg; });
    draft.up = rows.filter(function (r) { return r.chg > 0; }).slice(0, PICK);
    draft.down = rows.filter(function (r) { return r.chg < 0; }).slice(-PICK).reverse();
    $("#secParseMsg").textContent = rows.length + "개 업종을 읽었어요. 상·하위 " + PICK + "개씩 골랐어요 — 확인해 주세요.";
    save(); renderLists();
  });

  function renderLists() {
    [["up", "#secUp"], ["down", "#secDown"]].forEach(function (p) {
      var ol = $(p[1]); ol.innerHTML = "";
      draft[p[0]].forEach(function (r, i) {
        var n = h("input", { value: r.name, placeholder: "업종명", maxlength: 20 });
        var c = h("input", { value: r.chg, type: "number", step: "0.01", placeholder: "%" });
        n.addEventListener("input", function () { r.name = n.value; save(); });
        c.addEventListener("input", function () { r.chg = parseFloat(c.value); save(); });
        ol.appendChild(h("li", null, n, c, h("button", { class: "btn btn--sm", type: "button", onclick: function () { draft[p[0]].splice(i, 1); save(); renderLists(); } }, "삭제")));
      });
    });
  }
  document.querySelectorAll("[data-add]").forEach(function (b) {
    b.addEventListener("click", function () { var k = b.getAttribute("data-add"); if (draft[k].length < 5) { draft[k].push({ name: "", chg: k === "up" ? 0.5 : -0.5 }); save(); renderLists(); } });
  });

  /* ── GitHub ── */
  function hdr(c) { return { Authorization: "Bearer " + c.gh, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }; }
  function dec(s) { var bin = atob(s.replace(/\n/g, "")), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new TextDecoder().decode(a); }
  function enc(str) { var b = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); }
  function ghGet(c) {
    return fetch("https://api.github.com/repos/" + c.repo + "/contents/" + PATH + "?ref=main&t=" + Date.now(), { headers: hdr(c), cache: "no-store" })
      .then(function (r) { if (r.status === 404) return { sha: null, data: { days: [] } }; if (!r.ok) throw new Error("GitHub 읽기 실패 " + r.status); return r.json().then(function (j) { return { sha: j.sha, data: JSON.parse(dec(j.content)) }; }); });
  }
  function ghPut(c, data, sha, msg) {
    var body = { message: msg, content: enc(JSON.stringify(data, null, 1) + "\n"), branch: "main" }; if (sha) body.sha = sha;
    return fetch("https://api.github.com/repos/" + c.repo + "/contents/" + PATH, { method: "PUT", headers: hdr(c), body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error("GitHub 저장 실패 " + r.status + " " + t.slice(0, 120)); }); return r.json(); });
  }
  function clean(list) { return list.filter(function (r) { return r.name && r.name.trim() && isFinite(r.chg); }).map(function (r) { return { name: r.name.trim(), chg: Math.round(r.chg * 100) / 100 }; }); }

  $("#secPublish").addEventListener("click", function () {
    var c = cfg(), msg = $("#secMsg");
    if (!c.repo || !c.gh) { msg.textContent = "브리핑 탭의 설정(GitHub 저장소·토큰)을 먼저 완료해 주세요."; return; }
    var day = { date: draft.date, market: draft.market, up: clean(draft.up), down: clean(draft.down), comment: (draft.comment || "").trim(), published_at: new Date().toISOString() };
    if (!day.up.length && !day.down.length) { msg.textContent = "강세·약세 업종을 하나 이상 넣어 주세요."; return; }
    if (!confirm(day.date + " " + day.market + " 섹터 정리(강세 " + day.up.length + " · 약세 " + day.down.length + ")를 게시할까요?")) return;
    msg.textContent = "게시 중…";
    ghGet(c).then(function (cur) {
      var data = cur.data || {};
      data.days = [day].concat((data.days || []).filter(function (d) { return !(d.date === day.date && d.market === day.market); }))
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, KEEP);
      data.updated_at = day.published_at;
      return ghPut(c, data, cur.sha, "오늘의 섹터: " + day.date + " " + day.market);
    }).then(function () { msg.textContent = "게시했어요. 1~2분 뒤 사이트에 반영됩니다."; loadDays(); })
      .catch(function (e) { msg.textContent = "게시 실패: " + e.message; });
  });

  function loadDays() {
    var ul = $("#secDays"), c = cfg(); ul.innerHTML = "";
    if (!c.repo || !c.gh) { ul.appendChild(h("li", { class: "ed-empty", text: "설정을 먼저 완료해 주세요." })); return; }
    ghGet(c).then(function (cur) {
      var days = (cur.data && cur.data.days) || [];
      if (!days.length) { ul.appendChild(h("li", { class: "ed-empty", text: "아직 게시한 정리가 없어요." })); return; }
      days.slice(0, 10).forEach(function (d) {
        ul.appendChild(h("li", null, h("b", { text: d.date.slice(5) + " " + d.market }),
          h("span", { text: (d.up[0] ? "▲" + d.up[0].name : "") + (d.down[0] ? " ▼" + d.down[0].name : "") }), h("span", { class: "spacer" }),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () {
            if (!confirm(d.date + " " + d.market + " 정리를 사이트에서 내릴까요?")) return;
            ghGet(c).then(function (c2) { c2.data.days = (c2.data.days || []).filter(function (x) { return !(x.date === d.date && x.market === d.market); }); return ghPut(c, c2.data, c2.sha, "오늘의 섹터 삭제: " + d.date + " " + d.market); })
              .then(loadDays).catch(function (e) { alert("삭제 실패: " + e.message); });
          } }, "내리기")));
      });
    }).catch(function (e) { ul.appendChild(h("li", { class: "ed-empty", text: "불러오지 못했어요: " + e.message })); });
  }

  renderLists();
  route();
})();
