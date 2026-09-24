/* FinDesk 편집실 — 주간 금융 도서 작성 → GitHub(data/books.json)에 게시 */
(function () {
  "use strict";
  var PATH = "data/books.json", MAX_SUBS = 2;
  var LIMIT = { reason: 300, comment: 600 };
  var DISCLOSURE = { "": "표시할 이해관계 없음", gift: "출판사로부터 도서를 제공받음 (협찬)", affiliate: "제휴 링크 포함 (구매 시 수수료를 받을 수 있음)" };

  function $(s) { return document.querySelector(s); }
  function h(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { var v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (k === "value") n.value = v; else if (k === "checked") n.checked = !!v; else n.setAttribute(k, v === true ? "" : v); }
    (function add(l) { for (var i = 0; i < l.length; i++) { var c = l[i]; if (c == null || c === false) continue; if (Array.isArray(c)) add(c); else n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); } })(Array.prototype.slice.call(arguments, 2));
    return n;
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
  function mondayOf(dateStr) {
    var d = new Date(dateStr + "T00:00:00Z"), wd = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - wd * 864e5).toISOString().slice(0, 10);
  }
  function range(week) {
    var s = new Date(week + "T00:00:00Z"), e = new Date(s.getTime() + 6 * 864e5);
    return (s.getUTCMonth() + 1) + "/" + s.getUTCDate() + "–" + (e.getUTCMonth() + 1) + "/" + e.getUTCDate();
  }

  /* ── 설정 (브리핑 편집실과 공유) ── */
  var cfg = { repo: store("fd-ed-repo") || "", ghToken: store("fd-ed-gh") || "" };
  $("#setRepo").value = cfg.repo; $("#setGhToken").value = cfg.ghToken;
  function needSettings() { return !cfg.repo || !cfg.ghToken; }
  $("#edSettings").hidden = !needSettings();
  $("#edSettingsBtn").addEventListener("click", function () { $("#edSettings").hidden = !$("#edSettings").hidden; });
  $("#setSave").addEventListener("click", function () {
    cfg.repo = $("#setRepo").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, ""); cfg.ghToken = $("#setGhToken").value.trim();
    store("fd-ed-repo", cfg.repo); store("fd-ed-gh", cfg.ghToken);
    $("#setMsg").textContent = "저장했어요."; loadWeeks();
  });

  /* ── 초안 ── */
  function blankBook(role) { return { role: role, title: "", author: "", publisher: "", year: "", link: "", level: "intro", audience: ["취준생"], time: "", tags: "", reason: "", comment: "", disclosure: "" }; }
  var draft;
  try { draft = JSON.parse(store("fd-ed-books-draft") || "null"); } catch (e) { draft = null; }
  if (!draft || !draft.books) draft = { week: mondayOf(kstToday()), theme: "", books: [blankBook("main")] };
  function saveDraft() { store("fd-ed-books-draft", JSON.stringify(draft)); $("#draftSaved").textContent = "임시저장됨"; }

  var weekIn = $("#bWeek"), themeIn = $("#bTheme");
  weekIn.value = draft.week; themeIn.value = draft.theme || "";
  weekIn.addEventListener("change", function () { if (!weekIn.value) return; draft.week = mondayOf(weekIn.value); weekIn.value = draft.week; saveDraft(); });
  themeIn.addEventListener("input", function () { draft.theme = themeIn.value; saveDraft(); });

  function field(b, key, label, attrs) {
    var input = h("input", Object.assign({ value: b[key] || "" }, attrs || {}));
    input.addEventListener("input", function () { b[key] = input.value; saveDraft(); });
    return h("label", null, label, input);
  }
  function area(b, key, label, rows, placeholder) {
    var cnt = h("span", { class: "ed-count" });
    var ta = h("textarea", { rows: rows, maxlength: LIMIT[key], placeholder: placeholder, value: b[key] || "" });
    function upd() { cnt.textContent = " " + ta.value.length + "/" + LIMIT[key]; }
    ta.addEventListener("input", function () { b[key] = ta.value; upd(); saveDraft(); });
    upd();
    return h("label", { class: "ed-label" }, h("span", null, label, cnt), ta);
  }
  function renderBooks() {
    var box = $("#bBooks"); box.innerHTML = "";
    draft.books.forEach(function (b, i) {
      var level = h("select", null, [["intro", "입문"], ["mid", "중급"], ["pro", "실무"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
      level.value = b.level || "intro";
      level.addEventListener("change", function () { b.level = level.value; saveDraft(); });
      var disc = h("select", null, Object.keys(DISCLOSURE).map(function (k) { return h("option", { value: k, text: DISCLOSURE[k] }); }));
      disc.value = b.disclosure || "";
      disc.addEventListener("change", function () { b.disclosure = disc.value; saveDraft(); });
      var cbs = ["취준생", "실무자"].map(function (a) { return h("input", { type: "checkbox", value: a, checked: (b.audience || []).indexOf(a) >= 0 }); });
      cbs.forEach(function (cb) { cb.addEventListener("change", function () { b.audience = cbs.filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); saveDraft(); }); });
      var aud = cbs.map(function (cb) { return h("label", { class: "ed-check" }, cb, cb.value); });
      box.appendChild(h("div", { class: "ed-book" },
        h("div", { class: "ed-book__head" }, h("span", { text: b.role === "main" ? "이번 주 메인 도서" : "함께 읽기 " + i }), h("span", { class: "spacer" }),
          b.role === "main" ? null : h("button", { class: "btn btn--sm", type: "button", onclick: function () { draft.books.splice(i, 1); saveDraft(); renderBooks(); } }, "삭제")),
        h("div", { class: "ed-grid" },
          field(b, "title", "제목 *", { placeholder: "책 제목" }),
          field(b, "author", "저자 *", { placeholder: "저자명" }),
          field(b, "publisher", "출판사", { placeholder: "출판사" })),
        h("div", { class: "ed-grid" },
          field(b, "year", "출간연도", { placeholder: "2024", inputmode: "numeric", maxlength: 4 }),
          h("label", null, "난이도", level),
          field(b, "time", "예상 독서 시간", { placeholder: "약 6시간" })),
        h("div", { class: "ed-grid ed-grid--2" },
          field(b, "tags", "주제 태그 (쉼표로 구분)", { placeholder: "채권, 금리" }),
          field(b, "link", "링크 (선택 · 비우면 서점 검색)", { placeholder: "https://…" })),
        h("div", { class: "ed-checks", style: "margin-top:8px" }, h("span", { text: "대상" }), aud, h("span", { class: "spacer", style: "flex:1" }), h("label", { class: "ed-check" }, "표시 ", disc)),
        area(b, "reason", "추천 이유 *", 3, "예) 금통위가 있는 주. 기준금리 → 국고채 → 회사채로 이어지는 금리 전달 경로를 가장 쉽게 설명한 책."),
        area(b, "comment", "나의 코멘트 *", 5, "읽으며 든 생각, 실무·면접에서 쓸 포인트, 아쉬운 점 등을 본인 말로.")));
    });
    $("#bAdd").disabled = draft.books.length > MAX_SUBS;
  }
  $("#bAdd").addEventListener("click", function () { if (draft.books.length <= MAX_SUBS) { draft.books.push(blankBook("sub")); saveDraft(); renderBooks(); } });
  $("#bClear").addEventListener("click", function () {
    if (!confirm("작성 중인 내용을 비울까요?")) return;
    draft = { week: mondayOf(kstToday()), theme: "", books: [blankBook("main")] };
    weekIn.value = draft.week; themeIn.value = ""; saveDraft(); renderBooks();
  });

  /* ── GitHub ── */
  function ghHeaders() { return { Authorization: "Bearer " + cfg.ghToken, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }; }
  function b64decode(s) { var bin = atob(s.replace(/\n/g, "")), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new TextDecoder().decode(arr); }
  function b64encode(str) { var bytes = new TextEncoder().encode(str), bin = ""; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
  function ghGet() {
    return fetch("https://api.github.com/repos/" + cfg.repo + "/contents/" + PATH + "?ref=main&t=" + Date.now(), { headers: ghHeaders(), cache: "no-store" })
      .then(function (r) { if (r.status === 404) return { sha: null, data: { weeks: [] } }; if (!r.ok) throw new Error("GitHub 읽기 실패 " + r.status); return r.json().then(function (j) { return { sha: j.sha, data: JSON.parse(b64decode(j.content)) }; }); });
  }
  function ghPut(data, sha, message) {
    var body = { message: message, content: b64encode(JSON.stringify(data, null, 1) + "\n"), branch: "main" };
    if (sha) body.sha = sha;
    return fetch("https://api.github.com/repos/" + cfg.repo + "/contents/" + PATH, { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error("GitHub 저장 실패 " + r.status + " " + t.slice(0, 120)); }); return r.json(); });
  }

  function clean(b) {
    var out = { role: b.role, title: b.title.trim(), author: b.author.trim(), publisher: (b.publisher || "").trim(), year: (b.year || "").trim(),
      level: b.level, audience: b.audience || [], time: (b.time || "").trim(),
      tags: String(b.tags || "").split(/[,，]/).map(function (t) { return t.trim().replace(/^#/, ""); }).filter(Boolean).slice(0, 6),
      reason: b.reason.trim(), comment: b.comment.trim() };
    var link = (b.link || "").trim();
    if (/^https:\/\//.test(link)) out.link = link;
    if (b.disclosure && DISCLOSURE[b.disclosure]) out.disclosure = DISCLOSURE[b.disclosure];
    return out;
  }

  $("#bPublish").addEventListener("click", function () {
    var msg = $("#bMsg");
    if (needSettings()) { msg.textContent = "설정을 먼저 완료해 주세요."; $("#edSettings").hidden = false; return; }
    var books = draft.books.filter(function (b) { return b.title.trim(); });
    var missing = books.filter(function (b) { return !b.author.trim() || !b.reason.trim() || !b.comment.trim(); });
    if (!books.length || books[0].role !== "main") { msg.textContent = "메인 도서 제목을 입력해 주세요."; return; }
    if (missing.length) { msg.textContent = "저자·추천 이유·코멘트가 비어 있는 책이 " + missing.length + "권 있어요."; return; }
    var badLink = books.filter(function (b) { return (b.link || "").trim() && !/^https:\/\//.test(b.link.trim()); });
    if (badLink.length) { msg.textContent = "링크는 https:// 로 시작해야 해요."; return; }
    if (!$("#bOwn").checked) { msg.textContent = "아래 확인란(직접 쓴 문장)을 체크해 주세요."; return; }
    if (!confirm(range(draft.week) + " 주간 도서 " + books.length + "권을 사이트에 게시할까요?")) return;
    msg.textContent = "게시 중…";
    var week = { id: draft.week, week: draft.week, published_at: new Date().toISOString(), theme: (draft.theme || "").trim(), books: books.map(clean) };
    ghGet().then(function (cur) {
      var data = cur.data || {};
      data.weeks = [week].concat((data.weeks || []).filter(function (w) { return w.week !== week.week; }))
        .sort(function (a, b) { return a.week < b.week ? 1 : -1; });
      data.updated_at = week.published_at;
      return ghPut(data, cur.sha, "주간 도서 게시: " + week.week);
    }).then(function () {
      msg.textContent = "게시했어요. 1~2분 뒤 사이트에 반영됩니다. (" + range(week.week) + " 주가 시작되면 메인에 보여요)";
      $("#bOwn").checked = false;
      loadWeeks();
    }).catch(function (e) { msg.textContent = "게시 실패: " + e.message; });
  });

  function loadWeeks() {
    var ul = $("#bWeeks"); ul.innerHTML = "";
    if (needSettings()) { ul.appendChild(h("li", { class: "ed-empty", text: "설정을 먼저 완료해 주세요." })); return; }
    ghGet().then(function (cur) {
      var weeks = (cur.data && cur.data.weeks) || [];
      if (!weeks.length) { ul.appendChild(h("li", { class: "ed-empty", text: "아직 게시한 도서가 없어요." })); return; }
      weeks.forEach(function (w) {
        ul.appendChild(h("li", null, h("b", { text: range(w.week) }), h("span", { text: (w.books[0] && w.books[0].title) + (w.books.length > 1 ? " 외 " + (w.books.length - 1) + "권" : "") }), h("span", { class: "spacer" }),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () {
            draft = { week: w.week, theme: w.theme || "", books: w.books.map(function (b) {
              var d = Object.assign(blankBook(b.role), b); d.tags = (b.tags || []).join(", ");
              d.disclosure = Object.keys(DISCLOSURE).filter(function (k) { return DISCLOSURE[k] === b.disclosure; })[0] || ""; return d; }) };
            weekIn.value = draft.week; themeIn.value = draft.theme; saveDraft(); renderBooks(); window.scrollTo(0, 0);
          } }, "불러와 수정"),
          h("button", { class: "btn btn--sm", type: "button", onclick: function () {
            if (!confirm(range(w.week) + " 주간 도서를 사이트에서 내릴까요?")) return;
            ghGet().then(function (c2) {
              c2.data.weeks = (c2.data.weeks || []).filter(function (x) { return x.week !== w.week; });
              return ghPut(c2.data, c2.sha, "주간 도서 삭제: " + w.week);
            }).then(loadWeeks).catch(function (err) { alert("삭제 실패: " + err.message); });
          } }, "내리기")));
      });
    }).catch(function (e) { ul.appendChild(h("li", { class: "ed-empty", text: "불러오지 못했어요: " + e.message })); });
  }

  renderBooks();
  loadWeeks();
})();
