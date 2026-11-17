'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cacheEntities } from '@/lib/offlineDb';

/**
 * Keeps the offline IndexedDB cache warm with the latest core data.
 * Mounted once in AppShell. Silent on failure.
 */
export default function CacheSync() {
  const { data: wallets } = useQuery({ queryKey: ['wallets'], queryFn: () => api.getWallets(), staleTime: 60_000 });
  const { data: actions } = useQuery({ queryKey: ['actions'], queryFn: () => api.getActions({ limit: 200 }), staleTime: 60_000 });
  const { data: budgets } = useQuery({ queryKey: ['budgets'], queryFn: () => api.getBudgets(), staleTime: 60_000 });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.getCategories(), staleTime: 60_000 });
  const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: () => api.getGoals(), staleTime: 60_000 });

  useEffect(() => {
    if (wallets?.wallets) cacheEntities('wallets', wallets.wallets);
  }, [wallets]);
  useEffect(() => {
    if (actions?.actions) cacheEntities('actions', actions.actions);
  }, [actions]);
  useEffect(() => {
    if (budgets?.budgets) cacheEntities('budgets', budgets.budgets);
  }, [budgets]);
  useEffect(() => {
    if (categories?.categories) cacheEntities('categories', categories.categories);
  }, [categories]);
  useEffect(() => {
    if (goals?.goals) cacheEntities('goals', goals.goals);
  }, [goals]);

  return null;
}