import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Avatar, Button, EmptyState, ErrorState, Input, PageHeader, PageLoader, Select } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import type { ActivityItem } from '../lib/types';

const ENTITY_LABEL: Record<string, string> = { task: 'Tâche', issue: 'Difficulté', internship: 'Stage', sprint: 'Sprint', team: 'Équipe', user: 'Compte', report: 'Export', department: 'Département' };
const linkFor = (a: ActivityItem) =>
  a.entityId ? ({ task: `/taches/${a.entityId}`, issue: `/difficultes/${a.entityId}`, internship: `/stages/${a.entityId}`, team: `/equipes/${a.entityId}` } as Record<string, string>)[a.entity ?? ''] : undefined;

export function ActivityTable({ audit = false }: { audit?: boolean }) {
  const [entity, setEntity] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;
  const q = useQuery({
    queryKey: ['activity', audit, entity, search, page],
    queryFn: async () => (await api.get<{ items: ActivityItem[]; total: number }>('/activity', { params: { audit: audit || undefined, entity: entity || undefined, search: search || undefined, limit, offset: page * limit } })).data,
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Rechercher dans le journal" className="pl-9" aria-label="Rechercher dans le journal" />
        </div>
        {!audit && (
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} className="w-48" aria-label="Type d’élément">
            <option value="">Tous les éléments</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} /> : !q.data?.items.length ? (
        <div className="rounded-xl border border-ink-200 bg-white"><EmptyState title="Aucune entrée" /></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ink-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Personne</th>
                  <th className="px-3 py-2.5 font-semibold">Élément</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                  {audit && <th className="px-5 py-2.5 font-semibold">Adresse IP</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {q.data.items.map((a) => {
                  const to = linkFor(a);
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-ink-500">{fmtDateTime(a.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          {a.userName && <Avatar user={{ firstName: a.userName.split(' ')[0], lastName: a.userName.split(' ').slice(1).join(' '), avatarUrl: a.avatarUrl }} size="xs" />}
                          <span className="font-semibold">{a.userName ?? 'Système'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-600">{ENTITY_LABEL[a.entity ?? ''] ?? a.entity}</td>
                      <td className="px-3 py-2.5 text-ink-700">{to ? <Link to={to} className="hover:text-brand-700 hover:underline">{a.summary ?? a.action}</Link> : a.summary ?? a.action}</td>
                      {audit && <td className="px-5 py-2.5 font-mono text-xs text-ink-500">{a.ip ?? '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 px-5 py-2.5 text-xs text-ink-500">
            <span>{q.data.total} entrée(s)</span>
            <span className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</Button>
              <Button variant="secondary" size="sm" disabled={(page + 1) * limit >= q.data.total} onClick={() => setPage(page + 1)}>Suivant</Button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Historique d’activité" description="Journal horodaté des actions de votre périmètre : créations, déplacements, modifications, commentaires." />
      <ActivityTable />
    </>
  );
}
