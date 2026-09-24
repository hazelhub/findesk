#!/usr/bin/env python3
"""섹터별 뉴스 온도 (긍정·부정 비율) 생성 — 표준 라이브러리만 사용.

언론사 RSS에서 최근 기사 '제목'을 읽어
  1) 국내·미국 섹터로 분류하고
  2) 금융 용어 사전으로 긍정/부정/중립을 판정해
  3) 섹터별 비율·건수와 원문 링크 목록을 data/news.json 에 저장합니다.

공개 데이터에는 기사 제목·본문을 넣지 않습니다 (언론사·시각·링크·판정 근거 단어만).
판정은 제목 기반 자동 분류라 오류가 있을 수 있으며 투자 판단 근거가 아닙니다.

실행 시점 (한국시간)
  오전판: 전일 15:30 ~ 실행 시각   (국내 마감 이후 + 미국 장)
  오후판: 당일 07:00 ~ 실행 시각   (당일 장중·속보)
사용법
  python scripts/build_news.py            # 시간대에 맞는 판(오전/오후)을 새로 만들 때만 갱신
  python scripts/build_news.py --force am # 강제로 오전판 생성
  python scripts/build_news.py --raw file # (테스트) 저장된 RSS 묶음으로 실행
"""
from __future__ import annotations

import datetime as dt
import email.utils
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
KST = dt.timezone(dt.timedelta(hours=9))
UA = "Mozilla/5.0 (compatible; FinDeskBot/1.0)"
KEEP_EDITIONS = 6
KEEP_HISTORY = 120
MAX_LINKS = 30
EVENT_CAP = 3      # 같은 사건은 최대 3건까지만 비율에 반영 (한 사건이 비율을 독차지하지 않게)
MIN_SAMPLE = 5

FEEDS = [
    ("hk_fin", "https://www.hankyung.com/feed/finance", "한국경제"),
    ("hk_eco", "https://www.hankyung.com/feed/economy", "한국경제"),
    ("hk_int", "https://www.hankyung.com/feed/international", "한국경제"),
    ("hk_re", "https://www.hankyung.com/feed/realestate", "한국경제"),
    ("hk_it", "https://www.hankyung.com/feed/it", "한국경제"),
    ("hk_ind", "https://www.hankyung.com/feed/industry", "한국경제"),
    ("mk_stock", "https://www.mk.co.kr/rss/50200011/", "매일경제"),
    ("mk_eco", "https://www.mk.co.kr/rss/30100041/", "매일경제"),
    ("yna_eco", "https://www.yna.co.kr/rss/economy.xml", "연합뉴스"),
    ("yna_mkt", "https://www.yna.co.kr/rss/market.xml", "연합뉴스"),
    ("yna_int", "https://www.yna.co.kr/rss/international.xml", "연합뉴스"),
    ("yna_ind", "https://www.yna.co.kr/rss/industry.xml", "연합뉴스"),
    ("ed_all", "http://rss.edaily.co.kr/edaily_news.xml", "이데일리"),
    ("mt_all", "http://rss.mt.co.kr/mt_news.xml", "머니투데이"),
]

JUNK = re.compile(r"(\[포토\]|\[사진\]|\[인사\]|\[부고\]|\[게시판\]|\[표\]|\[그래픽\]|\[오늘의|운세|알림\]|\[광고|이벤트\]|\[모닝브리핑\]|\[카드뉴스\]|\[영상\])")

# ── 섹터 사전 ─────────────────────────────────────────────
US_CTX = re.compile(r"뉴욕|미국|美|월가|나스닥|S&P|다우|필라델피아|엔비디아|테슬라|애플|마이크로소프트|알파벳|구글|아마존|메타|브로드컴|AMD|인텔|마이크론|퀄컴|TSMC|오픈AI|팔란티어|JP모건|골드만|모건스탠리|뱅크오브아메리카|웰스파고|엑슨|셰브론|일라이릴리|화이자|머크|존슨앤드존슨|노보")
# 국내 섹터에서 제외할 '미국 시장·기업 기사' 표지 (美·미국 같은 단어만으로는 제외하지 않음)
US_MARKET = re.compile(r"뉴욕증시|뉴욕 증시|나스닥|S&P|다우|월가|필라델피아|엔비디아|테슬라|애플|마이크로소프트|알파벳|아마존|메타|브로드컴|AMD|인텔|마이크론|퀄컴|팔란티어|JP모건|골드만|모건스탠리|엑슨|셰브론|일라이릴리|화이자")
KR_SECTORS = [
    ("semi", "반도체", r"반도체|삼성전자|SK하이닉스|하이닉스|HBM|D램|디램|낸드|파운드리|메모리|한미반도체|DB하이텍"),
    ("battery", "2차전지", r"2차전지|이차전지|배터리|LG에너지솔루션|LG엔솔|에코프로|양극재|음극재|포스코퓨처엠|삼성SDI|SK온|리튬"),
    ("auto", "자동차", r"현대차|현대자동차|기아|완성차|현대모비스|자동차 ?수출|자동차 ?판매|자동차 ?관세"),
    ("bio", "바이오·제약", r"바이오|제약|신약|셀트리온|삼성바이오|임상|유한양행|한미약품|알테오젠|기술수출"),
    ("ship", "조선·방산", r"조선|HD현대중공업|HD한국조선해양|한화오션|삼성중공업|방산|방위산업|한화에어로|LIG넥스원|현대로템|KAI|한국항공우주|K-?방산"),
    ("fin", "금융", r"은행|금융지주|KB금융|신한|하나금융|우리금융|보험|증권사|카드사|저축은행|밸류업|배당"),
    ("realty", "건설·부동산", r"건설|부동산|아파트|주택|분양|재건축|재개발|청약|집값|전세|월세|PF|주담대|토지거래"),
    ("platform", "인터넷·게임", r"네이버|카카오|게임|엔씨|넷마블|크래프톤|넥슨|플랫폼|웹툰|엔터"),
    ("energy", "에너지·화학", r"정유|석유화학|화학|LG화학|롯데케미칼|SK이노베이션|에쓰오일|S-?Oil|유가|원유|OPEC|태양광|원전|한수원|두산에너빌리티|전력"),
    ("consumer", "유통·소비", r"유통|이마트|롯데쇼핑|편의점|화장품|면세|소비심리|식품|K-?뷰티|백화점|쿠팡|항공사|여행"),
]
US_SECTORS = [
    ("market", "미국 증시 전반", r"뉴욕증시|뉴욕 증시|나스닥|S&P|다우|월가|미 증시|美 증시|미국 증시"),
    ("bigtech", "빅테크", r"애플|마이크로소프트|MS[ ,]|알파벳|구글|아마존|메타|빅테크|매그니피센트|오픈AI|팔란티어"),
    ("semi", "반도체", r"엔비디아|AMD|브로드컴|인텔|마이크론|퀄컴|TSMC|필라델피아 ?반도체|반도체지수"),
    ("ev", "전기차", r"테슬라|리비안|루시드|전기차"),
    ("fin", "금융", r"JP모건|골드만|모건스탠리|뱅크오브아메리카|BoA|웰스파고|씨티|美 은행|미국 은행"),
    ("energy", "에너지", r"엑슨|셰브론|WTI|국제유가|유가|OPEC"),
    ("health", "헬스케어", r"일라이릴리|릴리|화이자|머크|존슨앤드존슨|노보|비만치료제|유나이티드헬스"),
]
KR_SECTORS = [(i, n, re.compile(p)) for i, n, p in KR_SECTORS]
US_SECTORS = [(i, n, re.compile(p)) for i, n, p in US_SECTORS]

# ── 감성 사전 (제목 기준) ───────────────────────────────────
# 문구(부정어 포함)를 먼저 처리한 뒤 단어를 셉니다.
PHRASE_POS = ["우려 해소", "우려 완화", "불확실성 해소", "적자 탈출", "흑자 전환", "흑자전환", "부진 탈출", "하락 멈춰", "낙폭 축소", "반등 성공",
              "사상 최고", "역대 최대", "최대 실적", "최고치", "신고가", "목표가 상향", "투자의견 상향", "금리 인하 기대"]
PHRASE_NEG = ["상승 제한", "상승폭 축소", "상승분 반납", "기대 못 미", "기대 이하", "예상 하회", "목표가 하향", "투자의견 하향", "적자 전환", "적자전환",
              "역대 최저", "신저가", "최저치", "어닝 쇼크", "어닝쇼크"]
WORD_POS = ["상승", "급등", "강세", "반등", "랠리", "껑충", "뛰었", "뛴다", "올랐", "오른", "치솟", "훨훨", "날개", "호실적", "호조", "흑자", "수주", "성장",
            "개선", "돌파", "증가", "확대", "기대감", "수혜", "회복", "훈풍", "청신호", "선방", "순매수", "상향", "호재", "최대", "최고", "승인", "타결", "합의", "완화"]
WORD_NEG = ["하락", "급락", "약세", "폭락", "추락", "곤두박질", "털썩", "뚝", "내렸", "내린", "밀렸", "주저앉", "적자", "손실", "감소", "급감", "부진", "둔화", "우려",
            "쇼크", "위기", "리스크", "경고", "하향", "순매도", "악재", "먹구름", "적신호", "비상", "타격", "충격", "침체", "불안", "공포", "관세", "규제", "제재",
            "과징금", "소송", "파산", "부도", "연체", "리콜", "해킹", "파업", "철수", "취소", "지연", "결렬", "최저", "경색"]


# 금리·환율·물가처럼 '오르면 시장에 부담'인 대상: 방향 단어의 의미를 뒤집음
INVERSE = re.compile(r"금리|국채|국고채|채권 ?금리|수익률|환율|원/달러|원·달러|달러 ?강세|물가|인플레|유가|전셋값|전월셋값|월세|연체율|실업률|변동성|VIX|공포지수")
DIR_UP = {"상승", "급등", "반등", "랠리", "껑충", "뛰었", "뛴다", "올랐", "오른", "치솟", "훨훨", "최고치", "사상 최고", "최고", "돌파", "강세"}
DIR_DOWN = {"하락", "급락", "약세", "폭락", "추락", "곤두박질", "털썩", "뚝", "내렸", "내린", "밀렸", "최저치", "최저"}


def judge(title: str):
    label, words = _judge(title)
    if INVERSE.search(title) and not re.search(r"코스피|코스닥|증시|주가|지수", title):
        # 방향 단어만 뒤집어 다시 계산
        l2, w2, p2, n2 = _judge_detail(title)
        p3 = [w for w in p2 if w not in DIR_UP] + [w for w in n2 if w in DIR_DOWN]
        n3 = [w for w in n2 if w not in DIR_DOWN] + [w for w in p2 if w in DIR_UP]
        sc = len(p3) - len(n3)
        lab = "pos" if sc > 0 else "neg" if sc < 0 else "neu"
        return lab, (p3 if lab == "pos" else n3 if lab == "neg" else p3 + n3)[:3]
    return label, words


def _judge(title: str):
    l, w, _, _ = _judge_detail(title)
    return l, w


def _judge_detail(title: str):
    t = title
    pos, neg = [], []
    for p in PHRASE_POS:
        if p in t:
            pos.append(p); t = t.replace(p, " ")
    for p in PHRASE_NEG:
        if p in t:
            neg.append(p); t = t.replace(p, " ")
    for w in WORD_POS:
        if w in t:
            pos.append(w); t = t.replace(w, " ")
    for w in WORD_NEG:
        if w in t:
            neg.append(w); t = t.replace(w, " ")
    score = len(pos) - len(neg)
    label = "pos" if score > 0 else "neg" if score < 0 else "neu"
    words = pos if label == "pos" else neg if label == "neg" else (pos + neg)
    return label, words[:3], pos, neg


# ── 사건 묶기용 토큰 ─────────────────────────────────────────
STOP = set("속보 종합 단독 오늘 내일 이번 지난 올해 관련 발표 전망 기자 뉴스 대비 기준 가능성 영향 위해 대한 따라 이후 이날 현재 최근 사진 영상 포토 1보 2보".split())
ALIAS = {"美": "미국", "中": "중국", "日": "일본", "韓": "한국", "英": "영국", "獨": "독일", "與": "여당", "野": "야당"}
JOSA = re.compile(r"(으로|에서|에게|까지|부터|이며|이고|하고|했다|한다|하는|된다|됐다|에는|에도|은|는|이|가|을|를|에|의|로|와|과|도|만)$")


def tokens(title: str) -> set:
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)|<[^>]*>", " ", title)
    for k, v in ALIAS.items():
        t = t.replace(k, " " + v + " ")
    out = set()
    for w in re.split(r"[^0-9A-Za-z가-힣]+", t):
        if len(w) < 2 or w.isdigit():
            continue
        if len(w) > 2:
            w = JOSA.sub("", w)
        if len(w) >= 2 and w not in STOP:
            out.add(w)
    return out


# ── RSS 읽기 ────────────────────────────────────────────────
def http_get(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_time(s: str):
    s = (s or "").strip()
    if not s:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$", s)
    if m:  # 시간대 없는 표기는 한국시간
        y, mo, d, h, mi, se = (int(x or 0) for x in m.groups())
        return dt.datetime(y, mo, d, h, mi, se, tzinfo=KST)
    try:
        v = email.utils.parsedate_to_datetime(s)
        return v if v.tzinfo else v.replace(tzinfo=KST)
    except Exception:
        pass
    try:
        return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def parse_rss(xml_bytes: bytes, source: str):
    root = ET.fromstring(xml_bytes)
    out = []
    for it in root.iter():
        if it.tag.split("}")[-1] not in ("item", "entry"):
            continue
        get = lambda name: next((c for c in it if c.tag.split("}")[-1] == name), None)
        te, le = get("title"), get("link")
        title = html.unescape(re.sub(r"<[^>]+>", "", (te.text or "") if te is not None else "")).strip()
        link = ""
        if le is not None:
            link = (le.text or le.get("href") or "").strip()
        de = next((x for x in (get("pubDate"), get("date"), get("published"), get("updated")) if x is not None), None)
        when = parse_time(de.text if de is not None else "")
        if title and link.startswith("http") and when:
            out.append({"title": title, "url": link, "source": source, "time": when})
    return out


def collect(raw_path: str | None):
    items, status = [], {}
    raw = json.loads(Path(raw_path).read_text("utf-8")) if raw_path else None
    for key, url, source in FEEDS:
        try:
            body = raw["rss"][key].encode("utf-8") if raw else http_get(url)
            got = parse_rss(body, source)
            items += got
            status[key] = len(got)
        except Exception as e:
            status[key] = "실패: " + str(e)[:60]
    # URL 중복 제거
    seen, uniq = set(), []
    for it in sorted(items, key=lambda x: x["time"], reverse=True):
        u = it["url"].split("?")[0]
        if u in seen or JUNK.search(it["title"]):
            continue
        seen.add(u)
        uniq.append(it)
    return uniq, status


# ── 섹터 집계 ───────────────────────────────────────────────
def group_events(arts):
    events = []
    for a in arts:
        tk = a["tok"]
        for ev in events:
            inter = len(tk & ev["tok"])
            if inter >= 3 or (inter >= 2 and inter / max(1, min(len(tk), len(ev["tok"]))) >= 0.5):
                ev["items"].append(a); ev["tok"] |= tk
                break
        else:
            events.append({"items": [a], "tok": set(tk)})
    return events


def keywords_of(events, n=3):
    cnt = {}
    for ev in events:
        for w in ev["tok"]:
            cnt[w] = cnt.get(w, 0) + len(ev["items"])
    return [w for w, c in sorted(cnt.items(), key=lambda x: -x[1]) if c >= 2][:n]


def summarize(sector_id, name, arts):
    events = group_events(sorted(arts, key=lambda a: a["time"], reverse=True))
    weight = {"pos": 0, "neg": 0, "neu": 0}
    lists = {"pos": [], "neg": [], "neu": []}
    for ev in events:
        for i, a in enumerate(ev["items"]):
            if i < EVENT_CAP:
                weight[a["label"]] += 1
            lists[a["label"]].append(a)
    total = sum(weight.values())
    polar = weight["pos"] + weight["neg"]
    link = lambda a: {"s": a["source"], "u": a["url"], "t": a["time"].astimezone(KST).strftime("%m/%d %H:%M"), "w": a["words"]}
    # 표본 키워드는 사건(묶음) 기준 — 섹터 이름과 같은 단어는 제외
    kws = [w for w in keywords_of(events, 6) if w not in name and name not in w][:3]
    return {
        "id": sector_id, "name": name,
        "pos": weight["pos"], "neg": weight["neg"], "neu": weight["neu"], "total": total,
        "articles": len(arts), "events": len(events),
        "pos_pct": round(weight["pos"] / polar * 100) if polar else None,
        "neg_pct": round(weight["neg"] / polar * 100) if polar else None,
        "enough": total >= MIN_SAMPLE,
        "keywords": kws,
        "links": {k: [link(a) for a in v[:MAX_LINKS]] for k, v in lists.items()},
    }


def build(arts, start, end):
    arts = [a for a in arts if start <= a["time"] <= end]
    for a in arts:
        a["label"], a["words"] = judge(a["title"])
        a["tok"] = tokens(a["title"])
    out = {"kr": [], "us": []}
    for market, table in (("kr", KR_SECTORS), ("us", US_SECTORS)):
        for sid, name, rx in table:
            picked = []
            for a in arts:
                is_us = bool(US_CTX.search(a["title"]))
                if market == "us" and not is_us:
                    continue
                if market == "kr" and US_MARKET.search(a["title"]) and not re.search(r"국내|코스피|코스닥|한국|韓|삼성|SK|LG|현대|한화", a["title"]):
                    continue
                if rx.search(a["title"]):
                    picked.append(a)
            if picked:
                out[market].append(summarize(sid, name, picked))
        out[market].sort(key=lambda s: -s["total"])
    return out, len(arts)


def now_kst():
    return dt.datetime.now(KST)


def decide_slot(force: str | None, existing: list) -> str | None:
    n = now_kst()
    today = n.date().isoformat()
    if force in ("am", "pm"):
        return force
    have = {(e["date"], e["slot"]) for e in existing}
    if 7 <= n.hour < 12 and (today, "am") not in have:
        return "am"
    if 16 <= n.hour < 24 and (today, "pm") not in have:
        return "pm"
    return None


def main() -> int:
    args = sys.argv[1:]
    force = args[args.index("--force") + 1] if "--force" in args else os.getenv("NEWS_FORCE") or None
    raw = args[args.index("--raw") + 1] if "--raw" in args else None
    path = DATA / "news.json"
    doc = json.loads(path.read_text("utf-8")) if path.exists() else {"editions": [], "history": []}
    slot = decide_slot(force, doc.get("editions", []))
    if not slot:
        print("[news] 이번 실행은 새 판을 만들 시간이 아님 (오전 07~12시 / 오후 16~24시에 하루 한 번씩)")
        return 0
    end = now_kst()
    if slot == "am":
        start = (end - dt.timedelta(days=1)).replace(hour=15, minute=30, second=0, microsecond=0)
    else:
        start = end.replace(hour=7, minute=0, second=0, microsecond=0)
    start = max(start, end - dt.timedelta(hours=24))
    arts, status = collect(raw)
    markets, n = build(arts, start, end)
    if n == 0:
        print("[news] 수집된 기사가 없어 기존 판 유지", status)
        return 0
    ed = {"date": end.date().isoformat(), "slot": slot, "built_at": end.isoformat(timespec="seconds"),
          "from": start.isoformat(timespec="minutes"), "to": end.isoformat(timespec="minutes"),
          "articles": n, "feeds": status, "markets": markets}
    eds = [e for e in doc.get("editions", []) if not (e["date"] == ed["date"] and e["slot"] == slot)]
    doc["editions"] = sorted([ed] + eds, key=lambda e: (e["date"], e["slot"]), reverse=True)[:KEEP_EDITIONS]
    hist = [h for h in doc.get("history", []) if not (h["date"] == ed["date"] and h["slot"] == slot)]
    hist.append({"date": ed["date"], "slot": slot, "kr": {s["id"]: s["pos_pct"] for s in markets["kr"] if s["enough"]},
                 "us": {s["id"]: s["pos_pct"] for s in markets["us"] if s["enough"]}})
    doc["history"] = sorted(hist, key=lambda h: (h["date"], h["slot"]))[-KEEP_HISTORY:]
    doc["method"] = "언론사 RSS 기사 제목을 금융 용어 사전으로 자동 판정 (긍정·부정·중립). 같은 사건은 최대 3건까지만 비율에 반영."
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), "utf-8")
    ok = sum(1 for v in status.values() if isinstance(v, int))
    print(f"[news] {slot} 판 생성: 기사 {n}건, 피드 {ok}/{len(status)} 정상, 국내 섹터 {len(markets['kr'])} · 미국 섹터 {len(markets['us'])}")
    for k, v in status.items():
        if not isinstance(v, int):
            print("[news]  피드", k, v)
    return 0


if __name__ == "__main__":
    sys.exit(main())
