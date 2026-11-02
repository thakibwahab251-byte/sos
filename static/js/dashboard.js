/**
 * SENTINEL AI - Guardian Operations & Incident Tracking Dashboard
 * Real-time SSE updates, Leaflet command center map, and responder dispatch.
 */

const GuardianDashboard = {
  map: null,
  incidentMarker: null,
  accuracyCircle: null,
  angelMarkers: [],
  selectedIncidentId: null,
  eventSource: null,
  activeFilter: 'all',

  init() {
    this.initMap();
    this.setupSSE();
    this.bindEvents();
    this.startPollingFallback();

    // Auto-select first incident in list if present
    const firstItem = document.querySelector('.incident-feed-item');
    if (firstItem) {
      firstItem.click();
    }
  },

  initMap() {
    const mapEl = document.getElementById('dashboard-map');
    if (!mapEl || typeof L === 'undefined') return;

    this.map = L.map('dashboard-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([37.7749, -122.4194], 15);

    // High-tech dark carto tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);
  },

  setupSSE() {
    if (!('EventSource' in window)) return;

    try {
      this.eventSource = new EventSource('/api/stream');

      this.eventSource.onmessage = (e) => {
        try {
          const packet = JSON.parse(e.data);
          if (packet.event === 'new_incident') {
            this.handleNewIncident(packet.data);
          } else if (packet.event === 'incident_updated') {
            this.handleIncidentUpdated(packet.data);
          } else if (packet.event === 'location_update') {
            this.handleLocationUpdate(packet.data);
          }
        } catch (err) {
          // heartbeat or ping
        }
      };

      this.eventSource.onerror = () => {
        console.warn("SSE connection interrupted. Polling fallback active.");
      };
    } catch (e) {
      console.warn("SSE setup error:", e);
    }
  },

  startPollingFallback() {
    // Poll every 4 seconds to guarantee state synchronization
    setInterval(async () => {
      try {
        const res = await fetch('/api/incidents');
        const list = await res.json();
        this.syncIncidentList(list);
      } catch (e) {}
    }, 4000);
  },

  handleNewIncident(data) {
    SentinelAudio.playEmergencyAlarm();
    showToast("CRITICAL INCIDENT ALERT", `New emergency triggered: ${data.incident.incident_code} - ${data.incident.distress_phrase}`, "critical");
    this.prependIncidentItem(data.incident);
    this.selectIncident(data.incident.id);
  },

  handleIncidentUpdated(data) {
    const badgeEl = document.getElementById(`badge-inc-${data.id}`);
    if (badgeEl) {
      badgeEl.className = `badge badge-${data.status.toLowerCase()}`;
      badgeEl.textContent = data.status;
    }
    if (this.selectedIncidentId === data.id) {
      this.loadIncidentDetails(data.id);
    }
  },

  handleLocationUpdate(data) {
    if (this.selectedIncidentId === data.id && this.map) {
      const latLng = [data.latitude, data.longitude];
      if (this.incidentMarker) {
        this.incidentMarker.setLatLng(latLng);
      }
      if (this.accuracyCircle) {
        this.accuracyCircle.setLatLng(latLng);
        this.accuracyCircle.setRadius(data.accuracy || 10);
      }
      this.map.panTo(latLng);
    }
  },

  prependIncidentItem(inc) {
    const container = document.getElementById('incident-feed-container');
    if (!container) return;

    // Check if item already exists
    if (document.getElementById(`incident-item-${inc.id}`)) return;

    const item = document.createElement('div');
    item.id = `incident-item-${inc.id}`;
    item.className = 'incident-feed-item selected';
    item.setAttribute('data-id', inc.id);
    item.setAttribute('data-status', inc.status);

    item.innerHTML = `
      <div class="item-top-row">
        <span class="item-code">${inc.incident_code}</span>
        <span id="badge-inc-${inc.id}" class="badge badge-critical">${inc.status}</span>
      </div>
      <div class="item-trigger-phrase">
        <span>🚨</span> "${inc.distress_phrase || 'SOS Trigger'}"
      </div>
      <div class="item-location-meta">
        <span>📍</span> ${inc.address || 'Active GPS Location'} · <span>⚡ ${inc.threat_score}% Threat</span>
      </div>
    `;

    item.addEventListener('click', () => this.selectIncident(inc.id));
    container.prepend(item);
  },

  syncIncidentList(incidents) {
    // Update active count metric
    const activeCount = incidents.filter(i => i.status === 'ACTIVE' || i.status === 'ESCALATED').length;
    const countEl = document.getElementById('metric-active-count');
    if (countEl) countEl.textContent = activeCount;
  },

  async selectIncident(id) {
    this.selectedIncidentId = id;

    // Highlight in list
    document.querySelectorAll('.incident-feed-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.getAttribute('data-id')) === id);
    });

    await this.loadIncidentDetails(id);
  },

  async loadIncidentDetails(id) {
    try {
      const res = await fetch(`/api/incidents/${id}`);
      const data = await res.json();
      if (!data.incident) return;

      const inc = data.incident;
      const logs = data.logs || [];

      // Update Header & Threat gauge
      const codeEl = document.getElementById('detail-incident-code');
      if (codeEl) codeEl.textContent = inc.incident_code;

      const statusEl = document.getElementById('detail-status-badge');
      if (statusEl) {
        statusEl.className = `badge badge-${inc.status.toLowerCase()}`;
        statusEl.textContent = inc.status;
      }

      const threatScoreEl = document.getElementById('detail-threat-score');
      if (threatScoreEl) threatScoreEl.textContent = `${inc.threat_score}%`;

      const gaugeFill = document.getElementById('detail-gauge-fill');
      if (gaugeFill) gaugeFill.style.width = `${inc.threat_score}%`;

      const phraseEl = document.getElementById('detail-phrase');
      if (phraseEl) phraseEl.textContent = `"${inc.distress_phrase || 'SOS Emergency Trigger'}"`;

      const audioClassEl = document.getElementById('detail-audio-class');
      if (audioClassEl) audioClassEl.textContent = inc.audio_classification || 'Voice Acoustic Trigger';

      const userEl = document.getElementById('detail-user-name');
      if (userEl) userEl.textContent = inc.user_name;

      const batteryEl = document.getElementById('detail-battery');
      if (batteryEl) batteryEl.textContent = `${inc.battery_level}%`;

      const motionEl = document.getElementById('detail-motion-state');
      if (motionEl) motionEl.textContent = inc.motion_state || 'Normal';

      const addressEl = document.getElementById('detail-address');
      if (addressEl) addressEl.textContent = inc.address || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`;

      // Update Logs Timeline
      const logsContainer = document.getElementById('incident-logs-container');
      if (logsContainer) {
        logsContainer.innerHTML = logs.map(l => `
          <div class="log-timeline-entry">
            <div class="log-bullet ${l.log_type === 'TRIGGER' ? 'danger' : l.log_type === 'STATUS' ? 'success' : ''}"></div>
            <div class="log-content">
              <div>${l.message}</div>
              <div class="log-time">${l.timestamp}</div>
            </div>
          </div>
        `).join('');
      }

      // Update Map View
      this.updateMapForIncident(inc);

    } catch (err) {
      console.error("Error loading incident:", err);
    }
  },

  updateMapForIncident(inc) {
    if (!this.map) return;

    const latLng = [inc.latitude, inc.longitude];
    this.map.setView(latLng, 16);

    // Remove old marker
    if (this.incidentMarker) this.map.removeLayer(this.incidentMarker);
    if (this.accuracyCircle) this.map.removeLayer(this.accuracyCircle);

    // Pulsing emergency SOS marker
    const pulseIcon = L.divIcon({
      className: 'emergency-pulse-marker',
      html: `
        <div style="position: relative; width: 44px; height: 44px;">
          <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(255, 42, 95, 0.35); animation: pulseBeacon 1.4s infinite;"></div>
          <div style="position: absolute; top: 8px; left: 8px; width: 28px; height: 28px; border-radius: 50%; background: #ff2a5f; border: 3px solid #fff; box-shadow: 0 0 15px #ff2a5f; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: 800;">SOS</div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    this.incidentMarker = L.marker(latLng, { icon: pulseIcon }).addTo(this.map);
    this.accuracyCircle = L.circle(latLng, {
      radius: inc.accuracy_meters || 12,
      color: '#ff2a5f',
      fillColor: '#ff2a5f',
      fillOpacity: 0.15,
      weight: 1
    }).addTo(this.map);

    // Add Angels' nearby locations (Image 1)
    this.angelMarkers.forEach(m => this.map.removeLayer(m));
    this.angelMarkers = [];

    const angels = [
      { name: "Angela Dinosaur (Sister)", lat: inc.latitude + 0.0028, lng: inc.longitude + 0.0022, icon: '👩' },
      { name: "Marcus Vance (Partner)", lat: inc.latitude - 0.003, lng: inc.longitude - 0.0025, icon: '👨' }
    ];

    angels.forEach(a => {
      const angelIcon = L.divIcon({
        className: 'dashboard-angel-pin',
        html: `
          <div style="background: rgba(157, 78, 221, 0.92); border: 2px solid #fff; border-radius: 14px; padding: 3px 8px; font-size: 11px; font-weight: 700; color: #fff; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 5px;">
            <span>${a.icon}</span> ${a.name}
          </div>
        `,
        iconAnchor: [45, 18]
      });
      const marker = L.marker([a.lat, a.lng], { icon: angelIcon }).addTo(this.map);
      this.angelMarkers.push(marker);
    });
  },

  bindEvents() {
    // Filter tabs (All, Active, Escalated, Resolved)
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.getAttribute('data-filter');
        this.activeFilter = filter;

        document.querySelectorAll('.incident-feed-item').forEach(item => {
          const status = item.getAttribute('data-status');
          if (filter === 'all' || status.toLowerCase() === filter) {
            item.style.display = 'block';
          } else {
            item.style.display = 'none';
          }
        });
      });
    });

    // Escalate to 911 button
    const btnEscalate = document.getElementById('btn-escalate-911');
    if (btnEscalate) {
      btnEscalate.addEventListener('click', async () => {
        if (!this.selectedIncidentId) return;
        if (confirm("Confirm dispatching Priority 1 CAD Packet to 911 & Emergency Services?")) {
          const res = await fetch(`/api/incidents/${this.selectedIncidentId}/escalate`, { method: 'POST' });
          if (res.ok) {
            SentinelAudio.playEmergencyAlarm();
            showToast("Critical Escalation Transmitted", "911 First Responder CAD packet dispatched with GPS breadcrumbs.", "critical");
            this.loadIncidentDetails(this.selectedIncidentId);
          }
        }
      });
    }

    // Resolve safely button
    const btnResolve = document.getElementById('btn-resolve-incident');
    if (btnResolve) {
      btnResolve.addEventListener('click', async () => {
        if (!this.selectedIncidentId) return;
        const notes = prompt("Enter resolution notes:", "Guardian verified user arrived safely.");
        if (notes !== null) {
          const res = await fetch(`/api/incidents/${this.selectedIncidentId}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
          });
          if (res.ok) {
            SentinelAudio.playSafeChime();
            showToast("Incident Resolved", "Marked resolved safely in Sentinel Network.", "success");
            this.loadIncidentDetails(this.selectedIncidentId);
          }
        }
      });
    }

    // Recenter map button
    const btnRecenter = document.getElementById('btn-recenter-map');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', () => {
        if (this.incidentMarker) {
          this.map.setView(this.incidentMarker.getLatLng(), 16);
        }
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => GuardianDashboard.init());
