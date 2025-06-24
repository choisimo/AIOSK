import { apiClient, handleApiResponse } from './api';
import type { Category, Menu, Order, OrderItem } from '../types';

// 공개 API 서비스 (키오스크용)
export const publicApi = {
  // 카테고리 조회
  getCategories: async (): Promise<Category[]> => {
    const response = await apiClient.get<Category[]>('/api/public/categories');
    return handleApiResponse(response);
  },

  // 메뉴 조회 (전체 또는 카테고리별)
  getMenus: async (categoryId?: number): Promise<Menu[]> => {
    const params = categoryId ? { categoryId } : {};
    const response = await apiClient.get<Menu[]>('/api/public/menus', { params });
    return handleApiResponse(response);
  },

  // 주문 생성
  createOrder: async (orderData: { items: OrderItem[] }): Promise<Order> => {
    const response = await apiClient.post<Order>('/api/public/orders', orderData);
    return handleApiResponse(response);
  },

  // 특정 메뉴 상세 조회 (공개 API에 있을 경우)
  getMenu: async (menuId: number): Promise<Menu> => {
    const response = await apiClient.get<Menu>(`/api/public/menus/${menuId}`);
    return handleApiResponse(response);
  },
};

export default publicApi;
