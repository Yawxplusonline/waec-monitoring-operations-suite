import { SentinelAlert, TelegramDispatchRecord } from '../types/sentinel';

export type SirenPattern = 'EMERGENCY_SOS' | 'ESCORT_WARNING';

const TELEGRAM_CONFIG_KEY = 'waec_sentinel_telegram_config_v1';

export interface TelegramBotConfig {
  botToken: string;
  chatId: string;
}

export function getTelegramBotConfig(): TelegramBotConfig {
  try {
    const raw = localStorage.getItem(TELEGRAM_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        botToken: parsed.botToken || import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '',
        chatId: parsed.chatId || import.meta.env.VITE_TELEGRAM_CHAT_ID || '@WAEC_Command_Lead',
      };
    }
  } catch {
    // ignore
  }
  return {
    botToken: import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '',
    chatId: import.meta.env.VITE_TELEGRAM_CHAT_ID || '@WAEC_Command_Lead',
  };
}

export function saveTelegramBotConfig(config: TelegramBotConfig) {
  localStorage.setItem(TELEGRAM_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Phase 3 & 4: Multi-Mode Web Audio API Siren Synthesizer & 15s Ambient Audio Preview Player.
 */
class SirenSynthesizer {
  private ctx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: number | null = null;
  private isPlaying = false;
  private currentPattern: SirenPattern = 'EMERGENCY_SOS';
  private masterVolume = 0.2;

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0.02, Math.min(0.6, vol));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public startSiren(pattern: SirenPattern = 'EMERGENCY_SOS') {
    if (this.isPlaying && this.currentPattern === pattern) return;
    this.stopSiren();
    this.currentPattern = pattern;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.oscillator = this.ctx.createOscillator();
      this.gainNode = this.ctx.createGain();

      if (pattern === 'EMERGENCY_SOS') {
        this.oscillator.type = 'sawtooth';
        this.oscillator.frequency.setValueAtTime(680, this.ctx.currentTime);
        this.gainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
        this.oscillator.start();
        this.isPlaying = true;

        let highTone = false;
        this.intervalId = window.setInterval(() => {
          if (!this.ctx || !this.oscillator) return;
          highTone = !highTone;
          this.oscillator.frequency.exponentialRampToValueAtTime(
            highTone ? 980 : 620,
            this.ctx.currentTime + 0.35
          );
        }, 400);
      } else {
        this.oscillator.type = 'triangle';
        this.oscillator.frequency.setValueAtTime(440, this.ctx.currentTime);
        this.gainNode.gain.setValueAtTime(this.masterVolume * 0.85, this.ctx.currentTime);

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
        this.oscillator.start();
        this.isPlaying = true;

        let highBeep = false;
        this.intervalId = window.setInterval(() => {
          if (!this.ctx || !this.oscillator) return;
          highBeep = !highBeep;
          this.oscillator.frequency.setValueAtTime(
            highBeep ? 660 : 440,
            this.ctx.currentTime
          );
        }, 550);
      }
    } catch {
      // Browser autoplay restriction until user interacts with DOM
    }
  }

  public playTestChime(pattern: SirenPattern = 'EMERGENCY_SOS', durationMs = 1800) {
    this.startSiren(pattern);
    window.setTimeout(() => {
      this.stopSiren();
    }, durationMs);
  }

  public playSimulatedAmbientClip(durationMs = 3000): () => void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const bufferSize = ctx.sampleRate * (durationMs / 1000);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const env = 0.25 + 0.75 * Math.abs(Math.sin(i / 4500));
        data[i] = (Math.random() * 2 - 1) * 0.04 * env;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;

      noise.connect(filter);
      filter.connect(ctx.destination);
      noise.start();

      const timer = window.setTimeout(() => {
        try {
          noise.stop();
          ctx.close();
        } catch {
          // ignore
        }
      }, durationMs);

      return () => {
        clearTimeout(timer);
        try {
          noise.stop();
          ctx.close();
        } catch {
          // ignore
        }
      };
    } catch {
      return () => {};
    }
  }

  public stopSiren() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
        // Ignore if already stopped
      }
      this.oscillator = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // Ignore
      }
      this.ctx = null;
    }
    this.isPlaying = false;
  }

  public get active(): boolean {
    return this.isPlaying;
  }

  public get pattern(): SirenPattern {
    return this.currentPattern;
  }
}

export const sirenEngine = new SirenSynthesizer();

/**
 * Phase 4: Dispatches an instant $0-cost Telegram Bot API SOS message to the Command Lead's mobile phone
 * and returns a structured `TelegramDispatchRecord` for audit logging.
 */
export async function dispatchTelegramSOS(
  alert: SentinelAlert
): Promise<TelegramDispatchRecord> {
  const { botToken, chatId } = getTelegramBotConfig();
  const osmUrl = `https://www.openstreetmap.org/?mlat=${alert.lat.toFixed(
    5
  )}&mlon=${alert.lng.toFixed(5)}#map=17/${alert.lat.toFixed(5)}/${alert.lng.toFixed(5)}`;

  const messageText = [
    `🚨 *WAEC SENTINEL — EMERGENCY ${alert.type}* 🚨`,
    `👤 *Officer:* ${alert.officer_name} (${alert.officer_id})`,
    `📞 *Phone:* ${alert.officer_phone || 'N/A'}`,
    `🔋 *Battery:* ${alert.battery}%`,
    `📍 *Coordinates:* \`${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}\``,
    `🗺️ *Live OSM Map:* [Open Location in Map](${osmUrl})`,
    `🎙️ *15s Ambient Audio:* Recording & Encrypting to Firebase Storage...`,
    `⏱️ *Timestamp:* ${new Date(alert.timestamp).toUTCString()}`,
  ].join('\n');

  let mode: TelegramDispatchRecord['mode'] = 'SIMULATED_BOT_WEBHOOK';

  if (botToken && botToken.trim() !== '' && chatId && chatId.trim() !== '') {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: messageText,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });
      if (res.ok) {
        mode = 'LIVE_TELEGRAM_API';
      }
    } catch {
      mode = 'SIMULATED_BOT_WEBHOOK';
    }
  }

  return {
    id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    alert_id: alert.id,
    officer_id: alert.officer_id,
    officer_name: alert.officer_name,
    alert_type: alert.type,
    mode,
    chat_id: chatId || '@WAEC_Command_Lead',
    osm_url: osmUrl,
    markdown_payload: messageText,
    timestamp: Date.now(),
  };
}
