import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { store } from './store';
import KioskPage from './pages/KioskPage';

// React Query 클라이언트 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// MUI 테마 설정
const theme = createTheme({
  palette: {
    primary: {
      main: '#2196F3',
    },
    background: {
      default: '#FAFAFA',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", "Noto Sans KR", sans-serif',
    h6: {
      fontWeight: 600,
    },
  },
});

function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const shouldRenderKiosk = normalizedPath === '/' || normalizedPath === '/kiosk';

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {shouldRenderKiosk && <KioskPage />}
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
