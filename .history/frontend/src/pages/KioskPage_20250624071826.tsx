import React, { useState } from 'react';
import { 
  Box, 
  Container, 
  AppBar, 
  Toolbar, 
  Typography, 
  Alert,
  Snackbar
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { useDispatch, useSelector } from 'react-redux';
import CategoryNav from '../components/kiosk/CategoryNav';
import MenuGrid from '../components/kiosk/MenuGrid';
import ShoppingCart from '../components/kiosk/ShoppingCart';
import OrderCompletionFlow from '../components/kiosk/OrderCompletionFlow';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { useCategories, useMenus, useCreateOrder } from '../hooks/usePublicApi';
import { addItem, clearCart } from '../store/slices/cartSlice';
import type { Menu, OrderItem, CartItem, Order } from '../types';
import type { RootState } from '../store';

const KioskContainer = styled(Box)(({ theme }) => ({
  minHeight: '100vh',
  backgroundColor: theme.palette.grey[50],
  display: 'flex',
  flexDirection: 'column',
}));

const MainContent = styled(Container)(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  display: 'flex',
  gap: theme.spacing(3),
  maxWidth: '1400px !important',
}));

const MenuSection = styled(Box)({
  flex: 1,
  minWidth: 0, // flex 아이템이 최소 너비를 갖지 않도록
});

const CartSection = styled(Box)({
  width: 350,
  flexShrink: 0,
});

const KioskPage: React.FC = () => {
  const dispatch = useDispatch();
  const cartItems = useSelector((state: RootState) => state.cart.items);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  // API 훅들
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const { data: menus = [], isLoading: menusLoading } = useMenus(selectedCategoryId || undefined);
  const createOrderMutation = useCreateOrder();

  // 카테고리 선택 핸들러
  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId);
  };

  // 메뉴 선택 핸들러 (메뉴 상세 모달 열기)
  const handleMenuSelect = (menu: Menu) => {
    setSelectedMenu(menu);
    setQuantity(1);
  };

  // 메뉴 장바구니 추가
  const handleAddToCart = () => {
    if (selectedMenu) {
      console.log('장바구니에 메뉴 추가:', selectedMenu.name, '수량:', quantity);
      dispatch(addItem({ menu: selectedMenu, quantity }));
      setSelectedMenu(null);
      setQuantity(1);
      console.log('장바구니 추가 완료');
    }
  };

  // 주문하기
  const handleCheckout = async () => {
    // Redux 스토어에서 장바구니 아이템 가져오기
    if (cartItems.length === 0) {
      console.log('장바구니가 비어있습니다.');
      return;
    }

    const orderItems: OrderItem[] = cartItems.map((item: CartItem) => ({
      menuId: item.menu.id,
      quantity: item.quantity,
      menuName: item.menu.name,
      pricePerItem: item.menu.price,
      price: item.menu.price * item.quantity,
    }));

    // 총 금액 계산
    const totalPrice = cartItems.reduce((sum, item) => sum + (item.menu.price * item.quantity), 0);

    console.log('주문 생성 시도:', orderItems);

    try {
      const result = await createOrderMutation.mutateAsync({ items: orderItems });
      console.log('주문 성공:', result);
      
      // 주문 결과에 총 금액과 타임스탬프 추가
      const enrichedOrder: Order = {
        ...result,
        totalPrice: result.totalPrice || totalPrice,
        createdAt: result.createdAt || new Date().toISOString(),
        items: result.items.map((item, index) => ({
          ...item,
          menuName: item.menuName || orderItems[index]?.menuName,
          pricePerItem: item.pricePerItem || orderItems[index]?.pricePerItem,
          price: item.price || orderItems[index]?.price,
        }))
      };
      
      // 장바구니 초기화
      dispatch(clearCart());
      
      // 주문 완료 플로우 시작
      setCompletedOrder(enrichedOrder);
      
    } catch (error) {
      console.error('주문 실패:', error);
      // 오류 시 알림 표시
      setOrderSuccess(true);
    }
  };

  // 수량 변경
  const handleQuantityChange = (change: number) => {
    setQuantity(Math.max(1, quantity + change));
  };

  // 주문 완료 플로우 핸들러들
  const handleOrderComplete = () => {
    setCompletedOrder(null);
  };

  const handlePrintReceipt = () => {
    // 실제 키오스크에서는 열 프린터나 영수증 프린터 API 호출
    window.print();
  };

  const handleSendNotification = async (contactInfo: any) => {
    // 실제 구현에서는 백엔드 API 호출
    console.log('알림 전송:', contactInfo);
    
    // 모의 API 호출 시뮬레이션
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log('알림 전송 완료');
        resolve();
      }, 1000);
    });
  };

  return (
    <KioskContainer>
      {/* 헤더 */}
      <AppBar position="static" elevation={2}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            🍽️ AIOSK 키오스크
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            장바구니: {cartItems.length}개
          </Typography>
          <Typography variant="body2">
            터치하여 주문하세요
          </Typography>
        </Toolbar>
      </AppBar>

      {/* 메인 컨텐츠 */}
      <MainContent>
        <MenuSection>
          {/* 카테고리 네비게이션 */}
          <CategoryNav
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onCategorySelect={handleCategorySelect}
          />

          {/* 메뉴 그리드 */}
          <MenuGrid
            menus={menus}
            onMenuSelect={handleMenuSelect}
            loading={menusLoading || categoriesLoading}
          />
        </MenuSection>

        {/* 장바구니 */}
        <CartSection>
          <ShoppingCart
            onCheckout={handleCheckout}
            loading={createOrderMutation.isPending}
          />
        </CartSection>
      </MainContent>

      {/* 메뉴 상세 모달 */}
      <Modal
        open={!!selectedMenu}
        onClose={() => setSelectedMenu(null)}
        title={selectedMenu?.name}
        maxWidth="sm"
      >
        {selectedMenu && (
          <Box>
            <Box
              component="img"
              src={selectedMenu.imageUrl || '/placeholder-menu.jpg'}
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
                target.src = '/placeholder-menu.jpg';
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
                  onClick={() => handleQuantityChange(-1)}
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
                  onClick={() => handleQuantityChange(1)}
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
                onClick={handleAddToCart}
                fullWidth
                isKiosk
              >
                {(selectedMenu.price * quantity).toLocaleString()}원 담기
              </Button>
            </Box>
          </Box>
        )}
      </Modal>

      {/* 주문 완료 플로우 */}
      <Modal
        open={!!completedOrder}
        onClose={handleOrderComplete}
        title=""
        maxWidth="lg"
      >
        {completedOrder && (
          <OrderCompletionFlow
            order={completedOrder}
            onClose={handleOrderComplete}
            onPrintReceipt={handlePrintReceipt}
            onSendNotification={handleSendNotification}
          />
        )}
      </Modal>

      {/* 주문 완료 알림 (오류 시에만 사용) */}
      <Snackbar
        open={orderSuccess}
        autoHideDuration={5000}
        onClose={() => setOrderSuccess(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setOrderSuccess(false)} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          주문 처리 중 오류가 발생했습니다. 다시 시도해주세요.
        </Alert>
      </Snackbar>
    </KioskContainer>
  );
};

export default KioskPage;
