import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const badge = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide',
  {
    variants: {
      tone: {
        gold: 'bg-gold-wash text-gold-deep',
        silver: 'bg-silver-wash text-ink-soft',
        outline: 'border border-line text-ink-soft',
        sale: 'bg-ink text-parchment',
      },
    },
    defaultVariants: { tone: 'outline' },
  },
);

export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badge> & { className?: string; children: ReactNode }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}
