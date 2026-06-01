// 카테고리 타입
export interface Category {
  id: number;
  name: string;
}

// 메뉴 타입
export interface Menu {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
}

// 주문 생성 요청 항목 타입
export interface CreateOrderItem {
  menuId: number;
  quantity: number;
}

// 주문 항목 타입
export interface OrderItem {
  menuName: string;
  quantity: number;
  price: number;
  pricePerItem: number;
}

// 주문 타입
export interface Order {
  orderId: number;
  items: OrderItem[];
  totalPrice: number;
  createdAt: string;
}

export interface KioskStatusReport {
  kioskId: string;
  label: string;
  status: 'ONLINE' | 'DEGRADED';
  appVersion?: string;
}
