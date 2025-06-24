import React, { useState } from 'react';
import { Box, Stepper, Step, StepLabel, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';
import { motion, AnimatePresence } from 'framer-motion';
import OrderReceipt from './OrderReceipt';
import ContactInput from './ContactInput';
import Button from '../ui/Button';
import type { Order } from '../../types';

const StepperContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  marginBottom: theme.spacing(3),
  backgroundColor: theme.palette.grey[50],
}));

interface ContactInfo {
  type: 'email' | 'sms' | 'none';
  email?: string;
  phone?: string;
}

interface OrderCompletionFlowProps {
  order: Order;
  onClose: () => void;
  onPrintReceipt?: () => void;
  onSendNotification?: (contactInfo: ContactInfo) => Promise<void>;
}

const OrderCompletionFlow: React.FC<OrderCompletionFlowProps> = ({
  order,
  onClose,
  onPrintReceipt,
  onSendNotification
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const steps = ['주문 확인', '알림 설정', '완료'];

  const handleContactSubmit = async (info: ContactInfo) => {
    setContactInfo(info);
    setIsLoading(true);

    try {
      if (info.type !== 'none' && onSendNotification) {
        await onSendNotification(info);
      }
      setCurrentStep(2); // 완료 단계로
    } catch (error) {
      console.error('알림 전송 실패:', error);
      // 실패해도 다음 단계로 진행
      setCurrentStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipContact = () => {
    setContactInfo({ type: 'none' });
    setCurrentStep(2);
  };

  const handleFinish = () => {
    onClose();
  };

  const handlePrint = () => {
    if (onPrintReceipt) {
      onPrintReceipt();
    } else {
      // 브라우저 기본 인쇄 기능
      window.print();
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <OrderReceipt
              order={order}
              onPrint={handlePrint}
            />
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 3 }}>
              <Button
                variant="outlined"
                onClick={handleSkipContact}
                size="large"
              >
                주문번호만 확인
              </Button>
              <Button
                variant="contained"
                onClick={() => setCurrentStep(1)}
                size="large"
                isKiosk
              >
                알림 받기
              </Button>
            </Box>
          </motion.div>
        );

      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <ContactInput
              onSubmit={handleContactSubmit}
              onSkip={handleSkipContact}
              loading={isLoading}
            />
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                <Box sx={{ fontSize: 80, mb: 2 }}>🎉</Box>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Box sx={{ mb: 4 }}>
                  <Box sx={{ 
                    p: 3, 
                    backgroundColor: 'success.light', 
                    borderRadius: 2, 
                    mb: 3,
                    color: 'white'
                  }}>
                    <Box sx={{ fontSize: 24, fontWeight: 'bold', mb: 1 }}>
                      주문이 완료되었습니다!
                    </Box>
                    <Box sx={{ fontSize: 18 }}>
                      주문번호: #{String(order.id || order.orderId).padStart(4, '0')}
                    </Box>
                  </Box>

                  {contactInfo?.type === 'email' && (
                    <Box sx={{ mb: 2, p: 2, backgroundColor: 'info.light', borderRadius: 1, color: 'white' }}>
                      📧 {contactInfo.email}로 알림을 보내드렸습니다.
                    </Box>
                  )}

                  {contactInfo?.type === 'sms' && (
                    <Box sx={{ mb: 2, p: 2, backgroundColor: 'info.light', borderRadius: 1, color: 'white' }}>
                      📱 {contactInfo.phone}로 알림을 보내드렸습니다.
                    </Box>
                  )}

                  <Box sx={{ fontSize: 16, color: 'text.secondary', mb: 3 }}>
                    음식 준비가 완료되면 호출해드립니다.
                  </Box>
                </Box>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Button
                  variant="contained"
                  onClick={handleFinish}
                  size="large"
                  isKiosk
                  sx={{ minWidth: 200 }}
                >
                  새 주문하기
                </Button>
              </motion.div>
            </Box>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      {/* 진행 단계 표시 */}
      <StepperContainer elevation={1}>
        <Stepper activeStep={currentStep} alternativeLabel>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </StepperContainer>

      {/* 단계별 콘텐츠 */}
      <AnimatePresence mode="wait">
        {renderStepContent()}
      </AnimatePresence>
    </Box>
  );
};

export default OrderCompletionFlow;
