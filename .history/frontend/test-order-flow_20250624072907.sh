#!/bin/bash

# 🧪 주문 기능 테스트 스크립트
echo "🛒 AIOSK 주문 기능 테스트"
echo "========================="

FRONTEND_URL="http://localhost:5174"

echo "📱 테스트 단계:"
echo "1. 브라우저에서 $FRONTEND_URL 접속"
echo "2. 카테고리 선택 (예: 커피)"
echo "3. 메뉴 선택하여 장바구니에 추가"
echo "4. 장바구니에서 '주문하기' 버튼 클릭"
echo "5. 브라우저 개발자 도구(F12) -> Console 탭에서 로그 확인"
echo ""
echo "🔍 예상 로그 메시지:"
echo "  - '주문하기 버튼 클릭됨'"
echo "  - '장바구니 아이템: [...]'"
echo "  - '주문 생성 시도: [...]'"
echo "  - '주문 성공: {...}'"
echo ""
echo "✅ 성공 시 화면 상단에 '주문이 성공적으로 접수되었습니다! 🎉' 알림 표시"
echo ""
echo "🐛 문제 발생 시 브라우저 Console 탭에서 오류 메시지 확인하세요."

# 브라우저가 자동으로 열리도록 시도 (Linux 환경에서)
if command -v xdg-open > /dev/null; then
    echo ""
    echo "🌐 브라우저 자동 실행 시도..."
    xdg-open "$FRONTEND_URL" 2>/dev/null &
fi
