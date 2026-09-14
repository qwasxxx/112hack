import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '../common/tokens';
import type {
  CallSessionStorePort,
  EventBusPort,
  LanguageModelPort,
  SpeechToTextPort,
  TextToSpeechPort,
} from '../ports';
import { ScenarioEngine } from '../scenario-engine/scenario-engine';

@Injectable()
export class CallOrchestrator {
  constructor(
    @Inject(ScenarioEngine) private readonly engine: ScenarioEngine,
    @Inject(TOKENS.SPEECH_TO_TEXT) private readonly stt: SpeechToTextPort,
    @Inject(TOKENS.LANGUAGE_MODEL) private readonly llm: LanguageModelPort,
    @Inject(TOKENS.TEXT_TO_SPEECH) private readonly tts: TextToSpeechPort,
    @Inject(TOKENS.CALL_SESSION_STORE) private readonly sessions: CallSessionStorePort,
    @Inject(TOKENS.EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  getPipelineSteps(): string[] {
    return [
      'stt',
      'normalize_transcript',
      'load_runtime_state',
      'scenario_engine_context',
      'llm',
      'commit_runtime_state',
      'tts',
      'publish_realtime',
    ];
  }
}
