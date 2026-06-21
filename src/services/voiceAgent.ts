export class VoiceAgent {
  private synthesis: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.initVoice();
  }

  private initVoice() {
    // Attempt to find a Vietnamese voice
    const setVoice = () => {
      const voices = this.synthesis.getVoices();
      this.voice = voices.find((v) => v.lang === 'vi-VN') || voices[0];
    };

    setVoice();
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = setVoice;
    }
  }

  public speak(text: string) {
    if (this.synthesis.speaking) {
      this.synthesis.cancel(); // Stop current speech
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      utterance.voice = this.voice;
    }
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    this.synthesis.speak(utterance);
  }

  public stop() {
    if (this.synthesis.speaking) {
      this.synthesis.cancel();
    }
  }
}

export const voiceAgent = new VoiceAgent();
