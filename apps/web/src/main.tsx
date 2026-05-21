import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import { queryClient } from '@/lib/queryClient';
import { router } from '@/router';
import '@/index.css';

/**
 * Phase 2 UI-SPEC §Toast Feedback — Toaster mounted inside QueryClientProvider
 * but outside RouterProvider so it persists across route transitions.
 * richColors + position="top-right" per UI-SPEC.
 */

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Toaster richColors position="top-right" />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
