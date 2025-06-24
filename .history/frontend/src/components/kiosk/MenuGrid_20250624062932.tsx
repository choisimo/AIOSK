import React from 'react';
import { Grid2 as Grid, Box, Typography, Container } from '@mui/material';
import { MenuCard } from '../ui/Card';
import { motion } from 'framer-motion';
import type { Menu } from '../../types';

interface MenuGridProps {
  menus: Menu[];
  onMenuSelect: (menu: Menu) => void;
  loading?: boolean;
}

const LoadingSkeleton: React.FC = () => (
  <Grid container spacing={3}>
    {Array.from({ length: 8 }).map((_, index) => (
      <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
        <Box
          sx={{
            height: 300,
            backgroundColor: 'grey.200',
            borderRadius: 2,
            animation: 'pulse 1.5s ease-in-out infinite',
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.5 },
              '100%': { opacity: 1 },
            },
          }}
        />
      </Grid>
    ))}
  </Grid>
);

const EmptyState: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 300,
      textAlign: 'center',
    }}
  >
    <Typography variant="h5" color="text.secondary" gutterBottom>
      메뉴가 없습니다
    </Typography>
    <Typography variant="body1" color="text.secondary">
      다른 카테고리를 선택해보세요
    </Typography>
  </Box>
);

const MenuGrid: React.FC<MenuGridProps> = ({
  menus,
  onMenuSelect,
  loading = false,
}) => {
  if (loading) {
    return (
      <Container maxWidth="lg">
        <LoadingSkeleton />
      </Container>
    );
  }

  if (menus.length === 0) {
    return <EmptyState />;
  }

  return (
    <Container maxWidth="lg">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Grid container spacing={3}>
          {menus.map((menu, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={menu.menuId}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <MenuCard
                  menuId={menu.menuId}
                  name={menu.name}
                  description={menu.description}
                  price={menu.price}
                  imageUrl={menu.imageUrl}
                  onSelect={() => onMenuSelect(menu)}
                  disabled={menu.status === 'SOLD_OUT'}
                />
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </motion.div>
    </Container>
  );
};

export default MenuGrid;
