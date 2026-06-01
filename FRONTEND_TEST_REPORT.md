# AIOSK 프론트엔드 검증 보고서

> 최근 부분 재검증일: 2026-05-30
> 대상: `frontend/`

## 결과

- `npm run lint`: 통과.
- `VITE_API_URL=https://api.example.com VITE_USE_MOCK_DATA=false npm run build`: 통과.
- `VITE_API_URL=http://localhost:3000 VITE_ALLOW_LOCAL_API_URL=true VITE_USE_MOCK_DATA=false npm run build`: 통과.
- 번들 결과: `dist/index.html` 0.77 kB, CSS 0.19 kB, JS 청크 최대 217.53 kB(`mui`).
- `npm audit --audit-level=moderate`: 통과, 취약점 0건.
- `npm run deps:check`: 통과, root와 `frontend/` 모두 unused dependency 없음.
- Frontend build env files are parsed as strict key/value data; malformed env line은 line number만 출력하고 Vite build 전에 실패하는 것을 정적 검증 smoke로 확인했다.
- 기존 전체 브라우저 E2E 기록: `npm run test:e2e:browser` 통과. 실제 MySQL, Express, Vite, Playwright Chromium으로 React 키오스크 주문 흐름과 EJS 관리자 핵심 흐름을 검증.
- 2026-05-30 기준 루트 `npm test`, 프론트 lint/build, dependency prune check, TypeScript unused check, export prune check를 재실행했다. 브라우저 E2E는 이번 부분 재검증 범위에서 제외했고, 전체 통과 기록은 기존 `npm run test:e2e:browser` 항목을 기준으로 한다.

## 이번 수정과 관련된 확인

- 삭제된 `frontend/src/hooks/useAdminApi.ts`와 `frontend/src/services/adminApi.ts`는 현재 React 라우트에서 사용되지 않는다.
- `frontend/index.html`의 `/vite.svg` 참조를 제거했으며 빌드가 정상 생성된다.
- `frontend/src/components/kiosk/OrderReceipt.tsx`의 미사용 `Grid` import를 제거해 TypeScript `noUnusedLocals`와 ESLint를 통과시켰다.
- 공개 API 응답을 `Category`, `Menu`, `Order` 타입으로 정규화하도록 `publicApi.ts`를 보강했다.
- 공개 API 실패 시 자동으로 mock 데이터를 반환하던 fallback을 제거했다. Mock 데이터는 개발 서버에서 `VITE_USE_MOCK_DATA=true`일 때만 사용하며, production build와 Docker image build에서는 거부한다.
- mock 주문 생성에서 알 수 없는 메뉴 ID를 임시 메뉴명/0원 가격으로 성공 처리하던 fallback을 제거했다.
- 프론트 API 기본 URL을 백엔드 기본 포트와 같은 `http://localhost:3000`으로 맞추고 `frontend/.env.example`을 추가했다.
- 추적 중이던 `frontend/.env.development`는 백엔드 `3001`과 mock mode를 강제해 현재 통합 검증 계약과 충돌하므로 제거했다. 로컬 env 파일은 ignore되고 `frontend/.env.example`만 추적 가능하다.
- React 관리자 API 제거 후 남아 있던 `authSlice`, 관리자 토큰 자동 주입, 미사용 타입/헬퍼를 제거했다.
- `ApiError`는 API client 내부 인터셉터에서만 쓰였고 화면은 오류 detail을 읽지 않으므로 로컬 타입과 미사용 `error`/`statusCode` 필드까지 제거하고 `Error(message)`만 reject한다.
- `handleApiResponse`는 `response.data`만 반환하는 no-op helper라 제거하고 `publicApi.ts`에서 Axios 응답의 `data`를 직접 사용한다.
- `apiClient` 응답 인터셉터의 성공 콜백은 응답을 그대로 반환하는 no-op이므로 제거하고, 실제 동작이 있는 오류 인터셉터만 유지했다.
- `resolveApiBaseUrl()`은 `API_BASE_URL` 초기화 한 곳에서만 쓰이는 wrapper이므로 제거하고, 운영 URL guard와 개발 fallback은 모듈 초기화 지점에 직접 둔다.
- QueryClient 전역 `staleTime`은 현재 모든 `useQuery` 호출부가 개별 stale time을 명시하므로 제거했고, 미사용 `secondary` theme palette override도 제거했다.
- `jsx: "react-jsx"` 자동 런타임을 기준으로 컴포넌트의 default React runtime import와 `FC` 타입 헬퍼를 제거하고, 필요한 `ReactNode`만 type import로 유지한다.
- `Button` wrapper의 `variant`/`size` 타입은 MUI props에서 상속되므로 중복 선언을 제거하고 `isKiosk`만 로컬 확장으로 유지했다.
- `Button` wrapper의 `size='medium'` 기본값은 MUI Button 기본값과 같아 제거했고, 명시 `size` 호출부는 rest props로 그대로 전달된다.
- `Button` wrapper의 `isKiosk = false` 기본값은 생략된 prop의 falsey 동작과 같아 제거했다. `variant='contained'` 기본값은 호출부 의도를 숨기므로 필요한 버튼에 직접 명시하고 wrapper 기본값에서는 제거했다.
- `Button` wrapper 함수는 `StyledButton`에 props와 children을 그대로 전달하는 no-op 계층이므로 제거하고, styled MUI Button을 `Button`으로 직접 export한다.
- `Button`의 스타일 전용 `isKiosk` prop은 DOM으로 전달되지 않도록 `shouldForwardProp`에서 차단한다.
- `App.tsx` theme의 미사용 `typography.h1` override와 로컬 `Button`/`MenuGrid` 카드 렌더링에 중복되는 `MuiButton`/`MuiCard` style override를 제거했다.
- `CategoryNav`는 `selectedCategoryId`를 `Tabs` 값으로 직접 전달하고, 중복 `currentValue` alias를 제거했다.
- `CategoryNav`의 탭 label은 단일 텍스트뿐이므로 no-op `Box`/`Typography` 중첩 없이 `Tab`의 `label`에 문자열을 직접 전달한다. 단일 사용 `StyledTabs`/`StyledTab` wrapper와 최상위 layout `Box`도 제거하고 `Tabs`의 `sx`에 직접 스타일과 spacing을 둔다.
- `KioskPage`는 `setSelectedCategoryId`를 `CategoryNav`에 직접 전달하고, setter만 감싸던 `handleCategorySelect`를 제거했다.
- `KioskPage`의 단일 사용 page layout styled wrapper(`KioskContainer`, `MainContent`, `MenuSection`, `CartSection`)를 제거하고 같은 레이아웃 스타일을 `Box`/`Container`의 `sx`에 직접 배치했다.
- `KioskPage`의 장바구니 추가 버튼은 `selectedMenu` 렌더 분기 안에서만 나타나므로, 단일 호출 `handleAddToCart` wrapper 없이 버튼 `onClick`에서 직접 장바구니 추가/모달 닫기/수량 초기화/클릭 피드백을 수행한다.
- `KioskPage` 메뉴 상세 수량은 1에서 시작하고 감소 버튼만 하한 clamp가 필요하므로, 증가 버튼의 중복 `Math.max(1, currentQuantity + 1)`를 제거했다.
- 단일 소비자였던 `components/ui/Modal.tsx`를 제거하고, `KioskPage`가 두 실제 모달을 MUI `Dialog`로 직접 렌더링한다. 메뉴 상세 모달은 required `Menu.name`을 다시 검사하지 않고 단일 `selectedMenu` guard로 제목/본문을 직접 소유하며, props 없는 `DialogContent` body `Box` wrapper 없이 본문을 직접 렌더링한다. 주문 완료 모달은 `maxWidth="lg"`만 명시한다.
- `MenuGrid`/`ShoppingCart`는 `KioskPage` 단일 호출부에서 항상 `loading`을 받으므로 optional prop과 `false` 기본값을 제거했다.
- `ShoppingCart`의 주문 버튼과 `MenuGrid` 카드 렌더링은 단순 위임 클릭 래퍼 없이 콜백을 직접 연결한다.
- `ShoppingCart`는 항목이 있을 때만 주문 버튼을 렌더링하므로 `KioskPage.handleCheckout`의 빈 장바구니 guard를 제거했다.
- `KioskPage`의 주문 제출 로직은 `ShoppingCart`의 `onCheckout` 한 곳에서만 쓰이므로 `handleCheckout` wrapper 없이 prop에서 직접 주문 생성, 장바구니 초기화, 완료 플로우, 오류 피드백을 수행한다.
- 단일 소비자였던 `components/ui/Card.tsx`의 `MenuCard`를 `MenuGrid` 카드 렌더링 지점으로 흡수했고, 이미지 fallback, hover/tap interaction, 카드 radius/shadow/hover transition style, 가격 `Typography` 렌더링을 같은 반복 항목 안에 직접 배치했다.
- `OrderReceipt`의 MUI 기본값과 같은 `Chip size="medium"` 및 `variant="filled"` 전달을 제거했다.
- `OrderReceipt`의 단일 호출 `formatDate()` wrapper를 제거하고 주문시간 표시 지점에서 `order.createdAt`를 직접 포맷한다.
- `printReceipt`도 인쇄 시각 대신 공개 주문 응답의 필수 `orderData.createdAt`를 주문시간으로 포맷한다.
- `OrderReceipt`의 단일 사용 styled wrapper(`ReceiptContainer`, `ReceiptHeader`, `ReceiptItem`)를 제거하고 같은 스타일을 렌더 지점의 `sx`에 직접 배치했다.
- `OrderReceipt` 최상위의 props 없는 `Box` wrapper를 제거하고 fragment로 바꿔, 호출부 완료 모달 컨테이너가 이미 소유하는 레이아웃 외 DOM만 줄였다.
- 주문 완료 인쇄 UI는 항상 `printReceipt` callback을 받는 단일 경로이므로 optional 인쇄 prop과 도달 불가 `window.print()` fallback을 제거했다.
- `KioskPage`의 단일 호출 `handlePrintReceipt()` wrapper를 제거하고 완료 주문 분기의 `onPrint`에서 인쇄와 클릭 피드백을 직접 실행한다.
- 단일 소비자 `OrderCompletionFlow.tsx`는 `KioskPage` 완료 주문 모달로 흡수했다. 완료 제목, `OrderReceipt`, 새 주문 버튼은 완료 모달 분기 안에서 직접 렌더링한다.
- 어떤 화면도 읽지 않던 Redux `orderSlice`와 주문 mutation dispatch를 제거했다. 주문 생성 loading/error는 React Query mutation state를 사용한다.
- Redux cart state의 파생 합계(`totalItems`, `totalPrice`, `CartItem.totalPrice`)를 제거하고, 장바구니 화면과 키오스크 상단 카운트에서 `items` quantity 기준으로 badge/합계/항목 금액을 직접 계산한다. 공용 `CartItem` export도 제거해 cart slice 내부 타입으로 축소했다.
- 호출되지 않던 알림 사운드 helper와 모듈 외부에서 쓰이지 않는 영수증 스타일 export를 제거했고, QR/상태조회 UI 제거 후 실제 인쇄 HTML에서 쓰이지 않던 `.print-qr`/`.no-print` CSS 잔여도 제거했다.
- 단일 소비자만 남은 `Card.tsx` 파일 자체를 제거했다. `MenuGrid`가 per-card entrance animation과 카드 hover/tap interaction을 함께 소유한다.
- EJS 관리자 메뉴 화면은 `menu.status`를 직접 사용하므로 `webAdmin.controller`의 미사용 `isAvailable` view-model alias를 제거했다.
- 호출되지 않던 `ConfirmModal`과 사용되지 않는 `Modal` 확장 props를 제거한 뒤, 남은 단일 소비자 `Modal.tsx` 파일 자체도 삭제했다.
- 공개 API와 UI가 소비하지 않는 mock 메뉴 `isPopular`, legacy metadata, nested `Menu.category`, `Order.customerName`/`updatedAt`, `Order.id` fallback, 프론트 내부 `sortOrder` DTO 필드를 제거했다. 공개 메뉴 API가 `FOR_SALE`만 반환하므로 키오스크 `Menu.isAvailable`/품절 카드 UI도 제거했다.
- 키오스크 UI는 메뉴의 `categoryId`를 읽지 않고 카테고리 필터링은 API query param 또는 mock 전용 데이터에서만 필요하므로, 공용 `Menu` 타입과 공개 메뉴 정규화 결과에서 `categoryId`를 제거하고 mock dataset 내부 타입에만 유지했다.
- 공개 카테고리/메뉴 응답 ID는 `NaN`만 거르지 않고 1 이상 safe integer일 때만 UI 타입으로 정규화한다.
- 공개 주문 생성 요청은 `menuId`/`quantity`만 전송하도록 `CreateOrderItem` 타입으로 분리했고, 영수증 표시는 공개 주문 응답의 `OrderItem` 필드만 사용한다. 표시용 `OrderItem`은 `menuId`를 상속하지 않는다.
- 공개 주문 생성 응답의 `totalPrice`/`createdAt`를 필수 표시 계약으로 반영하고, `KioskPage`의 응답 보강 및 영수증/인쇄 fallback을 제거했다.
- 공개 주문 생성 응답의 `orderId`, 주문 항목 `quantity`, 항목 `pricePerItem`/`price`도 `publicApi.ts`에서 정규화한 뒤 영수증/인쇄 UI로 전달한다.
- 공개 주문 생성 직후 상태는 고정 `주문 접수` 라벨로 표시하므로 프론트 `Order.status`와 `PublicOrderResponse.status` 소비를 제거했다.
- 실제 전송 API가 없던 이메일/SMS 알림 mock과 입력 UI, 공개 상태 조회 라우트가 없는 QR UI를 제거했고, 주문 완료 플로우는 영수증/주문번호/인쇄만 제공한다.
- 영수증 인쇄 HTML은 메뉴명 같은 동적 값을 escape한 뒤 별도 인쇄 창에 렌더링한다.
- 현재 프론트 코드에서 import되지 않는 `socket.io-client`, `qrcode`, `@types/qrcode` 의존성을 제거했다.
- `tsconfig.app.json`과 `tsconfig.node.json`의 설명용 comment를 제거해 JSON-only dependency audit 도구도 설정 파일을 파싱할 수 있게 했다.
- `npm audit fix`로 lockfile의 하위 의존성을 갱신했다.
- 사용되지 않는 `getMockPopularMenus` mock 헬퍼를 제거했다.
- `frontend/vite.config.ts`에 Rollup `manualChunks`를 추가해 MUI, Redux/React Query, Framer Motion, 기타 vendor 청크를 분리했다.
- React 키오스크 화면이 브라우저별 `kioskId`를 저장하고 `/api/public/kiosk/status`로 60초마다 heartbeat를 전송하도록 연결했다.
- React 키오스크 heartbeat는 `label`과 `ONLINE`/`DEGRADED` 상태를 항상 전송하므로 프론트 `KioskStatusReport`에서 optional `label`, optional `status`, 백엔드 집계 상태인 `MAINTENANCE`/`OFFLINE`을 제거했다.
- 주문 실패 Snackbar/햅틱/사운드와 관리자 전역 오류 알림이 이미 사용자 피드백을 담당하므로 중복 브라우저 `console.warn`/`console.error` side effect를 제거했다.

## 브라우저 E2E 확인

- 실제 MySQL DB와 백엔드를 띄운 공개 주문 생성은 `npm run test:e2e`에서 API 레벨로 검증된다.
- 키오스크 상태 저장/관리자 조회도 `npm run test:e2e`에서 API 레벨로 검증된다.
- `npm run test:e2e:browser`는 테스트 DB에 관리자/카테고리/메뉴를 seed하고, 실제 브라우저에서 메뉴 선택, 장바구니 추가, 주문 완료 모달, DB 주문 저장, 관리자 로그인, 주문 상태 변경, 카테고리/메뉴 생성과 DB 반영을 검증한다.
