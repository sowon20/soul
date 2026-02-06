/**
 * TTS Manager - Cartesia 음성 출력
 * REST API (/api/tts/speak) 또는 WebSocket (/api/tts/stream) 방식 지원
 * API 키는 백엔드에서 관리 (클라이언트 노출 없음)
 */
export class TTSManager {
  constructor() {
    this.enabled = localStorage.getItem('tts-enabled') === 'true';
    this.useWebSocket = localStorage.getItem('tts-use-websocket') === 'true';
    this.audioContext = null;
    this.playing = false;
    this.aborted = false;
    this.currentSource = null;
    this.ws = null;
    this.audioQueue = [];
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('tts-enabled', this.enabled);
    if (!this.enabled) this.stop();
    return this.enabled;
  }

  _cleanText(text) {
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\{[a-z_]+:.*?\}/gi, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>|]/g, '')
      .replace(/[ㅋㅎㅉ]{2,}/g, '[laughter]')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  _ensureAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  _playBuffer(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const ctx = this._ensureAudioContext();
      ctx.decodeAudioData(arrayBuffer.slice(0), (decoded) => {
        if (this.aborted) { resolve(); return; }
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        this.currentSource = source;
        source.onended = () => {
          this.currentSource = null;
          resolve();
        };
        source.start(0);
      }, (err) => {
        console.warn('[TTS] decodeAudioData 실패:', err);
        resolve();
      });
    });
  }

  async speak(text, options = {}) {
    if (!this.enabled || !text) return;

    this.stop();
    this.aborted = false;

    const clean = this._cleanText(text);
    if (!clean || clean.length < 3) return;

    this.playing = true;

    try {
      if (this.useWebSocket) {
        await this._speakWebSocket(clean, options);
      } else {
        await this._speakREST(clean);
      }
    } catch (err) {
      console.warn('[TTS] 재생 실패:', err);
    }

    this.playing = false;
  }

  async _speakREST(text) {
    const res = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `TTS 실패: ${res.status}`);
    }

    const wavBuffer = await res.arrayBuffer();
    if (this.aborted || !wavBuffer || wavBuffer.byteLength < 44) return;

    await this._playBuffer(wavBuffer);
  }

  async _speakWebSocket(text, options = {}) {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/tts/stream`;

      this.ws = new WebSocket(wsUrl);
      const chunks = [];

      this.ws.onopen = () => {
        // 필요한 정보만 전송: text, voice (선택), model (선택)
        const message = { text };
        if (options.voice) message.voice = options.voice;
        if (options.model) message.model = options.model;

        this.ws.send(JSON.stringify(message));
      };

      this.ws.onmessage = async (event) => {
        if (this.aborted) {
          this.ws.close();
          resolve();
          return;
        }

        if (event.data instanceof Blob) {
          // 오디오 청크 수신
          const arrayBuffer = await event.data.arrayBuffer();
          chunks.push(new Uint8Array(arrayBuffer));
        } else {
          // JSON 메시지 (에러 또는 완료)
          try {
            const data = JSON.parse(event.data);
            if (data.error) {
              console.error('[TTS WebSocket] Error:', data.error);
              this.ws.close();
              reject(new Error(data.error));
            } else if (data.done) {
              // 모든 청크를 합쳐서 WAV로 변환 후 재생 (끝부분 잘림 방지: 무음 패딩)
              if (chunks.length > 0) {
                const pcmData = this._mergeChunks(chunks);
                const silence = new Uint8Array(Math.floor(24000 * 2 * 0.3)); // 0.3초 무음
                const padded = this._mergeChunks([pcmData, silence]);
                const wavBuffer = this._addWavHeader(padded, 24000);
                await this._playBuffer(wavBuffer);
              }
              this.ws.close();
              resolve();
            }
          } catch (err) {
            console.warn('[TTS WebSocket] JSON parse error:', err);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error('[TTS WebSocket] Connection error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  _mergeChunks(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  _addWavHeader(pcmData, sampleRate = 24000) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = pcmData.length;

    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataSize, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);

    // Combine header + PCM data
    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const wavView = new Uint8Array(wavBuffer);
    wavView.set(new Uint8Array(header), 0);
    wavView.set(pcmData, 44);

    return wavBuffer;
  }

  stop() {
    this.aborted = true;
    this.playing = false;
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch {}
      this.currentSource = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  setWebSocketMode(enabled) {
    this.useWebSocket = enabled;
    localStorage.setItem('tts-use-websocket', enabled);
  }
}
