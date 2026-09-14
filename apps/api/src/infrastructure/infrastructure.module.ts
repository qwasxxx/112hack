import { Global, Module } from '@nestjs/common';
import { loadEnv, type AppEnv } from './config/env';
import { DatabaseService } from './database/database.service';
import { AiInfrastructureModule } from './ai/ai.module';
import { InMemoryVectorStore } from './vector/in-memory-vector-store';
import { InProcessEventBus } from './events/in-process-event-bus';
import { InMemoryCallSessionStore } from './session/in-memory-call-session-store';
import { InProcessJobQueue } from './jobs/in-process-job-queue';
import { TOKENS } from '../common/tokens';

const env: AppEnv = loadEnv();

@Global()
@Module({
  imports: [AiInfrastructureModule],
  providers: [
    { provide: 'APP_ENV', useValue: env },
    { provide: DatabaseService, useFactory: async () => {
      const database = new DatabaseService(env);
      await database.connect();
      return database;
    }},
    { provide: InMemoryVectorStore, useClass: InMemoryVectorStore },
    { provide: TOKENS.VECTOR_STORE, useExisting: InMemoryVectorStore },
    { provide: TOKENS.RETRIEVAL, useExisting: InMemoryVectorStore },
    { provide: TOKENS.EVENT_BUS, useClass: InProcessEventBus },
    { provide: TOKENS.CALL_SESSION_STORE, useClass: InMemoryCallSessionStore },
    { provide: TOKENS.JOB_QUEUE, useClass: InProcessJobQueue },
  ],
  exports: [
    'APP_ENV',
    DatabaseService,
    AiInfrastructureModule,
    TOKENS.VECTOR_STORE,
    TOKENS.RETRIEVAL,
    TOKENS.EVENT_BUS,
    TOKENS.CALL_SESSION_STORE,
    TOKENS.JOB_QUEUE,
  ],
})
export class InfrastructureModule {}
