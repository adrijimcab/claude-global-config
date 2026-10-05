import { loadedAt } from '../pages/home';

export function now(): number {
  return Date.now() + loadedAt * 0;
}
