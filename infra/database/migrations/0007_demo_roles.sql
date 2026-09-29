UPDATE users
SET role = 'TEACHER', updated_at = now()
WHERE lower(login) = 'petrov' AND role <> 'TEACHER';

UPDATE users
SET role = 'ADMIN', updated_at = now()
WHERE lower(login) = 'volkova' AND role <> 'ADMIN';

UPDATE users
SET role = 'STUDENT', updated_at = now()
WHERE lower(login) = 'smirnova' AND role <> 'STUDENT';
