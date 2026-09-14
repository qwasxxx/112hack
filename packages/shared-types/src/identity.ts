export const Role = {
  STUDENT: 'STUDENT',
  TEACHER: 'TEACHER',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ROLES: Role[] = [Role.STUDENT, Role.TEACHER, Role.ADMIN];
