import axios from 'axios';

const LOCAL_API_BASE_URL = 'http://localhost:3000';
const configuredUrl = import.meta.env.VITE_API_URL?.trim();
const allowLocalApiUrl = import.meta.env.VITE_ALLOW_LOCAL_API_URL === 'true';

if (!configuredUrl && !import.meta.env.DEV) {
  throw new Error('VITE_API_URL must be set for production frontend builds.');
}

if (configuredUrl && import.meta.env.PROD && !allowLocalApiUrl && /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(configuredUrl)) {
  throw new Error('VITE_API_URL must not point to a local address in production frontend builds.');
}

const API_BASE_URL = configuredUrl || LOCAL_API_BASE_URL;

// Axios 인스턴스 생성
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response 인터셉터 - 에러 처리
apiClient.interceptors.response.use(
  undefined,
  (error) => {
    return Promise.reject(new Error(error.response?.data?.message || error.message || '알 수 없는 오류가 발생했습니다.'));
  }
);
