import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Department, Notification, Team, User } from '../lib/types';

export const useTeams = (mine = false) =>
  useQuery({
    queryKey: ['teams', { mine }],
    queryFn: async () => (await api.get<Team[]>('/teams', { params: mine ? { mine: true } : {} })).data,
  });

export const useTeam = (id?: number | null) =>
  useQuery({
    queryKey: ['team', id],
    enabled: !!id,
    queryFn: async () => (await api.get<Team>(`/teams/${id}`)).data,
  });

export const useUsers = (params: Record<string, string | number | undefined> = {}) =>
  useQuery({
    queryKey: ['users', params],
    queryFn: async () => (await api.get<User[]>('/users', { params })).data,
  });

export const useDepartments = () =>
  useQuery({ queryKey: ['departments'], queryFn: async () => (await api.get<Department[]>('/departments')).data });

export const useLabels = () =>
  useQuery({ queryKey: ['labels'], queryFn: async () => (await api.get<string[]>('/tasks/labels')).data, staleTime: 60_000 });

export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<{ items: Notification[]; unread: number }>('/notifications')).data,
    refetchInterval: 30_000,
  });
