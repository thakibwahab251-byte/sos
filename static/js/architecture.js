/**
 * SENTINEL AI - Interactive Architecture & Signal Fusion Sandbox
 * Live calculation and visualization of multi-modal AI threat evaluation.
 */

const ArchitectureSandbox = {
  init() {
    this.bindInputs();
    this.evaluate();
  },

  bindInputs() {
    const inputs = ['slider-voice-score', 'slider-motion-score', 'select-trigger-type', 'check-active-session', 'check-overdue-session'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.evaluate());
        el.addEventListener('change', () => this.evaluate());
      }
    });

    // Architecture diagram node click inspection
    document.querySelectorAll('.arch-layer-box, .engine-node-box').forEach(box => {
      box.addEventListener('click', () => {
        const title = box.querySelector('.arch-box-title, .engine-node-title')?.textContent.trim();
        const desc = box.querySelector('.arch-box-subtitle, .engine-node-desc')?.textContent.trim();
        showToast(title || "Architecture Component", desc || "Sentinel AI Subsystem", "info");
      });
    });
  },

  async evaluate() {
    const voiceScore = parseInt(document.getElementById('slider-voice-score')?.value || 0);
    const motionScore = parseInt(document.getElementById('slider-motion-score')?.value || 0);
    const triggerType = document.getElementById('select-trigger-type')?.value || 'voice_distress';
    const inSession = document.getElementById('check-active-session')?.checked || false;
    const isOverdue = document.getElementById('check-overdue-session')?.checked || false;

    // Update labels
    const vVal = document.getElementById('val-voice-score');
    if (vVal) vVal.textContent = `${voiceScore}%`;
    const mVal = document.getElementById('val-motion-score');
    if (mVal) mVal.textContent = `${motionScore}%`;

    try {
      const res = await fetch('/api/fusion/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_score: voiceScore,
          motion_score: motionScore,
          trigger_type: triggerType,
          in_session: inSession,
          is_overdue: isOverdue
        })
      });

      const data = await res.json();
      this.renderResult(data);
    } catch (e) {
      console.warn("Evaluation error:", e);
    }
  },

  renderResult(data) {
    const scoreEl = document.getElementById('sandbox-threat-score');
    if (scoreEl) scoreEl.textContent = `${data.threat_score}%`;

    const badgeEl = document.getElementById('sandbox-threat-level');
    if (badgeEl) {
      badgeEl.className = `badge ${data.threat_level === 'CRITICAL' ? 'badge-critical' : data.threat_level === 'HIGH' ? 'badge-critical' : data.threat_level === 'ELEVATED' ? 'badge-warning' : 'badge-resolved'}`;
      badgeEl.textContent = data.threat_level;
    }

    const actionEl = document.getElementById('sandbox-action-desc');
    if (actionEl) {
      if (data.grace_period_seconds === 0) {
        actionEl.innerHTML = `⚡ <strong>Immediate Silent Escalation:</strong> High-priority alert broadcasted instantly to Angels & dispatch with live GPS.`;
        actionEl.style.color = 'var(--crimson)';
      } else {
        actionEl.innerHTML = `🛡️ <strong>False-Alert Filter:</strong> ${data.grace_period_seconds}s discreet countdown enabled before dispatch to prevent false alarms.`;
        actionEl.style.color = '#fbbf24';
      }
    }

    const barEl = document.getElementById('sandbox-gauge-fill');
    if (barEl) {
      barEl.style.width = `${data.threat_score}%`;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => ArchitectureSandbox.init());
