/**
 * Merges conditional Nativewind class names.
 *
 * Deliberately dependency-free: clsx is flagged unmaintained and tailwind-merge
 * solves a conflict-resolution problem this app does not have (component
 * `className` props are appended last, so they already win). Later classes
 * override earlier ones the same way they do in plain Tailwind.
 */
type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
