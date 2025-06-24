import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Order } from '../../types';

interface OrderState {
  currentOrder: Order | null;
  orders: Order[];
  loading: boolean;
  error: string | null;
  filter: {
    status?: Order['status'];
    startDate?: string;
    endDate?: string;
  };
}

const initialState: OrderState = {
  currentOrder: null,
  orders: [],
  loading: false,
  error: null,
  filter: {},
};

const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    // 주문 생성 시작
    createOrderStart: (state) => {
      state.loading = true;
      state.error = null;
    },

    // 주문 생성 성공
    createOrderSuccess: (state, action: PayloadAction<Order>) => {
      state.loading = false;
      state.currentOrder = action.payload;
      state.error = null;
    },

    // 주문 생성 실패
    createOrderFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    // 주문 목록 로딩 시작
    fetchOrdersStart: (state) => {
      state.loading = true;
      state.error = null;
    },

    // 주문 목록 로딩 성공
    fetchOrdersSuccess: (state, action: PayloadAction<Order[]>) => {
      state.loading = false;
      state.orders = action.payload;
      state.error = null;
    },

    // 주문 목록 로딩 실패
    fetchOrdersFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    // 주문 상태 업데이트
    updateOrderStatus: (state, action: PayloadAction<{ orderId: number; status: Order['status'] }>) => {
      const { orderId, status } = action.payload;
      const orderIndex = state.orders.findIndex(order => order.orderId === orderId);
      
      if (orderIndex >= 0) {
        state.orders[orderIndex].status = status;
      }
      
      // 현재 주문도 업데이트
      if (state.currentOrder && state.currentOrder.orderId === orderId) {
        state.currentOrder.status = status;
      }
    },

    // 주문 제거 (취소된 주문)
    removeOrder: (state, action: PayloadAction<number>) => {
      const orderId = action.payload;
      state.orders = state.orders.filter(order => order.orderId !== orderId);
      
      // 현재 주문이 제거된 주문인 경우 초기화
      if (state.currentOrder && state.currentOrder.orderId === orderId) {
        state.currentOrder = null;
      }
    },

    // 새 주문 추가 (실시간 알림용)
    addNewOrder: (state, action: PayloadAction<Order>) => {
      // 중복 체크
      const exists = state.orders.some(order => order.orderId === action.payload.orderId);
      if (!exists) {
        state.orders.unshift(action.payload); // 맨 앞에 추가
      }
    },

    // 필터 설정
    setFilter: (state, action: PayloadAction<OrderState['filter']>) => {
      state.filter = { ...state.filter, ...action.payload };
    },

    // 필터 초기화
    clearFilter: (state) => {
      state.filter = {};
    },

    // 에러 초기화
    clearError: (state) => {
      state.error = null;
    },

    // 현재 주문 초기화
    clearCurrentOrder: (state) => {
      state.currentOrder = null;
    },
  },
});

export const {
  createOrderStart,
  createOrderSuccess,
  createOrderFailure,
  fetchOrdersStart,
  fetchOrdersSuccess,
  fetchOrdersFailure,
  updateOrderStatus,
  removeOrder,
  addNewOrder,
  setFilter,
  clearFilter,
  clearError,
  clearCurrentOrder,
} = orderSlice.actions;

export default orderSlice.reducer;
