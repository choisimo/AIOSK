import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  List,
  ListItem,
  Chip,
  Grid
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { Receipt as ReceiptIcon, Print as PrintIcon } from '@mui/icons-material';
import type { Order } from '../../types';
import Button from '../ui/Button';
import OrderQRCode from './OrderQRCode';

const ReceiptContainer = styled(Paper)(({ theme }) => ({
  maxWidth: 400,
  margin: '0 auto',
  padding: theme.spacing(3),
  backgroundColor: '#ffffff',
  border: '2px dashed #e0e0e0',
  fontFamily: 'monospace',
}));

const ReceiptHeader = styled(Box)(({ theme }) => ({
  textAlign: 'center',
  marginBottom: theme.spacing(2),
  paddingBottom: theme.spacing(2),
  borderBottom: '1px dashed #ccc',
}));

const ReceiptItem = styled(ListItem)(({ theme }) => ({
  padding: `${theme.spacing(0.5)} 0`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}));

interface OrderReceiptProps {
  order: Order;
  onPrint?: () => void;
  onEmailSend?: () => void;
  onSMSSend?: () => void;
}

const OrderReceipt: React.FC<OrderReceiptProps> = ({
  order,
  onPrint,
  onEmailSend,
  onSMSSend
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box>
      {/* 디지털 영수증 */}
      <ReceiptContainer elevation={3}>
        <ReceiptHeader>
          <ReceiptIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight="bold" color="primary">
            🍽️ AIOSK 키오스크
          </Typography>
          <Typography variant="body2" color="text.secondary">
            주문 영수증
          </Typography>
        </ReceiptHeader>

        {/* 주문 정보 */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="text.secondary">
                주문번호
              </Typography>
              <Typography variant="h6" fontWeight="bold" color="primary">
                #{String(order.id || order.orderId).padStart(4, '0')}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="text.secondary">
                주문시간
              </Typography>
              <Typography variant="body2">
                {order.createdAt ? formatDate(order.createdAt) : '방금 전'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* 주문 아이템 */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            주문 내역
          </Typography>
          <List dense>
            {order.items.map((item, index) => (
              <ReceiptItem key={index}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2">
                    {item.menuName || `메뉴 ${item.menuId}`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.pricePerItem ? item.pricePerItem.toLocaleString() : '0'}원 × {item.quantity}개
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight="bold">
                  {item.price ? item.price.toLocaleString() : '0'}원
                </Typography>
              </ReceiptItem>
            ))}
          </List>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* 총계 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            총 결제금액
          </Typography>
          <Typography variant="h5" fontWeight="bold" color="primary">
            {order.totalPrice?.toLocaleString() || '0'}원
          </Typography>
        </Box>

        {/* 상태 */}
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Chip
            label={order.status === 'RECEIVED' ? '주문 접수' : order.status}
            color="success"
            variant="filled"
            size="medium"
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* 안내 메시지 */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            주문이 정상적으로 접수되었습니다.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            주문번호를 기억해 주세요!
          </Typography>
        </Box>
      </ReceiptContainer>

      {/* 액션 버튼들 */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
        {onPrint && (
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={onPrint}
            size="large"
          >
            영수증 인쇄
          </Button>
        )}
        {onEmailSend && (
          <Button
            variant="outlined"
            onClick={onEmailSend}
            size="large"
          >
            이메일 전송
          </Button>
        )}
        {onSMSSend && (
          <Button
            variant="outlined"
            onClick={onSMSSend}
            size="large"
          >
            SMS 전송
          </Button>
        )}
      </Box>

      {/* 주문번호 하이라이트 */}
      <Box 
        sx={{ 
          mt: 3, 
          p: 2, 
          backgroundColor: 'primary.light', 
          borderRadius: 2,
          textAlign: 'center'
        }}
      >
        <Typography variant="body1" color="white" fontWeight="bold">
          📱 주문번호를 스크린샷하거나 기억해 주세요!
        </Typography>
        <Typography variant="h4" color="white" fontWeight="bold" sx={{ mt: 1 }}>
          #{String(order.id || order.orderId).padStart(4, '0')}
        </Typography>
      </Box>

      {/* QR 코드 섹션 */}
      <Box sx={{ mt: 3 }}>
        <OrderQRCode 
          orderNumber={String(order.id || order.orderId).padStart(4, '0')}
          size={120}
        />
      </Box>
    </Box>
  );
};

export default OrderReceipt;
