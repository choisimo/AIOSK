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
import { updateQuantity, removeItem } from '../../store/slices/cartSlice';
import { MAX_ORDER_ITEM_QUANTITY } from '../../constants/order';
import Button from '../ui/Button';

interface ShoppingCartProps {
  onCheckout: () => void;
  loading: boolean;
}

const ShoppingCart = ({ onCheckout, loading }: ShoppingCartProps) => {
  const dispatch = useDispatch();
  const items = useSelector((state: RootState) => state.cart.items);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.menu.price * item.quantity, 0);

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
              {items.map((item) => (
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
                        onClick={() => dispatch(removeItem(item.menu.id))}
                        sx={{ color: 'error.main' }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>

                    {/* 가격 및 수량 조절 */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="primary" fontWeight="bold">
                        {(item.menu.price * item.quantity).toLocaleString()}원
                      </Typography>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton
                          size="small"
                          onClick={() => dispatch(updateQuantity({
                            menuId: item.menu.id,
                            quantity: item.quantity - 1
                          }))}
                          disabled={item.quantity <= 1}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>

                        <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>
                          {item.quantity}
                        </Typography>

                        <IconButton
                          size="small"
                          onClick={() => dispatch(updateQuantity({
                            menuId: item.menu.id,
                            quantity: Math.min(MAX_ORDER_ITEM_QUANTITY, item.quantity + 1)
                          }))}
                          disabled={item.quantity >= MAX_ORDER_ITEM_QUANTITY}
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
            variant="contained"
            fullWidth
            size="large"
            isKiosk
            onClick={onCheckout}
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
