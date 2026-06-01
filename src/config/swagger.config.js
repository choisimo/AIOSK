// src/config/swagger.config.js

const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const configuredApiPublicUrl = process.env.API_PUBLIC_URL?.trim();
const swaggerServerUrl = configuredApiPublicUrl || '/';

// Swagger 기본 설정
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'AIOSK API Documentation',
    version: '1.0.0',
    description: 'AI 키오스크 백엔드 API 문서\n\n이 API는 키오스크 주문, 관리자 인증, 메뉴/카테고리, 주문 관리, 통계 조회 엔드포인트를 제공합니다.',
    license: {
      name: 'ISC',
      url: 'https://opensource.org/licenses/ISC',
    },
  },
  servers: [
    {
      url: swaggerServerUrl,
      description: configuredApiPublicUrl ? '공개 API URL' : '현재 origin',
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
      // 공통 오류 응답 스키마
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
            example: '/uploads/menus/menu-1-1700000000000.jpg',
            description: '메뉴 이미지 URL',
          },
          status: {
            type: 'string',
            enum: ['FOR_SALE', 'SOLD_OUT'],
            example: 'FOR_SALE',
            description: '판매 상태',
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
      // 통계 스키마
      Statistics: {
        type: 'object',
        properties: {
          overview: {
            type: 'object',
            properties: {
              total_orders: {
                type: 'integer',
                example: 45,
                description: '총 주문 수',
              },
              total_sales: {
                type: 'number',
                format: 'decimal',
                example: 150000.00,
                description: '총 매출',
              },
              average_order_value: {
                type: 'number',
                format: 'decimal',
                example: 3333.33,
                description: '평균 주문 금액',
              },
              completed_orders: {
                type: 'integer',
                example: 38,
                description: '완료된 주문 수',
              },
              cancelled_orders: {
                type: 'integer',
                example: 2,
                description: '취소된 주문 수',
              },
              pending_orders: {
                type: 'integer',
                example: 3,
                description: '접수된 주문 수',
              },
              preparing_orders: {
                type: 'integer',
                example: 2,
                description: '준비 중인 주문 수',
              },
            },
          },
          topSellingMenus: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                menu_id: {
                  type: 'integer',
                  example: 1,
                },
                menu_name: {
                  type: 'string',
                  example: '아메리카노',
                },
                category_name: {
                  type: 'string',
                  nullable: true,
                  example: '음료',
                },
                total_quantity: {
                  type: 'integer',
                  example: 25,
                },
                order_count: {
                  type: 'integer',
                  example: 18,
                },
                total_revenue: {
                  type: 'number',
                  format: 'decimal',
                  example: 112500.00,
                },
                average_price: {
                  type: 'number',
                  format: 'decimal',
                  example: 4500.00,
                },
              },
            },
            description: '인기 메뉴 목록',
          },
          dailySales: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sale_date: {
                  type: 'string',
                  format: 'date',
                  example: '2025-06-15',
                },
                order_count: {
                  type: 'integer',
                  example: 12,
                },
                daily_sales: {
                  type: 'number',
                  format: 'decimal',
                  example: 54000.00,
                },
                completed_orders: {
                  type: 'integer',
                  example: 10,
                },
                cancelled_orders: {
                  type: 'integer',
                  example: 1,
                },
              },
            },
            description: '최근 7일 일별 매출',
          },
          hourlyAnalysis: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                order_hour: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 23,
                  example: 12,
                },
                order_count: {
                  type: 'integer',
                  example: 8,
                },
                hourly_sales: {
                  type: 'number',
                  format: 'decimal',
                  example: 36000.00,
                },
                average_order_value: {
                  type: 'number',
                  format: 'decimal',
                  example: 4500.00,
                },
              },
            },
            description: '시간대별 주문 분석',
          },
          categoryStats: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category_id: {
                  type: 'integer',
                  example: 1,
                },
                category_name: {
                  type: 'string',
                  example: '음료',
                },
                order_count: {
                  type: 'integer',
                  example: 20,
                },
                total_quantity: {
                  type: 'integer',
                  example: 34,
                },
                category_revenue: {
                  type: 'number',
                  format: 'decimal',
                  example: 153000.00,
                },
                menu_count: {
                  type: 'integer',
                  example: 6,
                },
              },
            },
            description: '카테고리별 매출 분석',
          },
          generatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-06-15T10:30:00.000Z',
          },
          period: {
            type: 'object',
            properties: {
              startDate: {
                type: 'string',
                nullable: true,
                example: '2025-06-01',
              },
              endDate: {
                type: 'string',
                nullable: true,
                example: '2025-06-15',
              },
            },
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
      name: 'System',
      description: '헬스 체크와 운영 상태 확인 API',
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
    './src/server.js',
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
  customfavIcon: '/favicon.svg',
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
