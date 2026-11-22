export const USER_PUBLIC_COLUMNS = `u.id, u.first_name, u.last_name, u.email, u.role, u.job_title, u.phone,
  u.avatar_url, u.skills, u.department_id, u.is_active, u.wip_limit, u.last_login_at, u.created_at,
  (SELECT name FROM departments d WHERE d.id = u.department_id) AS department_name`;

/** Résumé utilisateur compact (pour les listes d'affectation, commentaires, etc.). */
export const userBriefJson = (alias: string) =>
  `json_build_object('id', ${alias}.id, 'first_name', ${alias}.first_name, 'last_name', ${alias}.last_name,
     'role', ${alias}.role, 'avatar_url', ${alias}.avatar_url)`;
