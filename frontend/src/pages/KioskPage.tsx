import { useEffect, useState } from 'react';
import {
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import CategoryNav from '../components/kiosk/CategoryNav';
import MenuGrid from '../components/kiosk/MenuGrid';
import ShoppingCart from '../components/kiosk/ShoppingCart';
import OrderReceipt from '../components/kiosk/OrderReceipt';
import Button from '../components/ui/Button';
import { publicApi } from '../services/publicApi';
import { addItem, clearCart } from '../store/slices/cartSlice';
import { MAX_ORDER_ITEM_QUANTITY } from '../constants/order';
import { KioskSoundManager, KioskHapticManager } from '../utils/kioskFeedback';
import { printReceipt } from '../utils/printUtils';
import type { Category, Menu, CreateOrderItem, Order } from '../types';
import type { RootState } from '../store';

const KioskPage = () => {
  const dispatch = useDispatch();
  const cartItems = useSelector((state: RootState) => state.cart.items);
  const cartTotalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [orderErrorOpen, setOrderErrorOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: publicApi.getCategories,
    staleTime: 5 * 60 * 1000
  });
  const {
    data: menus = [],
    isLoading: menusLoading,
    isError: menusError
  } = useQuery<Menu[]>({
    queryKey: ['menus', selectedCategoryId || undefined],
    queryFn: () => publicApi.getMenus(selectedCategoryId || undefined),
    staleTime: 2 * 60 * 1000
  });
  const createOrderMutation = useMutation({
    mutationFn: (orderData: { items: CreateOrderItem[] }) => publicApi.createOrder(orderData)
  });
  const hasCatalogError = categoriesError || menusError;

  useEffect(() => {
    const storageKey = 'aiosk:kiosk-id';
    const existingId = window.localStorage.getItem(storageKey);
    const kioskId = existingId || `kiosk-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    if (!existingId) {
      window.localStorage.setItem(storageKey, kioskId);
    }

    const reportStatus = () => {
      publicApi.reportKioskStatus({
        kioskId,
        label: 'Browser Kiosk',
        status: hasCatalogError ? 'DEGRADED' : 'ONLINE',
        appVersion: import.meta.env.VITE_APP_VERSION
      }).catch(() => {
        // Heartbeat is best-effort; catalog errors already report DEGRADED status when reachable.
      });
    };

    reportStatus();
    const intervalId = window.setInterval(reportStatus, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [hasCatalogError]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: 'grey.50',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 헤더 */}
      <AppBar position="static" elevation={2}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            🍽️ AIOSK 키오스크
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            장바구니: {cartTotalItems}개
          </Typography>
          <Typography variant="body2">
            터치하여 주문하세요
          </Typography>
        </Toolbar>
      </AppBar>

      {/* 메인 컨텐츠 */}
      <Container
        sx={{
          flexGrow: 1,
          p: 3,
          display: 'flex',
          gap: 3,
          maxWidth: '1400px !important',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {hasCatalogError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              메뉴 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </Alert>
          )}

          {/* 카테고리 네비게이션 */}
          <CategoryNav
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onCategorySelect={setSelectedCategoryId}
          />

          {/* 메뉴 그리드 */}
          <MenuGrid
            menus={menus}
            onMenuSelect={(menu) => {
              setSelectedMenu(menu);
              setQuantity(1);
            }}
            loading={menusLoading || categoriesLoading}
          />
        </Box>

        {/* 장바구니 */}
        <Box sx={{ width: 350, flexShrink: 0 }}>
          <ShoppingCart
            onCheckout={async () => {
              const orderItems: CreateOrderItem[] = cartItems.map((item) => ({
                menuId: item.menu.id,
                quantity: item.quantity
              }));

              try {
                const result = await createOrderMutation.mutateAsync({ items: orderItems });

                dispatch(clearCart());
                KioskSoundManager.playOrderSuccessSound();
                KioskHapticManager.triggerSuccess();
                setCompletedOrder(result);
              } catch {
                KioskSoundManager.playErrorSound();
                KioskHapticManager.triggerError();
                setOrderErrorOpen(true);
              }
            }}
            loading={createOrderMutation.isPending}
          />
        </Box>
      </Container>

      {/* 메뉴 상세 모달 */}
      <Dialog
        open={!!selectedMenu}
        onClose={() => setSelectedMenu(null)}
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            boxShadow: 24,
          },
        }}
      >
        {selectedMenu && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {selectedMenu.name}
              <IconButton onClick={() => setSelectedMenu(null)} size="small">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Box
                component="img"
                src={selectedMenu.imageUrl || '/images/no-image.svg'}
                alt={selectedMenu.name}
                sx={{
                  width: '100%',
                  height: 250,
                  objectFit: 'cover',
                  borderRadius: 1,
                  mb: 2,
                }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/images/no-image.svg';
                }}
              />

              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                {selectedMenu.description}
              </Typography>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" color="primary" fontWeight="bold">
                  {selectedMenu.price.toLocaleString()}원
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={() => setQuantity((currentQuantity) => Math.max(1, currentQuantity - 1))}
                    disabled={quantity <= 1}
                    sx={{ minWidth: 40 }}
                  >
                    -
                  </Button>
                  <Typography variant="h6" sx={{ minWidth: 40, textAlign: 'center' }}>
                    {quantity}
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={() => setQuantity((currentQuantity) => Math.min(MAX_ORDER_ITEM_QUANTITY, currentQuantity + 1))}
                    disabled={quantity >= MAX_ORDER_ITEM_QUANTITY}
                    sx={{ minWidth: 40 }}
                  >
                    +
                  </Button>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => setSelectedMenu(null)}
                  fullWidth
                >
                  취소
                </Button>
                <Button
                  variant="contained"
                  onClick={() => {
                    dispatch(addItem({ menu: selectedMenu, quantity }));
                    setSelectedMenu(null);
                    setQuantity(1);
                    KioskSoundManager.playClickSound();
                    KioskHapticManager.triggerClick();
                  }}
                  fullWidth
                  isKiosk
                >
                  {(selectedMenu.price * quantity).toLocaleString()}원 담기
                </Button>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* 주문 완료 플로우 */}
      <Dialog
        open={!!completedOrder}
        onClose={() => setCompletedOrder(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            boxShadow: 24,
          },
        }}
      >
        <DialogContent>
          {completedOrder && (
            <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                  <Typography variant="h4" fontWeight="bold" color="primary" sx={{ mb: 1 }}>
                    주문이 완료되었습니다
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    주문번호와 영수증을 확인해 주세요.
                  </Typography>
                </Box>

                <OrderReceipt
                  order={completedOrder}
                  onPrint={() => {
                    printReceipt(completedOrder);
                    KioskSoundManager.playClickSound();
                    KioskHapticManager.triggerClick();
                  }}
                />

                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <Button
                    variant="contained"
                    onClick={() => setCompletedOrder(null)}
                    size="large"
                    isKiosk
                    sx={{ minWidth: 200 }}
                  >
                    새 주문하기
                  </Button>
                </Box>
              </motion.div>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* 주문 오류 알림 */}
      <Snackbar
        open={orderErrorOpen}
        autoHideDuration={5000}
        onClose={() => setOrderErrorOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setOrderErrorOpen(false)}
          severity="error"
          sx={{ width: '100%' }}
        >
          주문 처리 중 오류가 발생했습니다. 다시 시도해주세요.
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default KioskPage;
