import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTeams } from './queries';

/** Équipe sélectionnée, synchronisée avec l'URL (?equipe=) et mémorisée pour la session. */
export function useTeamSelection(mine = true) {
  const [params, setParams] = useSearchParams();
  const teams = useTeams(mine);
  const raw = params.get('equipe');
  const stored = sessionStorage.getItem('tt-team');
  const teamId = raw ? Number(raw) : stored ? Number(stored) : teams.data?.[0]?.id ?? null;

  useEffect(() => {
    if (!teams.data?.length) return;
    const valid = teams.data.some((t) => t.id === teamId);
    if (!raw || !valid) {
      const next = valid ? teamId : teams.data[0].id;
      params.set('equipe', String(next));
      setParams(params, { replace: true });
    }
  }, [teams.data, raw, teamId, params, setParams]);

  const setTeamId = (id: number) => {
    sessionStorage.setItem('tt-team', String(id));
    params.set('equipe', String(id));
    setParams(params);
  };

  return { teams, teamId: teams.data?.some((t) => t.id === teamId) ? teamId : null, setTeamId };
}
