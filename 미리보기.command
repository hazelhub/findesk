#!/bin/bash
# 더블클릭하면 이 폴더를 작은 웹서버로 열어 브라우저에서 미리보기합니다. 창을 닫으면 종료됩니다.
cd "$(dirname "$0")"
PORT=8000
echo "FinDesk 미리보기: http://localhost:$PORT  (종료하려면 이 창을 닫으세요)"
( sleep 1; open "http://localhost:$PORT" ) &
python3 -m http.server $PORT
