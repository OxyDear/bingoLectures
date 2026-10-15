import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => { document.title = `${title ? `${title} — ` : ''}Синий флаг`; }, [title]);
}

export const groupByTier = (items, tiers) =>
  tiers.map((tier) => ({ tier, items: items.filter((p) => p.points === tier.points) })).filter((g) => g.items.length);
