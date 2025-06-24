import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  InputAdornment,
  Alert
} from '@mui/material';
import { Email as EmailIcon, Sms as SmsIcon } from '@mui/icons-material';
import Button from '../ui/Button';

interface ContactInfo {
  type: 'email' | 'sms' | 'none';
  email?: string;
  phone?: string;
}

interface ContactInputProps {
  onSubmit: (contactInfo: ContactInfo) => void;
  onSkip: () => void;
  loading?: boolean;
}

const ContactInput: React.FC<ContactInputProps> = ({
  onSubmit,
  onSkip,
  loading = false
}) => {
  const [contactType, setContactType] = useState<'email' | 'sms' | 'none'>('none');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^010-\d{4}-\d{4}$/;
    return phoneRegex.test(phone);
  };

  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/[^\d]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setPhone(formatted);
    if (errors.phone) {
      setErrors(prev => ({ ...prev, phone: undefined }));
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (errors.email) {
      setErrors(prev => ({ ...prev, email: undefined }));
    }
  };

  const handleSubmit = () => {
    const newErrors: { email?: string; phone?: string } = {};

    if (contactType === 'email') {
      if (!email.trim()) {
        newErrors.email = '이메일을 입력해주세요.';
      } else if (!validateEmail(email)) {
        newErrors.email = '올바른 이메일 형식을 입력해주세요.';
      }
    }

    if (contactType === 'sms') {
      if (!phone.trim()) {
        newErrors.phone = '휴대폰 번호를 입력해주세요.';
      } else if (!validatePhone(phone)) {
        newErrors.phone = '010-1234-5678 형식으로 입력해주세요.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const contactInfo: ContactInfo = {
      type: contactType,
      ...(contactType === 'email' && { email }),
      ...(contactType === 'sms' && { phone }),
    };

    onSubmit(contactInfo);
  };

  return (
    <Box sx={{ maxWidth: 500, mx: 'auto' }}>
      <Typography variant="h5" fontWeight="bold" textAlign="center" sx={{ mb: 1 }}>
        📧 알림 받기
      </Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
        주문 상태를 알림으로 받으시겠어요?
      </Typography>

      <FormControl component="fieldset" fullWidth sx={{ mb: 3 }}>
        <FormLabel component="legend" sx={{ mb: 2, fontWeight: 'bold' }}>
          알림 방법 선택
        </FormLabel>
        <RadioGroup
          value={contactType}
          onChange={(e) => setContactType(e.target.value as 'email' | 'sms' | 'none')}
        >
          <FormControlLabel
            value="none"
            control={<Radio />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography>알림 받지 않기</Typography>
                <Typography variant="body2" color="text.secondary">
                  (주문번호만 확인)
                </Typography>
              </Box>
            }
            sx={{ mb: 1 }}
          />
          <FormControlLabel
            value="email"
            control={<Radio />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EmailIcon color="primary" />
                <Typography>이메일로 받기</Typography>
              </Box>
            }
            sx={{ mb: 1 }}
          />
          <FormControlLabel
            value="sms"
            control={<Radio />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmsIcon color="primary" />
                <Typography>SMS로 받기</Typography>
              </Box>
            }
          />
        </RadioGroup>
      </FormControl>

      {/* 이메일 입력 */}
      {contactType === 'email' && (
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            label="이메일 주소"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            error={!!errors.email}
            helperText={errors.email || '주문 접수 및 완료 알림을 보내드립니다.'}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon color="primary" />
                </InputAdornment>
              ),
            }}
            placeholder="example@email.com"
          />
        </Box>
      )}

      {/* 휴대폰 번호 입력 */}
      {contactType === 'sms' && (
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            label="휴대폰 번호"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            error={!!errors.phone}
            helperText={errors.phone || '주문 상태 SMS를 보내드립니다.'}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SmsIcon color="primary" />
                </InputAdornment>
              ),
            }}
            placeholder="010-1234-5678"
            inputProps={{ maxLength: 13 }}
          />
        </Box>
      )}

      {/* 개인정보 안내 */}
      {(contactType === 'email' || contactType === 'sms') && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            입력하신 연락처는 주문 알림 목적으로만 사용되며, 
            주문 완료 후 자동으로 삭제됩니다.
          </Typography>
        </Alert>
      )}

      {/* 버튼 */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={onSkip}
          fullWidth
          size="large"
          disabled={loading}
        >
          건너뛰기
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          fullWidth
          size="large"
          isKiosk
          disabled={loading}
        >
          {loading ? '전송 중...' : '확인'}
        </Button>
      </Box>
    </Box>
  );
};

export default ContactInput;
