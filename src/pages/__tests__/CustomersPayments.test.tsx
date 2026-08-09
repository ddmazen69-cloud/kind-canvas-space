import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// Mock the store so the page renders deterministically
vi.mock('@/lib/store', () => ({
  useDB: () => ({ payments: [], customers: [], invoices: [], loading: false, refresh: async () => {} }),
  db: {
    recordPayment: async () => {},
    removePayment: async () => {},
  },
}));

import CustomersPayments from '../CustomersPayments';

test('shows empty state when no payments', () => {
  render(<CustomersPayments />);
  expect(screen.getByText(/لم يتم تسجيل أي دفعات/i)).toBeInTheDocument();
});
