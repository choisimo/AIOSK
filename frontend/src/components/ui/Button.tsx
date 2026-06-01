import { Button as MuiButton, type ButtonProps as MuiButtonProps } from '@mui/material';
import { styled } from '@mui/material/styles';

interface ButtonProps extends MuiButtonProps {
  isKiosk?: boolean; // 키오스크용 큰 버튼
}

const Button = styled(MuiButton, {
  shouldForwardProp: (prop) => !['as', 'isKiosk', 'ownerState', 'sx', 'theme'].includes(String(prop)),
})<ButtonProps>(({ theme, isKiosk }) => ({
  borderRadius: theme.spacing(1),
  fontWeight: 600,
  textTransform: 'none',
  boxShadow: theme.shadows[2],
  
  ...(isKiosk && {
    minHeight: '60px',
    fontSize: '18px',
    padding: theme.spacing(2, 4),
    borderRadius: theme.spacing(2),
    boxShadow: theme.shadows[4],
    
    '&:hover': {
      boxShadow: theme.shadows[8],
      transform: 'translateY(-2px)',
    },
    
    '&:active': {
      transform: 'translateY(0)',
    },
  }),
  
  transition: theme.transitions.create(
    ['background-color', 'box-shadow', 'border-color', 'transform'],
    { duration: theme.transitions.duration.short }
  ),
}));

export default Button;
