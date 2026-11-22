import { Link } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';

export default function NotFoundPage() {
  return (
    <EmptyState title="Page introuvable" action={<Link to="/"><Button>Retour au tableau de bord</Button></Link>}>
      L’adresse demandée n’existe pas ou vous n’y avez pas accès.
    </EmptyState>
  );
}
