import React from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  List, 
  ListItem, 
  Divider,
  IconButton,
  Badge
} from '@mui/material';
import { 
  Add as AddIcon, 
  Remove as RemoveIcon, 
  Delete as DeleteIcon,
  ShoppingCart as CartIcon 
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import type { RootState } from '../../store';
import type { CartItem } from '../../types';
import { updateQuantity, removeItem } from '../../store/slices/cartSlice';
import Button from '../ui/Button';

interface ShoppingCartProps {
  onCheckout: () => void;
  loading?: boolean;
}

const ShoppingCart: React.FC<ShoppingCartProps> = ({ onCheckout, loading = false }) => {
  const dispatch = useDispatch();
  const { items, totalItems, totalPrice } = useSelector((state: RootState) => state.cart);

  const handleQuantityChange = (menuId: number, newQuantity: number) => {
    dispatch(updateQuantity({ menuId, quantity: newQuantity }));
  };

  const handleRemoveItem = (menuId: number) => {
    dispatch(removeItem(menuId));
  };

  const handleCheckoutClick = () => {
    console.log('주문하기 버튼 클릭됨');
    console.log('장바구니 아이템:', items);
    console.log('총 아이템 수:', totalItems);
    console.log('총 가격:', totalPrice);
    onCheckout();
  };

  return (
    <Paper 
      elevation={4} 
      sx={{ 
        p: 3, 
        height: 'fit-content',
        minHeight: 400,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 2,
      }}
    >
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Badge badgeContent={totalItems} color="primary">
          <CartIcon color="primary" />
        </Badge>
        <Typography variant="h6" sx={{ ml: 1 }}>
          장바구니
        </Typography>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* 장바구니 아이템 목록 */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {items.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              color: 'text.secondary',
            }}
          >
            <CartIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
            <Typography variant="body1">
              장바구니가 비어있습니다
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            <AnimatePresence>
              {items.map((item: CartItem) => (
                <motion.div
                  key={item.menu.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <ListItem
                    sx={{
                      p: 2,
                      mb: 1,
                      backgroundColor: 'grey.50',
                      borderRadius: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                    }}
                  >
                    {/* 메뉴 정보 */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {item.menu.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveItem(item.menu.id)}
                        sx={{ color: 'error.main' }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>

                    {/* 가격 및 수량 조절 */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="primary" fontWeight="bold">
                        {item.totalPrice.toLocaleString()}원
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleQuantityChange(item.menu.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>

                        <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>
                          {item.quantity}
                        </Typography>

                        <IconButton
                          size="small"
                          onClick={() => handleQuantityChange(item.menu.id, item.quantity + 1)}
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  </ListItem>
                </motion.div>
              ))}
            </AnimatePresence>
          </List>
        )}
      </Box>

      {/* 총계 및 주문 버튼 */}
      {items.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Divider sx={{ mb: 2 }} />
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">
              총 {totalItems}개
            </Typography>
            <Typography variant="h6" color="primary" fontWeight="bold">
              {totalPrice.toLocaleString()}원
            </Typography>
          </Box>

          <Button
            fullWidth
            size="large"
            isKiosk
            onClick={handleCheckoutClick}
            disabled={loading}
            sx={{ py: 2 }}
          >
            {loading ? '주문 중...' : '주문하기'}
          </Button>
        </Box>
      )}
    </Paper>
  );
};

export default ShoppingCart;
