"""
Database module for SilentSOS - SENTINEL AI Emergency Detection System.
Provides thread-safe SQLite operations, schema migration, and initial seed data.
"""

import sqlite3
import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "silent_sos.db")


def get_db_connection():
    """Get a connection to the SQLite database with row factory enabled."""
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db():
    """Initialize database tables and populate initial seed data if empty."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            relationship TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NOT NULL,
            is_primary INTEGER DEFAULT 0,
            notify_sms INTEGER DEFAULT 1,
            notify_call INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_code TEXT UNIQUE NOT NULL,
            user_name TEXT NOT NULL,
            trigger_type TEXT NOT NULL,         -- 'voice_distress', 'secret_gesture', 'motion_anomaly', 'session_timeout', 'manual_sos'
            distress_phrase TEXT,
            audio_classification TEXT,         -- 'Scream', 'Glass Break', 'Aggressive Voice', 'Distress Keyword'
            threat_score INTEGER NOT NULL,      -- 0 to 100
            threat_level TEXT NOT NULL,         -- 'LOW', 'ELEVATED', 'HIGH', 'CRITICAL'
            status TEXT NOT NULL,               -- 'ACTIVE', 'ESCALATED', 'RESOLVED', 'CANCELLED'
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            accuracy_meters REAL DEFAULT 8.5,
            address TEXT,
            battery_level INTEGER DEFAULT 84,
            motion_state TEXT DEFAULT 'Normal',  -- 'Normal', 'Fall Impact', 'Violent Shake', 'Immobile'
            false_alarm_seconds_left INTEGER DEFAULT 0,
            guardian_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS incident_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id INTEGER NOT NULL,
            log_type TEXT NOT NULL,             -- 'TRIGGER', 'VOICE_AI', 'MOTION', 'DISPATCH', 'STATUS', 'LOCATION'
            message TEXT NOT NULL,
            metadata_json TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS safety_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_code TEXT UNIQUE NOT NULL,
            user_name TEXT NOT NULL,
            title TEXT NOT NULL,                -- e.g. 'Walking back from Library to Dorm'
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            duration_minutes INTEGER NOT NULL,
            target_destination TEXT,
            current_lat REAL,
            current_lng REAL,
            status TEXT NOT NULL,               -- 'ACTIVE', 'COMPLETED', 'EXPIRED_SOS', 'CANCELLED'
            checkin_interval_mins INTEGER DEFAULT 10,
            last_checkin TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            next_checkin_due TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS distress_phrases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phrase TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,             -- 'high_urgency', 'medium_urgency', 'discreet'
            confidence_threshold REAL DEFAULT 0.70,
            is_active INTEGER DEFAULT 1
        );
    """)

    # Seed contacts if empty
    cursor.execute("SELECT COUNT(*) FROM contacts")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
            INSERT INTO contacts (name, relationship, phone, email, is_primary, notify_sms, notify_call)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            ("Angela Dinosaur", "Sister (Guardian Angel)", "+1 (555) 234-8901", "angela@family-sos.org", 1, 1, 1),
            ("Jane Dinosaur", "Mother", "+1 (555) 876-5432", "jane.d@family-sos.org", 0, 1, 1),
            ("Marcus Vance", "Partner", "+1 (555) 432-1098", "marcus.v@sentinel.net", 0, 1, 0),
            ("Metro Campus Security", "Campus Safety Dispatch", "+1 (555) 911-0022", "dispatch@campus-police.edu", 0, 1, 1),
        ])

    # Seed distress phrases
    cursor.execute("SELECT COUNT(*) FROM distress_phrases")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
            INSERT INTO distress_phrases (phrase, category, confidence_threshold, is_active)
            VALUES (?, ?, ?, ?)
        """, [
            ("help me", "high_urgency", 0.75, 1),
            ("save me", "high_urgency", 0.80, 1),
            ("emergency", "high_urgency", 0.75, 1),
            ("stop please", "high_urgency", 0.70, 1),
            ("leave me alone", "high_urgency", 0.75, 1),
            ("code red", "discreet", 0.85, 1),
            ("someone is following me", "high_urgency", 0.80, 1),
            ("call the angels", "discreet", 0.85, 1),
            ("pineapple", "discreet", 0.90, 1)  # custom hidden codeword
        ])

    # Seed a demo active incident and historical resolved incident if none exist
    cursor.execute("SELECT COUNT(*) FROM incidents")
    if cursor.fetchone()[0] == 0:
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        # Active incident matching image 1
        cursor.execute("""
            INSERT INTO incidents (
                incident_code, user_name, trigger_type, distress_phrase, audio_classification,
                threat_score, threat_level, status, latitude, longitude, accuracy_meters,
                address, battery_level, motion_state, false_alarm_seconds_left, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "INC-84920", "Sophia Lin", "voice_distress", "someone is following me",
            "Distress Keyword + Elevated Stress Acoustics", 88, "CRITICAL", "ACTIVE",
            37.7749, -122.4194, 5.2,
            "4th St & Mission St, San Francisco, CA", 76, "Rapid Pace / Tremor", 0,
            now_str, now_str
        ))
        inc_id = cursor.lastrowid

        cursor.executemany("""
            INSERT INTO incident_logs (incident_id, log_type, message, metadata_json, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, [
            (inc_id, "TRIGGER", "Voice AI trigger matched phrase: 'someone is following me' (Confidence: 94.2%)", json.dumps({"source": "Whisper-Vosk-Edge", "decibels": -12.4}), now_str),
            (inc_id, "VOICE_AI", "Acoustic stress pattern detected elevated heartrate pitch jitter", json.dumps({"stress_index": 0.89}), now_str),
            (inc_id, "MOTION", "Motion sensor detected sudden directional sprint then hesitation", json.dumps({"anomaly_score": 0.82}), now_str),
            (inc_id, "DISPATCH", "SMS dispatch transmitted to 3 Angels (Angela Dinosaur, Jane Dinosaur, Marcus Vance)", json.dumps({"recipients": 3, "carrier": "Twilio/FCM"}), now_str),
            (inc_id, "LOCATION", "High-precision GPS telemetry locked at 37.7749, -122.4194 (5m radius)", json.dumps({"fix": "3D_GPS"}), now_str),
        ])

        # Past resolved incident for history
        cursor.execute("""
            INSERT INTO incidents (
                incident_code, user_name, trigger_type, distress_phrase, audio_classification,
                threat_score, threat_level, status, latitude, longitude, accuracy_meters,
                address, battery_level, motion_state, false_alarm_seconds_left, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "INC-84918", "Sophia Lin", "secret_gesture", "Volume Key Combo (Down-Up-Down)",
            "Manual Discreet Trigger", 92, "CRITICAL", "RESOLVED",
            37.7833, -122.4167, 4.0,
            "Market St & 6th St, San Francisco, CA", 62, "Normal", 0,
            now_str, now_str
        ))
        past_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO incident_logs (incident_id, log_type, message, timestamp)
            VALUES (?, ?, ?, ?)
        """, (past_id, "STATUS", "Incident resolved safely by user PIN verification", now_str))

    # Seed safety session
    cursor.execute("SELECT COUNT(*) FROM safety_sessions")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO safety_sessions (
                session_code, user_name, title, duration_minutes, target_destination,
                current_lat, current_lng, status, checkin_interval_mins
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "SES-1049", "Sophia Lin", "Late Transit Home from Downtown", 25,
            "742 Evergreen Terrace, North Heights", 37.7749, -122.4194, "ACTIVE", 10
        ))

    conn.commit()
    conn.close()


def query_db(query, args=(), one=False):
    """Execute a SELECT query and return rows as dictionaries."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(query, args)
    r = cur.fetchall()
    conn.close()
    return (dict(r[0]) if r else None) if one else [dict(row) for row in r]


def execute_db(query, args=(), return_id=False):
    """Execute an INSERT, UPDATE, or DELETE query and commit."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(query, args)
    last_id = cur.lastrowid if return_id else None
    conn.commit()
    conn.close()
    return last_id
