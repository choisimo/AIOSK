import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { adminApi } from '../services/adminApi';
import { 
  loginStart, 
  loginSuccess, 
  loginFailure
} from '../store/slices/authSlice';
import { 
  fetchOrdersStart,
  fetchOrdersSuccess,
  fetchOrdersFailure,
  updateOrderStatus as updateOrderStatusAction
} from '../store/slices/orderSlice';
import type { 
  LoginRequest, 
  Order, 
  OrderFilter, 
  Statistics,
  Menu,
  MenuFormData,
  Category,
  CategoryFormData,
  SalesStatistics,
  DailyStatistics,
  HourlyStatistics,
  CategoryStatistics
} from '../types';

// 로그인 훅
export const useLogin = () => {
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: (credentials: LoginRequest) => {
      dispatch(loginStart());
      return adminApi.auth.login(credentials);
    },
    onSuccess: (data) => {
      dispatch(loginSuccess(data));
    },
    onError: (error: Error) => {
      dispatch(loginFailure(error.message));
    },
  });
};

// 주문 목록 조회 훅
export const useAdminOrders = (filter?: OrderFilter) => {
  const dispatch = useDispatch();

  return useQuery<Order[]>({
    queryKey: ['admin-orders', filter],
    queryFn: () => {
      dispatch(fetchOrdersStart());
      return adminApi.orders.getOrders(filter);
    },
    onSuccess: (data) => {
      dispatch(fetchOrdersSuccess(data));
    },
    onError: (error: Error) => {
      dispatch(fetchOrdersFailure(error.message));
    },
    refetchInterval: 30000, // 30초마다 자동 새로고침
  });
};

// 주문 상태 업데이트 훅
export const useUpdateOrderStatus = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: Order['status'] }) => 
      adminApi.orders.updateOrderStatus(orderId, status),
    onSuccess: (data, variables) => {
      dispatch(updateOrderStatusAction(variables));
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
  });
};

// 주문 취소 훅
export const useCancelOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: number) => adminApi.orders.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
  });
};

// 통계 조회 훅
export const useStatistics = (startDate?: string, endDate?: string) => {
  return useQuery<Statistics>({
    queryKey: ['statistics', startDate, endDate],
    queryFn: () => adminApi.statistics.getStatistics(startDate, endDate),
    staleTime: 2 * 60 * 1000, // 2분간 캐시
  });
};

// 매출 통계 훅
export const useSalesStatistics = (startDate?: string, endDate?: string) => {
  return useQuery<SalesStatistics>({
    queryKey: ['sales-statistics', startDate, endDate],
    queryFn: () => adminApi.statistics.getSalesStatistics(startDate, endDate),
    staleTime: 2 * 60 * 1000,
  });
};

// 일별 통계 훅
export const useDailyStatistics = (startDate?: string, endDate?: string) => {
  return useQuery<DailyStatistics[]>({
    queryKey: ['daily-statistics', startDate, endDate],
    queryFn: () => adminApi.statistics.getDailyStatistics(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });
};

// 시간별 통계 훅
export const useHourlyStatistics = (date?: string) => {
  return useQuery<HourlyStatistics[]>({
    queryKey: ['hourly-statistics', date],
    queryFn: () => adminApi.statistics.getHourlyStatistics(date),
    staleTime: 5 * 60 * 1000,
  });
};

// 카테고리별 통계 훅
export const useCategoryStatistics = (startDate?: string, endDate?: string) => {
  return useQuery<CategoryStatistics[]>({
    queryKey: ['category-statistics', startDate, endDate],
    queryFn: () => adminApi.statistics.getCategoryStatistics(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });
};

// 메뉴 관리 훅들
export const useAdminMenus = (categoryId?: number) => {
  return useQuery<Menu[]>({
    queryKey: ['admin-menus', categoryId],
    queryFn: () => adminApi.menus.getMenus(categoryId),
    staleTime: 2 * 60 * 1000,
  });
};

export const useCreateMenu = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (menuData: MenuFormData) => adminApi.menus.createMenu(menuData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
      queryClient.invalidateQueries({ queryKey: ['menus'] });
    },
  });
};

export const useUpdateMenu = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ menuId, menuData }: { menuId: number; menuData: Partial<MenuFormData> }) => 
      adminApi.menus.updateMenu(menuId, menuData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
      queryClient.invalidateQueries({ queryKey: ['menus'] });
    },
  });
};

export const useDeleteMenu = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (menuId: number) => adminApi.menus.deleteMenu(menuId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
      queryClient.invalidateQueries({ queryKey: ['menus'] });
    },
  });
};

// 카테고리 관리 훅들
export const useAdminCategories = () => {
  return useQuery<Category[]>({
    queryKey: ['admin-categories'],
    queryFn: adminApi.categories.getCategories,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryData: CategoryFormData) => adminApi.categories.createCategory(categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

export const useUpdateCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, categoryData }: { categoryId: number; categoryData: Partial<CategoryFormData> }) => 
      adminApi.categories.updateCategory(categoryId, categoryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

export const useDeleteCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: number) => adminApi.categories.deleteCategory(categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};
