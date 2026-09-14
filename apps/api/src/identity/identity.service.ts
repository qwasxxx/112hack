import { Injectable } from '@nestjs/common';
import { ROLES, type Role } from '@sys112/shared-types';

@Injectable()
export class IdentityService {
  roles(): Role[] {
    return ROLES;
  }
}
