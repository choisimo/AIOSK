import React from 'react';
import { Card as MuiCard, CardContent, CardMedia, CardActions, Typography, Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  elevated?: boolean;
  interactive?: boolean;
  className?: string;
}

interface MenuCardProps {
  menuId: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  onSelect: (menuId: number) => void;
  disabled?: boolean;
}

const StyledCard = styled(MuiCard)<{ elevated?: boolean; interactive?: boolean }>(({ theme, elevated, interactive }) => ({
  borderRadius: theme.spacing(2),
  boxShadow: elevated ? theme.shadows[8] : theme.shadows[2],
  transition: theme.transitions.create(['box-shadow', 'transform'], {
    duration: theme.transitions.duration.short,
  }),
  
  ...(interactive && {
    cursor: 'pointer',
    '&:hover': {
      boxShadow: theme.shadows[12],
      transform: 'translateY(-4px)',
    },
  }),
}));

const MotionCard = motion(StyledCard);

// 기본 카드 컴포넌트
const Card: React.FC<CardProps> = ({ 
  children, 
  elevated = false, 
  interactive = false, 
  className 
}) => {
  return (
    <StyledCard 
      elevated={elevated} 
      interactive={interactive} 
      className={className}
    >
      {children}
    </StyledCard>
  );
};

// 메뉴 카드 컴포넌트 (키오스크용)
export const MenuCard: React.FC<MenuCardProps> = ({
  menuId,
  name,
  description,
  price,
  imageUrl,
  onSelect,
  disabled = false,
}) => {
  const handleClick = () => {
    if (!disabled) {
      onSelect(menuId);
    }
  };

  return (
    <MotionCard
      interactive={!disabled}
      onClick={handleClick}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <CardMedia
        component="img"
        height="200"
        image={imageUrl || '/placeholder-menu.jpg'}
        alt={name}
        sx={{
          objectFit: 'cover',
          backgroundColor: 'grey.100',
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.src = '/placeholder-menu.jpg';
        }}
      />
      
      <CardContent sx={{ flexGrow: 1, p: 2 }}>
        <Typography variant="h6" component="h3" gutterBottom noWrap>
          {name}
        </Typography>
        
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ 
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            mb: 2,
            minHeight: '40px',
          }}
        >
          {description}
        </Typography>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" color="primary" fontWeight="bold">
            {price.toLocaleString()}원
          </Typography>
          
          {disabled && (
            <Typography variant="caption" color="error" fontWeight="bold">
              품절
            </Typography>
          )}
        </Box>
      </CardContent>
    </MotionCard>
  );
};

export default Card;
