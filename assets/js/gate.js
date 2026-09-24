/* 공개 전 '오픈 준비 중' 화면. OPEN_AT 이후에는 자동으로 누구나 볼 수 있습니다.
   운영자 미리보기: 주소 뒤에 ?preview=findesk 를 한 번 붙여 열면 이 브라우저에서는 계속 보입니다. */
(function () {
  var OPEN_AT = "2026-09-29T07:30:00+09:00", KEY = "findesk";
  try {
    var m = location.search.match(/[?&]preview=([^&]+)/);
    if (m) localStorage.setItem("fd-preview", decodeURIComponent(m[1]));
    if (Date.now() >= Date.parse(OPEN_AT) || localStorage.getItem("fd-preview") === KEY) return;
  } catch (e) { if (Date.now() >= Date.parse(OPEN_AT)) return; }
  var root = document.documentElement;
  root.classList.add("gated"); window.FD_GATED = true;
  var st = document.createElement("style");
  st.textContent = "html.gated body{visibility:hidden}.gate{visibility:visible;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif}.gate h1{font-size:22px;margin:0 0 8px}.gate p{color:#666;margin:4px 0}";
  document.head.appendChild(st);
  document.addEventListener("DOMContentLoaded", function () {
    document.body.innerHTML = '<main class="gate"><div><h1>FinDesk 오픈 준비 중</h1><p>금융인을 위한 아침 데스크가 곧 문을 엽니다.</p><p>9월 29일(화) 오전 공개 예정</p></div></main>';
    document.body.style.visibility = "visible";
  });
})();
