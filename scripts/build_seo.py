#!/usr/bin/env python3
"""검색 노출(SEO) 파일 생성.

site.config.json 을 읽어
  - index.html 의 <!-- SEO:START --> ~ <!-- SEO:END --> 구간(제목·설명·공유 미리보기·검색엔진 인증·구조화 데이터)
  - robots.txt
  - sitemap.xml
을 만듭니다. siteUrl 이 비어 있으면 환경변수 SITE_URL(배포 시 GitHub Pages 주소가 자동 입력)을 씁니다.

사용법: python3 scripts/build_seo.py
"""
import datetime as dt
import html
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OG_IMAGE = "assets/img/og-image.png"


def main() -> None:
    cfg = json.loads((ROOT / "site.config.json").read_text("utf-8"))
    url = (cfg.get("siteUrl") or os.getenv("SITE_URL") or "").strip()
    if url and not url.endswith("/"):
        url += "/"
    esc = lambda s: html.escape(str(s or ""), quote=True)
    title, desc = cfg.get("title", ""), cfg.get("description", "")
    image = (url + OG_IMAGE) if url else OG_IMAGE

    lines = [
        f"<title>{esc(title)}</title>",
        f'<meta name="description" content="{esc(desc)}">',
        f'<meta name="keywords" content="{esc(cfg.get("keywords"))}">',
        '<meta name="robots" content="index, follow">',
    ]
    if url:
        lines.append(f'<link rel="canonical" href="{esc(url)}">')
    lines += [
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="ko_KR">',
        f'<meta property="og:site_name" content="FinDesk">',
        f'<meta property="og:title" content="{esc(title)}">',
        f'<meta property="og:description" content="{esc(desc)}">',
        f'<meta property="og:image" content="{esc(image)}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    if url:
        lines.append(f'<meta property="og:url" content="{esc(url)}">')
    if cfg.get("googleVerification"):
        lines.append(f'<meta name="google-site-verification" content="{esc(cfg["googleVerification"])}">')
    if cfg.get("naverVerification"):
        lines.append(f'<meta name="naver-site-verification" content="{esc(cfg["naverVerification"])}">')
    ld = {"@context": "https://schema.org", "@type": "WebSite", "name": "FinDesk", "alternateName": "핀데스크",
          "description": desc, "inLanguage": "ko-KR"}
    if url:
        ld["url"] = url
    lines.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>")

    block = "<!-- SEO:START (scripts/build_seo.py 가 자동 생성) -->\n  " + "\n  ".join(lines) + "\n  <!-- SEO:END -->"
    index = ROOT / "index.html"
    src = index.read_text("utf-8")
    new, n = re.subn(r"<!-- SEO:START.*?<!-- SEO:END -->", block, src, flags=re.S)
    if n != 1:
        raise SystemExit("index.html 에서 SEO 표시 구간을 찾지 못했습니다.")
    index.write_text(new, "utf-8")

    robots = "User-agent: *\nAllow: /\nDisallow: /editor.html\nDisallow: /editor-books.html\n"
    if url:
        robots += f"\nSitemap: {url}sitemap.xml\n"
    (ROOT / "robots.txt").write_text(robots, "utf-8")

    if url:
        today = dt.date.today().isoformat()
        (ROOT / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url><loc>{esc(url)}</loc><lastmod>{today}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>\n"
            f"  <url><loc>{esc(url)}books.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n"
            f"  <url><loc>{esc(url)}sites.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n"
            "</urlset>\n", "utf-8")
        print(f"[seo] 주소 {url} 기준으로 index.html, robots.txt, sitemap.xml 생성")
    else:
        print("[seo] 사이트 주소가 아직 없어 sitemap.xml 은 배포 때 생성됩니다. (index.html, robots.txt 는 갱신)")


if __name__ == "__main__":
    main()
