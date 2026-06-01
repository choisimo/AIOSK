// 키오스크 사운드 효과 유틸리티
type AudioContextConstructor = typeof AudioContext;

export class KioskSoundManager {
  private static audioContext: AudioContext | null = null;

  // 기본 톤 재생 함수
  private static playTone(frequency: number, duration: number): void {
    let audioContext = KioskSoundManager.audioContext;
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || (window as Window & {
        webkitAudioContext?: AudioContextConstructor;
      }).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext is not supported.');
      }
      audioContext = new AudioContextClass();
      KioskSoundManager.audioContext = audioContext;
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';

    // 부드러운 페이드 인/아웃
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  }

  // 주문 완료 성공 사운드
  static playOrderSuccessSound(): void {
    try {
      // C4, E4, G4 코드 (성공 멜로디)
      const notes = [
        { frequency: 261.63, duration: 0.2, delay: 0 },     // C4
        { frequency: 329.63, duration: 0.2, delay: 0.15 },  // E4
        { frequency: 392.00, duration: 0.4, delay: 0.3 }    // G4
      ];

      notes.forEach(note => {
        setTimeout(() => {
          KioskSoundManager.playTone(note.frequency, note.duration);
        }, note.delay * 1000);
      });
    } catch {
      // Audio feedback is optional and can be blocked by browser policy.
    }
  }

  // 버튼 클릭 사운드
  static playClickSound(): void {
    try {
      KioskSoundManager.playTone(800, 0.1);
    } catch {
      // Audio feedback is optional and can be blocked by browser policy.
    }
  }

  // 에러 사운드
  static playErrorSound(): void {
    try {
      // 낮은 음으로 에러 표시
      const notes = [
        { frequency: 220, duration: 0.3, delay: 0 },
        { frequency: 196, duration: 0.3, delay: 0.2 }
      ];

      notes.forEach(note => {
        setTimeout(() => {
          KioskSoundManager.playTone(note.frequency, note.duration);
        }, note.delay * 1000);
      });
    } catch {
      // Audio feedback is optional and can be blocked by browser policy.
    }
  }
}

// 키오스크 전용 햅틱 피드백 (지원되는 기기에서)
export class KioskHapticManager {
  static triggerSuccess(): void {
    if ('vibrate' in navigator) {
      // 성공 패턴: 짧은 진동 두 번
      navigator.vibrate([100, 50, 100]);
    }
  }

  static triggerClick(): void {
    if ('vibrate' in navigator) {
      // 클릭 피드백: 짧은 진동
      navigator.vibrate(50);
    }
  }

  static triggerError(): void {
    if ('vibrate' in navigator) {
      // 에러 패턴: 긴 진동
      navigator.vibrate(300);
    }
  }
}
