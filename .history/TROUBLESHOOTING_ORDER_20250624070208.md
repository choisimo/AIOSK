# 🐛 AIOSK 주문 기능 문제 해결 가이드

> **상황**: 모의 데이터를 사용할 때 주문하기가 작동하지 않는 문제  
> **업데이트**: 2025년 6월 24일

## 🔍 문제 진단 체크리스트

### 1️⃣ 기본 환경 확인
- [ ] 프론트엔드 서버 실행 여부: http://localhost:5174
- [ ] 브라우저 개발자 도구 열기 (F12)
- [ ] Console 탭에서 오류 메시지 확인

### 2️⃣ 장바구니 기능 확인
```javascript
// 브라우저 Console에서 실행해볼 명령어들:

// 1. Redux 스토어 상태 확인
window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__

// 2. 장바구니 상태 확인 (Console에서)
// React DevTools가 설치되어 있다면 Components 탭에서 확인 가능
```

### 3️⃣ 주문 플로우 단계별 확인

#### 📍 단계 1: 메뉴 추가
1. 카테고리 선택 (예: 커피)
2. 메뉴 카드 클릭
3. 모달에서 수량 조절 후 "담기" 버튼 클릭
4. **확인 사항**: 
   - Console에 "장바구니에 메뉴 추가: [메뉴명] 수량: [숫자]" 표시
   - 우측 장바구니에 메뉴 표시
   - 장바구니 총 금액 업데이트

#### 📍 단계 2: 주문하기
1. 우측 장바구니에서 "주문하기" 버튼 클릭
2. **확인 사항**:
   - Console에 "주문하기 버튼 클릭됨" 표시
   - Console에 "장바구니 아이템: [...]" 표시
   - Console에 "주문 생성 시도: [...]" 표시
   - Console에 "주문 성공: {...}" 표시
   - 화면 상단에 녹색 성공 알림 표시
   - 장바구니 비우기

## 🚨 일반적인 문제들

### 문제 1: 장바구니가 비어있음
**증상**: "주문하기" 버튼을 눌러도 아무 일이 일어나지 않음  
**원인**: 장바구니에 아이템이 없음  
**해결**: 먼저 메뉴를 장바구니에 추가

### 문제 2: Redux 연결 오류
**증상**: Console에 Redux 관련 오류 메시지  
**해결**: 페이지 새로고침 (Ctrl+F5)

### 문제 3: API 호출 실패
**증상**: "주문 실패:" 오류 메시지  
**원인**: 모의 데이터 함수 오류  
**해결**: 아래 수동 테스트 실행

## 🧪 수동 테스트 방법

### Console에서 직접 API 테스트
브라우저 Console 탭에서 다음 코드를 실행:

```javascript
// 1. 모의 데이터 기능 확인
console.log('개발 모드:', import.meta.env.DEV);
console.log('모의 데이터 사용:', import.meta.env.VITE_USE_MOCK_DATA);

// 2. 주문 API 직접 호출 테스트
const testOrder = {
  items: [
    { menuId: 1, quantity: 2 },
    { menuId: 2, quantity: 1 }
  ]
};

// 이 코드는 실제 작동하지 않을 수 있지만, 오류 확인 가능
fetch('/api/test', { method: 'POST', body: JSON.stringify(testOrder) })
  .then(response => console.log('API 테스트:', response))
  .catch(error => console.log('API 오류:', error));
```

### Redux DevTools 사용
1. Chrome 확장 프로그램 "Redux DevTools" 설치
2. 개발자 도구에서 "Redux" 탭 확인
3. Actions 리스트에서 다음 액션들이 실행되는지 확인:
   - `cart/addItem` (메뉴 추가 시)
   - `order/createOrderStart` (주문 시작 시)
   - `order/createOrderSuccess` (주문 성공 시)

## 💡 해결 방법들

### 방법 1: 브라우저 캐시 초기화
1. Ctrl+Shift+Delete로 브라우저 데이터 삭제
2. 또는 시크릿 모드로 테스트

### 방법 2: 개발 서버 재시작
```bash
cd /workspace/AIOSK/frontend
npm run dev
```

### 방법 3: 로컬 스토리지 초기화
브라우저 Console에서:
```javascript
localStorage.clear();
location.reload();
```

### 방법 4: 강제 모의 데이터 모드
브라우저 Console에서:
```javascript
// 강제로 모의 데이터 모드 활성화
localStorage.setItem('FORCE_MOCK_MODE', 'true');
location.reload();
```

## 📞 지원 요청 시 제공 정보

문제가 지속될 경우 다음 정보를 제공해주세요:

1. **브라우저 정보**: Chrome/Firefox 버전
2. **Console 오류**: 전체 오류 메시지 복사
3. **Network 탭**: 실패한 API 호출 정보
4. **Redux 상태**: DevTools에서 현재 상태 확인
5. **재현 단계**: 정확한 클릭 순서

## 🎯 최종 확인 사항

✅ **정상 작동 시 나타나는 현상**:
- 메뉴 클릭 → 모달 열림
- 수량 조절 → 가격 업데이트
- "담기" 클릭 → 장바구니에 추가
- "주문하기" 클릭 → 녹색 성공 알림
- 장바구니 자동 비우기

❌ **비정상 작동 시 나타나는 현상**:
- 버튼 클릭해도 반응 없음
- Console에 오류 메시지
- 로딩 상태에서 멈춤
- 알림 메시지 미표시

---

> **📝 추가 도움이 필요하시면**: 위 체크리스트를 완료한 후  
> 구체적인 오류 메시지와 함께 문의해주시기 바랍니다.
