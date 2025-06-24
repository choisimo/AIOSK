import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, CircularProgress } from '@mui/material';
import QRCode from 'qrcode';

interface OrderQRCodeProps {
  orderNumber: string;
  size?: number;
}

const OrderQRCode: React.FC<OrderQRCodeProps> = ({ 
  orderNumber, 
  size = 150 
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        // 실제 구현에서는 주문 상태 확인 URL을 생성
        const orderCheckUrl = `${window.location.origin}/order/${orderNumber}`;
        
        const qrCodeDataUrl = await QRCode.toDataURL(orderCheckUrl, {
          width: size,
          margin: 2,
          color: {
            dark: '#1976d2', // MUI primary color
            light: '#FFFFFF'
          }
        });
        
        setQrCodeUrl(qrCodeDataUrl);
      } catch (error) {
        console.error('QR 코드 생성 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    generateQRCode();
  }, [orderNumber, size]);

  if (loading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          width: size,
          height: size,
          margin: '0 auto'
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper 
      elevation={2}
      sx={{ 
        p: 2, 
        textAlign: 'center',
        backgroundColor: 'background.paper',
        borderRadius: 2
      }}
    >
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
        📱 주문 상태 확인
      </Typography>
      
      {qrCodeUrl && (
        <Box sx={{ mb: 2 }}>
          <img 
            src={qrCodeUrl} 
            alt={`주문번호 ${orderNumber} QR 코드`}
            style={{ 
              width: size, 
              height: size,
              border: '2px solid #e0e0e0',
              borderRadius: '8px'
            }}
          />
        </Box>
      )}
      
      <Typography variant="body2" color="text.secondary">
        QR 코드를 스캔하여
      </Typography>
      <Typography variant="body2" color="text.secondary">
        주문 상태를 확인하세요
      </Typography>
      
      <Typography variant="body1" fontWeight="bold" color="primary" sx={{ mt: 1 }}>
        주문번호: #{orderNumber}
      </Typography>
    </Paper>
  );
};

export default OrderQRCode;
