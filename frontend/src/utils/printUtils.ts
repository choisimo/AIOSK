import type { Order } from '../types';

// 영수증 인쇄 전용 스타일
const printStyles = `
  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    body {
      margin: 0;
      padding: 20px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
    }
    
    .print-receipt {
      max-width: 300px;
      margin: 0 auto;
      background: white !important;
      color: black !important;
    }
    
    .print-header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    
    .print-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .print-order-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
      font-size: 11px;
    }
    
    .print-items {
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    
    .print-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 11px;
    }
    
    .print-item-detail {
      color: #666;
      font-size: 10px;
      margin-left: 10px;
    }
    
    .print-total {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 14px;
      border-bottom: 2px dashed #000;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    
    .print-footer {
      text-align: center;
      font-size: 10px;
      color: #666;
    }
  }
`;

const escapeHtml = (value: unknown): string => {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return String(value ?? '').replace(/[&<>"']/g, (character) => htmlEscapes[character]);
};

// 영수증 인쇄 함수
export const printReceipt = (orderData: Order) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('팝업이 차단되었습니다. 팝업을 허용해주세요.');
    return;
  }

  const orderNumber = escapeHtml(String(orderData.orderId).padStart(4, '0'));
  const orderTime = escapeHtml(new Date(orderData.createdAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }));

  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>주문 영수증 #${orderNumber}</title>
      <style>${printStyles}</style>
    </head>
    <body>
      <div class="print-receipt">
        <div class="print-header">
          <div class="print-title">🍽️ AIOSK 키오스크</div>
          <div>주문 영수증</div>
        </div>
        
        <div class="print-order-info">
          <div>
            <div>주문번호: #${orderNumber}</div>
            <div>주문시간: ${orderTime}</div>
          </div>
        </div>
        
        <div class="print-items">
          <div style="font-weight: bold; margin-bottom: 8px;">주문 내역</div>
          ${orderData.items.map((item) => {
            const itemName = escapeHtml(item.menuName);
            const quantity = item.quantity.toLocaleString();
            const pricePerItem = item.pricePerItem.toLocaleString();
            const itemPrice = item.price.toLocaleString();

            return `
              <div class="print-item">
                <div>
                  <div>${itemName}</div>
                  <div class="print-item-detail">
                    ${pricePerItem}원 × ${quantity}개
                  </div>
                </div>
                <div>${itemPrice}원</div>
              </div>
            `;
          }).join('')}
        </div>
        
        <div class="print-total">
          <div>총 결제금액</div>
          <div>${orderData.totalPrice.toLocaleString()}원</div>
        </div>
        
        <div class="print-footer">
          <div style="margin-bottom: 10px;">주문이 정상적으로 접수되었습니다.</div>
          <div style="margin-bottom: 10px;">주문번호: #${orderNumber}</div>
          <div style="margin-bottom: 10px;">예상 준비시간: 5-10분</div>
          <div style="font-size: 9px;">
            문의사항이 있으시면 매장 직원에게 말씀해 주세요.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(printContent);
  printWindow.document.close();
  
  // 잠시 대기 후 인쇄
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
};
