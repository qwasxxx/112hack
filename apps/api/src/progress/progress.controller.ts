import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { TrainingStoreService } from './training-store.service';

const MAX_AUDIO = 32_000_000;

@Controller('api/v1/training')
export class ProgressController {
  constructor(@Inject(TrainingStoreService) private readonly store: TrainingStoreService) {}

  @Get('health')
  health() {
    return this.store.health();
  }

  @Get('lessons')
  lessons(@Query('login') login?: string) {
    return this.store.listLessons(login?.trim() || undefined);
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
      categories?: string[];
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

  @Get('cues')
  cues(@Query('login') login?: string) {
    return this.store.listCues(login?.trim() || undefined);
  }

  @Put('cues/:id')
  putCue(@Param('id') id: string, @Body() body: unknown) {
    return this.store.putCue(id, body);
  }

  @Get('catalog')
  catalog() {
    return this.store.getCatalog();
  }

  @Put('catalog')
  putCatalog(@Body() body: { overlays?: unknown; custom?: unknown }) {
    return this.store.putCatalog(body ?? {});
  }

  @Get('recordings')
  recordings(@Query('login') login?: string) {
    return this.store.listRecordings(login?.trim() || undefined);
  }

  @Post('recordings')
  putRecording(
    @Body()
    body: {
      id?: string;
      lessonId?: string;
      login?: string;
      scenarioId?: string;
      mime?: string;
      durationSec?: number;
      data?: string;
    },
  ) {
    const login = String(body.login || '').trim();
    if (!login || !body.data) {
      throw new HttpException('Нужны login и data', HttpStatus.BAD_REQUEST);
    }
    const raw = body.data.includes(',') ? body.data.slice(body.data.indexOf(',') + 1) : body.data;
    const bytes = Buffer.from(raw, 'base64');
    if (!bytes.length || bytes.length > MAX_AUDIO) {
      throw new HttpException('Файл записи пустой или слишком большой', HttpStatus.BAD_REQUEST);
    }
    return this.store.saveRecording({
      id: body.id,
      lessonId: body.lessonId,
      login,
      scenarioId: body.scenarioId,
      mime: body.mime || 'audio/wav',
      durationSec: body.durationSec,
      bytes,
    });
  }

  @Get('recordings/:id')
  @Header('Cache-Control', 'private, max-age=3600')
  async recordingFile(@Param('id') id: string, @Query('download') download?: string) {
    const row = await this.store.getRecording(id);
    if (!row) {
      throw new HttpException('Запись не найдена', HttpStatus.NOT_FOUND);
    }
    return new StreamableFile(row.bytes, {
      type: row.mime || 'audio/wav',
      disposition: download ? `attachment; filename="${id}.wav"` : 'inline',
    });
  }
}
