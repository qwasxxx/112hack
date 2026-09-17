export type TheoryRegionId =
  | 'incoming'
  | 'phones'
  | 'caller'
  | 'quick-actions'
  | 'address'
  | 'incident'
  | 'description'
  | 'services'
  | 'timer'
  | 'footer';

export type TheorySourceKind = 'manual' | 'card-screenshot' | 'classifier' | 'phone-datasheet' | 'dds-screenshot';

export type TheorySourceRef = {
  kind: TheorySourceKind;
  ref: string;
};

export type TheoryStep = {
  id: string;
  index: string;
  title: string;
  regionIds: TheoryRegionId[];
  fieldName: string;
  purpose: string;
  operatorDoes: string;
  note?: string;
  hotkey?: string;
  source: TheorySourceRef[];
};
