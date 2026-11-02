/**
 * SENTINEL AI / SilentSOS - Main Application Script
 * Provides Web Audio API synthesizers (SOS sirens, confirmation chimes),
 * toast notifications, and common helpers.
 */

const SentinelAudio = {
  ctx: null,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  },

  // Synthesize an authentic emergency alarm siren
  playEmergencyAlarm() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      // Pitch modulation: siren sweep
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.linearRampToValueAtTime(980, now + 0.35);
      osc.frequency.linearRampToValueAtTime(650, now + 0.7);
      osc.frequency.linearRampToValueAtTime(980, now + 1.05);
      osc.frequency.linearRampToValueAtTime(650, now + 1.4);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 1.5);
    } catch (e) {
      console.warn("Audio synth warning:", e);
    }
  },

  // Safe mode activated chime
  playSafeChime() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.36); // C6

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    } catch (e) {
      console.warn("Audio synth warning:", e);
    }
  },

  // Single discreet pulse click
  playDiscreetClick() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }
};

// UI Notification Toast
function showToast(title, message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  if (type === 'danger' || type === 'critical') {
    toast.style.borderLeftColor = 'var(--crimson)';
  } else if (type === 'success') {
    toast.style.borderLeftColor = 'var(--emerald)';
  } else if (type === 'warning') {
    toast.style.borderLeftColor = 'var(--amber)';
  } else {
    toast.style.borderLeftColor = 'var(--cyan)';
  }

  const icon = type === 'danger' || type === 'critical' ? '🚨' :
               type === 'success' ? '🛡️' :
               type === 'warning' ? '⚠️' : '📡';

  toast.innerHTML = `
    <div style="font-size: 1.3rem;">${icon}</div>
    <div style="flex: 1;">
      <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 2px;">${title}</div>
      <div style="font-size: 0.8rem; color: #cbd5e1;">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// User unlock audio on first interaction
window.addEventListener('click', () => SentinelAudio.init(), { once: true });
