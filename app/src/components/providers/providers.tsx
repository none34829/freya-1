"use client";

import type { ReactNode } from 'react';
import { QueryProvider } from './query-provider';
import { ToastProvider } from './toast-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ToastProvider>{children}</ToastProvider>
    </QueryProvider>
  );
}
