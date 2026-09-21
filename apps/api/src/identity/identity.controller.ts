import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import type { Role } from '@sys112/shared-types';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from './identity.service';

@Controller('api/v1')
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post('auth/login')
  async login(@Body() body: { login?: string; password?: string }) {
    const login = String(body.login || '').trim();
    const password = String(body.password || '');
    if (!login || !password) {
      return { ok: false, message: 'Укажите логин и пароль.' };
    }
    try {
      const user = await this.identity.login(login, password);
      if (!user) {
        return { ok: false, message: 'Нет такой учётной записи или неверный пароль.' };
      }
      await this.audit.append({
        actorId: user.id,
        action: 'login',
        entityType: 'user',
        entityId: user.id,
        payload: { login: user.login, role: user.role },
      });
      return { ok: true, user };
    } catch (error) {
      if (error instanceof Error && error.message === 'blocked') {
        return { ok: false, message: 'Учётная запись заблокирована.' };
      }
      throw error;
    }
  }

  @Post('auth/register')
  async register(
    @Body() body: { login?: string; email?: string; name?: string; password?: string },
  ) {
    const login = String(body.login || body.email || '').trim().toLowerCase();
    const name = String(body.name || login).trim();
    const password = String(body.password || '');
    if (!login || !password || password.length < 3) {
      return { ok: false, message: 'Проверьте логин и пароль.' };
    }
    try {
      const user = await this.identity.createUser({
        login,
        email: body.email,
        name,
        role: 'STUDENT',
        password,
      });
      await this.audit.append({
        actorId: user.id,
        action: 'register',
        entityType: 'user',
        entityId: user.id,
        payload: { login: user.login },
      });
      return { ok: true, user };
    } catch {
      return { ok: false, message: 'Такой логин уже есть.' };
    }
  }

  @Get('users')
  users() {
    return this.identity.listUsers();
  }

  @Post('users')
  async create(
    @Body()
    body: { login?: string; email?: string; name?: string; role?: Role; password?: string },
  ) {
    const login = String(body.login || '').trim().toLowerCase();
    const name = String(body.name || login).trim();
    const password = String(body.password || '112');
    const role = (body.role || 'STUDENT') as Role;
    if (!login || !name) {
      return { ok: false, message: 'Укажите логин и имя.' };
    }
    const user = await this.identity.createUser({
      login,
      email: body.email,
      name,
      role,
      password,
    });
    await this.audit.append({
      action: 'account_created',
      entityType: 'user',
      entityId: user.id,
      payload: { login: user.login, role: user.role },
    });
    return { ok: true, user };
  }

  @Patch('users/:id')
  async patch(
    @Param('id') id: string,
    @Body() body: { role?: Role; status?: 'active' | 'blocked'; password?: string; name?: string },
  ) {
    const user = await this.identity.patchUser(id, body);
    if (!user) {
      return { ok: false, message: 'Учётка не найдена.' };
    }
    await this.audit.append({
      action: body.status === 'blocked' ? 'account_blocked' : body.password ? 'password_reset' : 'account_updated',
      entityType: 'user',
      entityId: user.id,
      payload: body,
    });
    return { ok: true, user };
  }
}
