/**
 * SENTINEL AI / SilentSOS - Mobile Device Client Simulator
 * Controls the smartphone UI, Web Speech API phrase listener,
 * secret volume gestures, motion sensor triggers, and stealth disguise.
 */

const MobileApp = {
  isSafeModeActive: true,
  currentScreen: 'safe', // 'safe', 'emergency', 'stealth'
  isListening: false,
  speechRecognition: null,
  map: null,
  userMarker: null,
  userCoords: { lat: 37.7749, lng: -122.4194 },
  batteryLevel: 84,
  holdTimer: null,
  holdProgress: 0,
  activeIncidentId: null,
  falseAlarmSeconds: 10,
  falseAlarmInterval: null,
  volumeKeyHistory: [],

  init() {
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
    this.initMap();
    this.setupSpeechRecognition();
    this.bindEvents();
    this.startVoiceListening();
    this.setupKeyboardShortcuts();
    this.tryGetRealLocation();
  },

  updateClock() {
    const el = document.getElementById('phone-time');
    if (el) {
      const now = new Date();
      el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  },

  tryGetRealLocation() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (this.map && this.userMarker) {
            this.map.setView([this.userCoords.lat, this.userCoords.lng], 16);
            this.userMarker.setLatLng([this.userCoords.lat, this.userCoords.lng]);
          }
        },
        () => console.log("Using default demo coordinates for mobile simulator.")
      );
    }
  },

  initMap() {
    const mapEl = document.getElementById('mobile-map');
    if (!mapEl || typeof L === 'undefined') return;

    this.map = L.map('mobile-map', {
      zoomControl: false,
      attributionControl: false
    }).setView([this.userCoords.lat, this.userCoords.lng], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);

    // Custom user pulse marker
    const userIcon = L.divIcon({
      className: 'mobile-user-pin',
      html: `
        <div style="position: relative; width: 24px; height: 24px;">
          <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(0, 240, 255, 0.4); animation: pulseBeacon 1.8s infinite;"></div>
          <div style="position: absolute; top: 4px; left: 4px; width: 16px; height: 16px; border-radius: 50%; background: #00f0ff; border: 2px solid #fff; box-shadow: 0 0 10px #00f0ff;"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    this.userMarker = L.marker([this.userCoords.lat, this.userCoords.lng], { icon: userIcon }).addTo(this.map);

    // Add Angels' simulated locations nearby (matching Image 1)
    const angels = [
      { name: "Angela Dinosaur", lat: this.userCoords.lat + 0.003, lng: this.userCoords.lng + 0.002, icon: '👩' },
      { name: "Jane Dinosaur", lat: this.userCoords.lat - 0.0025, lng: this.userCoords.lng - 0.003, icon: '👵' }
    ];

    angels.forEach(a => {
      const angelIcon = L.divIcon({
        className: 'angel-pin',
        html: `
          <div style="background: rgba(157, 78, 221, 0.95); border: 2px solid #fff; border-radius: 12px; padding: 2px 6px; font-size: 10px; font-weight: 700; color: #fff; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 4px;">
            <span>${a.icon}</span> ${a.name}
          </div>
        `,
        iconAnchor: [35, 15]
      });
      L.marker([a.lat, a.lng], { icon: angelIcon }).addTo(this.map);
    });
  },

  // Web Speech API for active voice listening
  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not available in this browser. Simulator buttons can be used.");
      this.updateVoiceStatus("Voice API Simulated (Use Quick Phrases below)");
      return;
    }

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';

      this.speechRecognition.onstart = () => {
        this.isListening = true;
        this.updateVoiceStatus("Listening for Distress Keywords...");
        document.querySelectorAll('.audio-bar').forEach(b => b.style.animationPlayState = 'running');
      };

      this.speechRecognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript.trim().toLowerCase();
          const confidence = event.results[i][0].confidence || 0.85;

          const logEl = document.getElementById('live-transcript-preview');
          if (logEl) logEl.textContent = `Hearing: "${transcript}"`;

          // Check against known distress phrases
          this.checkVoiceTrigger(transcript, confidence);
        }
      };

      this.speechRecognition.onerror = (e) => {
        console.warn("Speech error:", e.error);
        if (e.error === 'not-allowed') {
          this.updateVoiceStatus("Mic Muted (Click 'Test Phrase' buttons)");
        }
      };

      this.speechRecognition.onend = () => {
        // Automatically restart if safe mode is still on
        if (this.isSafeModeActive && this.currentScreen !== 'emergency') {
          try { this.speechRecognition.start(); } catch (err) {}
        }
      };
    } catch (err) {
      console.warn("Speech setup err:", err);
    }
  },

  startVoiceListening() {
    if (this.speechRecognition && !this.isListening) {
      try {
        this.speechRecognition.start();
      } catch (e) {}
    }
  },

  stopVoiceListening() {
    if (this.speechRecognition && this.isListening) {
      try {
        this.speechRecognition.stop();
        this.isListening = false;
      } catch (e) {}
    }
  },

  updateVoiceStatus(txt) {
    const el = document.getElementById('voice-detection-status');
    if (el) el.textContent = txt;
  },

  async checkVoiceTrigger(transcript, confidence) {
    const keywords = [
      "help me", "save me", "emergency", "stop please", "leave me alone",
      "code red", "someone is following me", "call the angels", "pineapple"
    ];

    const matched = keywords.some(k => transcript.includes(k));
    if (matched) {
      showToast("Voice Distress Detected!", `Trigger phrase spoken: "${transcript}"`, "critical");
      this.triggerSOS({
        trigger_type: 'voice_distress',
        transcript: transcript,
        acoustic_stress: 0.88,
        notes: `Distress keyword recognized with ${(confidence * 100).toFixed(0)}% confidence`
      });
    }
  },

  // Main Emergency Trigger Dispatch
  async triggerSOS(data = {}) {
    SentinelAudio.playEmergencyAlarm();

    const payload = {
      user_name: 'Sophia Lin',
      trigger_type: data.trigger_type || 'manual_sos',
      transcript: data.transcript || '',
      motion_state: data.motion_state || 'Normal',
      latitude: this.userCoords.lat,
      longitude: this.userCoords.lng,
      address: data.address || 'Market & 4th St, San Francisco, CA',
      battery_level: this.batteryLevel,
      notes: data.notes || 'Emergency triggered via mobile device interface.'
    };

    try {
      const res = await fetch('/api/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        this.activeIncidentId = json.incident.id;
        this.switchScreen('emergency');
        this.startFalseAlarmCountdown(json.incident.false_alarm_seconds_left || 0);
        showToast("EMERGENCY MODE ACTIVE", "Guardian Angels & Response Hub Notified with live GPS.", "critical");
      }
    } catch (err) {
      console.error("SOS trigger failed:", err);
      // Still show emergency screen in offline mode
      this.switchScreen('emergency');
    }
  },

  startFalseAlarmCountdown(seconds) {
    const container = document.getElementById('false-alarm-timer-wrap');
    const timerVal = document.getElementById('false-alarm-seconds');

    if (!container || !timerVal || seconds <= 0) {
      if (container) container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    this.falseAlarmSeconds = seconds;
    timerVal.textContent = this.falseAlarmSeconds;

    clearInterval(this.falseAlarmInterval);
    this.falseAlarmInterval = setInterval(() => {
      this.falseAlarmSeconds--;
      timerVal.textContent = this.falseAlarmSeconds;
      if (this.falseAlarmSeconds <= 0) {
        clearInterval(this.falseAlarmInterval);
        container.style.display = 'none';
        showToast("Full Escalation", "Grace period ended. Incident locked in active escalation.", "danger");
      }
    }, 1000);
  },

  async cancelFalseAlarm() {
    const pin = prompt("Enter 4-digit Safety PIN to Cancel (Default: 1234):", "1234");
    if (pin === "1234") {
      clearInterval(this.falseAlarmInterval);
      if (this.activeIncidentId) {
        await fetch(`/api/incidents/${this.activeIncidentId}/cancel`, { method: 'POST' });
      }
      SentinelAudio.playSafeChime();
      showToast("Incident Cancelled", "False alarm cancelled safely with PIN.", "success");
      this.switchScreen('safe');
    } else if (pin !== null) {
      alert("Incorrect PIN. Alert remains active.");
    }
  },

  switchScreen(mode) {
    this.currentScreen = mode;
    document.querySelectorAll('.screen-mode').forEach(s => s.classList.remove('active'));

    if (mode === 'safe') {
      document.getElementById('screen-safe').classList.add('active');
      if (this.map) setTimeout(() => this.map.invalidateSize(), 200);
    } else if (mode === 'emergency') {
      document.getElementById('screen-emergency').classList.add('active');
    } else if (mode === 'stealth') {
      document.getElementById('screen-stealth').classList.add('active');
    }
  },

  // Secret Gestures & Hardware Button Sequences
  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Secret volume simulation via Down-Up-Down arrows
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        this.handleSecretVolumeKey(e.key === 'ArrowDown' ? 'DOWN' : 'UP');
      }
    });
  },

  handleSecretVolumeKey(key) {
    SentinelAudio.playDiscreetClick();
    const now = Date.now();
    this.volumeKeyHistory.push({ key, time: now });

    // Keep only last 3 within 2 seconds
    this.volumeKeyHistory = this.volumeKeyHistory.filter(k => now - k.time < 2000);

    const combo = this.volumeKeyHistory.map(k => k.key).join('-');
    const logEl = document.getElementById('gesture-seq-display');
    if (logEl) logEl.textContent = `Combo: ${combo || 'None'}`;

    if (combo.endsWith('DOWN-UP-DOWN')) {
      showToast("Secret Gesture Recognized!", "Volume sequence (Down-Up-Down) activated silent SOS.", "critical");
      this.triggerSOS({
        trigger_type: 'secret_gesture',
        notes: 'Secret volume button cadence (Down-Up-Down) activated without screen unlock.'
      });
      this.volumeKeyHistory = [];
    }
  },

  bindEvents() {
    // 1. Safe Mode Toggle
    const safeToggle = document.getElementById('btn-safe-mode-toggle');
    if (safeToggle) {
      safeToggle.addEventListener('click', () => {
        this.isSafeModeActive = !this.isSafeModeActive;
        if (this.isSafeModeActive) {
          safeToggle.classList.remove('off');
          safeToggle.innerHTML = '🛡️ Safe Mode ON';
          SentinelAudio.playSafeChime();
          this.startVoiceListening();
          showToast("Safe Mode Armed", "SilentSOS is actively monitoring voice, motion, and location.", "success");
        } else {
          safeToggle.classList.add('off');
          safeToggle.innerHTML = '⚪ Safe Mode OFF';
          this.stopVoiceListening();
          showToast("Safe Mode Paused", "Background monitoring suspended.", "warning");
        }
      });
    }

    // 2. Central SOS 3-Second Hold Button
    const sosBtn = document.getElementById('central-sos-hold-btn');
    if (sosBtn) {
      const startHold = (e) => {
        e.preventDefault();
        sosBtn.classList.add('holding');
        this.holdProgress = 0;
        clearInterval(this.holdTimer);

        this.holdTimer = setInterval(() => {
          this.holdProgress += 10;
          this.updateHoldSvg(this.holdProgress);
          if (this.holdProgress >= 100) {
            clearInterval(this.holdTimer);
            sosBtn.classList.remove('holding');
            this.updateHoldSvg(0);
            this.triggerSOS({
              trigger_type: 'manual_sos',
              notes: 'User held central SOS button for 3 seconds.'
            });
          }
        }, 300);
      };

      const endHold = () => {
        clearInterval(this.holdTimer);
        sosBtn.classList.remove('holding');
        this.updateHoldSvg(0);
      };

      sosBtn.addEventListener('mousedown', startHold);
      sosBtn.addEventListener('touchstart', startHold);
      sosBtn.addEventListener('mouseup', endHold);
      sosBtn.addEventListener('mouseleave', endHold);
      sosBtn.addEventListener('touchend', endHold);
    }

    // 3. Cancel link
    const cancelLink = document.getElementById('emergency-cancel-link');
    if (cancelLink) {
      cancelLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.cancelFalseAlarm();
      });
    }

    // 4. Quick Simulator Test Phrase buttons
    document.querySelectorAll('.btn-quick-phrase').forEach(btn => {
      btn.addEventListener('click', () => {
        const phrase = btn.getAttribute('data-phrase');
        showToast("Simulating Voice AI", `Uttered: "${phrase}"`, "critical");
        this.triggerSOS({
          trigger_type: 'voice_distress',
          transcript: phrase,
          notes: `Simulated Voice AI detection for '${phrase}'`
        });
      });
    });

    // 5. Simulate Motion Anomaly buttons
    const btnFall = document.getElementById('btn-sim-fall');
    if (btnFall) {
      btnFall.addEventListener('click', () => {
        showToast("Motion Sensor Anomaly", "Sudden 4.5G drop & impact detected!", "critical");
        this.triggerSOS({
          trigger_type: 'motion_anomaly',
          motion_state: 'Fall Impact',
          notes: 'TensorFlow Lite model detected severe fall impact pattern.'
        });
      });
    }

    const btnShake = document.getElementById('btn-sim-shake');
    if (btnShake) {
      btnShake.addEventListener('click', () => {
        showToast("Motion Sensor Anomaly", "Violent struggle oscillations detected!", "critical");
        this.triggerSOS({
          trigger_type: 'motion_anomaly',
          motion_state: 'Violent Shake',
          notes: 'Multi-axis accelerometer registered struggle tremor.'
        });
      });
    }

    // 6. Stealth Calculator Keypad
    document.querySelectorAll('.calc-btn').forEach(b => {
      b.addEventListener('click', () => {
        SentinelAudio.playDiscreetClick();
        const display = document.getElementById('calc-display-text');
        const val = b.getAttribute('data-val');

        if (val === 'C') {
          display.textContent = '0';
        } else if (val === '=') {
          // Secret code check: if entered 911 or pressing = with 911
          if (display.textContent.includes('911')) {
            showToast("Discreet SOS Engaged", "Silent alert dispatched from Calculator disguise without visual alert.", "critical");
            this.triggerSOS({
              trigger_type: 'discreet_pin',
              notes: 'Discreet SOS triggered from covert calculator keypad.'
            });
            display.textContent = '3.14159'; // Innocent result
          } else {
            try {
              display.textContent = eval(display.textContent.replace(/×/g, '*').replace(/÷/g, '/')) || '0';
            } catch {
              display.textContent = '0';
            }
          }
        } else {
          if (display.textContent === '0') display.textContent = val;
          else display.textContent += val;
        }
      });
    });

    // 7. Screen Mode Switchers in Sidebar
    const btnModeSafe = document.getElementById('btn-show-safe');
    if (btnModeSafe) btnModeSafe.addEventListener('click', () => this.switchScreen('safe'));
    const btnModeEm = document.getElementById('btn-show-emergency');
    if (btnModeEm) btnModeEm.addEventListener('click', () => this.switchScreen('emergency'));
    const btnModeStealth = document.getElementById('btn-show-stealth');
    if (btnModeStealth) btnModeStealth.addEventListener('click', () => this.switchScreen('stealth'));
  },

  updateHoldSvg(percent) {
    const circle = document.getElementById('hold-progress-circle');
    if (circle) {
      const radius = circle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (percent / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => MobileApp.init());
