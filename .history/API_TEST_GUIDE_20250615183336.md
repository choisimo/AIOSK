# 🚀 AIOSK 공개 API 테스트 가이드

## 📋 구현 완료된 공개 API 엔드포인트

### 1. 카테고리 목록 조회

```bash
# GET /api/public/categories
curl -X GET http://localhost:3000/api/public/categories
```

**예상 응답:**

```json
[
  {
    "categoryId": 1,
    "name": "커피",
    "sortOrder": 1
  },
  {
    "categoryId": 2,
    "name": "음료",
    "sortOrder": 2
  }
]
```

### 2. 메뉴 목록 조회

```bash
# 전체 메뉴 조회 (FOR_SALE 상태만)
curl -X GET http://localhost:3000/api/public/menus

# 특정 카테고리 메뉴 조회
curl -X GET "http://localhost:3000/api/public/menus?categoryId=1"
```

**예상 응답:**

```json
[
  {
    "menuId": 101,
    "name": "아메리카노",
    "description": "진한 에스프레소와 물의 조화",
    "price": 4500,
    "imageUrl": "/uploads/menus/menu-101-1686823200000.jpg",
    "status": "FOR_SALE",
    "categoryId": 1
  }
]
```

### 3. 주문 생성

```bash
# POST /api/public/orders
curl -X POST http://localhost:3000/api/public/orders \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "menuId": 101, "quantity": 2 },
      { "menuId": 102, "quantity": 1 }
    ]
  }'
```

**예상 응답:**

```json
{
  "orderId": 1,
  "totalPrice": 13500,
  "status": "RECEIVED",
  "createdAt": "2025-06-15T14:30:00Z",
  "items": [
    { "menuName": "아메리카노", "quantity": 2, "price": 9000 },
    { "menuName": "카페라떼", "quantity": 1, "price": 4500 }
  ]
}
```

---

## 🔧 구현 완료된 관리자 API 엔드포인트

### 4. 메뉴 이미지 업로드 (🆕 NEW!)

```bash
# POST /api/menus/:menuId/image (JWT 토큰 필요)
curl -X POST http://localhost:3000/api/menus/101/image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/your/image.jpg"
```

**예상 응답:**

```json
{
  "message": "이미지가 성공적으로 업로드되었습니다.",
  "imageUrl": "/uploads/menus/menu-101-1686823200000.jpg",
  "filename": "menu-101-1686823200000.jpg",
  "menuId": 101
}
```

### 5. 관리자 로그인 (JWT 토큰 발급)

```bash
# POST /api/admin/login
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "password"
  }'
```

**예상 응답:**

```json
{
  "message": "Login successful",
  "data": {
    "id": 1,
    "username": "admin",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 6. 주문 목록 조회 (🆕 NEW!)

```bash
# GET /api/admin/orders (JWT 토큰 필요)
curl -X GET http://localhost:3000/api/admin/orders \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 상태별 필터링
curl -X GET "http://localhost:3000/api/admin/orders?status=RECEIVED" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**예상 응답:**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 1,
      "total_price": "13500.00",
      "status": "RECEIVED",
      "created_at": "2025-06-15T14:30:00Z",
      "updated_at": "2025-06-15T14:30:00Z",
      "items": [
        {
          "menuId": 101,
          "menuName": "아메리카노",
          "quantity": 2,
          "pricePerItem": "4500.00"
        }
      ]
    }
  ]
}
```

### 7. 주문 상태 변경 (🆕 NEW!)

```bash
# PATCH /api/admin/orders/:orderId/status (JWT 토큰 필요)
curl -X PATCH http://localhost:3000/api/admin/orders/1/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "PREPARING"}'
```

**예상 응답:**

```json
{
  "success": true,
  "message": "주문 상태가 성공적으로 변경되었습니다.",
  "orderId": 1,
  "previousStatus": "RECEIVED",
  "status": "PREPARING"
}
```

### 8. 주문 취소 (🆕 NEW!)

```bash
# PATCH /api/admin/orders/:orderId/cancel (JWT 토큰 필요)
curl -X PATCH http://localhost:3000/api/admin/orders/1/cancel \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**예상 응답:**

```json
{
  "success": true,
  "message": "주문이 성공적으로 취소되었습니다.",
  "orderId": 1,
  "status": "CANCELLED"
}
```

---

## 📊 주문 상태 관리 시스템

### 🔄 주문 상태 흐름

```
RECEIVED → PREPARING → COMPLETED
    ↓         ↓
CANCELLED  CANCELLED (제한적)
```

### 📋 주문 상태 설명

- **RECEIVED**: 주문 접수됨 (취소 가능)
- **PREPARING**: 조리 중 (제한적 취소 가능)
- **COMPLETED**: 완료됨 (취소 불가)
- **CANCELLED**: 취소됨 (최종 상태)

### ⚠️ 주문 취소 규칙

- ✅ **RECEIVED** 상태: 언제든 취소 가능
- ⚠️ **PREPARING** 상태: 제한적 취소 가능 (관리자 판단)
- ❌ **COMPLETED** 상태: 취소 불가

---

## 🧪 테스트 도구

### 1. 주문 관리 테스트 페이지

```
http://localhost:3000/test_order_management.html
```

**기능:**

- 관리자 로그인
- 실시간 주문 목록 조회
- 주문 상태 변경
- 주문 취소
- 테스트 주문 생성

### 2. 파일 업로드 테스트 페이지

```
http://localhost:3000/test_upload.html
```

**기능:**

- 관리자 로그인
- 메뉴 이미지 업로드
- 업로드된 이미지 미리보기

---
