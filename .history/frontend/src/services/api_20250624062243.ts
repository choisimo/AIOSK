import axios, { AxiosResponse } from 'axios';
import { ApiResponse, ApiError } from '../types';

// 백엔드 서버 URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

// Axios 인스턴스 생성
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request 인터셉터 - JWT 토큰 자동 추가
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response 인터셉터 - 에러 처리
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    const apiError: ApiError = {
      message: error.response?.data?.message || error.message || '알 수 없는 오류가 발생했습니다.',
      error: error.response?.data?.error,
      statusCode: error.response?.status,
    };

    // 인증 오류 시 토큰 제거 및 로그인 페이지로 리다이렉트
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }

    return Promise.reject(apiError);
  }
);

// 공통 API 응답 처리 헬퍼
export const handleApiResponse = <T>(response: AxiosResponse<T>): T => {
  return response.data;
};

// 파일 업로드를 위한 FormData 생성 헬퍼
export const createFormData = (data: Record<string, any>): FormData => {
  const formData = new FormData();
  
  Object.entries(data).forEach(([key, value]) => {
    if (value instanceof File) {
      formData.append(key, value);
    } else if (value !== null && value !== undefined) {
      formData.append(key, String(value));
    }
  });
  
  return formData;
};

// 에러 메시지 추출 헬퍼
export const getErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as ApiError).message;
  }
  return '알 수 없는 오류가 발생했습니다.';
};

export default apiClient;
