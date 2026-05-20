import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn-standard `cn()` helper — combines class names and resolves
 * Tailwind utility conflicts in favor of the last value.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
