"""
F1 Race Data Generator for Web Dashboard
=========================================

This script generates race telemetry data for the F1 Dashboard 2026 web application.
It uses FastF1 to fetch race data and OpenF1 API for team radio clips.

Features:
---------
- Extracts driver positions, telemetry (speed, throttle, brake, DRS, gear)
- Fetches weather data (track temp, air temp, humidity, wind, rain)
- Downloads team radio clips from OpenF1 API (2023+ seasons only)
- Outputs JSON files optimized for web playback

Output Files:
-------------
- static_data/{year}/{round}/race_telemetry.json - Full telemetry with all frames
- static_data/{year}/{round}/race_data.json - Metadata only (lighter file)

Usage:
------
    python generate_data.py

    The script is configured at the bottom to generate data for a specific race.
    Modify the year and round_number in the __main__ section as needed.

Dependencies:
-------------
- fastf1: For F1 telemetry data
- numpy/pandas: Data processing
- urllib: For OpenF1 API calls

Author: F1 Dashboard Team
Last Updated: December 2025
"""

import fastf1
import fastf1.plotting
import json
import numpy as np
import os
import pandas as pd
from datetime import timedelta, datetime
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
import sys

# Add parent directory for imports (allows running from /python directory)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.f1_data import get_race_telemetry, enable_cache, load_session, get_driver_colors

# Initialize FastF1 cache for faster subsequent runs
enable_cache()


# =============================================================================
# OpenF1 API Integration for Team Radio
# =============================================================================


def get_openf1_session_key(year: int, round_number: int, session_type: str = 'R') -> int | None:
    """
    Get the OpenF1 session_key for a given race session.
    Returns None if not found (e.g., for races before 2023).
    """
    # Map session types to OpenF1 session names
    session_name_map = {
        'R': 'Race',
        'Q': 'Qualifying',
        'S': 'Sprint',
        'SQ': 'Sprint Qualifying',
        'FP1': 'Practice 1',
        'FP2': 'Practice 2',
        'FP3': 'Practice 3',
    }
    session_name = session_name_map.get(session_type, 'Race')
    
    try:
        # First get all sessions for the year
        url = f"https://api.openf1.org/v1/sessions?year={year}&session_name={session_name}"
        print(f"Fetching OpenF1 sessions: {url}")
        
        response = urlopen(url, timeout=10)
        sessions = json.loads(response.read().decode('utf-8'))
        
        # OpenF1 doesn't have round numbers directly, so we need to find the correct meeting
        # by counting races in order of date
        race_sessions = sorted(sessions, key=lambda x: x.get('date_start', ''))
        
        if round_number <= len(race_sessions):
            session = race_sessions[round_number - 1]  # 0-indexed
            session_key = session.get('session_key')
            print(f"Found OpenF1 session_key: {session_key} for {session.get('circuit_short_name', 'Unknown')}")
            return session_key
        else:
            print(f"Round {round_number} not found in OpenF1 data (only {len(race_sessions)} sessions)")
            return None
            
    except (URLError, HTTPError) as e:
        print(f"Failed to fetch OpenF1 session info: {e}")
        return None
    except Exception as e:
        print(f"Error getting OpenF1 session_key: {e}")
        return None


def fetch_team_radio(session_key: int, race_start_time: datetime = None) -> list:
    """
    Fetch team radio clips from OpenF1 API for a given session.
    Returns a list of radio clip info with relative timestamps.
    """
    if session_key is None:
        return []
    
    try:
        url = f"https://api.openf1.org/v1/team_radio?session_key={session_key}"
        print(f"Fetching team radio from OpenF1: {url}")
        
        response = urlopen(url, timeout=15)
        radio_clips = json.loads(response.read().decode('utf-8'))
        
        if not radio_clips:
            print("No team radio clips found for this session")
            return []
        
        print(f"Found {len(radio_clips)} team radio clips")
        
        # Sort by timestamp
        radio_clips = sorted(radio_clips, key=lambda x: x.get('date', ''))
        
        # Get the first clip time as our reference point if no race_start_time
        if race_start_time is None and radio_clips:
            first_time_str = radio_clips[0].get('date', '')
            if first_time_str:
                race_start_time = datetime.fromisoformat(first_time_str.replace('+00:00', '+00:00'))
        
        # Build driver number to code mapping (we'll use driver numbers from the clips)
        processed_clips = []
        for clip in radio_clips:
            try:
                clip_time_str = clip.get('date', '')
                if not clip_time_str:
                    continue
                    
                clip_time = datetime.fromisoformat(clip_time_str.replace('+00:00', '+00:00'))
                
                # Calculate relative time from start
                if race_start_time:
                    relative_time = (clip_time - race_start_time).total_seconds()
                else:
                    relative_time = 0
                
                processed_clips.append({
                    "t": round(relative_time, 1),
                    "driverNumber": clip.get('driver_number'),
                    "url": clip.get('recording_url', '')
                })
            except Exception as e:
                print(f"Error processing radio clip: {e}")
                continue
        
        print(f"Processed {len(processed_clips)} radio clips with timestamps")
        return processed_clips
        
    except (URLError, HTTPError) as e:
        print(f"Failed to fetch team radio: {e}")
        return []
    except Exception as e:
        print(f"Error fetching team radio: {e}")
        return []

def convert_to_json_serializable(obj):
    if isinstance(obj, (np.int64, np.int32, np.int16, np.int8)):
        return int(obj)
    elif isinstance(obj, (np.float64, np.float32, float)):
        # Handle NaN and Inf values which are not valid JSON
        if np.isnan(obj) or np.isinf(obj):
            return 0
        return float(obj)
    elif isinstance(obj, (np.ndarray,)):
        # Replace NaN values in arrays
        arr = np.array(obj)
        arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
        return arr.tolist()
    elif isinstance(obj, (pd.Timestamp,)):
        return obj.isoformat()
    elif isinstance(obj, (timedelta,)):
        return obj.total_seconds()
    return str(obj)


def sanitize_for_json(obj):
    """Recursively sanitize data to ensure all NaN/Inf values are replaced with 0."""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return 0
        return obj
    elif isinstance(obj, (np.float64, np.float32)):
        if np.isnan(obj) or np.isinf(obj):
            return 0
        return float(obj)
    elif isinstance(obj, (np.int64, np.int32, np.int16, np.int8)):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        arr = np.nan_to_num(obj, nan=0.0, posinf=0.0, neginf=0.0)
        return arr.tolist()
    else:
        return obj

def generate_round_data(year, round_number, session_type='R'):
    print(f"Loading Session: {year} Round {round_number} ({session_type})")
    session = load_session(year, round_number, session_type)

    # Basic Info
    event_info = {
        "eventName": session.event.EventName,
        "roundNumber": int(session.event.RoundNumber),
        "country": session.event.Country,
        "location": session.event.Location,
        "sessionType": session_type,
        "year": year
    }

    print("Processing telemetry (this may take a few minutes)...")
    
    # Get full race telemetry using existing logic
    race_data = get_race_telemetry(session, session_type=session_type)
    
    # Track map data (using fastest lap)
    fastest_lap = session.laps.pick_fastest()
    track_telemetry = fastest_lap.get_telemetry()
    track_map = {
        "x": track_telemetry['X'].tolist(),
        "y": track_telemetry['Y'].tolist()
    }

    # Driver info - build list and number-to-code mapping
    drivers = session.drivers
    driver_list = []
    driver_number_to_code = {}  # For mapping team radio driver numbers to codes
    
    for driver_id in drivers:
        drv = session.get_driver(driver_id)
        driver_code = drv['Abbreviation']
        driver_num = str(drv['DriverNumber'])
        
        driver_list.append({
            "code": driver_code,
            "number": driver_num,
            "color": fastf1.plotting.get_driver_color(driver_code, session=session),
            "team": drv['TeamName'],
            "fullName": drv['FullName']
        })
        driver_number_to_code[int(drv['DriverNumber'])] = driver_code

    # Sample frames for web (every 10th frame to reduce file size)
    sampled_frames = race_data['frames'][::10]
    
    # Fetch team radio from OpenF1 API (2023+ only)
    print("\nFetching team radio from OpenF1...")
    session_key = get_openf1_session_key(year, round_number, session_type)
    raw_team_radio = fetch_team_radio(session_key)
    
    # Add driver codes to team radio clips
    team_radio = []
    for clip in raw_team_radio:
        driver_num = clip.get('driverNumber')
        driver_code = driver_number_to_code.get(driver_num, f"#{driver_num}")
        team_radio.append({
            "t": clip['t'],
            "driver": driver_code,
            "driverNumber": driver_num,
            "url": clip['url']
        })
    
    print(f"Added {len(team_radio)} team radio clips to race data")
    
    output_data = {
        "event": event_info,
        "track": track_map,
        "drivers": driver_list,
        "driverColors": race_data['driver_colors'],
        "trackStatuses": race_data['track_statuses'],
        "totalLaps": race_data['total_laps'],
        "lapTiming": race_data.get('lap_timing', {}),  # Lap times, sectors, grid positions
        "frames": sampled_frames,
        "frameRate": 2.5,  # 25 FPS / 10 = 2.5 FPS sampled
        "teamRadio": team_radio  # Team radio clips with timestamps
    }

    # Ensure directories exist
    output_dir = f"static_data/{year}/{round_number}"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    output_file = f"{output_dir}/race_telemetry.json"
    # Sanitize to ensure no NaN/Inf values that break JSON parsing
    sanitized_data = sanitize_for_json(output_data)
    with open(output_file, 'w') as f:
        json.dump(sanitized_data, f, default=convert_to_json_serializable)

    print(f"Full telemetry saved to {output_file}")
    
    # Also save a smaller metadata file
    meta_file = f"{output_dir}/race_data.json"
    meta_data = {
        "event": event_info,
        "track": track_map,
        "drivers": driver_list,
        "totalLaps": race_data['total_laps'],
        "totalFrames": len(sampled_frames)
    }
    with open(meta_file, 'w') as f:
        json.dump(meta_data, f, indent=2, default=convert_to_json_serializable)
    
    print(f"Metadata saved to {meta_file}")

if __name__ == "__main__":
    generate_round_data(2025, 12, 'R')
