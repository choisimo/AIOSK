import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Menu } from '../../types';
import { MAX_ORDER_ITEMS, MAX_ORDER_ITEM_QUANTITY } from '../../constants/order';

interface CartItem {
  menu: Menu;
  quantity: number;
}

interface CartState {
  items: CartItem[];
}

const initialState: CartState = {
  items: [],
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // 메뉴 추가
    addItem: (state, action: PayloadAction<{ menu: Menu; quantity: number }>) => {
      const { menu, quantity } = action.payload;
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return;
      }

      const boundedQuantity = Math.min(quantity, MAX_ORDER_ITEM_QUANTITY);
      const existingItemIndex = state.items.findIndex(item => item.menu.id === menu.id);
      
      if (existingItemIndex >= 0) {
        // 이미 있는 메뉴인 경우 수량 추가
        state.items[existingItemIndex].quantity = Math.min(
          MAX_ORDER_ITEM_QUANTITY,
          state.items[existingItemIndex].quantity + boundedQuantity
        );
      } else {
        if (state.items.length >= MAX_ORDER_ITEMS) {
          return;
        }

        // 새로운 메뉴인 경우 추가
        state.items.push({
          menu,
          quantity: boundedQuantity
        });
      }
    },

    // 메뉴 수량 업데이트
    updateQuantity: (state, action: PayloadAction<{ menuId: number; quantity: number }>) => {
      const { menuId, quantity } = action.payload;
      if (!Number.isSafeInteger(quantity)) {
        return;
      }

      const itemIndex = state.items.findIndex(item => item.menu.id === menuId);
      
      if (itemIndex >= 0) {
        if (quantity <= 0) {
          // 수량이 0 이하면 제거
          state.items.splice(itemIndex, 1);
        } else {
          // 수량 업데이트
          state.items[itemIndex].quantity = Math.min(quantity, MAX_ORDER_ITEM_QUANTITY);
        }
      }
    },

    // 메뉴 제거
    removeItem: (state, action: PayloadAction<number>) => {
      const menuId = action.payload;
      state.items = state.items.filter(item => item.menu.id !== menuId);
    },

    // 장바구니 비우기
    clearCart: (state) => {
      state.items = [];
    },
  },
});

export const { addItem, updateQuantity, removeItem, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
