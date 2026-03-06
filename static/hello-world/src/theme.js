import { createTheme } from '@mui/material/styles';

/**
 * Custom Material UI Theme for Service Lifecycle Tracker
 * 
 * Color System:
 * - Yellow: Offer open / waiting
 * - Orange: Offer-Epic in progress
 * - Green: Completed / Order open
 * - Blue: Order-Epic in progress
 * - Gray: Not available / N/A
 */
const theme = createTheme({
  palette: {
    primary: {
      main: '#0052CC', // Atlassian Blue
      light: '#4C9AFF',
      dark: '#0747A6',
    },
    secondary: {
      main: '#FF5630', // Accent Red
      light: '#FF8F73',
      dark: '#DE350B',
    },
    // Custom pipeline colors
    pipeline: {
      yellow: '#FFAB00',
      orange: '#FF8B00',
      green: '#36B37E',
      blue: '#0052CC',
      gray: '#DFE1E6',
      red: '#DE350B',
    },
    background: {
      default: '#F4F5F7',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#172B4D',
      secondary: '#6B778C',
    },
    divider: '#DFE1E6',
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    h4: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.8125rem',
    },
    caption: {
      fontSize: '0.75rem',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
  },
  spacing: 8, // 1 spacing unit = 8px
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // No uppercase buttons
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          '&:before': {
            display: 'none', // Remove default divider
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
});

export default theme;