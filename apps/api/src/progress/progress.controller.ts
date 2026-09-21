import { Body, Controller, Delete, Get, Inject, Param, Put } from '@nestjs/common';
import { TrainingStoreService } from './training-store.service';

@Controller('api/v1/training')
export class ProgressController {
  constructor(@Inject(TrainingStoreService) private readonly store: TrainingStoreService) {}

  @Get('health')
  health() {
    return this.store.health();
  }

  @Get('lessons')
  lessons() {
    return this.store.listLessons();
  }

  @Put('lessons/:id')
  putLesson(@Param('id') id: string, @Body() body: { login?: string; payload?: unknown }) {
    return this.store.upsertLesson(id, String(body.login || ''), body.payload);
  }

  @Get('assignments')
  assignments() {
    return this.store.getAssignments();
  }

  @Put('assignments')
  putAssignments(@Body() body: { scenarioIds?: string[]; teacherLogin?: string }) {
    return this.store.putAssignments(body.scenarioIds ?? [], body.teacherLogin || 'petrov');
  }

  @Get('class')
  classState() {
    return this.store.getClass();
  }

  @Put('class')
  putClass(
    @Body()
    body: {
      active?: boolean;
      startedAt?: string;
      teacherLogin?: string;
      title?: string;
    },
  ) {
    return this.store.putClass(body);
  }

  @Get('overlays')
  overlays() {
    return this.store.getOverlays();
  }

  @Put('overlays/:lessonId')
  putOverlay(
    @Param('lessonId') lessonId: string,
    @Body() body: { expertScore?: number; comment?: string },
  ) {
    return this.store.putOverlay(lessonId, body);
  }

  @Get('audit')
  audit() {
    return this.store.listAudit();
  }

  @Put('audit/:id')
  putAudit(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.store.putAudit(id, body);
  }

  @Get('live')
  live() {
    return this.store.listLive();
  }

  @Put('live/:login')
  putLive(@Param('login') login: string, @Body() body: unknown) {
    return this.store.upsertLive(login, body);
  }

  @Delete('live/:login')
  deleteLive(@Param('login') login: string) {
    return this.store.deleteLive(login);
  }
}
