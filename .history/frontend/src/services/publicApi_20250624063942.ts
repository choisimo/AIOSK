import { apiClient, handleApiResponse } from './api';
import type { Category, Menu, Order, OrderItem } from '../types';
import { 
  mockCategories, 
  mockMenus, 
  getMockMenusByCategory, 
  getMockMenuById, 
  isDevelopmentMode 
} from '../data/mockData';

// 공개 API 서비스 (키오스크용)
export const publicApi = {
  // 카테고리 조회
  getCategories: async (): Promise<Category[]> => {
    // 개발 모드에서는 모의 데이터 사용
    if (isDevelopmentMode()) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(mockCategories), 500); // 네트워크 지연 시뮬레이션
      });
    }
    
    try {
      const response = await apiClient.get<Category[]>('/api/public/categories');
      return handleApiResponse(response);
    } catch (error) {
      console.warn('API 호출 실패, 모의 데이터를 사용합니다:', error);
      return mockCategories;
    }
  },

  // 메뉴 조회 (전체 또는 카테고리별)
  getMenus: async (categoryId?: number): Promise<Menu[]> => {
    // 개발 모드에서는 모의 데이터 사용
    if (isDevelopmentMode()) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(getMockMenusByCategory(categoryId)), 500);
      });
    }
    
    try {
      const params = categoryId ? { categoryId } : {};
      const response = await apiClient.get<Menu[]>('/api/public/menus', { params });
      return handleApiResponse(response);
    } catch (error) {
      console.warn('API 호출 실패, 모의 데이터를 사용합니다:', error);
      return getMockMenusByCategory(categoryId);
    }
  },

  // 주문 생성
  createOrder: async (orderData: { items: OrderItem[] }): Promise<Order> => {
    // 개발 모드에서는 모의 응답 생성
    if (isDevelopmentMode()) {
      return new Promise((resolve) => {
        const totalPrice = orderData.items.reduce((sum, item) => {
          const menu = getMockMenuById(item.menuId);
          return sum + (menu ? menu.price * item.quantity : 0);
        }, 0);
        
        const mockOrder: Order = {
          id: Math.floor(Math.random() * 1000) + 1,
          orderId: Math.floor(Math.random() * 1000) + 1,
          items: orderData.items,
          totalPrice,
          status: 'RECEIVED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        setTimeout(() => resolve(mockOrder), 1000);
      });
    }
    
    try {
      const response = await apiClient.post<Order>('/api/public/orders', orderData);
      return handleApiResponse(response);
    } catch (error) {
      console.error('주문 생성 실패:', error);
      throw error;
    }
  },

  // 특정 메뉴 상세 조회 (공개 API에 있을 경우)
  getMenu: async (menuId: number): Promise<Menu> => {
    // 개발 모드에서는 모의 데이터 사용
    if (isDevelopmentMode()) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const menu = getMockMenuById(menuId);
          if (menu) {
            resolve(menu);
          } else {
            reject(new Error('메뉴를 찾을 수 없습니다.'));
          }
        }, 300);
      });
    }
    
    try {
      const response = await apiClient.get<Menu>(`/api/public/menus/${menuId}`);
      return handleApiResponse(response);
    } catch (error) {
      console.warn('API 호출 실패, 모의 데이터를 사용합니다:', error);
      const menu = getMockMenuById(menuId);
      if (menu) {
        return menu;
      }
      throw error;
    }
  },
};

export default publicApi;
