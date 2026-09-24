/*
 * FinDesk 설정 파일 — 사이트 이름, 위젯 종목을 여기서 바꿉니다.
 *
 * TradingView 심볼 표기: "거래소:티커"
 *  - 무료 위젯은 거래소 라이선스 때문에 일부 심볼이 "TradingView에서만 볼 수 있음"으로 표시됩니다.
 *  - 한국거래소(KRX) 심볼은 무료 위젯 지원 목록에 없어 코스피·코스닥은 한국은행 ECOS 데이터로 표시합니다.
 *  - 금·구리 등은 CFD(차액결제) 시세라 실제 선물 가격과 약간 다를 수 있습니다.
 *  - 배포 후 안 뜨는 카드가 있으면 아래 symbol 값을 바꿔 보세요. (https://kr.tradingview.com 에서 검색)
 */
window.FD_CONFIG = {
  siteName: "FinDesk",
  tagline: "금융인을 위한 아침 데스크",
  locale: "kr",

  // 상단 흐르는 시세 띠
  tickerTape: [
    { proName: "FOREXCOM:NSXUSD", title: "나스닥100" },
    { proName: "FOREXCOM:SPXUSD", title: "S&P500" },
    { proName: "FOREXCOM:DJI", title: "다우" },
    { proName: "FX_IDC:USDKRW", title: "원/달러" },
    { proName: "FX_IDC:JPYKRW", title: "원/엔" },
    { proName: "OANDA:XAUUSD", title: "금" },
    { proName: "OANDA:XCUUSD", title: "구리" },
    { proName: "OANDA:WTICOUSD", title: "WTI" },
    { proName: "BITSTAMP:BTCUSD", title: "비트코인" }
  ],

  // 지수 캐러셀: kind "ecos" = 한국은행 데이터 카드, 그 외 = TradingView 미니 차트
  indexGroups: [
    {
      id: "kr", name: "국내",
      items: [
        { kind: "ecos", key: "KOSPI", name: "코스피", rowName: "코스피지수", link: "https://finance.naver.com/sise/sise_index.naver?code=KOSPI" },
        { kind: "ecos", key: "KOSDAQ", name: "코스닥", rowName: "코스닥지수", link: "https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ" }
      ]
    },
    {
      id: "us", name: "미국",
      items: [
        { symbol: "FOREXCOM:NSXUSD", name: "나스닥100" },
        { symbol: "FOREXCOM:SPXUSD", name: "S&P 500" },
        { symbol: "FOREXCOM:DJI", name: "다우존스" },
        { symbol: "CAPITALCOM:VIX", name: "VIX 변동성" }
      ]
    },
    {
      id: "world", name: "아시아·유럽",
      items: [
        { symbol: "OANDA:JP225USD", name: "닛케이225" },
        { symbol: "OANDA:HK33HKD", name: "항셍" },
        { symbol: "OANDA:CN50USD", name: "중국 A50" },
        { symbol: "OANDA:DE30EUR", name: "독일 DAX" },
        { symbol: "OANDA:UK100GBP", name: "영국 FTSE100" }
      ]
    }
  ],

  // 원자재
  commodities: [
    { symbol: "OANDA:XAUUSD", name: "금", unit: "USD/온스" },
    { symbol: "OANDA:XAGUSD", name: "은", unit: "USD/온스" },
    { symbol: "OANDA:XCUUSD", name: "구리", unit: "USD/파운드" },
    { symbol: "OANDA:WTICOUSD", name: "WTI 원유", unit: "USD/배럴" },
    { symbol: "OANDA:BCOUSD", name: "브렌트유", unit: "USD/배럴" },
    { symbol: "OANDA:NATGASUSD", name: "천연가스", unit: "USD/MMBtu" }
  ],

  // 철강은 무료 실시간 위젯이 없어 바로가기로 제공
  steelLinks: [
    { name: "스틸데일리 (철강 시황)", url: "https://www.steeldaily.co.kr" },
    { name: "KOMIS 광물 가격 (철광석 등)", url: "https://www.komis.or.kr" },
    { name: "한국물가정보 (국내 강재 가격)", url: "https://www.kpi.or.kr" },
    { name: "CME 금속 선물 (열연 HRC 포함)", url: "https://www.cmegroup.com/markets/metals.html" }
  ],

  // 환율 (실시간)
  fx: [
    { symbol: "FX_IDC:USDKRW", name: "원/달러" },
    { symbol: "FX_IDC:JPYKRW", name: "원/엔 (1엔)" },
    { symbol: "FX_IDC:EURKRW", name: "원/유로" },
    { symbol: "CAPITALCOM:DXY", name: "달러 인덱스" }
  ],

  // 디지털자산
  crypto: [
    { symbol: "BINANCE:BTCUSDT", name: "비트코인" },
    { symbol: "BINANCE:ETHUSDT", name: "이더리움" },
    { symbol: "BINANCE:XRPUSDT", name: "리플(XRP)" }
  ],
  cryptoLinks: [
    { name: "DefiLlama 스테이블코인 시총", url: "https://defillama.com/stablecoins" },
    { name: "쟁글 가상자산 공시", url: "https://xangle.io" },
    { name: "업비트 원화 시세", url: "https://upbit.com" }
  ],

  // 세션별 '지금 볼 곳' (언론사·기관 사이트로 가는 단순 링크)
  sessionLinks: {
    morning: [
      { name: "연합인포맥스", desc: "간밤 뉴욕·외환·채권 마감", url: "https://news.einfomax.co.kr" },
      { name: "네이버 해외증시", desc: "미국·유럽 지수 마감", url: "https://finance.naver.com/world/" },
      { name: "한국경제 증권", desc: "전일 국내 마감·오늘 전망", url: "https://www.hankyung.com/finance" },
      { name: "인베스팅 경제캘린더", desc: "오늘 발표 지표", url: "https://kr.investing.com/economic-calendar/" },
      { name: "CME FedWatch", desc: "금리 기대 변화", url: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html" }
    ],
    pre: [
      { name: "넥스트레이드", desc: "프리마켓 08:00~08:50", url: "https://www.nextrade.co.kr" },
      { name: "네이버페이 증권", desc: "장 시작 전 동시호가·종목", url: "https://finance.naver.com" },
      { name: "KIND 오늘의 공시", desc: "장 전 공시", url: "https://kind.krx.co.kr/disclosure/todaydisclosure.do?method=searchTodayDisclosureMain" },
      { name: "서울외국환중개", desc: "매매기준율", url: "https://www.smbs.biz" },
      { name: "연합인포맥스", desc: "개장 전 시황", url: "https://news.einfomax.co.kr" }
    ],
    intraday: [
      { name: "네이버 국내증시", desc: "지수·업종·특징주", url: "https://finance.naver.com/sise/" },
      { name: "KRX 정보데이터시스템", desc: "투자자별 매매동향", url: "https://data.krx.co.kr" },
      { name: "KIND 오늘의 공시", desc: "장중 공시", url: "https://kind.krx.co.kr/disclosure/todaydisclosure.do?method=searchTodayDisclosureMain" },
      { name: "연합인포맥스", desc: "장중 속보", url: "https://news.einfomax.co.kr" }
    ],
    close: [
      { name: "KRX 정보데이터시스템", desc: "마감 수급·지수", url: "https://data.krx.co.kr" },
      { name: "DART", desc: "장 마감 후 공시", url: "https://dart.fss.or.kr" },
      { name: "한경 컨센서스", desc: "오늘 나온 리포트", url: "https://consensus.hankyung.com" },
      { name: "네이버 증권 리서치", desc: "종목·산업 리포트", url: "https://finance.naver.com/research/" },
      { name: "넥스트레이드", desc: "애프터마켓 ~20:00", url: "https://www.nextrade.co.kr" }
    ],
    global: [
      { name: "인베스팅 경제캘린더", desc: "오늘 밤 지표 발표", url: "https://kr.investing.com/economic-calendar/" },
      { name: "네이버 해외증시", desc: "유럽·미국 지수", url: "https://finance.naver.com/world/" },
      { name: "CNBC Markets", desc: "미국 시장 속보", url: "https://www.cnbc.com/markets/" },
      { name: "Reuters Markets", desc: "글로벌 시장", url: "https://www.reuters.com/markets/" },
      { name: "CME FedWatch", desc: "금리 기대", url: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html" }
    ],
    holiday: [
      { name: "네이버 해외증시", desc: "해외 시장 흐름", url: "https://finance.naver.com/world/" },
      { name: "인베스팅 경제캘린더", desc: "다음 주 일정", url: "https://kr.investing.com/economic-calendar/" },
      { name: "한경 컨센서스", desc: "리포트 복습", url: "https://consensus.hankyung.com" }
    ]
  },

  // 섹션별 '관련 뉴스 보러가기'
  sectionLinks: {
    market: [{ name: "네이버 증권", url: "https://finance.naver.com" }, { name: "한국경제 증권", url: "https://www.hankyung.com/finance" }, { name: "연합인포맥스", url: "https://news.einfomax.co.kr" }, { name: "KIND 공시", url: "https://kind.krx.co.kr/disclosure/todaydisclosure.do?method=searchTodayDisclosureMain" }],
    commodity: [{ name: "인베스팅 원자재", url: "https://kr.investing.com/commodities/" }, { name: "스틸데일리", url: "https://www.steeldaily.co.kr" }, { name: "KOMIS", url: "https://www.komis.or.kr" }, { name: "Kitco", url: "https://www.kitco.com" }],
    macro: [{ name: "한국은행", url: "https://www.bok.or.kr" }, { name: "인베스팅 경제캘린더", url: "https://kr.investing.com/economic-calendar/" }, { name: "FRED", url: "https://fred.stlouisfed.org" }, { name: "서울외국환중개", url: "https://www.smbs.biz" }],
    bond: [{ name: "KOFIA 채권정보센터", url: "https://www.kofiabond.or.kr" }, { name: "한국신용평가", url: "https://www.kisrating.com" }, { name: "한국기업평가", url: "https://www.korearatings.com" }, { name: "연합인포맥스", url: "https://news.einfomax.co.kr" }],
    crypto: [{ name: "업비트", url: "https://upbit.com" }, { name: "DefiLlama 스테이블코인", url: "https://defillama.com/stablecoins" }, { name: "CoinDesk", url: "https://www.coindesk.com" }, { name: "쟁글", url: "https://xangle.io" }],
    policy: [{ name: "금융위원회 보도자료", url: "https://www.fsc.go.kr/no010101" }, { name: "금융감독원", url: "https://www.fss.or.kr" }, { name: "한국은행", url: "https://www.bok.or.kr" }]
  },

  // 경제 캘린더 국가 필터 (kr 한국, us 미국, cn 중국, jp 일본, eu 유로존)
  calendarCountries: "kr,us,cn,jp,eu",

  // 지수 카드 차트 기간: 1D, 1M, 3M, 12M, 60M, ALL
  miniChartRange: "1M"
};
