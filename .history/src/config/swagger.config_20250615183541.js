// src/config/swagger.config.js

const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Swagger 기본 설정
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'AIOSK API Documentation',
    version: '1.0.0',
    description: '🚀 AI 키오스크 백엔드 API 문서\n\n이 API는 키오스크 시스템을 위한 완전한 백엔드 솔루션을 제공합니다.',
    contact: {
      name: 'AIOSK Development Team',
      email: 'dev@aiosk.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: '개발 서버',
    },
    {
      url: 'https://api.aiosk.com',
      description: '운영 서버',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT 토큰을 사용한 인증. 로그인 후 받은 토큰을 "Bearer {token}" 형식으로 입력하세요.',
      },
    },
    schemas: {
      // 공통 응답 스키마
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            example: '성공적으로 처리되었습니다.',
          },
          data: {
            type: 'object',
            description: '응답 데이터',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          status: {
            type: 'string',
            example: 'error',
          },
          message: {
            type: 'string',
            example: '오류가 발생했습니다.',
          },
        },
      },
      // 카테고리 스키마
      Category: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1,
            description: '카테고리 ID',
          },
          name: {
            type: 'string',
            example: '음료',
            description: '카테고리 이름',
          },
          description: {
            type: 'string',
            example: '다양한 음료 메뉴',
            description: '카테고리 설명',
          },
          is_active: {
            type: 'boolean',
            example: true,
            description: '활성화 상태',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            example: '2025-06-15T10:30:00Z',
            description: '생성일시',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2025-06-15T10:30:00Z',
            description: '수정일시',
          },
        },
      },
      // 메뉴 스키마
      Menu: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1,
            description: '메뉴 ID',
          },
          name: {
            type: 'string',
            example: '아메리카노',
            description: '메뉴 이름',
          },
          description: {
            type: 'string',
            example: '진한 에스프레소와 뜨거운 물',
            description: '메뉴 설명',
          },
          price: {
            type: 'number',
            format: 'decimal',
            example: 4500.00,
            description: '메뉴 가격',
          },
          category_id: {
            type: 'integer',
            example: 1,
            description: '카테고리 ID',
          },
          category_name: {
            type: 'string',
            example: '음료',
            description: '카테고리 이름',
          },
          image_url: {
            type: 'string',
            example: '/uploads/menus/americano.jpg',
            description: '메뉴 이미지 URL',
          },
          is_available: {
            type: 'boolean',
            example: true,
            description: '판매 가능 여부',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            example: '2025-06-15T10:30:00Z',
            description: '생성일시',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2025-06-15T10:30:00Z',
            description: '수정일시',
          },
        },
      },
      // 주문 스키마
      Order: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1,
            description: '주문 ID',
          },
          total_price: {
            type: 'number',
            format: 'decimal',
            example: 9000.00,
            description: '총 주문 가격',
          },
          status: {
            type: 'string',
            enum: ['RECEIVED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'],
            example: 'RECEIVED',
            description: '주문 상태',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            example: '2025-06-15T10:30:00Z',
            description: '주문 생성일시',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2025-06-15T10:30:00Z',
            description: '주문 수정일시',
          },
          items: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/OrderItem',
            },
            description: '주문 항목 목록',
          },
        },
      },
      // 주문 항목 스키마
      OrderItem: {
        type: 'object',
        properties: {
          menu_id: {
            type: 'integer',
            example: 1,
            description: '메뉴 ID',
          },
          menu_name: {
            type: 'string',
            example: '아메리카노',
            description: '메뉴 이름',
          },
          quantity: {
            type: 'integer',
            example: 2,
            description: '주문 수량',
          },
          price_per_item: {
            type: 'number',
            format: 'decimal',
            example: 4500.00,
            description: '개당 가격',
          },
        },
      },
      // 통계 스키마
      Statistics: {
        type: 'object',
        properties: {
          totalSales: {
            type: 'number',
            format: 'decimal',
            example: 150000.00,
            description: '총 매출',
          },
          totalOrders: {
            type: 'integer',
            example: 45,
            description: '총 주문 수',
          },
          averageOrderValue: {
            type: 'number',
            format: 'decimal',
            example: 3333.33,
            description: '평균 주문 금액',
          },
          topSellingMenus: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                menu_name: {
                  type: 'string',
                  example: '아메리카노',
                },
                total_quantity: {
                  type: 'integer',
                  example: 25,
                },
                total_sales: {
                  type: 'number',
                  format: 'decimal',
                  example: 112500.00,
                },
              },
            },
            description: '인기 메뉴 목록',
          },
        },
      },
    },
  },
  tags: [
    {
      name: '🔓 Public API',
      description: '인증이 필요하지 않은 공개 API (키오스크용)',
    },
    {
      name: '🔐 Admin - Auth',
      description: '관리자 인증 관련 API',
    },
    {
      name: '🏷️ Admin - Categories',
      description: '관리자 카테고리 관리 API',
    },
    {
      name: '🍔 Admin - Menus',
      description: '관리자 메뉴 관리 API',
    },
    {
      name: '📋 Admin - Orders',
      description: '관리자 주문 관리 API',
    },
    {
      name: '📊 Admin - Statistics',
      description: '관리자 통계 및 리포트 API',
    },
    {
      name: '📁 File Upload',
      description: '파일 업로드 관련 API',
    },
  ],
};

// Swagger JSDoc 옵션
const options = {
  definition: swaggerDefinition,
  apis: [
    './src/routes/**/*.js',
    './src/controllers/**/*.js',
    './src/models/**/*.js',
  ],
};

// Swagger 스펙 생성
const swaggerSpec = swaggerJSDoc(options);

// Swagger UI 옵션
const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6; }
    .swagger-ui .info .description { margin: 20px 0; }
    .swagger-ui .opblock.opblock-get .opblock-summary { border-color: #10b981; }
    .swagger-ui .opblock.opblock-post .opblock-summary { border-color: #3b82f6; }
    .swagger-ui .opblock.opblock-put .opblock-summary { border-color: #f59e0b; }
    .swagger-ui .opblock.opblock-delete .opblock-summary { border-color: #ef4444; }
    .swagger-ui .opblock.opblock-patch .opblock-summary { border-color: #8b5cf6; }
  `,
  customSiteTitle: 'AIOSK API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showRequestHeaders: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
};

module.exports = {
  swaggerSpec,
  swaggerUi,
  swaggerUiOptions,
};
