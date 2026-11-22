import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Fusionne les classes Tailwind : les classes passées en props remplacent celles par défaut. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
