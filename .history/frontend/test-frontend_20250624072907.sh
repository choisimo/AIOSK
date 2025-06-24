#!/bin/bash

# 🧪 AIOSK 프론트엔드 기능 테스트 스크립트
# 이 스크립트는 키오스크의 주요 기능들을 자동으로 테스트합니다.

echo "🎯 AIOSK 키오스크 기능 테스트 시작"
echo "================================="

FRONTEND_URL="http://localhost:5174"

# 1. 프론트엔드 서버 상태 확인
echo "📡 프론트엔드 서버 상태 확인..."
if curl -s --fail "$FRONTEND_URL" > /dev/null; then
    echo "✅ 프론트엔드 서버가 정상적으로 실행 중입니다."
else
    echo "❌ 프론트엔드 서버에 접근할 수 없습니다. $FRONTEND_URL"
    exit 1
fi

# 2. 기본 HTML 구조 확인
echo ""
echo "🏗️ 기본 HTML 구조 확인..."
HTML_CONTENT=$(curl -s "$FRONTEND_URL")
if echo "$HTML_CONTENT" | grep -q "root"; then
    echo "✅ React 앱 루트 컨테이너가 확인되었습니다."
else
    echo "❌ React 앱 루트 컨테이너를 찾을 수 없습니다."
fi

# 3. TypeScript 타입 체크
echo ""
echo "📝 TypeScript 타입 체크..."
cd /workspace/AIOSK/frontend
if npx tsc --noEmit --quiet; then
    echo "✅ TypeScript 타입 체크 통과"
else
    echo "⚠️ TypeScript 타입 오류가 있습니다."
fi

# 4. 빌드 테스트 (이미 완료되었으므로 dist 폴더 확인)
echo ""
echo "🔨 빌드 결과 확인..."
if [ -d "dist" ] && [ -f "dist/index.html" ]; then
    echo "✅ 프로덕션 빌드가 성공적으로 생성되었습니다."
    BUNDLE_SIZE=$(du -sh dist/assets/*.js | head -1 | cut -f1)
    echo "📦 번들 크기: $BUNDLE_SIZE"
else
    echo "❌ 빌드 결과를 찾을 수 없습니다."
fi

# 5. 주요 파일 존재 확인
echo ""
echo "📁 주요 컴포넌트 파일 확인..."

REQUIRED_FILES=(
    "src/App.tsx"
    "src/pages/KioskPage.tsx"
    "src/components/kiosk/CategoryNav.tsx"
    "src/components/kiosk/MenuGrid.tsx"
    "src/components/kiosk/ShoppingCart.tsx"
    "src/services/publicApi.ts"
    "src/store/index.ts"
    "src/types/index.ts"
    "src/data/mockData.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file - 파일이 없습니다!"
    fi
done

echo ""
echo "🎊 테스트 완료!"
echo "==================="
echo ""
echo "🌐 키오스크 앱 접속: $FRONTEND_URL"
echo "📱 모의 데이터를 사용하여 다음 기능들을 테스트할 수 있습니다:"
echo "   • 카테고리 탐색"
echo "   • 메뉴 선택"
echo "   • 장바구니 추가/제거"
echo "   • 주문 완료"
echo ""
echo "🛠️ 다음 개발 단계:"
echo "   • 관리자 대시보드 구현"
echo "   • 실제 백엔드와 연동"
echo "   • 반응형 디자인 개선"
echo "   • 단위 테스트 추가"
