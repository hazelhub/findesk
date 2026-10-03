/* FinDesk 편집실 — 오늘의 섹터 (KRX 엑셀 올리기 또는 표 붙여넣기 → 시장별 상·하위 추출 → 한 번에 게시) */
(function () {
  "use strict";
  var PATH = "data/sectors.json", KEEP = 240, PICK = 3;
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
  var MARKETS = ["코스피", "코스닥", "KRX 섹터", "테마"];
  if (draft && !draft.m) { var old = draft; draft = { date: old.date, market: old.market || "코스피", comment: old.comment || "", m: {} }; draft.m[draft.market] = { up: old.up || [], down: old.down || [] }; }
  if (!draft || draft.date !== kstToday()) draft = { date: kstToday(), market: "코스피", comment: "", m: {} };
  function cur() { if (!draft.m[draft.market]) draft.m[draft.market] = { up: [], down: [] }; return draft.m[draft.market]; }
  function save() { store("fd-ed-sec-draft", JSON.stringify(draft)); $("#secSaved").textContent = "임시저장됨"; }
  $("#secDate").value = draft.date; $("#secMarket").value = draft.market; $("#secComment").value = draft.comment || "";
  $("#secDate").addEventListener("change", function (e) { draft.date = e.target.value; save(); });
  $("#secMarket").addEventListener("change", function (e) { draft.market = e.target.value; save(); renderLists(); });
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
      // 시장 전체·규모별 지수는 업종이 아니라서 제외 (코스피, 코스피 200, 대형주 등)
      if (/^(코스피|코스닥|KOSPI|KOSDAQ|KRX)(\s?(200|150|100|50|대형주|중형주|소형주|종합|지수))?$/i.test(name) || /^(대형주|중형주|소형주)$/.test(name)) return;
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
    var g = pick(rows), m = cur(); m.up = g.up; m.down = g.down;
    $("#secParseMsg").textContent = rows.length + "개 업종을 읽었어요. " + draft.market + " 상·하위 " + PICK + "개씩 골랐어요 — 확인해 주세요.";
    save(); renderLists();
  });

  function pick(rows) {
    rows = rows.slice().sort(function (a, b) { return b.chg - a.chg; });
    return { up: rows.filter(function (r) { return r.chg > 0; }).slice(0, PICK),
      down: rows.filter(function (r) { return r.chg < 0; }).slice(-PICK).reverse() };
  }

  /* ── KRX 엑셀(xlsx/csv) 올리기 ──
     KRX 정보데이터시스템 > 지수 > 전체지수 시세에서 받은 파일(코스피·코스닥·KRX·테마)을 그대로 올리면
     파일마다 시장을 알아보고, 시장 전체·규모·전략 지수는 빼고 업종·테마만 남겨 상·하위를 고릅니다. */
  function nameOf(n) { return String(n || "").replace(/\s+/g, " ").trim(); }
  function short(n) { return n.replace(/^KRX[-\/][A-Za-z&]+\s+/, "").replace(/^KRX\s+/, "").replace(/\s*지수$/, "").trim(); }
  var RULES = {
    "코스피": function (n) { return !/^(코스피|코스닥|KRX|KOSPI)/i.test(n) && !/^(제조|대형주|중형주|소형주)$/.test(n) && !/\(/.test(n); },
    "코스닥": function (n) { return !/^(코스피|코스닥|KRX|KOSDAQ)/i.test(n) && !/^(제조|대형주|중형주|소형주)$/.test(n) && !/\(/.test(n); },
    "KRX 섹터": function (n) { return /^KRX [^\d\s]+$/.test(n) && !/TMI/.test(n); },
    "테마": function (n) { return !/ESG|배당|우선주|거버넌스|Governance|Leaders|탄소|리츠|부동산|블루칩|미국채|샤프|밸류업|TMI|KTOP|^코스닥 TOP|^코스피 200 기후|^KRX 300|^KRX 100$|^코스피|^코스닥 150/.test(n); }
  };
  function detect(names) {
    var has = function (re) { return names.some(function (n) { return re.test(n); }); };
    if (has(/^코스피$/)) return "코스피";
    if (has(/^코스닥$/)) return "코스닥";
    if (has(/^KRX 반도체$/) || has(/^KRX 300$/)) return "KRX 섹터";
    return "테마";
  }
  function sheetRows(wb) {
    var ws = wb.Sheets[wb.SheetNames[0]], aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    var hi = -1, ni = 0, pi = -1;
    for (var i = 0; i < Math.min(aoa.length, 10); i++) {
      var r = aoa[i].map(nameOf), p = r.indexOf("등락률");
      if (p >= 0) { hi = i; pi = p; ni = Math.max(0, r.indexOf("지수명")); break; }
    }
    if (hi < 0) return null;
    return aoa.slice(hi + 1).map(function (r) { return { name: nameOf(r[ni]), chg: toNum(r[pi]), close: toNum(r[pi - 2]) }; })
      .filter(function (r) { return r.name && r.chg != null && isFinite(r.chg); });
  }
  function readFile(f) {
    return f.arrayBuffer().then(function (buf) {
      if (/\.csv$/i.test(f.name)) {
        var t = new TextDecoder("utf-8").decode(buf);
        if (t.indexOf("\uFFFD") >= 0) t = new TextDecoder("euc-kr").decode(buf);
        return XLSX.read(t, { type: "string" });
      }
      return XLSX.read(buf, { type: "array" });
    });
  }
  function loadLib() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (ok, no) { var sc = document.createElement("script"); sc.src = "assets/vendor/xlsx.full.min.js"; sc.onload = ok; sc.onerror = function () { no(new Error("엑셀 도구를 불러오지 못했어요")); }; document.head.appendChild(sc); });
  }
  var fileIn = $("#secFiles");
  if (fileIn) fileIn.addEventListener("change", function () {
    var files = Array.prototype.slice.call(fileIn.files || []), out = $("#secFileMsg");
    if (!files.length) return;
    out.textContent = "읽는 중…";
    loadLib().then(function () { return Promise.all(files.map(function (f) { return readFile(f).then(function (wb) { return { f: f, rows: sheetRows(wb) }; }); })); })
      .then(function (res) {
        var lines = [], fdate = null;
        res.forEach(function (x) {
          if (!x.rows || !x.rows.length) { lines.push(x.f.name + ": '지수명·등락률' 표를 찾지 못했어요"); return; }
          var names = x.rows.map(function (r) { return r.name; }), mk = detect(names), rule = RULES[mk];
          var idx = x.rows.filter(function (r) { return r.name === mk; })[0];
          var keep = x.rows.filter(function (r) { return rule(r.name) && Math.abs(r.chg) <= 30; })
            .map(function (r) { return { name: short(r.name).slice(0, 20), chg: Math.round(r.chg * 100) / 100 }; });
          var g = pick(keep);
          draft.m[mk] = { up: g.up, down: g.down, index: idx ? { chg: Math.round(idx.chg * 100) / 100 } : null };
          lines.push(mk + ": " + keep.length + "개 중 강세 " + g.up.length + " · 약세 " + g.down.length);
          var d = x.f.name.match(/(20\d{2})(\d{2})(\d{2})/); if (d) fdate = d[1] + "-" + d[2] + "-" + d[3];
          draft.market = mk;
        });
        if (fdate && fdate !== draft.date) { lines.push("파일 이름 날짜 " + fdate + " — 거래일이 다르면(휴장일 다음날 받은 경우 등) 위 날짜를 고쳐 주세요."); }
        $("#secMarket").value = draft.market; save(); renderLists();
        out.textContent = lines.join(" / ");
        fileIn.value = "";
      }).catch(function (e) { out.textContent = "읽기 실패: " + e.message; });
  });

  function renderLists() {
    var m = cur(), sum = $("#secSummary");
    if (sum) sum.textContent = MARKETS.filter(function (k) { var x = draft.m[k]; return x && (x.up.length || x.down.length); })
      .map(function (k) { var x = draft.m[k]; return k + " (▲" + x.up.length + "·▼" + x.down.length + ")"; }).join(" · ") || "아직 정리한 시장이 없어요";
    [["up", "#secUp"], ["down", "#secDown"]].forEach(function (p) {
      var ol = $(p[1]); ol.innerHTML = "";
      m[p[0]].forEach(function (r, i) {
        var n = h("input", { value: r.name, placeholder: "업종명", maxlength: 20 });
        var c = h("input", { value: r.chg, type: "number", step: "0.01", placeholder: "%" });
        n.addEventListener("input", function () { r.name = n.value; save(); });
        c.addEventListener("input", function () { r.chg = parseFloat(c.value); save(); });
        ol.appendChild(h("li", null, n, c, h("button", { class: "btn btn--sm", type: "button", onclick: function () { m[p[0]].splice(i, 1); save(); renderLists(); } }, "삭제")));
      });
    });
  }
  document.querySelectorAll("[data-add]").forEach(function (b) {
    b.addEventListener("click", function () { var k = b.getAttribute("data-add"); var m = cur(); if (m[k].length < 5) { m[k].push({ name: "", chg: k === "up" ? 0.5 : -0.5 }); save(); renderLists(); } });
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
    var now = new Date().toISOString(), comment = (draft.comment || "").trim(), list = [];
    MARKETS.forEach(function (k) {
      var x = draft.m[k]; if (!x) return;
      var day = { date: draft.date, market: k, up: clean(x.up), down: clean(x.down), published_at: now };
      if (!day.up.length && !day.down.length) return;
      if (x.index && isFinite(x.index.chg)) day.index = { chg: x.index.chg };
      if (comment && !list.length) day.comment = comment;
      list.push(day);
    });
    if (!list.length) { msg.textContent = "강세·약세 업종을 하나 이상 넣어 주세요."; return; }
    if (!confirm(draft.date + " 섹터 정리를 게시할까요?\n" + list.map(function (d) { return "· " + d.market + " (강세 " + d.up.length + " · 약세 " + d.down.length + ")"; }).join("\n"))) return;
    msg.textContent = "게시 중…";
    ghGet(c).then(function (curr) {
      var data = curr.data || {};
      data.days = list.concat((data.days || []).filter(function (d) { return !list.some(function (n) { return n.date === d.date && n.market === d.market; }); }))
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, KEEP);
      data.updated_at = now;
      return ghPut(c, data, curr.sha, "오늘의 섹터: " + draft.date + " " + list.map(function (d) { return d.market; }).join("·"));
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
