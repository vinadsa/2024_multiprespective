"""
Live Edge-Case Streaming Script:
Streams edgecase_test.xes to http://localhost:8100/events
Monitors /api/cases/active and logs pipeline lifecycle.
"""
import time
import uuid
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

PRODUCER_URL = "http://localhost:8100/events"
CONSUMER_ACTIVE_URL = "http://localhost:8000/api/cases/active"
XES_PATH = Path(__file__).parent / "data" / "edgecase_test.xes"


def load_traces(xes_path):
    tree = ET.parse(xes_path)
    root = tree.getroot()
    ns = {"xes": "http://www.xes-standard.org/"}
    traces_elem = root.findall("xes:trace", ns) or root.findall("trace")
    
    traces = {}
    for t in traces_elem:
        cid = None
        for s in t.findall("string"):
            if s.attrib.get("key") == "concept:name":
                cid = s.attrib.get("value")
        events = []
        for ev in t.findall("event"):
            act, res = None, None
            for s in ev.findall("string"):
                if s.attrib.get("key") == "concept:name":
                    act = s.attrib.get("value")
                elif s.attrib.get("key") in ("org:resource", "resource"):
                    res = s.attrib.get("value")
            events.append({"activity": act, "resource": res})
        if cid:
            traces[cid] = events
    return traces


def send_event(case_id, activity, resource, event_index):
    payload = {
        "event_id": str(uuid.uuid4()),
        "trace_id": str(case_id),
        "activity": activity,
        "lifecycle": "complete",
        "resource": resource or "Unknown",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_index": event_index,
        "case_attrs": {},
        "event_attrs": {},
        "source": {"type": "edgecase_streamer"},
        "sim": {
            "replay_mode": "scaled",
            "speed": 1.0,
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
            "is_late": False,
            "watermark": datetime.now(timezone.utc).isoformat()
        }
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        PRODUCER_URL,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_active_cases():
    try:
        with urllib.request.urlopen(CONSUMER_ACTIVE_URL) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"error": str(e)}


def stream_edge_cases():
    print("=" * 80)
    print("🚀 LIVE STREAMING EDGE-CASE SUITE TO PIPELINE")
    print("=" * 80)
    traces = load_traces(XES_PATH)
    print(f"Loaded traces: {list(traces.keys())}\n")

    # 1. Stream Trace 10 (Alternative XOR-split branch)
    print("📡 Streaming Case 10 (Alternative XOR-split branch)...")
    for idx, ev in enumerate(traces["10"], 1):
        res = send_event("10", ev["activity"], ev["resource"], idx)
        print(f"   [Case 10] Event {idx}: {ev['activity']} -> Offset {res.get('offset')}")
        time.sleep(0.12)

    time.sleep(0.5)
    active = get_active_cases()
    print(f"Active cases count: {active.get('active_cases_count')}")

    # 2. Stream Trace 20 (Abandoned mid-stream at step 3)
    print("\n📡 Streaming Case 20 (Abandoned Process - stops at step 3)...")
    for idx, ev in enumerate(traces["20"], 1):
        res = send_event("20", ev["activity"], ev["resource"], idx)
        print(f"   [Case 20] Event {idx}: {ev['activity']} -> Offset {res.get('offset')}")
        time.sleep(0.12)

    time.sleep(0.5)
    active = get_active_cases()
    print(f"Active cases count: {active.get('active_cases_count')} (Case 20 should be active in tracker)")

    # 3. Stream Trace 30 (Skipped Mandatory Step - missing token deviation)
    print("\n📡 Streaming Case 30 (Skipped Step - Control-flow deviation)...")
    for idx, ev in enumerate(traces["30"], 1):
        res = send_event("30", ev["activity"], ev["resource"], idx)
        print(f"   [Case 30] Event {idx}: {ev['activity']} -> Offset {res.get('offset')}")
        time.sleep(0.12)

    time.sleep(0.5)
    active = get_active_cases()
    print(f"Active cases count: {active.get('active_cases_count')}")

    # 4. Stream Cases 40 & 50 interleaved (High concurrency)
    print("\n📡 Streaming Cases 40 & 50 interleaved (Concurrency test)...")
    t40 = traces["40"]
    t50 = traces["50"]
    max_len = max(len(t40), len(t50))
    for i in range(max_len):
        if i < len(t40):
            res40 = send_event("40", t40[i]["activity"], t40[i]["resource"], i + 1)
            print(f"   [Case 40] Event {i+1}: {t40[i]['activity']}")
            time.sleep(0.08)
        if i < len(t50):
            res50 = send_event("50", t50[i]["activity"], t50[i]["resource"], i + 1)
            print(f"   [Case 50] Event {i+1}: {t50[i]['activity']}")
            time.sleep(0.08)

    time.sleep(1.0)
    active = get_active_cases()
    print("\n" + "=" * 80)
    print(f"📊 Final Active Cases State: {active.get('active_cases_count')} active cases")
    for c in active.get("cases", []):
        print(f"   - Case #{c['case_id']}: last activity='{c['last_activity']}', events={c['event_count']}, idle={c.get('idle_seconds', 0)}s")
    print("=" * 80)
    print("✅ Live edge-case streaming complete.")


if __name__ == "__main__":
    stream_edge_cases()
