import { cva, type VariantProps } from 'class-variance-authority';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-xs text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-parchment hover:bg-gold-deep',
        outline:
          'border border-line bg-transparent text-ink hover:border-gold hover:text-gold-deep',
        ghost: 'text-ink-soft hover:text-ink',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-5',
        lg: 'h-12 px-7 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonStyles = VariantProps<typeof button>;

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonStyles & ComponentProps<'button'>) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  href,
  children,
}: ButtonStyles & { className?: string; href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(button({ variant, size }), className)}>
      {children}
    </Link>
  );
}
