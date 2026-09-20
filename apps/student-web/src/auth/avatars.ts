import avatar01 from '../assets/avatars/sys112-avatar-01.png';
import avatar02 from '../assets/avatars/sys112-avatar-02.png';
import avatar03 from '../assets/avatars/sys112-avatar-03.png';
import avatar04 from '../assets/avatars/sys112-avatar-04.png';
import avatar05 from '../assets/avatars/sys112-avatar-05.png';
import avatar06 from '../assets/avatars/sys112-avatar-06.jpg';
import avatar07 from '../assets/avatars/sys112-avatar-07.jpg';
import avatar08 from '../assets/avatars/sys112-avatar-08.jpg';
import avatar09 from '../assets/avatars/sys112-avatar-09.jpg';
import avatar10 from '../assets/avatars/sys112-avatar-10.jpg';

export const FEMALE_AVATAR_IDS = [
  'sys112-avatar-01',
  'sys112-avatar-03',
  'sys112-avatar-05',
  'sys112-avatar-06',
  'sys112-avatar-07',
] as const;

export const MALE_AVATAR_IDS = [
  'sys112-avatar-02',
  'sys112-avatar-04',
  'sys112-avatar-08',
  'sys112-avatar-09',
  'sys112-avatar-10',
] as const;

export type BuiltinAvatarId =
  | (typeof FEMALE_AVATAR_IDS)[number]
  | (typeof MALE_AVATAR_IDS)[number];

export const BUILTIN_AVATAR_IDS: readonly BuiltinAvatarId[] = [
  ...FEMALE_AVATAR_IDS,
  ...MALE_AVATAR_IDS,
];

export const BUILTIN_AVATARS: Record<BuiltinAvatarId, string> = {
  'sys112-avatar-01': avatar01,
  'sys112-avatar-02': avatar02,
  'sys112-avatar-03': avatar03,
  'sys112-avatar-04': avatar04,
  'sys112-avatar-05': avatar05,
  'sys112-avatar-06': avatar06,
  'sys112-avatar-07': avatar07,
  'sys112-avatar-08': avatar08,
  'sys112-avatar-09': avatar09,
  'sys112-avatar-10': avatar10,
};

export function isBuiltinAvatarId(value: string): value is BuiltinAvatarId {
  return (BUILTIN_AVATAR_IDS as readonly string[]).includes(value);
}
