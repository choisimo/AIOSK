import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Admin } from '../../types';

interface AuthState {
  isAuthenticated: boolean;
  admin: Admin | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  admin: null,
  token: localStorage.getItem('adminToken'),
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // 로그인 시작
    loginStart: (state) => {
      state.loading = true;
      state.error = null;
    },

    // 로그인 성공
    loginSuccess: (state, action: PayloadAction<{ admin: Admin; token: string }>) => {
      state.loading = false;
      state.isAuthenticated = true;
      state.admin = action.payload.admin;
      state.token = action.payload.token;
      state.error = null;
      
      // 토큰을 localStorage에 저장
      localStorage.setItem('adminToken', action.payload.token);
    },

    // 로그인 실패
    loginFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.isAuthenticated = false;
      state.admin = null;
      state.token = null;
      state.error = action.payload;
      
      // localStorage에서 토큰 제거
      localStorage.removeItem('adminToken');
    },

    // 로그아웃
    logout: (state) => {
      state.isAuthenticated = false;
      state.admin = null;
      state.token = null;
      state.error = null;
      
      // localStorage에서 토큰 제거
      localStorage.removeItem('adminToken');
    },

    // 에러 초기화
    clearError: (state) => {
      state.error = null;
    },

    // 토큰 복원 (새로고침 시)
    restoreToken: (state) => {
      const token = localStorage.getItem('adminToken');
      if (token) {
        state.token = token;
        state.isAuthenticated = true;
      }
    },
  },
});

export const { 
  loginStart, 
  loginSuccess, 
  loginFailure, 
  logout, 
  clearError, 
  restoreToken 
} = authSlice.actions;

export default authSlice.reducer;
