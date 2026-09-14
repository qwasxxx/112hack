import { Module } from '@nestjs/common';
import { TOKENS } from '../../common/tokens';
import { MockEmbeddings } from './mock/mock-embeddings';
import { MockEvaluationModel } from './mock/mock-evaluation';
import { MockLanguageModel } from './mock/mock-llm';
import { MockSpeechToText } from './mock/mock-stt';
import { MockTextToSpeech } from './mock/mock-tts';

@Module({
  providers: [
    { provide: TOKENS.SPEECH_TO_TEXT, useClass: MockSpeechToText },
    { provide: TOKENS.LANGUAGE_MODEL, useClass: MockLanguageModel },
    { provide: TOKENS.TEXT_TO_SPEECH, useClass: MockTextToSpeech },
    { provide: TOKENS.EMBEDDINGS, useClass: MockEmbeddings },
    { provide: TOKENS.EVALUATION_MODEL, useClass: MockEvaluationModel },
  ],
  exports: [
    TOKENS.SPEECH_TO_TEXT,
    TOKENS.LANGUAGE_MODEL,
    TOKENS.TEXT_TO_SPEECH,
    TOKENS.EMBEDDINGS,
    TOKENS.EVALUATION_MODEL,
  ],
})
export class AiInfrastructureModule {}
