import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv } from './infrastructure/config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { cors: false });
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  await app.listen(env.API_PORT, env.API_HOST);
  Logger.log(`api listening on http://${env.API_HOST}:${env.API_PORT}`, 'Bootstrap');
}

void bootstrap();
