"""
SQLite Database Engine for Surveillance Records, Users, and Security Events.
"""

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path("C:/Users/ragha/ai-security-system/storage/sentinel.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            created_at TEXT NOT NULL
        )
    """)

    # Surveillance Events Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            time_display TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            camera_name TEXT NOT NULL,
            object_class TEXT NOT NULL,
            confidence REAL NOT NULL,
            track_id INTEGER,
            bbox_json TEXT NOT NULL,
            snapshot_path TEXT,
            video_offset_sec REAL DEFAULT 0,
            is_alert INTEGER DEFAULT 0,
            alert_title TEXT,
            description TEXT
        )
    """)

    conn.commit()
    seed_demo_data(cursor, conn)
    conn.close()
    print(f"Database initialized at {DB_PATH.resolve()}")


def seed_demo_data(cursor, conn):
    """Seed initial realistic security events for instant AI testing."""
    cursor.execute("SELECT COUNT(*) FROM events")
    count = cursor.fetchone()[0]

    # Pre-populate sample events if empty
    if count == 0:
        base_today = datetime.now().strftime("%Y-%m-%d")
        sample_events = [
            {
                "timestamp": f"{base_today}T11:35:12",
                "time_display": "11:35:12 AM",
                "camera_id": "cam-02-abbey-road",
                "camera_name": "Abbey Road Crossing (London)",
                "object_class": "person",
                "confidence": 0.95,
                "track_id": 101,
                "bbox_json": json.dumps([210, 185, 340, 395]),
                "snapshot_path": "snapshots/demo_courier.jpg",
                "video_offset_sec": 42.5,
                "is_alert": 0,
                "alert_title": "Pedestrians on Zebra Crossing",
                "description": "Group of 4 tourists identified crossing zebra crossing outside Abbey Road Studios."
            },
            {
                "timestamp": f"{base_today}T13:45:04",
                "time_display": "01:45:04 PM",
                "camera_id": "cam-01-times-square",
                "camera_name": "Times Square South & Broadway",
                "object_class": "person",
                "confidence": 0.91,
                "track_id": 204,
                "bbox_json": json.dumps([180, 220, 310, 580]),
                "snapshot_path": "snapshots/demo_courier.jpg",
                "video_offset_sec": 120.0,
                "is_alert": 0,
                "alert_title": "Pedestrian in Crosswalk",
                "description": "Pedestrian in dark jacket detected crossing pedestrian plaza."
            },
            {
                "timestamp": f"{base_today}T14:00:22",
                "time_display": "02:00:22 PM",
                "camera_id": "cam-01-times-square",
                "camera_name": "Times Square South & Broadway",
                "object_class": "parcel",
                "confidence": 0.88,
                "track_id": 205,
                "bbox_json": json.dumps([260, 480, 390, 590]),
                "snapshot_path": "snapshots/demo_parcel.jpg",
                "video_offset_sec": 142.2,
                "is_alert": 1,
                "alert_title": "Unattended Parcel Deposited",
                "description": "Unattended parcel left near curb of 7th Avenue pedestrian walkway."
            },
            {
                "timestamp": f"{base_today}T14:01:05",
                "time_display": "02:01:05 PM",
                "camera_id": "cam-01-times-square",
                "camera_name": "Times Square South & Broadway",
                "object_class": "person",
                "confidence": 0.89,
                "track_id": 204,
                "bbox_json": json.dumps([320, 190, 420, 550]),
                "snapshot_path": "snapshots/demo_courier_leave.jpg",
                "video_offset_sec": 165.0,
                "is_alert": 0,
                "alert_title": "Pedestrian Departed",
                "description": "Individual moved north along Broadway towards 47th St."
            },
            {
                "timestamp": f"{base_today}T14:15:30",
                "time_display": "02:15:30 PM",
                "camera_id": "cam-03-salem-west",
                "camera_name": "Salem West Corridor (Tamil Nadu)",
                "object_class": "vehicle",
                "confidence": 0.96,
                "track_id": 310,
                "bbox_json": json.dumps([110, 340, 520, 580]),
                "snapshot_path": "snapshots/demo_vehicle.jpg",
                "video_offset_sec": 210.5,
                "is_alert": 0,
                "alert_title": "Heavy Goods Vehicle Transit",
                "description": "Commercial transport vehicle passed through Salem West junction corridor."
            }
        ]

        for ev in sample_events:
            cursor.execute("""
                INSERT INTO events (
                    timestamp, time_display, camera_id, camera_name, object_class,
                    confidence, track_id, bbox_json, snapshot_path, video_offset_sec,
                    is_alert, alert_title, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ev["timestamp"], ev["time_display"], ev["camera_id"], ev["camera_name"],
                ev["object_class"], ev["confidence"], ev["track_id"], ev["bbox_json"],
                ev["snapshot_path"], ev["video_offset_sec"], ev["is_alert"],
                ev["alert_title"], ev["description"]
            ))
        conn.commit()
        print(f"Seeded {len(sample_events)} baseline surveillance events.")


def insert_event(
    timestamp: str,
    camera_id: str,
    camera_name: str,
    object_class: str,
    confidence: float,
    track_id: int,
    bbox: list,
    snapshot_path: str = None,
    video_offset_sec: float = 0.0,
    is_alert: bool = False,
    alert_title: str = None,
    description: str = None,
):
    conn = get_db()
    cursor = conn.cursor()
    dt = datetime.fromisoformat(timestamp)
    time_display = dt.strftime("%I:%M:%S %p")

    cursor.execute("""
        INSERT INTO events (
            timestamp, time_display, camera_id, camera_name, object_class,
            confidence, track_id, bbox_json, snapshot_path, video_offset_sec,
            is_alert, alert_title, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        timestamp, time_display, camera_id, camera_name, object_class,
        confidence, track_id, json.dumps(bbox), snapshot_path, video_offset_sec,
        1 if is_alert else 0, alert_title or f"{object_class.title()} Detected",
        description or f"{object_class.title()} recorded at {time_display}"
    ))
    event_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return event_id


def query_events(
    camera_id: str = None,
    object_class: str = None,
    is_alert: bool = None,
    limit: int = 50,
):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM events WHERE 1=1"
    params = []

    if camera_id:
        query += " AND camera_id = ?"
        params.append(camera_id)
    if object_class:
        query += " AND object_class = ?"
        params.append(object_class)
    if is_alert is not None:
        query += " AND is_alert = ?"
        params.append(1 if is_alert else 0)

    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


if __name__ == "__main__":
    init_db()
