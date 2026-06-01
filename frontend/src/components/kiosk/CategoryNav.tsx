import { Tabs, Tab } from '@mui/material';
import type { Category } from '../../types';

interface CategoryNavProps {
  categories: Category[];
  selectedCategoryId: number | null;
  onCategorySelect: (categoryId: number | null) => void;
}

const CategoryNav = ({
  categories,
  selectedCategoryId,
  onCategorySelect,
}: CategoryNavProps) => {
  return (
    <Tabs
      value={selectedCategoryId}
      onChange={(_, newValue: number | null) => onCategorySelect(newValue)}
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
      sx={{
        width: '100%',
        mb: 3,
        backgroundColor: 'background.paper',
        borderRadius: 1,
        boxShadow: 2,
        '& .MuiTabs-indicator': {
          height: 4,
          borderRadius: 2,
        },
        '& .MuiTab-root': {
          minHeight: 60,
          fontSize: '16px',
          fontWeight: 600,
          textTransform: 'none',
          px: 4,
          py: 2,
        },
        '& .MuiTab-root.Mui-selected': {
          fontWeight: 700,
        },
      }}
    >
      <Tab
        label="전체 메뉴"
        value={null}
      />
      {categories.map((category) => (
        <Tab
          key={category.id}
          label={category.name}
          value={category.id}
        />
      ))}
    </Tabs>
  );
};

export default CategoryNav;
