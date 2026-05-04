// Browser stub for ConsolePromptService.
// In the browser there is no stdin/stdout — all confirmations auto-resolve to true.
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConsolePromptService {
  log = new Logger(ConsolePromptService.name);

  async askUserConfirmation(_message: string): Promise<boolean> {
    return true;
  }

  async askDataResetConfirmation(configStartHeight: number, currentDbHeight: number): Promise<boolean> {
    this.log.warn(
      `Data reset: configuredStart=${configStartHeight}, currentDb=${currentDbHeight} — auto-confirming in browser`
    );
    return true;
  }
}
