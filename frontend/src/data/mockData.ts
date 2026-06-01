import type { Category, Menu } from '../types';

type MockMenu = Menu & {
  categoryId: number;
};

// 🎯 개발/테스트용 모의 데이터
const mockCategories: Category[] = [
  {
    id: 1,
    name: '커피'
  },
  {
    id: 2,
    name: '음료'
  },
  {
    id: 3,
    name: '디저트'
  },
  {
    id: 4,
    name: '샌드위치'
  }
];

const mockMenus: MockMenu[] = [
  // 커피 메뉴
  {
    id: 1,
    name: '아메리카노',
    description: '깔끔하고 진한 아메리카노',
    price: 4500,
    categoryId: 1,
    imageUrl: 'https://images.unsplash.com/photo-1497636577773-f1231844b336?w=400'
  },
  {
    id: 2,
    name: '카페라떼',
    description: '부드러운 우유와 에스프레소의 조화',
    price: 5000,
    categoryId: 1,
    imageUrl: 'https://images.unsplash.com/photo-1561047029-3000c68339ca?w=400'
  },
  {
    id: 3,
    name: '카푸치노',
    description: '풍부한 거품과 함께하는 커피',
    price: 5200,
    categoryId: 1,
    imageUrl: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400'
  },
  {
    id: 4,
    name: '바닐라라떼',
    description: '달콤한 바닐라 향이 가득한 라떼',
    price: 5500,
    categoryId: 1,
    imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400'
  },

  // 음료 메뉴
  {
    id: 5,
    name: '아이스티',
    description: '시원하고 상큼한 아이스티',
    price: 3500,
    categoryId: 2,
    imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400'
  },
  {
    id: 6,
    name: '레몬에이드',
    description: '신선한 레몬으로 만든 상큼한 에이드',
    price: 4000,
    categoryId: 2,
    imageUrl: 'https://images.unsplash.com/photo-1523371683702-0a57c6c87eea?w=400'
  },
  {
    id: 7,
    name: '딸기스무디',
    description: '달콤한 딸기로 만든 건강한 스무디',
    price: 6000,
    categoryId: 2,
    imageUrl: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400'
  },

  // 디저트 메뉴
  {
    id: 8,
    name: '치즈케이크',
    description: '부드럽고 진한 뉴욕 스타일 치즈케이크',
    price: 6500,
    categoryId: 3,
    imageUrl: 'https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=400'
  },
  {
    id: 9,
    name: '초콜릿 브라우니',
    description: '진한 초콜릿이 가득한 촉촉한 브라우니',
    price: 4500,
    categoryId: 3,
    imageUrl: 'https://images.unsplash.com/photo-1624353365286-3f8d62daad51?w=400'
  },
  {
    id: 10,
    name: '마카롱',
    description: '다양한 맛의 프랑스 마카롱 (5개입)',
    price: 8000,
    categoryId: 3,
    imageUrl: 'https://images.unsplash.com/photo-1558312657-b966ecadf2a4?w=400'
  },

  // 샌드위치 메뉴
  {
    id: 11,
    name: 'BLT 샌드위치',
    description: '베이컨, 양상추, 토마토가 들어간 클래식 샌드위치',
    price: 7500,
    categoryId: 4,
    imageUrl: 'https://images.unsplash.com/photo-1553909489-cd47e0ef937f?w=400'
  },
  {
    id: 12,
    name: '클럽 샌드위치',
    description: '치킨, 베이컨, 치즈가 층층이 쌓인 프리미엄 샌드위치',
    price: 9500,
    categoryId: 4,
    imageUrl: 'https://images.unsplash.com/photo-1567909143771-2a22db8b4077?w=400'
  },
  {
    id: 13,
    name: '참치 샌드위치',
    description: '신선한 참치와 야채로 만든 건강한 샌드위치',
    price: 6500,
    categoryId: 4,
    imageUrl: 'https://images.unsplash.com/photo-1595777216528-85ba64ac4962?w=400'
  }
];

export const mockDataEnabled = import.meta.env.VITE_USE_MOCK_DATA === 'true';

if (mockDataEnabled && import.meta.env.PROD) {
  throw new Error('VITE_USE_MOCK_DATA must be false in production frontend bundles.');
}

export const getMockCategories = (): Category[] => {
  return mockCategories;
};

// 카테고리별 메뉴 조회 함수
export const getMockMenusByCategory = (categoryId?: number): Menu[] => {
  if (!categoryId) return mockMenus;
  return mockMenus.filter(menu => menu.categoryId === categoryId);
};

// 특정 메뉴 조회 함수
export const getMockMenuById = (menuId: number): Menu => {
  const menu = mockMenus.find(item => item.id === menuId);
  if (!menu) {
    throw new Error(`Mock menu not found: ${menuId}`);
  }
  return menu;
};
