import {
  Box,
  Paper,
  Typography,
  Divider,
  List,
  ListItem,
  Chip
} from '@mui/material';
import { Receipt as ReceiptIcon, Print as PrintIcon } from '@mui/icons-material';
import type { Order } from '../../types';
import Button from '../ui/Button';

interface OrderReceiptProps {
  order: Order;
  onPrint: () => void;
}

const OrderReceipt = ({
  order,
  onPrint
}: OrderReceiptProps) => {
  return (
    <>
      {/* 디지털 영수증 */}
      <Paper
        elevation={3}
        sx={{
          maxWidth: 400,
          margin: '0 auto',
          p: 3,
          backgroundColor: '#ffffff',
          border: '2px dashed #e0e0e0',
          fontFamily: 'monospace',
        }}
      >
        <Box
          sx={{
            textAlign: 'center',
            mb: 2,
            pb: 2,
            borderBottom: '1px dashed #ccc',
          }}
        >
          <ReceiptIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight="bold" color="primary">
            🍽️ AIOSK 키오스크
          </Typography>
          <Typography variant="body2" color="text.secondary">
            주문 영수증
          </Typography>
        </Box>

        {/* 주문 정보 */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="text.secondary">
                주문번호
              </Typography>
              <Typography variant="h6" fontWeight="bold" color="primary">
                #{String(order.orderId).padStart(4, '0')}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="text.secondary">
                주문시간
              </Typography>
              <Typography variant="body2">
                {new Date(order.createdAt).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
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
              <ListItem
                key={index}
                sx={{
                  py: 0.5,
                  px: 0,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2">
                    {item.menuName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.pricePerItem.toLocaleString()}원 × {item.quantity}개
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight="bold">
                  {item.price.toLocaleString()}원
                </Typography>
              </ListItem>
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
            {order.totalPrice.toLocaleString()}원
          </Typography>
        </Box>

        {/* 상태 */}
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Chip
            label="주문 접수"
            color="success"
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
      </Paper>

      {/* 액션 버튼들 */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<PrintIcon />}
          onClick={onPrint}
          size="large"
        >
          영수증 인쇄
        </Button>
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
          #{String(order.orderId).padStart(4, '0')}
        </Typography>
      </Box>
    </>
  );
};

export default OrderReceipt;
