import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CartItem, Menu } from '../../types';

interface CartState {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
}

const initialState: CartState = {
  items: [],
  totalItems: 0,
  totalPrice: 0,
};

// 장바구니 계산 헬퍼 함수
const calculateTotals = (items: CartItem[]) => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);
  return { totalItems, totalPrice };
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // 메뉴 추가
    addItem: (state, action: PayloadAction<{ menu: Menu; quantity: number }>) => {
      const { menu, quantity } = action.payload;
      const existingItemIndex = state.items.findIndex(item => item.menu.menuId === menu.menuId);
      
      if (existingItemIndex >= 0) {
        // 이미 있는 메뉴인 경우 수량 추가
        state.items[existingItemIndex].quantity += quantity;
        state.items[existingItemIndex].totalPrice = 
          state.items[existingItemIndex].quantity * menu.price;
      } else {
        // 새로운 메뉴인 경우 추가
        state.items.push({
          menu,
          quantity,
          totalPrice: menu.price * quantity,
        });
      }
      
      // 총계 업데이트
      const totals = calculateTotals(state.items);
      state.totalItems = totals.totalItems;
      state.totalPrice = totals.totalPrice;
    },

    // 메뉴 수량 업데이트
    updateQuantity: (state, action: PayloadAction<{ menuId: number; quantity: number }>) => {
      const { menuId, quantity } = action.payload;
      const itemIndex = state.items.findIndex(item => item.menu.menuId === menuId);
      
      if (itemIndex >= 0) {
        if (quantity <= 0) {
          // 수량이 0 이하면 제거
          state.items.splice(itemIndex, 1);
        } else {
          // 수량 업데이트
          state.items[itemIndex].quantity = quantity;
          state.items[itemIndex].totalPrice = 
            state.items[itemIndex].menu.price * quantity;
        }
        
        // 총계 업데이트
        const totals = calculateTotals(state.items);
        state.totalItems = totals.totalItems;
        state.totalPrice = totals.totalPrice;
      }
    },

    // 메뉴 제거
    removeItem: (state, action: PayloadAction<number>) => {
      const menuId = action.payload;
      state.items = state.items.filter(item => item.menu.menuId !== menuId);
      
      // 총계 업데이트
      const totals = calculateTotals(state.items);
      state.totalItems = totals.totalItems;
      state.totalPrice = totals.totalPrice;
    },

    // 장바구니 비우기
    clearCart: (state) => {
      state.items = [];
      state.totalItems = 0;
      state.totalPrice = 0;
    },
  },
});

export const { addItem, updateQuantity, removeItem, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
