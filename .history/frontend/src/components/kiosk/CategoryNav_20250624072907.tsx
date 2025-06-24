import React from 'react';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import type { Category } from '../../types';

interface CategoryNavProps {
  categories: Category[];
  selectedCategoryId: number | null;
  onCategorySelect: (categoryId: number | null) => void;
}

const StyledTabs = styled(Tabs)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.spacing(1),
  boxShadow: theme.shadows[2],
  '& .MuiTabs-indicator': {
    height: 4,
    borderRadius: 2,
  },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  minHeight: 60,
  fontSize: '16px',
  fontWeight: 600,
  textTransform: 'none',
  padding: theme.spacing(2, 4),
  '&.Mui-selected': {
    fontWeight: 700,
  },
}));

const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  selectedCategoryId,
  onCategorySelect,
}) => {
  const handleChange = (_: React.SyntheticEvent, newValue: number | null) => {
    onCategorySelect(newValue);
  };

  const currentValue = selectedCategoryId;

  return (
    <Box sx={{ width: '100%', mb: 3 }}>
      <StyledTabs
        value={currentValue}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        <StyledTab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="inherit">전체 메뉴</Typography>
            </Box>
          }
          value={null}
        />
        {categories.map((category) => (
          <StyledTab
            key={category.id}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="inherit">{category.name}</Typography>
              </Box>
            }
            value={category.id}
          />
        ))}
      </StyledTabs>
    </Box>
  );
};

export default CategoryNav;
