import { Box, Card as MuiCard, CardContent, CardMedia, Typography, Container } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import type { Menu } from '../../types';

const MotionCard = motion(MuiCard);

interface MenuGridProps {
  menus: Menu[];
  onMenuSelect: (menu: Menu) => void;
  loading: boolean;
}

const MenuGrid = ({
  menus,
  onMenuSelect,
  loading,
}: MenuGridProps) => {
  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 3,
          }}
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <Box
              key={index}
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
          ))}
        </Box>
      </Container>
    );
  }

  if (menus.length === 0) {
    return (
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
  }

  return (
    <Container maxWidth="lg">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 3,
          }}
        >
          {menus.map((menu, index) => (
            <motion.div
              key={menu.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <MotionCard
                onClick={() => onMenuSelect(menu)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                sx={(theme: Theme) => ({
                  borderRadius: theme.spacing(2),
                  boxShadow: theme.shadows[2],
                  cursor: 'pointer',
                  transition: theme.transitions.create(['box-shadow', 'transform'], {
                    duration: theme.transitions.duration.short,
                  }),
                  '&:hover': {
                    boxShadow: theme.shadows[12],
                    transform: 'translateY(-4px)',
                  },
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                })}
              >
                <CardMedia
                  component="img"
                  height="200"
                  image={menu.imageUrl || '/images/no-image.svg'}
                  alt={menu.name}
                  sx={{
                    objectFit: 'cover',
                    backgroundColor: 'grey.100',
                  }}
                  onError={(event) => {
                    const target = event.target as HTMLImageElement;
                    target.src = '/images/no-image.svg';
                  }}
                />

                <CardContent sx={{ flexGrow: 1, p: 2 }}>
                  <Typography variant="h6" component="h3" gutterBottom noWrap>
                    {menu.name}
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
                    {menu.description}
                  </Typography>

                  <Typography variant="h6" color="primary" fontWeight="bold">
                    {menu.price.toLocaleString()}원
                  </Typography>
                </CardContent>
              </MotionCard>
            </motion.div>
          ))}
        </Box>
      </motion.div>
    </Container>
  );
};

export default MenuGrid;
