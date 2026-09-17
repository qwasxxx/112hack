export const ARM112_SCREEN_IDS = [
  'login',
  'journal',
  'incoming-call',
  'card-create',
  'card-view',
  'map-window',
  'services-modal',
  'link-cards',
  'otrabotka',
  'dds-journal',
  'dds-card',
] as const;

export type Arm112ScreenId = (typeof ARM112_SCREEN_IDS)[number];
