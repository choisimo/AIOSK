import { apiClient } from './api';
import type { Category, CreateOrderItem, KioskStatusReport, Menu, Order, OrderItem } from '../types';
import { MAX_ORDER_ITEMS, MAX_ORDER_ITEM_QUANTITY } from '../constants/order';
import { 
  getMockCategories,
  getMockMenusByCategory, 
  getMockMenuById,
  mockDataEnabled
} from '../data/mockData';

type PublicCategoryResponse = {
  categoryId: number;
  name: string;
};

type PublicMenuResponse = {
  menuId: number;
  name: string;
  description?: string | null;
  price: number | string;
  imageUrl?: string | null;
};

type PublicOrderItemResponse = {
  menuName: string;
  quantity: number;
  price: number | string;
  pricePerItem: number | string;
};

type PublicOrderResponse = {
  orderId: number;
  items: PublicOrderItemResponse[];
  totalPrice: number | string;
  createdAt: string;
};

const getRequiredId = (value: number | undefined, entity: string): number => {
  if (!(typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) {
    throw new Error(`${entity} 응답에 유효한 ID가 없습니다.`);
  }
  return value;
};

const getRequiredNonNegativeAmount = (value: number | string, entity: string): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    const parsed = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? Number(text) : null;
    if (parsed !== null && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`${entity} 응답에 유효한 금액이 없습니다.`);
};

const getRequiredOrderItemQuantity = (value: number, entity: string): number => {
  if (!(typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_ORDER_ITEM_QUANTITY)) {
    throw new Error(`${entity}에 유효한 수량이 없습니다.`);
  }
  return value;
};

// 공개 API 서비스 (키오스크용)
export const publicApi = {
  // 카테고리 조회
  getCategories: async (): Promise<Category[]> => {
    if (mockDataEnabled) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(getMockCategories()), 500); // 네트워크 지연 시뮬레이션
      });
    }

    const response = await apiClient.get<PublicCategoryResponse[]>('/api/public/categories');
    return response.data.map((category) => ({
      id: getRequiredId(category.categoryId, '카테고리'),
      name: category.name
    }));
  },

  // 메뉴 조회 (전체 또는 카테고리별)
  getMenus: async (categoryId?: number): Promise<Menu[]> => {
    if (mockDataEnabled) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(getMockMenusByCategory(categoryId)), 500);
      });
    }

    const params = categoryId ? { categoryId } : {};
    const response = await apiClient.get<PublicMenuResponse[]>('/api/public/menus', { params });
    return response.data.map((menu) => ({
      id: getRequiredId(menu.menuId, '메뉴'),
      name: menu.name,
      description: menu.description ?? '',
      price: getRequiredNonNegativeAmount(menu.price, '메뉴 가격'),
      imageUrl: menu.imageUrl ?? undefined
    }));
  },

  // 주문 생성
  createOrder: async (orderData: { items: CreateOrderItem[] }): Promise<Order> => {
    const orderItems = Array.isArray(orderData?.items) ? orderData.items : [];
    if (orderItems.length === 0 || orderItems.length > MAX_ORDER_ITEMS) {
      throw new Error(`주문 항목은 1개 이상 ${MAX_ORDER_ITEMS}개 이하로 요청해야 합니다.`);
    }
    const requestItems: CreateOrderItem[] = orderItems.map((item) => {
      const menuId = item.menuId;
      if (!(typeof menuId === 'number' && Number.isSafeInteger(menuId) && menuId > 0)) {
        throw new Error('주문 항목 요청에 유효한 메뉴 ID가 없습니다.');
      }

      const quantity = getRequiredOrderItemQuantity(item.quantity, '주문 항목 요청');
      return { menuId, quantity };
    });

    if (mockDataEnabled) {
      return new Promise((resolve) => {
        const mockItems: OrderItem[] = requestItems.map((item) => {
          const menu = getMockMenuById(item.menuId);
          const pricePerItem = menu.price;

          return {
            menuName: menu.name,
            quantity: item.quantity,
            pricePerItem,
            price: pricePerItem * item.quantity
          };
        });
        const totalPrice = mockItems.reduce((sum, item) => sum + item.price, 0);

        const mockOrder: Order = {
          orderId: Math.floor(Math.random() * 1000) + 1,
          items: mockItems,
          totalPrice,
          createdAt: new Date().toISOString()
        };
        
        setTimeout(() => resolve(mockOrder), 1000);
      });
    }
    
    const response = await apiClient.post<PublicOrderResponse>('/api/public/orders', { items: requestItems });
    return {
      orderId: getRequiredId(response.data.orderId, '주문'),
      items: response.data.items.map((item) => {
        const quantity = getRequiredOrderItemQuantity(item.quantity, '주문 항목 응답');

        return {
          menuName: item.menuName,
          quantity,
          pricePerItem: getRequiredNonNegativeAmount(item.pricePerItem, '주문 항목 단가'),
          price: getRequiredNonNegativeAmount(item.price, '주문 항목 금액')
        };
      }),
      totalPrice: getRequiredNonNegativeAmount(response.data.totalPrice, '주문 합계'),
      createdAt: response.data.createdAt
    };
  },

  reportKioskStatus: async (statusData: KioskStatusReport): Promise<void> => {
    if (mockDataEnabled) {
      return;
    }

    const token = import.meta.env.VITE_KIOSK_STATUS_TOKEN?.trim();
    await apiClient.post('/api/public/kiosk/status', statusData, {
      headers: token ? { 'x-kiosk-status-token': token } : undefined
    });
  }
};
