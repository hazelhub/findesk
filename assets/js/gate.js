/* 공개 전 '오픈 준비 중' 화면. OPEN_AT 이후에는 자동으로 누구나 볼 수 있습니다.
   운영자 미리보기: 주소 뒤에 ?preview=findesk 를 한 번 붙여 열면 이 브라우저에서는 계속 보입니다. */
(function () {
  var OPEN_AT = "2099-01-01T00:00:00+09:00", KEY = "findesk";
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
    document.body.innerHTML = '<main class="gate"><div><h1>FinDesk 점검 중</h1><p>더 정확한 정보를 위해 데이터를 점검하고 있어요.</p><p>점검을 마치면 다시 열게요.</p></div></main>';
    document.body.style.visibility = "visible";
  });
})();
