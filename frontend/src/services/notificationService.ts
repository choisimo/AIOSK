// 알림 서비스 관련 유틸리티
import type { OrderItem } from '../types';

export interface NotificationService {
  sendEmail: (to: string, orderNumber: string, items: OrderItem[]) => Promise<void>;
  sendSMS: (to: string, orderNumber: string) => Promise<void>;
}

// 이메일 템플릿
export const createEmailTemplate = (orderNumber: string, items: OrderItem[], totalPrice: number) => {
  return {
    subject: `[AIOSK] 주문 접수 완료 - 주문번호 #${orderNumber}`,
    body: `
안녕하세요! AIOSK 키오스크를 이용해 주셔서 감사합니다.

📋 주문 정보
주문번호: #${orderNumber}
주문시간: ${new Date().toLocaleString('ko-KR')}

🍽️ 주문 내역
${items.map(item => `• ${item.menuName} ${item.quantity}개 - ${(item.price || 0).toLocaleString()}원`).join('\n')}

💰 총 결제금액: ${totalPrice.toLocaleString()}원

📱 주문 상태 확인
주문번호를 통해 언제든지 주문 상태를 확인하실 수 있습니다.

음식 준비가 완료되면 다시 알려드리겠습니다.
감사합니다! 🎉
    `
  };
};

// SMS 템플릿
export const createSMSTemplate = (orderNumber: string, totalPrice: number) => {
  return `[AIOSK] 주문 접수 완료!
주문번호: #${orderNumber}
결제금액: ${totalPrice.toLocaleString()}원
준비 완료시 재알림 드립니다. 감사합니다!`;
};

// 모의 알림 서비스 구현
export const mockNotificationService: NotificationService = {
  sendEmail: async (to: string, orderNumber: string, items: OrderItem[]) => {
    const totalPrice = items.reduce((sum, item) => sum + (item.price || 0), 0);
    const template = createEmailTemplate(orderNumber, items, totalPrice);
    
    console.log('📧 이메일 전송 시뮬레이션');
    console.log('받는사람:', to);
    console.log('제목:', template.subject);
    console.log('내용:', template.body);
    
    // 실제 구현에서는 이메일 서비스 API 호출
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('✅ 이메일 전송 완료');
  },

  sendSMS: async (to: string, orderNumber: string) => {
    const message = createSMSTemplate(orderNumber, 0); // totalPrice는 실제 구현에서 전달받아야 함
    
    console.log('📱 SMS 전송 시뮬레이션');
    console.log('받는사람:', to);
    console.log('내용:', message);
    
    // 실제 구현에서는 SMS 서비스 API 호출
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ SMS 전송 완료');
  }
};
