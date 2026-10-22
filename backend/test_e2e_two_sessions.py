import requests
import time
import json

BASE = "http://127.0.0.1:8000/api/v1"

def run():
    print("=== 1. Setup Host & Attendee Accounts ===")
    pwd = "Password123!"
    host_email = f"host_{int(time.time())}@example.com"
    requests.post(f"{BASE}/auth/register", json={"name": "Alice Host", "email": host_email, "password": pwd})
    h_res = requests.post(f"{BASE}/auth/login", json={"email": host_email, "password": pwd}).json()
    host_token = h_res["access_token"]
    host_headers = {"Authorization": f"Bearer {host_token}"}
    host_me = requests.get(f"{BASE}/auth/me", headers=host_headers).json()
    host_id = host_me["id"]

    att_email = f"attendee_{int(time.time())}@example.com"
    requests.post(f"{BASE}/auth/register", json={"name": "Bob Engineer", "email": att_email, "password": pwd})
    a_res = requests.post(f"{BASE}/auth/login", json={"email": att_email, "password": pwd}).json()
    att_token = a_res["access_token"]
    att_headers = {"Authorization": f"Bearer {att_token}"}
    att_me = requests.get(f"{BASE}/auth/me", headers=att_headers).json()
    att_id = att_me["id"]

    print("=== 2. Create Workspace and Add Attendee ===")
    ws_res = requests.post(
        f"{BASE}/workspaces",
        json={"name": "Architecture & Engineering Workspace", "description": "Core product team"},
        headers=host_headers,
    ).json()
    ws_id = ws_res["id"]

    # Create a project
    proj_res = requests.post(
        f"{BASE}/workspaces/{ws_id}/projects",
        json={"name": "Sprint 42 - Cloud Migration"},
        headers=host_headers,
    ).json()
    proj_id = proj_res["id"]

    # Add Bob to workspace
    requests.post(
        f"{BASE}/workspaces/{ws_id}/members",
        json={"email": att_email, "role": "MEMBER"},
        headers=host_headers,
    )

    print("=== 3. Host Creates Participant-Aware Meeting ===")
    mtg_res = requests.post(
        f"{BASE}/workspaces/{ws_id}/meetings",
        json={
            "title": "Cloud Architecture & Security Sync",
            "description": "Planning OAuth tokens, database indexing, and sprint retrospective.",
            "project_id": proj_id,
            "recording_consent": True,
        },
        headers=host_headers,
    ).json()
    meeting_id = mtg_res["id"]
    code = mtg_res["meeting_code"]
    print(f"Meeting created: ID={meeting_id}, Code={code}")

    # Both join to establish LiveKit participant identities
    requests.post(f"{BASE}/meetings/{meeting_id}/join", headers=host_headers)
    requests.post(f"{BASE}/meetings/join-by-code/{code}", headers=att_headers)

    print("=== 4. Capture & Ingest Separate Participant Tracks ===")
    # Statement 1 from Host
    s1 = requests.post(
        f"{BASE}/meetings/{meeting_id}/transcript",
        json={
            "segments": [
                {
                    "content": "Welcome team. Let's discuss our deliverables for the Cloud Migration milestone.",
                    "speaker_name": "Alice Host",
                    "speaker_user_id": host_id,
                    "start_time_ms": 1200,
                    "end_time_ms": 5400,
                }
            ]
        },
        headers=host_headers,
    ).json()

    # Statement 2 from Attendee (Bob)
    s2 = requests.post(
        f"{BASE}/meetings/{meeting_id}/transcript",
        json={
            "segments": [
                {
                    "content": "Bob Engineer will implement the OAuth token refresh mechanism by next Monday.",
                    "speaker_name": "Bob Engineer",
                    "speaker_user_id": att_id,
                    "start_time_ms": 6100,
                    "end_time_ms": 11500,
                }
            ]
        },
        headers=att_headers,
    ).json()

    # Statement 3 from Host (proposing calendar event)
    s3 = requests.post(
        f"{BASE}/meetings/{meeting_id}/transcript",
        json={
            "segments": [
                {
                    "content": "Sounds great. Let's schedule the architecture review call for next Friday at 2 PM.",
                    "speaker_name": "Alice Host",
                    "speaker_user_id": host_id,
                    "start_time_ms": 12000,
                    "end_time_ms": 17500,
                }
            ]
        },
        headers=host_headers,
    ).json()

    # Fetch transcript to verify attribution
    trans = requests.get(f"{BASE}/meetings/{meeting_id}/transcript", headers=host_headers).json()
    print(f"Verified {len(trans)} transcript segments with participant attribution:")
    for t in trans:
        print(f"  - [{t['speaker_name']} (participant_id={t.get('participant_id')})] at {t['start_time_ms']}ms: '{t['content']}' (status: {t.get('processing_status')})")

    print("=== 5. Host Ends Meeting -> Triggers Durable Post-Meeting Pipeline ===")
    end_res = requests.post(f"{BASE}/meetings/{meeting_id}/end", headers=host_headers).json()
    print("Meeting ended status:", end_res["status"])

    # Wait for pipeline to finish
    print("Waiting for post-meeting AI extraction...")
    for _ in range(10):
        sum_res = requests.get(f"{BASE}/meetings/{meeting_id}/summary", headers=host_headers).json()
        if sum_res and sum_res.get("processing_status") == "READY":
            print(f"Pipeline finished! Stage: {sum_res.get('processing_stage')}")
            print(f"Summary: {sum_res.get('summary_text')[:120]}...")
            print(f"Decisions: {sum_res.get('decisions')}")
            break
        print(f"Current stage: {sum_res.get('processing_stage') if sum_res else 'Initializing'}...")
        time.sleep(1.5)

    # Check suggestions
    suggestions = requests.get(f"{BASE}/meetings/{meeting_id}/suggestions", headers=host_headers).json()
    print(f"Generated {len(suggestions)} suggestions for approval:")
    for s in suggestions:
        print(f"  - [{s['item_type']}] {s['title']} | Assignee: {s.get('suggested_assignee_name')} | Status: {s['status']}")

    # Return meeting and login info
    output = {
        "meeting_id": meeting_id,
        "meeting_code": code,
        "host_email": host_email,
        "host_token": host_token,
        "attendee_email": att_email,
        "password": pwd,
        "suggestions_count": len(suggestions),
    }
    with open("e2e_meeting_info.json", "w") as f:
        json.dump(output, f, indent=2)
    print("Exported e2e_meeting_info.json")

if __name__ == "__main__":
    run()
