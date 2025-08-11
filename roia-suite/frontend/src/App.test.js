import { render, screen } from '@testing-library/react';
import App from './App';

test('renders application title', () => {
  render(<App />);
  const titleElement = screen.getByText(/AI-Driven Project Management Suite/i);
  expect(titleElement).toBeInTheDocument();
});

// Implementation Status section has been removed from production version
