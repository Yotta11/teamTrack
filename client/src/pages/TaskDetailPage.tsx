import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { TaskDetailView } from '../components/TaskDetailView';

export default function TaskDetailPage() {
  const { id } = useParams();
  return (
    <>
      <Link to="/taches" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500 hover:text-brand-700">
        <ChevronLeft className="h-4 w-4" /> Toutes les tâches
      </Link>
      <TaskDetailView id={Number(id)} />
    </>
  );
}
