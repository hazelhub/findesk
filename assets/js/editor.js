/* FinDesk 편집실 — 후보 기사 보기 → 고르기 → 본인 코멘트 작성 → GitHub에 게시 */
(function () {
  "use strict";
  var D = window.FD_DATA || {};
  var HOLI = (D.schedule && D.schedule.holidays && D.schedule.holidays.KR) || [];
  var SECS = { market: "증시", commodity: "원자재", macro: "매크로·환율", bond: "채권·크레딧", crypto: "디지털자산", policy: "금융정책" };
  var MAX_LEN = 120, KEEP_EDITIONS = 40, PATH = "data/briefing.json";

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
  function kstDate(ms) { return new Date((ms || Date.now()) + 9 * 3600e3).toISOString().slice(0, 10); }
  function fmtTime(ms) {
    var d = new Date(ms + 9 * 3600e3), hm = d.toISOString().slice(11, 16);
    return (d.toISOString().slice(0, 10) === kstDate() ? hm : (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + hm);
  }

  /* ── 설정 ── */
  var cfg = { api: store("fd-ed-api") || "", edToken: store("fd-ed-token") || "", repo: store("fd-ed-repo") || "", ghToken: store("fd-ed-gh") || "" };
  $("#setApi").value = cfg.api; $("#setEdToken").value = cfg.edToken; $("#setRepo").value = cfg.repo; $("#setGhToken").value = cfg.ghToken;
  function needSettings() { return !cfg.api || !cfg.edToken || !cfg.repo || !cfg.ghToken; }
  $("#edSettings").hidden = !needSettings();
  $("#edSettingsBtn").addEventListener("click", function () { $("#edSettings").hidden = !$("#edSettings").hidden; });
  $("#setSave").addEventListener("click", function () {
    cfg.api = $("#setApi").value.trim().replace(/\/$/, ""); cfg.edToken = $("#setEdToken").value.trim();
    cfg.repo = $("#setRepo").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, ""); cfg.ghToken = $("#setGhToken").value.trim();
    store("fd-ed-api", cfg.api); store("fd-ed-token", cfg.edToken); store("fd-ed-repo", cfg.repo); store("fd-ed-gh", cfg.ghToken);
    $("#setMsg").textContent = "저장했어요.";
    loadCandidates(); loadEditions();
  });

  /* ── 설정 코드 (기기 간 옮기기) ── */
  $("#syncCopy").addEventListener("click", function () {
    if (needSettings()) { $("#syncMsg").textContent = "이 기기 설정이 비어 있어요."; return; }
    var code = "FD1:" + btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
    $("#syncCode").value = code;
    (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { $("#syncMsg").textContent = "복사했어요."; }, function () { $("#syncCode").select(); $("#syncMsg").textContent = "위 코드를 길게 눌러 복사하세요."; });
  });
  $("#syncImport").addEventListener("click", function () {
    try {
      var raw = $("#syncCode").value.trim().replace(/\s+/g, "");
      if (raw.indexOf("FD1:") !== 0) throw new Error("형식");
      var c = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
      if (!c.api || !c.edToken || !c.repo || !c.ghToken) throw new Error("항목 누락");
      cfg = c;
      store("fd-ed-api", c.api); store("fd-ed-token", c.edToken); store("fd-ed-repo", c.repo); store("fd-ed-gh", c.ghToken);
      $("#setApi").value = c.api; $("#setEdToken").value = c.edToken; $("#setRepo").value = c.repo; $("#setGhToken").value = c.ghToken;
      $("#syncCode").value = ""; $("#syncMsg").textContent = "가져왔어요. 이제 이 기기에서 바로 편집할 수 있어요.";
      loadCandidates(); loadEditions();
    } catch (e) { $("#syncMsg").textContent = "코드가 올바르지 않아요 (" + e.message + ")"; }
  });

  /* ── 세션 ── */
  var now = FDNews.currentSession(Date.now(), HOLI);
  var sel = $("#edSession");
  FDNews.SESSIONS.forEach(function (s) { sel.appendChild(h("option", { value: s.id, text: s.label + " (" + s.range + ")" })); });
  sel.value = now.id === "holiday" ? "morning" : now.id;
  function sessionLabel(id) { var s = FDNews.SESSIONS.filter(function (x) { return x.id === id; })[0]; return s ? s.label : id; }
  sel.addEventListener("change", function () { draft.session = sel.value; saveDraft(); renderDraft(); });

  /* ── 초안 ── */
  var draft;
  try { draft = JSON.parse(store("fd-ed-draft") || "null"); } catch (e) { draft = null; }
  if (!draft || draft.date !== kstDate()) draft = { date: kstDate(), session: sel.value, summary: "", items: [] };
  sel.value = draft.session;
  $("#draftSummary").value = draft.summary || "";
  $("#draftSummary").addEventListener("input", function (e) { draft.summary = e.target.value; saveDraft(); });
  function saveDraft() { store("fd-ed-draft", JSON.stringify(draft)); $("#draftSaved").textContent = "임시저장 " + fmtTime(Date.now()); }

  function similarity(a, b) {
    if (!a || !b) return 0;
    var o = FDNews.overlap(FDNews.tokens(a), FDNews.tokens(b));
    return o.min;
  }
  function renderDraft() {
    $("#draftSession").textContent = sessionLabel(draft.session) + " · " + draft.date;
    var ol = $("#draftItems"); ol.innerHTML = "";
    if (!draft.items.length) { ol.appendChild(h("li", { class: "ed-empty", text: "왼쪽 후보 기사에서 '담기'를 누르거나 '직접 추가'로 기사를 넣으세요." })); }
    draft.items.forEach(function (it, i) {
      var ta = h("textarea", { rows: 2, maxlength: MAX_LEN + 40, placeholder: "사실 + 의미를 내 문장으로 (120자 이내)", value: it.comment || "" });
      var check = h("span");
      function validate() {
        var len = ta.value.length, sim = similarity(ta.value, it.title);
        check.className = len > MAX_LEN || sim >= 0.7 ? "ed-warn" : "ed-ok";
        check.textContent = len + "/" + MAX_LEN + (sim >= 0.7 ? " · 원문 제목과 너무 비슷해요. 내 문장으로 바꿔 주세요" : len ? " · 좋아요" : "");
      }
      ta.addEventListener("input", function () { it.comment = ta.value; validate(); saveDraft(); });
      validate();
      var secSel = h("select", null, Object.keys(SECS).map(function (k) { return h("option", { value: k, text: SECS[k] }); }));
      secSel.value = it.sec || "market";
      secSel.addEventListener("change", function () { it.sec = secSel.value; saveDraft(); });
      ol.appendChild(h("li", { class: "ed-item" },
        h("div", { class: "ed-item__head" }, secSel, h("span", { text: it.source + (it.time ? " · " + fmtTime(it.time) : "") })),
        it.title ? h("p", { class: "ed-item__orig" }, "원문(비공개): ", h("a", { href: it.url, target: "_blank", rel: "noopener", text: it.title })) : h("p", { class: "ed-item__orig" }, h("a", { href: it.url, target: "_blank", rel: "noopener", text: it.url })),
        ta,
        h("div", { class: "ed-item__foot" }, check, h("span", { class: "spacer" }),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () { if (i > 0) { draft.items.splice(i - 1, 0, draft.items.splice(i, 1)[0]); saveDraft(); renderDraft(); } } }, "↑"),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () { if (i < draft.items.length - 1) { draft.items.splice(i + 1, 0, draft.items.splice(i, 1)[0]); saveDraft(); renderDraft(); } } }, "↓"),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () { draft.items.splice(i, 1); saveDraft(); renderDraft(); renderCands(); } }, "빼기"))));
    });
  }
  $("#addManual").addEventListener("click", function () {
    var url = prompt("원문 기사 주소(URL)를 붙여넣으세요");
    if (!url || !/^https?:\/\//.test(url)) return;
    var source = prompt("언론사 이름 (예: 연합뉴스)") || "";
    draft.items.push({ url: url.trim(), source: source.trim(), title: "", comment: "", sec: "market", time: null });
    saveDraft(); renderDraft();
  });
  $("#clearDraft").addEventListener("click", function () {
    if (!confirm("작성 중인 브리핑을 비울까요?")) return;
    draft = { date: kstDate(), session: sel.value, summary: "", items: [] }; $("#draftSummary").value = ""; saveDraft(); renderDraft(); renderCands();
  });

  /* ── 후보 기사 ── */
  var RESULT = null, FILTER = "all";
  var chips = $("#candChips");
  [["all", "전체"]].concat(Object.keys(SECS).map(function (k) { return [k, SECS[k]]; })).forEach(function (c, i) {
    chips.appendChild(h("button", { class: "chip", type: "button", "aria-selected": i === 0 ? "true" : "false", "data-k": c[0],
      onclick: function () { FILTER = c[0]; chips.querySelectorAll(".chip").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.k === FILTER ? "true" : "false"); }); renderCands(); } }, c[1]));
  });
  $("#candSearch").addEventListener("input", renderCands);
  $("#candWide").addEventListener("change", renderCands);
  $("#candReload").addEventListener("click", loadCandidates);

  function loadCandidates() {
    if (!cfg.api || !cfg.edToken) { $("#candStatus").textContent = "설정에서 후보 기사 서버를 연결하세요."; return; }
    $("#candStatus").textContent = "불러오는 중…";
    fetch(cfg.api + "/candidates", { headers: { Authorization: "Bearer " + cfg.edToken }, cache: "no-store" })
      .then(function (r) { if (r.status === 401) throw new Error("편집 토큰이 맞지 않아요"); if (!r.ok) throw new Error("서버 오류 " + r.status); return r.json(); })
      .then(function (raw) {
        RESULT = FDNews.process(raw, { holidays: HOLI, stocks: D.stocks });
        RESULT.raw = raw;
        var ok = 0, st = raw.status || {}, ul = $("#feedStatus"); ul.innerHTML = "";
        (raw.meta.rss || []).forEach(function (f) { if (st[f.key] === "정상") ok++; ul.appendChild(h("li", { text: f.source + " " + f.key + " — " + (st[f.key] || "-") })); });
        $("#candStatus").textContent = fmtTime(Date.parse(raw.fetched_at)) + " 기준 · 피드 " + ok + "/" + (raw.meta.rss || []).length + " · 기사 " + RESULT.stats.raw + "건";
        renderCands();
      })
      .catch(function (e) { $("#candStatus").textContent = "불러오지 못했어요: " + e.message; });
  }
  function renderCands() {
    var ol = $("#candList"); ol.innerHTML = "";
    if (!RESULT) return;
    var wide = $("#candWide").checked, q = $("#candSearch").value.trim();
    var list = wide ? RESULT.allHead : RESULT.allHead;
    if (wide) {
      // 최근 24시간: 섹션 묶음 전체를 합쳐 중복 제거
      var seen = {}, all = [];
      Object.keys(RESULT.sections).forEach(function (k) { RESULT.sections[k].forEach(function (g) { if (!seen[g.id]) { seen[g.id] = 1; all.push(g); } }); });
      list = all.filter(function (g) { return Date.now() - g.newest < 24 * 3600e3; }).sort(function (a, b) { return b.score - a.score; });
    }
    var picked = {}; draft.items.forEach(function (it) { picked[it.url] = 1; });
    list.filter(function (g) { return (FILTER === "all" || g.secs.indexOf(FILTER) >= 0) && (!q || g.items.some(function (x) { return x.title.indexOf(q) >= 0; })); })
      .slice(0, 80).forEach(function (g) {
        var rep = g.rep;
        ol.appendChild(h("li", { class: "ed-cand" + (picked[rep.url] ? " is-picked" : "") },
          h("div", null,
            h("div", { class: "ed-cand__title", text: rep.title }),
            h("div", { class: "ed-cand__meta" }, g.badges.slice(0, 3).map(function (b) { return h("span", { class: "nbadge nbadge--" + b.k, text: b.t }); }),
              h("span", { text: rep.source + " · " + fmtTime(rep.time) + (g.items.length > 1 ? " · 관련 " + (g.items.length - 1) : "") }),
              h("span", { text: "점수 " + g.score }))),
          h("div", { class: "ed-cand__btns" },
            h("button", { class: "btn btn--sm btn--primary", type: "button", disabled: picked[rep.url] ? true : null, onclick: function () {
              var sec = g.secs[0] || "market";
              draft.items.push({ url: rep.url, source: rep.source, title: rep.title, comment: "", sec: sec, time: rep.time });
              saveDraft(); renderDraft(); renderCands();
            } }, "담기"),
            h("a", { class: "btn btn--sm", href: rep.url, target: "_blank", rel: "noopener" }, "원문"))));
      });
    if (!ol.children.length) ol.appendChild(h("li", { class: "ed-empty", text: "조건에 맞는 기사가 없어요." }));
  }

  /* ── GitHub 게시 ── */
  function ghHeaders() { return { Authorization: "Bearer " + cfg.ghToken, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }; }
  function b64decode(s) { var bin = atob(s.replace(/\n/g, "")), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new TextDecoder().decode(arr); }
  function b64encode(str) { var bytes = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
  function ghGet() {
    return fetch("https://api.github.com/repos/" + cfg.repo + "/contents/" + PATH + "?ref=main&t=" + Date.now(), { headers: ghHeaders(), cache: "no-store" })
      .then(function (r) { if (r.status === 404) return { sha: null, data: { editions: [] } }; if (!r.ok) throw new Error("GitHub 읽기 실패 " + r.status); return r.json().then(function (j) { return { sha: j.sha, data: JSON.parse(b64decode(j.content)) }; }); });
  }
  function ghPut(data, sha, message) {
    var body = { message: message, content: b64encode(JSON.stringify(data, null, 1) + "\n"), branch: "main" };
    if (sha) body.sha = sha;
    return fetch("https://api.github.com/repos/" + cfg.repo + "/contents/" + PATH, { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error("GitHub 저장 실패 " + r.status + " " + t.slice(0, 120)); }); return r.json(); });
  }
  $("#publishBtn").addEventListener("click", function () {
    var msg = $("#publishMsg");
    if (needSettings()) { msg.textContent = "설정을 먼저 완료해 주세요."; $("#edSettings").hidden = false; return; }
    var items = draft.items.filter(function (it) { return it.comment && it.comment.trim(); });
    if (!items.length) { msg.textContent = "코멘트를 쓴 기사가 하나도 없어요."; return; }
    var bad = items.filter(function (it) { return it.comment.length > MAX_LEN || similarity(it.comment, it.title) >= 0.7; });
    if (bad.length) { msg.textContent = "원문 제목과 너무 비슷하거나 120자를 넘는 코멘트가 " + bad.length + "개 있어요. 고친 뒤 게시해 주세요."; return; }
    if (draft.items.length > items.length && !confirm("코멘트가 비어 있는 " + (draft.items.length - items.length) + "개는 빼고 게시할까요?")) return;
    if (!confirm(sessionLabel(draft.session) + " 브리핑(" + items.length + "건)을 사이트에 게시할까요?")) return;
    msg.textContent = "게시 중…";
    var edition = {
      id: draft.date + "-" + draft.session + "-" + Date.now().toString(36), date: draft.date, session: draft.session, published_at: new Date().toISOString(),
      summary: (draft.summary || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 3),
      // 공개 데이터에는 원문 제목을 넣지 않습니다 (본인 코멘트 + 출처 + 링크만)
      items: items.map(function (it) { return { sec: it.sec, comment: it.comment.trim(), source: it.source, url: it.url, time: it.time ? new Date(it.time).toISOString() : null }; })
    };
    ghGet().then(function (cur) {
      var data = cur.data || {}; data.editions = [edition].concat((data.editions || []).filter(function (e) { return !(e.date === edition.date && e.session === edition.session); })).slice(0, KEEP_EDITIONS);
      data.updated_at = edition.published_at;
      return ghPut(data, cur.sha, "브리핑 게시: " + edition.date + " " + sessionLabel(edition.session));
    }).then(function () {
      msg.textContent = "게시했어요. 1~2분 뒤 사이트에 반영됩니다. (같은 날 같은 세션 브리핑은 새 글로 교체돼요)";
      loadEditions();
    }).catch(function (e) { msg.textContent = "게시 실패: " + e.message; });
  });

  function loadEditions() {
    var ul = $("#editionList"); ul.innerHTML = "";
    if (needSettings()) return;
    ghGet().then(function (cur) {
      var eds = (cur.data && cur.data.editions) || [];
      if (!eds.length) { ul.appendChild(h("li", { class: "ed-empty", text: "아직 게시한 브리핑이 없어요." })); return; }
      eds.slice(0, 10).forEach(function (e) {
        ul.appendChild(h("li", null, h("b", { text: e.date + " " + sessionLabel(e.session) }), h("span", { text: e.items.length + "건" }), h("span", { class: "spacer" }),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () {
            draft = { date: kstDate(), session: e.session, summary: (e.summary || []).join("\n"), items: e.items.map(function (x) { return { url: x.url, source: x.source, title: "", comment: x.comment, sec: x.sec, time: x.time ? Date.parse(x.time) : null }; }) };
            sel.value = draft.session; $("#draftSummary").value = draft.summary; saveDraft(); renderDraft(); renderCands();
          } }, "불러와 수정"),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () {
            if (!confirm(e.date + " " + sessionLabel(e.session) + " 브리핑을 사이트에서 내릴까요?")) return;
            ghGet().then(function (c2) {
              c2.data.editions = (c2.data.editions || []).filter(function (x) { return x.id !== e.id; });
              return ghPut(c2.data, c2.sha, "브리핑 삭제: " + e.date + " " + sessionLabel(e.session));
            }).then(loadEditions).catch(function (err) { alert("삭제 실패: " + err.message); });
          } }, "내리기")));
      });
    }).catch(function (e) { ul.appendChild(h("li", { class: "ed-empty", text: "불러오지 못했어요: " + e.message })); });
  }

  renderDraft();
  loadCandidates();
  loadEditions();
})();
