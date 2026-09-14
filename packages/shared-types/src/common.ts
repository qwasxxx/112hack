export type IsoDateTime = string;

export type EntityId = string;

export interface VersionedEntity {
  version: number;
  updatedAt: IsoDateTime;
}
