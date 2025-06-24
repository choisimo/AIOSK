// API 응답 타입 정의
export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  timestamp?: string;
}

// 카테고리 타입
export interface Category {
  categoryId: number;
  name: string;
  sortOrder: number;
}

// 메뉴 타입
export interface Menu {
  menuId: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  status: 'FOR_SALE' | 'SOLD_OUT';
  categoryId: number;
  category?: Category;
}

// 주문 항목 타입
export interface OrderItem {
  menuId: number;
  menuName?: string;
  quantity: number;
  price?: number;
  pricePerItem?: number;
}

// 주문 타입
export interface Order {
  orderId?: number;
  items: OrderItem[];
  totalPrice?: number;
  status?: 'RECEIVED' | 'PREPARING' | 'COMPLETED' | 'CANCELED';
  createdAt?: string;
  customerName?: string;
}

// 장바구니 아이템 타입
export interface CartItem {
  menu: Menu;
  quantity: number;
  totalPrice: number;
}

// 통계 타입
export interface Statistics {
  totalSales: number;
  orderCount: number;
  topSellingMenus: {
    menuName: string;
    count: number;
  }[];
}

// 관리자 타입
export interface Admin {
  id: number;
  username: string;
  createdAt: string;
}

// 로그인 요청 타입
export interface LoginRequest {
  username: string;
  password: string;
}

// 로그인 응답 타입
export interface LoginResponse {
  token: string;
  admin: Admin;
}

// 에러 타입
export interface ApiError {
  message: string;
  error?: string;
  statusCode?: number;
}

// 페이지네이션 타입
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// 필터 타입
export interface OrderFilter {
  status?: Order['status'];
  startDate?: string;
  endDate?: string;
}

// 메뉴 생성/수정 타입
export interface MenuFormData extends Record<string, string | number | File | undefined> {
  name: string;
  description: string;
  price: number;
  categoryId: number;
  status: Menu['status'];
  image?: File;
}

// 카테고리 생성/수정 타입
export interface CategoryFormData {
  name: string;
  sortOrder: number;
}

// 통계 상세 타입들
export interface SalesStatistics {
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  salesByDate: {
    date: string;
    sales: number;
    orders: number;
  }[];
}

export interface DailyStatistics {
  date: string;
  totalSales: number;
  orderCount: number;
  popularMenus: {
    menuName: string;
    count: number;
  }[];
}

export interface HourlyStatistics {
  hour: number;
  totalSales: number;
  orderCount: number;
}

export interface CategoryStatistics {
  categoryName: string;
  totalSales: number;
  orderCount: number;
  percentage: number;
}
