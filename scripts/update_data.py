#!/usr/bin/env python3
"""FinDesk 데이터 수집 스크립트 (표준 라이브러리만 사용).

GitHub Actions에서 주기적으로 실행되어 data/*.json 을 갱신하고
브라우저가 읽는 data/bundle.js 를 생성합니다.

환경변수 (모두 선택, 없으면 해당 단계는 건너뛰고 기존 데이터 유지)
  ECOS_API_KEY         한국은행 ECOS Open API 인증키 (지수·금리·환율·경제용어)

사용법
  python scripts/update_data.py            # 수집 + 번들 생성
  python scripts/update_data.py --offline  # 수집 없이 번들만 생성
"""
from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
KST = dt.timezone(dt.timedelta(hours=9))
UA = "Mozilla/5.0 (compatible; FinDeskBot/1.0; +https://github.com/)"

# ── 금융위원회 보도자료 (정부 공식 발표, 제목 + 원문 링크만 표시) ─────
POLICY_RSS = "http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111"

# ── ECOS 100대 통계지표 중 화면에 쓰는 항목 ─────────────────
KEYSTAT_PICK = [
    "코스피지수", "코스닥지수",
    "원/달러 환율(종가)", "원/엔(100엔) 환율(매매기준율)", "원/유로 환율(매매기준율)", "원/위안 환율(종가)",
    "한국은행 기준금리", "콜금리(익일물)", "KORIBOR(3개월)", "CD수익률(91일)", "통안증권수익률(364일)",
    "국고채수익률(3년)", "국고채수익률(5년)", "회사채수익률(3년,AA-)",
    "경제성장률(실질, 계절조정 전기대비)", "소비자물가지수", "생산자물가지수", "경상수지", "외환보유액",
    "실업률", "고용률", "소비자심리지수", "Dubai유(현물)", "금",
]
SERIES = {"KOSPI": ("802Y001", "0001000"), "KOSDAQ": ("802Y001", "0089000")}


def log(*a):
    print("[update]", *a, flush=True)


def http_get(url: str, headers: dict | None = None, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load(name: str, default):
    p = DATA / name
    if p.exists():
        try:
            return json.loads(p.read_text("utf-8"))
        except Exception as e:  # 손상된 파일은 기본값으로
            log(f"{name} 읽기 실패: {e}")
    return default


def save(name: str, obj) -> None:
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8")


def now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="seconds")


# ── ECOS ────────────────────────────────────────────────────
def ecos(key: str, service: str, start: int, end: int, *path: str) -> dict:
    parts = [service, key, "json", "kr", str(start), str(end), *path]
    url = "https://ecos.bok.or.kr/api/" + "/".join(urllib.parse.quote(p, safe="") for p in parts)
    return json.loads(http_get(url).decode("utf-8"))


def update_market(key: str) -> None:
    market = load("market.json", {"rows": [], "series": {}})
    try:
        res = ecos(key, "KeyStatisticList", 1, 200)
        rows = res.get("KeyStatisticList", {}).get("row", [])
        if not rows:
            raise RuntimeError(res.get("RESULT", res))
        by_name = {r["KEYSTAT_NAME"].strip(): r for r in rows}
        picked = []
        for name in KEYSTAT_PICK:
            r = by_name.get(name)
            if r:
                picked.append({"class": r.get("CLASS_NAME", ""), "name": name, "value": r.get("DATA_VALUE", ""),
                               "cycle": r.get("CYCLE", ""), "unit": (r.get("UNIT_NAME") or "").strip()})
            else:
                log(f"ECOS 지표 없음(이름 변경 가능성): {name}")
        if picked:
            # 이번에 못 받은 항목은 이전 값을 유지
            merged = {r["name"]: r for r in market.get("rows", [])}
            merged.update({r["name"]: r for r in picked})
            order = {n: i for i, n in enumerate(KEYSTAT_PICK)}
            market["rows"] = sorted(merged.values(), key=lambda r: order.get(r["name"], 999))
            market["snapshot"] = False
            market["fetched_at"] = now_iso()
            log(f"ECOS 지표 {len(picked)}개 갱신")
    except Exception as e:
        log(f"ECOS 지표 실패, 기존 값 유지: {e}")

    end = dt.datetime.now(KST).date()
    start = end - dt.timedelta(days=75)
    for label, (stat, item) in SERIES.items():
        try:
            res = ecos(key, "StatisticSearch", 1, 100, stat, "D", start.strftime("%Y%m%d"), end.strftime("%Y%m%d"), item)
            rows = res.get("StatisticSearch", {}).get("row", [])
            pts = [[r["TIME"], float(r["DATA_VALUE"])] for r in rows if r.get("DATA_VALUE")]
            if pts:
                market.setdefault("series", {})[label] = pts[-40:]
                log(f"{label} 일별 시계열 {len(pts)}개")
        except Exception as e:
            log(f"{label} 시계열 실패, 기존 값 유지: {e}")
    market["source"] = "한국은행 ECOS 100대 통계지표 (Open API)"
    market["source_url"] = "https://ecos.bok.or.kr"
    save("market.json", market)


def update_terms(key: str) -> None:
    terms = load("terms.json", {"candidates": [], "terms": []})
    existing = {t["word"]: t for t in terms.get("terms", [])}
    found = dict(existing)
    for cand in terms.get("candidates", []):
        try:
            res = ecos(key, "StatisticWord", 1, 10, cand)
            rows = res.get("StatisticWord", {}).get("row", [])
        except Exception as e:
            log(f"용어 '{cand}' 실패: {e}")
            continue
        if not rows:
            continue
        # 정확히 일치하는 항목 우선, 없으면 괄호 앞부분이 일치하는 항목
        row = next((r for r in rows if r["WORD"].strip() == cand), None) or \
              next((r for r in rows if r["WORD"].split("(")[0].strip() == cand), None)
        if not row:
            continue
        word = row["WORD"].strip()
        content = (row.get("CONTENT") or "").strip()
        if len(content) < 10:
            continue
        prev = found.get(word, {})
        found[word] = {**prev, "word": word, "content": content}
    terms["terms"] = list(found.values())
    terms["fetched"] = dt.datetime.now(KST).date().isoformat()
    save("terms.json", terms)
    log(f"경제용어 {len(found)}개")


# ── 금융위원회 보도자료 ─────────────────────────────────
def update_policy() -> None:
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(http_get(POLICY_RSS))
        items = []
        for it in root.iter("item"):
            title = html.unescape(re.sub(r"<[^>]+>", "", it.findtext("title", "") or "")).strip()
            link = (it.findtext("link", "") or "").strip()
            date = (it.findtext("pubDate", "") or "").strip()[:10]
            if title and link.startswith("http"):
                items.append({"title": title, "url": link, "date": date})
        if items:
            save("policy.json", {"source": "금융위원회 보도자료", "fetched_at": now_iso(), "items": items[:20]})
            log(f"금융위 보도자료 {len(items)}건")
    except Exception as e:
        log(f"금융위 보도자료 실패, 기존 값 유지: {e}")


# ── 번들 ────────────────────────────────────────────────────
def build_bundle() -> None:
    terms = load("terms.json", {})
    terms.pop("candidates", None)  # 화면에 필요 없는 필드 제거
    bundle = {
        "built_at": now_iso(),
        "links": load("links.json", {}),
        "quotes": load("quotes.json", {}),
        "terms": terms,
        "schedule": load("schedule.json", {}),
        "market": load("market.json", {}),
        "stocks": load("stocks.json", {}),
        "briefing": load("briefing.json", {"editions": []}),
        "policy": load("policy.json", {"items": []}),
    }
    js = "/* 자동 생성 파일: scripts/update_data.py 가 만듭니다. 직접 수정하지 마세요. */\n"
    js += "window.FD_DATA = " + json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (DATA / "bundle.js").write_text(js, "utf-8")
    log(f"bundle.js 생성 ({len(js.encode('utf-8')) // 1024} KB)")


def main() -> int:
    offline = "--offline" in sys.argv
    if not offline:
        key = os.getenv("ECOS_API_KEY", "").strip()
        if key:
            update_market(key)
            # 용어는 하루 한 번이면 충분: 오늘 이미 받았으면 건너뜀
            if load("terms.json", {}).get("fetched") != dt.datetime.now(KST).date().isoformat():
                update_terms(key)
        else:
            log("ECOS_API_KEY 없음 → 지표·용어는 기존 스냅샷 사용")
        update_policy()
    build_bundle()
    return 0


if __name__ == "__main__":
    sys.exit(main())
