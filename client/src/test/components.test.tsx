import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Field, Input, PriorityBadge, ProgressBar, Segmented, StatusBadge, StatusRail } from '../components/ui';

describe('composants UI', () => {
  it('ProgressBar borne la valeur et expose son rôle', () => {
    render(<ProgressBar value={140} showValue />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('100 %')).toBeInTheDocument();
  });
  it('StatusBadge affiche le libellé français', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('En cours')).toBeInTheDocument();
  });
  it('PriorityBadge a un titre accessible', () => {
    render(<PriorityBadge priority="urgent" />);
    expect(screen.getByTitle('Priorité urgente')).toBeInTheDocument();
  });
  it('StatusRail affiche la légende avec les valeurs', () => {
    render(<StatusRail segments={[{ key: 'a', label: 'À faire', value: 2 }, { key: 'b', label: 'Terminé', value: 5 }]} />);
    expect(screen.getByText('Terminé')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
  it('Field relie le libellé au champ et annonce l’erreur', () => {
    render(<Field label="Adresse e-mail" error="Adresse invalide">{(id) => <Input id={id} />}</Field>);
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Adresse invalide');
  });
  it('Segmented est navigable et signale la sélection', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Priorité" value="low" onChange={onChange} options={[{ value: 'low', label: 'Basse' }, { value: 'high', label: 'Haute' }]} />);
    expect(screen.getByRole('radio', { name: 'Basse' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Haute' }));
    expect(onChange).toHaveBeenCalledWith('high');
  });
});
