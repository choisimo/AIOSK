import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { publicApi } from '../services/publicApi';
import { useDispatch } from 'react-redux';
import { createOrderStart, createOrderSuccess, createOrderFailure } from '../store/slices/orderSlice';
import type { Category, Menu, Order, OrderItem } from '../types';

// 카테고리 조회 훅
export const useCategories = () => {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: publicApi.getCategories,
    staleTime: 5 * 60 * 1000, // 5분간 캐시
  });
};

// 메뉴 조회 훅
export const useMenus = (categoryId?: number) => {
  return useQuery<Menu[]>({
    queryKey: ['menus', categoryId],
    queryFn: () => publicApi.getMenus(categoryId),
    staleTime: 2 * 60 * 1000, // 2분간 캐시
  });
};

// 주문 생성 훅
export const useCreateOrder = () => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderData: { items: OrderItem[] }) => {
      dispatch(createOrderStart());
      return publicApi.createOrder(orderData);
    },
    onSuccess: (data: Order) => {
      dispatch(createOrderSuccess(data));
      // 필요시 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: Error) => {
      dispatch(createOrderFailure(error.message));
    },
  });
};

// 특정 메뉴 상세 조회 훅
export const useMenu = (menuId: number) => {
  return useQuery<Menu>({
    queryKey: ['menu', menuId],
    queryFn: () => publicApi.getMenu(menuId),
    enabled: !!menuId,
    staleTime: 5 * 60 * 1000, // 5분간 캐시
  });
};
