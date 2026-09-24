# FinDesk — 금융인을 위한 아침 데스크

금융권 종사자와 취업준비생을 위한 **정보 제공용(비영리)** 금융 대시보드입니다.
뉴스는 기사를 자동으로 옮기지 않고, **운영자가 직접 고르고 자기 문장으로 정리한 "편집 브리핑"** 으로 제공합니다.

## 법적 위험을 줄이기 위한 운영 원칙
- 언론사 기사 제목·본문을 공개 화면에 자동 게시하지 않습니다. (언론사 RSS 약관·뉴스 이용규칙상 재배포 금지)
- 네이버 API·AI 요약을 쓰지 않습니다.
- 공개 화면의 브리핑은 **운영자 문장 + 출처 + 원문 링크**만 담습니다. 편집 데이터(`data/briefing.json`)에도 원문 제목은 저장하지 않습니다.
- 후보 기사 수집은 **운영자 개인 열람용**(토큰으로 보호되는 서버)이며 공개하지 않고 저장하지 않습니다.
- 금융위원회 보도자료(정부 공식 발표)는 제목 + 원문 링크로 표시합니다.
- 해외 뉴스는 TradingView 공식 위젯(라이선스 제공)으로 표시합니다.

## 시간대별 세션 (한국시간, 평일)
| 시간 | 세션 | 브리핑 초점 · '지금 볼 곳' 링크 |
|---|---|---|
| 05:00~08:00 | 모닝 브리핑 | 간밤 미국·유럽 마감 + 전일 국내 마감 이후 이슈 |
| 08:00~09:00 | 개장 전 | 넥스트레이드 프리마켓, 동시호가, 환율 개장 |
| 09:00~15:30 | 장중 | 개장 시황·특징주·수급 |
| 15:30~20:00 | 국내 마감 | 마감 시황·수급·장 마감 후 공시·실적 |
| 20:00~05:00 | 글로벌 | 유럽 증시·미국 개장 전후·지표 발표 |

---

## 편집 브리핑 쓰는 법 (`editor.html`)
1. 사이트 주소 뒤에 `/editor.html` 을 붙여 엽니다. (검색엔진 비노출, 메뉴에 링크 없음)
2. 처음 한 번 **설정**에 네 가지를 입력합니다 (이 기기 브라우저에만 저장):
   - 후보 기사 서버 주소 / 편집 토큰 (Cloudflare에서 만든 것)
   - GitHub 저장소 (`아이디/findesk`) / GitHub 토큰 (이 저장소 쓰기 권한만)
3. 왼쪽 **후보 기사**에서 오늘 볼 기사를 **담기** → 오른쪽에서 **본인 문장**으로 한 줄 코멘트(120자 이내)
   - 원문 제목과 너무 비슷하면 경고가 뜨고 게시가 막힙니다.
4. **게시하기** → 1~2분 뒤 사이트에 반영. 같은 날 같은 세션은 새 글로 교체됩니다.
5. 최근 게시 목록에서 **불러와 수정** / **내리기** 가능.

추천 루틴: 모닝(07:30까지) · 국내 마감(16:30까지) 하루 2번, 각 5~8건.

---

## 1. 사이트 배포 (GitHub Pages, 무료)
1. GitHub 저장소 `findesk` (Public) 생성 → 이 폴더 파일 업로드 (`.github` 폴더 포함)
2. **Settings → Pages → Source: GitHub Actions**
3. **Settings → Secrets and variables → Actions** → `ECOS_API_KEY` 추가
4. **Actions → 데이터 수집 및 배포 → Run workflow** → `https://아이디.github.io/findesk/`

## 2. 후보 기사 서버 (Cloudflare Worker, 무료) — 편집용
1. Cloudflare → Workers & Pages → Create Worker (`findesk-editor`) → Edit code → `worker/worker.js` 붙여넣기 → Deploy
2. Settings → Variables and Secrets → **Secret** `EDITOR_TOKEN` (긴 임의 문자열) / Text `ALLOWED_ORIGIN` = `https://아이디.github.io`
3. `https://findesk-editor.아이디.workers.dev/health` 에서 `"token_set":true` 확인
- KV·예약 실행·AI 키는 필요 없습니다.

## 3. GitHub 토큰 (편집기 게시용)
GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate
- Repository access: **Only select repositories → findesk**
- Permissions: **Contents: Read and write** (나머지 없음)
- 만료일을 정해 두고, 만료되면 새로 만들어 편집기 설정에 다시 넣으세요.

---

## 내용 바꾸기
| 바꾸고 싶은 것 | 파일 |
|---|---|
| 세션별 '지금 볼 곳', 섹션별 바로가기, 위젯 종목 | `assets/js/config.js` |
| 후보 기사 RSS 목록 (개인 열람용) | `worker/worker.js` 의 `RSS` |
| 후보 기사 점수·분류 기준 | `assets/js/news.js` (`SCORE`, `SEC_RULES`) |
| 금융·정책 일정, 자격시험, 휴장일 | `data/schedule.json` |
| 사이트 모음 | `data/links.json` |
| 명언 | `data/quotes.json` |
| 검색 노출 문구·인증 코드 | `site.config.json` |

JSON을 고친 뒤 내 컴퓨터에서 미리 보려면 `python3 scripts/update_data.py --offline` 로 번들을 다시 만드세요.

## 검색(구글·네이버) 노출
배포 시 sitemap.xml·robots.txt·메타태그가 자동 생성됩니다(편집기는 제외). Google Search Console / 네이버 서치어드바이저에서 HTML 태그 인증값을 `site.config.json` 에 넣고 사이트맵을 제출하세요.

## 알아둘 점
- 정보 제공 목적이며 투자 권유가 아닙니다. 매수·매도 권유나 목표가 제시는 하지 않습니다.
- 광고·유료화를 하려면 데이터·위젯 이용 조건과 유사투자자문업(유료 회원제) 규정을 먼저 확인하세요.
- 나중에 기사 헤드라인 자동 표시를 원하면 언론사에 "비영리 사이트 제목+링크 표시" 허락을 받거나 뉴스 라이선스를 검토하세요.
- 휴장일 목록(`schedule.json` 의 `holidays`)은 매년 갱신하세요.

## 폴더 구조
```
index.html / sites.html / editor.html   메인 / 사이트 모음 / 편집실(운영자 전용)
assets/js/config.js       세션·섹션 링크, 위젯 종목
assets/js/app.js          메인 화면 (브리핑·지표·일정)
assets/js/news.js         편집실 후보 기사 분류·점수 엔진
assets/js/editor.js       편집실 동작 (GitHub에 게시)
data/briefing.json        게시된 브리핑 (편집기가 갱신)
data/policy.json          금융위원회 보도자료 (자동 수집)
data/*.json               지표·일정·링크·명언·용어
worker/worker.js          후보 기사 서버 (토큰 보호, 개인 열람용)
scripts/update_data.py    ECOS·보도자료 수집 + 번들 생성
scripts/build_seo.py      sitemap·robots·메타태그
.github/workflows/deploy.yml  push·2시간마다 배포
```
