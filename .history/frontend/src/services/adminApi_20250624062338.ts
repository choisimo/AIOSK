import { apiClient, handleApiResponse, createFormData } from './api';
import type { 
  LoginRequest, 
  LoginResponse, 
  Order, 
  OrderFilter, 
  Statistics, 
  Menu, 
  MenuFormData, 
  Category, 
  CategoryFormData 
} from '../types';

// 관리자 API 서비스
export const adminApi = {
  // 인증
  auth: {
    // 로그인
    login: async (credentials: LoginRequest): Promise<LoginResponse> => {
      const response = await apiClient.post<LoginResponse>('/api/admin/login', credentials);
      return handleApiResponse(response);
    },

    // 로그아웃 (클라이언트 사이드)
    logout: (): void => {
      localStorage.removeItem('adminToken');
    },

    // 토큰 검증
    verifyToken: async (): Promise<boolean> => {
      try {
        await apiClient.get('/api/admin/verify');
        return true;
      } catch {
        return false;
      }
    },
  },

  // 주문 관리
  orders: {
    // 주문 목록 조회
    getOrders: async (filter?: OrderFilter): Promise<Order[]> => {
      const response = await apiClient.get<Order[]>('/api/admin/orders', { 
        params: filter 
      });
      return handleApiResponse(response);
    },

    // 주문 상태 변경
    updateOrderStatus: async (orderId: number, status: Order['status']): Promise<Order> => {
      const response = await apiClient.patch<Order>(`/api/admin/orders/${orderId}/status`, { 
        status 
      });
      return handleApiResponse(response);
    },

    // 주문 취소
    cancelOrder: async (orderId: number): Promise<Order> => {
      const response = await apiClient.patch<Order>(`/api/admin/orders/${orderId}/cancel`);
      return handleApiResponse(response);
    },

    // 특정 주문 상세 조회
    getOrder: async (orderId: number): Promise<Order> => {
      const response = await apiClient.get<Order>(`/api/admin/orders/${orderId}`);
      return handleApiResponse(response);
    },
  },

  // 통계
  statistics: {
    // 기본 통계 조회
    getStatistics: async (startDate?: string, endDate?: string): Promise<Statistics> => {
      const params = { startDate, endDate };
      const response = await apiClient.get<Statistics>('/api/admin/statistics', { params });
      return handleApiResponse(response);
    },

    // 매출 통계
    getSalesStatistics: async (startDate?: string, endDate?: string): Promise<any> => {
      const params = { startDate, endDate };
      const response = await apiClient.get('/api/admin/statistics/sales', { params });
      return handleApiResponse(response);
    },

    // 일별 통계
    getDailyStatistics: async (startDate?: string, endDate?: string): Promise<any> => {
      const params = { startDate, endDate };
      const response = await apiClient.get('/api/admin/statistics/daily', { params });
      return handleApiResponse(response);
    },

    // 시간별 통계
    getHourlyStatistics: async (date?: string): Promise<any> => {
      const params = { date };
      const response = await apiClient.get('/api/admin/statistics/hourly', { params });
      return handleApiResponse(response);
    },

    // 카테고리별 통계
    getCategoryStatistics: async (startDate?: string, endDate?: string): Promise<any> => {
      const params = { startDate, endDate };
      const response = await apiClient.get('/api/admin/statistics/category', { params });
      return handleApiResponse(response);
    },

    // CSV 내보내기
    exportStatistics: async (startDate?: string, endDate?: string): Promise<Blob> => {
      const params = { startDate, endDate };
      const response = await apiClient.get('/api/admin/statistics/export', { 
        params,
        responseType: 'blob' 
      });
      return response.data;
    },
  },

  // 메뉴 관리
  menus: {
    // 메뉴 목록 조회 (관리자용)
    getMenus: async (categoryId?: number): Promise<Menu[]> => {
      const params = categoryId ? { categoryId } : {};
      const response = await apiClient.get<Menu[]>('/api/menus', { params });
      return handleApiResponse(response);
    },

    // 메뉴 생성
    createMenu: async (menuData: MenuFormData): Promise<Menu> => {
      const formData = createFormData(menuData);
      const response = await apiClient.post<Menu>('/api/menus', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return handleApiResponse(response);
    },

    // 메뉴 수정
    updateMenu: async (menuId: number, menuData: Partial<MenuFormData>): Promise<Menu> => {
      const formData = createFormData(menuData);
      const response = await apiClient.put<Menu>(`/api/menus/${menuId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return handleApiResponse(response);
    },

    // 메뉴 삭제
    deleteMenu: async (menuId: number): Promise<void> => {
      await apiClient.delete(`/api/menus/${menuId}`);
    },

    // 메뉴 이미지 업로드
    uploadMenuImage: async (menuId: number, image: File): Promise<{ imageUrl: string }> => {
      const formData = new FormData();
      formData.append('image', image);
      
      const response = await apiClient.post<{ imageUrl: string }>(
        `/api/menus/${menuId}/image`, 
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return handleApiResponse(response);
    },
  },

  // 카테고리 관리
  categories: {
    // 카테고리 목록 조회 (관리자용)
    getCategories: async (): Promise<Category[]> => {
      const response = await apiClient.get<Category[]>('/api/categories');
      return handleApiResponse(response);
    },

    // 카테고리 생성
    createCategory: async (categoryData: CategoryFormData): Promise<Category> => {
      const response = await apiClient.post<Category>('/api/categories', categoryData);
      return handleApiResponse(response);
    },

    // 카테고리 수정
    updateCategory: async (categoryId: number, categoryData: Partial<CategoryFormData>): Promise<Category> => {
      const response = await apiClient.put<Category>(`/api/categories/${categoryId}`, categoryData);
      return handleApiResponse(response);
    },

    // 카테고리 삭제
    deleteCategory: async (categoryId: number): Promise<void> => {
      await apiClient.delete(`/api/categories/${categoryId}`);
    },
  },
};

export default adminApi;
