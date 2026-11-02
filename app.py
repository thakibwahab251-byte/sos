"""
SilentSOS / SENTINEL AI - Intelligent Emergency Detection Platform
Flask Web Application with Interactive Mobile Simulator, Guardian Operations Dashboard,
and Sentinel AI Architecture Explorer.
"""

import json
import time
import queue
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, Response, redirect, url_for

from database import init_db, query_db, execute_db
from ai_engine import SentinelAIEngine

app = Flask(__name__)
app.config["SECRET_KEY"] = "sentinel-ai-silent-sos-secret-token-99"

# In-memory queue list for Server-Sent Events (SSE) live updates
sse_subscribers = []


def notify_sse(event_type, data):
    """Broadcast an event to all connected dashboard SSE subscribers."""
    payload = json.dumps({"event": event_type, "data": data, "timestamp": time.time()})
    dead_subscribers = []
    for q in sse_subscribers:
        try:
            q.put_nowait(payload)
        except Exception:
            dead_subscribers.append(q)
    for dq in dead_subscribers:
        if dq in sse_subscribers:
            sse_subscribers.remove(dq)


# ==========================================
# PAGE ROUTES
# ==========================================

@app.route("/")
def index():
    """Landing page: Problem, Innovation, Architecture Overview, and Quick Start."""
    active_incidents = query_db("SELECT COUNT(*) as count FROM incidents WHERE status = 'ACTIVE'", one=True)["count"]
    total_contacts = query_db("SELECT COUNT(*) as count FROM contacts", one=True)["count"]
    phrases = query_db("SELECT phrase, category FROM distress_phrases WHERE is_active = 1")
    return render_template(
        "index.html",
        active_incidents=active_incidents,
        total_contacts=total_contacts,
        phrases=phrases
    )


@app.route("/mobile")
def mobile_simulator():
    """Interactive Mobile App Simulator (SilentSOS on Android / Flutter mockup)."""
    contacts = query_db("SELECT * FROM contacts ORDER BY is_primary DESC, name ASC")
    active_session = query_db(
        "SELECT * FROM safety_sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1",
        one=True
    )
    phrases = query_db("SELECT phrase FROM distress_phrases WHERE is_active = 1")
    return render_template(
        "mobile.html",
        contacts=contacts,
        active_session=active_session,
        phrases=[p["phrase"] for p in phrases]
    )


@app.route("/dashboard")
def dashboard():
    """Live Incident Tracking and Guardian Operations Center."""
    incidents = query_db("SELECT * FROM incidents ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 WHEN status = 'ESCALATED' THEN 1 ELSE 2 END, id DESC")
    contacts = query_db("SELECT * FROM contacts ORDER BY is_primary DESC")
    active_count = sum(1 for inc in incidents if inc["status"] in ["ACTIVE", "ESCALATED"])
    return render_template(
        "dashboard.html",
        incidents=incidents,
        contacts=contacts,
        active_count=active_count
    )


@app.route("/architecture")
def architecture():
    """Interactive Sentinel AI Architecture Diagram & Signal Fusion Sandbox."""
    return render_template("architecture.html")


@app.route("/contacts")
def contacts_view():
    """Manage Guardian Angels & Emergency Responders."""
    contacts = query_db("SELECT * FROM contacts ORDER BY is_primary DESC, name ASC")
    return render_template("contacts.html", contacts=contacts)


@app.route("/sessions")
def sessions_view():
    """Safety Sessions: 'Walk with Me', Timed Check-in, Route Monitoring."""
    sessions = query_db("SELECT * FROM safety_sessions ORDER BY id DESC")
    return render_template("sessions.html", sessions=sessions)


# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.route("/api/sos/trigger", methods=["POST"])
def api_sos_trigger():
    """
    Emergency SOS Trigger endpoint.
    Called when voice distress detected, secret gesture activated, or manual button held.
    """
    payload = request.get_json() or {}
    result = SentinelAIEngine.create_incident(payload)

    # Fetch newly created full incident record
    incident = query_db("SELECT * FROM incidents WHERE id = ?", (result["id"],), one=True)
    logs = query_db("SELECT * FROM incident_logs WHERE incident_id = ? ORDER BY id DESC", (result["id"],))

    # Broadcast to web dashboard via SSE
    notify_sse("new_incident", {
        "incident": dict(incident),
        "logs": [dict(l) for l in logs]
    })

    return jsonify({
        "success": True,
        "incident": dict(incident),
        "message": f"Emergency Mode Engaged: {result['threat_level']} threat ({result['threat_score']}% confidence). Guardian Angels notified."
    }), 201


@app.route("/api/incidents", methods=["GET"])
def api_get_incidents():
    """Get list of incidents with optional status filter."""
    status = request.args.get("status")
    if status:
        incidents = query_db("SELECT * FROM incidents WHERE status = ? ORDER BY id DESC", (status,))
    else:
        incidents = query_db("SELECT * FROM incidents ORDER BY id DESC")
    return jsonify([dict(inc) for inc in incidents])


@app.route("/api/incidents/<int:inc_id>", methods=["GET"])
def api_get_incident_detail(inc_id):
    """Get single incident details with audit logs."""
    incident = query_db("SELECT * FROM incidents WHERE id = ?", (inc_id,), one=True)
    if not incident:
        return jsonify({"error": "Incident not found"}), 404
    logs = query_db("SELECT * FROM incident_logs WHERE incident_id = ? ORDER BY id DESC", (inc_id,))
    return jsonify({
        "incident": dict(incident),
        "logs": [dict(l) for l in logs]
    })


@app.route("/api/incidents/<int:inc_id>/resolve", methods=["POST"])
def api_resolve_incident(inc_id):
    """Resolve an incident safely with guardian notes."""
    payload = request.get_json() or {}
    notes = payload.get("notes", "Marked resolved safely by guardian/user.")
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    execute_db("UPDATE incidents SET status = 'RESOLVED', updated_at = ?, guardian_notes = ? WHERE id = ?",
               (now_str, notes, inc_id))
    execute_db("INSERT INTO incident_logs (incident_id, log_type, message, timestamp) VALUES (?, ?, ?, ?)",
               (inc_id, "STATUS", f"Incident resolved: {notes}", now_str))

    notify_sse("incident_updated", {"id": inc_id, "status": "RESOLVED"})
    return jsonify({"success": True, "status": "RESOLVED"})


@app.route("/api/incidents/<int:inc_id>/escalate", methods=["POST"])
def api_escalate_incident(inc_id):
    """Escalate incident to Tier 3: Emergency Dispatch 911 / Police / Campus Patrol."""
    payload = request.get_json() or {}
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    execute_db("UPDATE incidents SET status = 'ESCALATED', threat_score = 99, threat_level = 'CRITICAL', updated_at = ? WHERE id = ?",
               (now_str, inc_id))
    execute_db("INSERT INTO incident_logs (incident_id, log_type, message, timestamp) VALUES (?, ?, ?, ?)",
               (inc_id, "DISPATCH", "CRITICAL ESCALATION: Emergency 911 / First Responder CAD integration packet dispatched with live GPS tracking", now_str))

    notify_sse("incident_updated", {"id": inc_id, "status": "ESCALATED"})
    return jsonify({"success": True, "status": "ESCALATED"})


@app.route("/api/incidents/<int:inc_id>/cancel", methods=["POST"])
def api_cancel_incident(inc_id):
    """Cancel incident during grace period (False Alarm control)."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    execute_db("UPDATE incidents SET status = 'CANCELLED', updated_at = ? WHERE id = ?", (now_str, inc_id))
    execute_db("INSERT INTO incident_logs (incident_id, log_type, message, timestamp) VALUES (?, ?, ?, ?)",
               (inc_id, "STATUS", "Distress alert cancelled during false-alarm countdown with PIN", now_str))

    notify_sse("incident_updated", {"id": inc_id, "status": "CANCELLED"})
    return jsonify({"success": True, "status": "CANCELLED"})


@app.route("/api/incidents/<int:inc_id>/location", methods=["POST"])
def api_update_location(inc_id):
    """Update live location breadcrumbs for active incident."""
    payload = request.get_json() or {}
    lat = float(payload.get("latitude", 37.7749))
    lng = float(payload.get("longitude", -122.4194))
    accuracy = float(payload.get("accuracy", 5.0))
    address = payload.get("address")
    battery = payload.get("battery_level")

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    update_fields = ["latitude = ?", "longitude = ?", "accuracy_meters = ?", "updated_at = ?"]
    params = [lat, lng, accuracy, now_str]

    if address:
        update_fields.append("address = ?")
        params.append(address)
    if battery is not None:
        update_fields.append("battery_level = ?")
        params.append(battery)

    params.append(inc_id)
    execute_db(f"UPDATE incidents SET {', '.join(update_fields)} WHERE id = ?", tuple(params))

    notify_sse("location_update", {
        "id": inc_id,
        "latitude": lat,
        "longitude": lng,
        "accuracy": accuracy,
        "battery": battery
    })
    return jsonify({"success": True})


@app.route("/api/voice/analyze", methods=["POST"])
def api_analyze_voice():
    """
    Real-time speech recognition test endpoint.
    Tests voice input against distress keywords and acoustic stress without full trigger.
    """
    payload = request.get_json() or {}
    transcript = payload.get("transcript", "")
    stress = float(payload.get("stress", 0.5))
    analysis = SentinelAIEngine.analyze_voice_input(transcript, acoustic_stress=stress)
    return jsonify(analysis)


@app.route("/api/fusion/evaluate", methods=["POST"])
def api_evaluate_fusion():
    """
    Interactive Signal Fusion Sandbox for the Architecture page.
    Allows adjusting Voice, Motion, Trigger, and Context sliders to see real-time AI decision score.
    """
    payload = request.get_json() or {}
    v_score = int(payload.get("voice_score", 0))
    m_score = int(payload.get("motion_score", 0))
    trigger_type = payload.get("trigger_type", "voice_distress")
    in_session = bool(payload.get("in_session", False))
    is_overdue = bool(payload.get("is_overdue", False))

    voice_analysis = {"score": v_score, "detected": v_score > 50}
    motion_analysis = {"threat_score": m_score, "classification": "Custom test"}
    context = {"is_active": in_session, "is_overdue": is_overdue}

    fusion = SentinelAIEngine.fuse_signals(voice_analysis, motion_analysis, trigger_type, context)
    return jsonify(fusion)


# ==========================================
# CONTACTS API
# ==========================================

@app.route("/api/contacts", methods=["GET", "POST"])
def api_contacts():
    if request.method == "POST":
        data = request.get_json() or {}
        name = data.get("name", "").strip()
        rel = data.get("relationship", "Guardian Angel").strip()
        phone = data.get("phone", "").strip()
        email = data.get("email", "").strip()
        is_primary = 1 if data.get("is_primary") else 0
        sms = 1 if data.get("notify_sms", True) else 0
        call = 1 if data.get("notify_call", True) else 0

        if not name or not phone:
            return jsonify({"error": "Name and phone are required"}), 400

        if is_primary:
            execute_db("UPDATE contacts SET is_primary = 0")

        cid = execute_db("""
            INSERT INTO contacts (name, relationship, phone, email, is_primary, notify_sms, notify_call)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name, rel, phone, email, is_primary, sms, call), return_id=True)

        return jsonify({"success": True, "id": cid}), 201

    contacts = query_db("SELECT * FROM contacts ORDER BY is_primary DESC, name ASC")
    return jsonify([dict(c) for c in contacts])


@app.route("/api/contacts/<int:cid>", methods=["DELETE"])
def api_delete_contact(cid):
    execute_db("DELETE FROM contacts WHERE id = ?", (cid,))
    return jsonify({"success": True})


# ==========================================
# SAFETY SESSIONS API
# ==========================================

@app.route("/api/sessions/start", methods=["POST"])
def api_start_session():
    data = request.get_json() or {}
    title = data.get("title", "Active Safety Transit").strip()
    duration = int(data.get("duration_minutes", 15))
    target = data.get("destination", "Home").strip()
    lat = float(data.get("latitude", 37.7749))
    lng = float(data.get("longitude", -122.4194))

    now_ts = int(datetime.now(timezone.utc).timestamp())
    code = f"SES-{now_ts % 10000}"

    sid = execute_db("""
        INSERT INTO safety_sessions (session_code, user_name, title, duration_minutes, target_destination, current_lat, current_lng, status)
        VALUES (?, 'Sophia Lin', ?, ?, ?, ?, ?, 'ACTIVE')
    """, (code, title, duration, target, lat, lng), return_id=True)

    return jsonify({"success": True, "session_id": sid, "session_code": code})


@app.route("/api/sessions/<int:sid>/checkin", methods=["POST"])
def api_session_checkin(sid):
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    execute_db("UPDATE safety_sessions SET last_checkin = ? WHERE id = ?", (now_str, sid))
    return jsonify({"success": True, "message": "Check-in recorded. Angels notified that you are safe."})


@app.route("/api/sessions/<int:sid>/end", methods=["POST"])
def api_session_end(sid):
    execute_db("UPDATE safety_sessions SET status = 'COMPLETED' WHERE id = ?", (sid,))
    return jsonify({"success": True, "message": "Safety session completed successfully."})


# ==========================================
# DISTRESS PHRASES API
# ==========================================

@app.route("/api/phrases", methods=["GET", "POST"])
def api_phrases():
    if request.method == "POST":
        data = request.get_json() or {}
        phrase = data.get("phrase", "").strip().lower()
        category = data.get("category", "discreet")
        if not phrase:
            return jsonify({"error": "Phrase cannot be empty"}), 400

        try:
            pid = execute_db("""
                INSERT INTO distress_phrases (phrase, category, confidence_threshold, is_active)
                VALUES (?, ?, 0.80, 1)
            """, (phrase, category), return_id=True)
            return jsonify({"success": True, "id": pid, "phrase": phrase}), 201
        except Exception as e:
            return jsonify({"error": "Phrase already exists or invalid"}), 400

    phrases = query_db("SELECT * FROM distress_phrases WHERE is_active = 1")
    return jsonify([dict(p) for p in phrases])


# ==========================================
# SERVER-SENT EVENTS (SSE) STREAM
# ==========================================

@app.route("/api/stream")
def sse_stream():
    """SSE endpoint for live real-time dashboard notifications."""
    def event_stream():
        q = queue.Queue(maxsize=50)
        sse_subscribers.append(q)
        # Send initial connection handshake
        yield f"data: {json.dumps({'event': 'connected', 'timestamp': time.time()})}\n\n"
        try:
            while True:
                try:
                    msg = q.get(timeout=20.0)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    # Keep-alive heartbeat comment
                    yield ": ping\n\n"
        except GeneratorExit:
            if q in sse_subscribers:
                sse_subscribers.remove(q)

    return Response(event_stream(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    })


# ==========================================
# APP INITIALIZATION
# ==========================================

with app.app_context():
    init_db()

if __name__ == "__main__":
    init_db()
    print("SilentSOS - SENTINEL AI Server starting on http://127.0.0.1:5000 ...")
    app.run(host="0.0.0.0", port=5000, debug=True)
