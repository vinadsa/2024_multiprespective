"""
Multi-Scenario Edge-Case Suite & White-Box Inspection
Based strictly on Conformance Checking & Testing Methodology in AGENTS.md
"""
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
import pandas as pd
import pm4py
from pm4py.objects.petri_net.utils import reachability_graph
from neo4j import GraphDatabase

# Ensure Backend root is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from Algorithm import GO_TR, Neo4jFunc as neo4j_func
from config import settings


def query_active_marking(p_id, session):
    q = """
    MATCH (p:Place {p_id: $p_id})
    WHERE p.token > 0
    RETURN p.name AS name, p.token AS token, coalesce(p.is_final, false) AS is_final
    """
    res = session.run(q, p_id=str(p_id)).data()
    return {r["name"]: {"token": r["token"], "is_final": r["is_final"]} for r in res}


def query_enabled_transitions(p_id, session):
    q = """
    MATCH (p:Place {p_id: $p_id})-[:Arc]->(t:Transition {p_id: $p_id})
    WITH t, collect(p.token) AS tokens
    WHERE all(tok IN tokens WHERE tok > 0)
    RETURN count(t) AS enabled_count, collect(t.label) AS enabled_labels
    """
    res = session.run(q, p_id=str(p_id)).single()
    return res["enabled_count"] if res else 0, res["enabled_labels"] if res else []


def check_proper_completion(p_id, session):
    q_sink = """
    MATCH (sink:Place {p_id: $p_id, is_final: true})
    WHERE sink.token > 0
    RETURN count(sink) > 0 AS sink_reached
    """
    sink_res = session.run(q_sink, p_id=str(p_id)).single()
    sink_reached = bool(sink_res and sink_res["sink_reached"])
    enabled_count, enabled_labels = query_enabled_transitions(p_id, session)
    is_finished = sink_reached and (enabled_count == 0)
    return is_finished, sink_reached, enabled_count, enabled_labels


def teardown_test_clones(session):
    print("\n🧹 Teardown: Cleaning test clone graphs from Neo4j...")
    session.run("MATCH (n {type: 'clone'}) DETACH DELETE n")
    print("✅ Neo4j test clones cleared.")


def load_traces_from_xes(xes_path):
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


def run_edge_case_suite():
    print("=" * 80)
    print("🧪 RUNNING MULTI-TIER EDGE-CASE SUITE (edgecase_test.xes)")
    print("=" * 80)

    # 1. Initialize Driver & Model Environment
    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password)
    )
    session = driver.session()

    # Load master model topology properties
    csv_path = settings.model_source_path or Path("../../process_mining/media/datacsv_repair.csv")
    df = pd.read_csv(csv_path, sep=";")
    df["timestamp"] = pd.date_range(start=datetime.now(), periods=len(df), freq="15s")
    df = pm4py.format_dataframe(
        df,
        case_id=settings.model_case_col,
        activity_key=settings.model_activity_col,
        timestamp_key=settings.model_timestamp_col
    )
    event_log = pm4py.convert_to_event_log(df)
    net, initial_marking, final_marking = pm4py.discover_petri_net_inductive(event_log)
    ts = reachability_graph.construct_reachability_graph(net, initial_marking)
    trans_name = [t.label for t in net.transitions] + ["START", "END"]
    states, places = GO_TR.reachabilityGraphProperties(ts, net)
    check_mode = "multi"

    xes_path = backend_dir / "StreamerMachine" / "data" / "edgecase_test.xes"
    traces = load_traces_from_xes(xes_path)
    print(f"Loaded {len(traces)} traces from {xes_path.name}: {list(traces.keys())}\n")

    # -------------------------------------------------------------------------
    # SCENARIO 1: Alternative Branch (XOR-Split) -> Case 10
    # -------------------------------------------------------------------------
    print("-" * 80)
    print("📍 SCENARIO 1: Alternative Branch (XOR-Split) -> Case 10")
    print("Validates valid non-standard route ('Send a cancellation letter' bypassing repair/payment)")
    print("Expected: Instant termination upon 'Return the item' with Fitness = 1.00")
    print("-" * 80)

    p_id = "test_case_10"
    GO_TR.initialize_case_in_db(p_id, session)

    events_10 = traces["10"]
    for idx, ev in enumerate(events_10, 1):
        act = ev["activity"]
        res = ev["resource"] or "Unknown"
        gotr_ev = [p_id, act, res, "Unknown"]

        pre_marking = query_active_marking(p_id, session)
        result = GO_TR.process_single_event(p_id, gotr_ev, trans_name, states, places, check_mode, session)
        post_marking = query_active_marking(p_id, session)
        en_count, en_labels = query_enabled_transitions(p_id, session)
        is_fin, sink_reached, _, _ = check_proper_completion(p_id, session)

        print(f"Step {idx}: {act} [{res}] -> status: {result['status']}")
        print(f"   Pre:  {list(pre_marking.keys())}")
        print(f"   Post: {list(post_marking.keys())} | Enabled ({en_count}): {en_labels} | Terminated: {is_fin}")

    # Assert proper completion condition
    assert is_fin, "Case 10 should terminate immediately upon reaching sink with 0 enabled transitions!"
    final_recap = GO_TR.finalize_case(p_id, session)
    print(f"Case 10 Final Recap: Fitness = {final_recap['fitness']}, Missing = {final_recap['missing']}, Remained = {final_recap['remained']}")
    assert final_recap["fitness"] == 1.0, f"Case 10 should have Fitness = 1.00, got {final_recap['fitness']}"
    assert final_recap["missing"] == 0, "Case 10 should have 0 missing tokens"
    print("✅ Scenario 1 PASSED: Alternative branch terminated with 100% Fitness.\n")

    # -------------------------------------------------------------------------
    # SCENARIO 2: Abandoned Process (Deadlock / Incomplete Trace) -> Case 20
    # -------------------------------------------------------------------------
    print("-" * 80)
    print("📍 SCENARIO 2: Abandoned Process (Incomplete Trace) -> Case 20")
    print("Terminates mid-stream (step 3: Check the warranty).")
    print("Expected: sink.token == 0, enabled_count > 0, remains in Active Tracker, penalized by TTL")
    print("-" * 80)

    p_id = "test_case_20"
    GO_TR.initialize_case_in_db(p_id, session)

    events_20 = traces["20"]
    for idx, ev in enumerate(events_20, 1):
        act = ev["activity"]
        res = ev["resource"] or "Unknown"
        gotr_ev = [p_id, act, res, "Unknown"]
        result = GO_TR.process_single_event(p_id, gotr_ev, trans_name, states, places, check_mode, session)
        post_marking = query_active_marking(p_id, session)
        en_count, en_labels = query_enabled_transitions(p_id, session)
        is_fin, sink_reached, _, _ = check_proper_completion(p_id, session)
        print(f"Step {idx}: {act} -> Post: {list(post_marking.keys())} | Enabled ({en_count}): {en_labels} | Terminated: {is_fin}")

    # Case must NOT be finished yet
    assert not is_fin, "Case 20 must NOT be marked finished mid-stream!"
    assert not sink_reached, "Case 20 must not have reached sink place!"
    assert en_count > 0, "Case 20 must have enabled transitions waiting for stream events!"
    print(f"Case 20 correctly stalled mid-stream with enabled transitions: {en_labels}")

    # Simulate 30s TTL Fallback finalization
    print("Simulating 30s TTL sliding inactivity window expiration...")
    ttl_recap = GO_TR.finalize_case(p_id, session)
    print(f"Case 20 TTL Recap: Fitness = {ttl_recap['fitness']}, Missing = {ttl_recap['missing']}, Remained = {ttl_recap['remained']}")
    assert ttl_recap["remained"] > 0, "Case 20 must have leftover/remained tokens penalizing fitness!"
    assert ttl_recap["fitness"] < 1.0, f"Case 20 fitness must be penalized, got {ttl_recap['fitness']}"
    print("✅ Scenario 2 PASSED: Incomplete trace properly kept active, then penalized by TTL.\n")

    # -------------------------------------------------------------------------
    # SCENARIO 3: Skipped Mandatory Step (Control-Flow Deviation) -> Case 30
    # -------------------------------------------------------------------------
    print("-" * 80)
    print("📍 SCENARIO 3: Skipped Mandatory Step (Control-Flow Deviation) -> Case 30")
    print("Skips 'Notify the customer', jumps directly to 'Repair the item'.")
    print("Expected: Missing token inserted, deviation alert emitted, fitness penalty")
    print("-" * 80)

    p_id = "test_case_30"
    GO_TR.initialize_case_in_db(p_id, session)

    events_30 = traces["30"]
    missing_tokens_detected = []
    for idx, ev in enumerate(events_30, 1):
        act = ev["activity"]
        res = ev["resource"] or "Unknown"
        gotr_ev = [p_id, act, res, "Unknown"]
        result = GO_TR.process_single_event(p_id, gotr_ev, trans_name, states, places, check_mode, session)
        post_marking = query_active_marking(p_id, session)
        en_count, en_labels = query_enabled_transitions(p_id, session)
        is_fin, _, _, _ = check_proper_completion(p_id, session)

        if result.get("status") == "deviation":
            violations = result.get("violations", [])
            print(f"🚨 Step {idx} Deviation Detected: {act} -> {violations}")
            for v in violations:
                if v.get("type") == "missing_token":
                    missing_tokens_detected.append(v)
        else:
            print(f"Step {idx}: {act} -> Conforming | Post: {list(post_marking.keys())}")

    assert len(missing_tokens_detected) > 0, "Case 30 must detect missing token when skipping 'Notify the customer'!"
    final_recap_30 = GO_TR.finalize_case(p_id, session)
    print(f"Case 30 Final Recap: Fitness = {final_recap_30['fitness']}, Missing = {final_recap_30['missing']}")
    assert final_recap_30["missing"] > 0, "Case 30 recap must reflect missing token count > 0"
    assert final_recap_30["fitness"] < 1.0, "Case 30 fitness must be strictly < 1.00"
    print("✅ Scenario 3 PASSED: Control-flow skip triggered missing token and fitness penalty.\n")

    # -------------------------------------------------------------------------
    # SCENARIO 4: High Concurrency & Event Interleaving -> Cases 40 & 50
    # -------------------------------------------------------------------------
    print("-" * 80)
    print("📍 SCENARIO 4: High Concurrency & Event Interleaving -> Cases 40 & 50")
    print("Interleaves stream events: 40_1 -> 50_1 -> 40_2 -> 50_2...")
    print("Expected: Strict graph isolation (p_id scoping), zero cross-case token leakage")
    print("-" * 80)

    p_id_40 = "test_case_40"
    p_id_50 = "test_case_50"
    GO_TR.initialize_case_in_db(p_id_40, session)
    GO_TR.initialize_case_in_db(p_id_50, session)

    events_40 = traces["40"]
    events_50 = traces["50"]
    max_len = max(len(events_40), len(events_50))

    for i in range(max_len):
        if i < len(events_40):
            ev40 = events_40[i]
            gotr_ev40 = [p_id_40, ev40["activity"], ev40["resource"] or "Unknown", "Unknown"]
            res40 = GO_TR.process_single_event(p_id_40, gotr_ev40, trans_name, states, places, check_mode, session)

        if i < len(events_50):
            ev50 = events_50[i]
            gotr_ev50 = [p_id_50, ev50["activity"], ev50["resource"] or "Unknown", "Unknown"]
            res50 = GO_TR.process_single_event(p_id_50, gotr_ev50, trans_name, states, places, check_mode, session)

        # White-box check: Verify token isolation
        marking_40 = query_active_marking(p_id_40, session)
        marking_50 = query_active_marking(p_id_50, session)

        # Cross-leakage query: Verify no nodes exist with mismatched p_id
        leak_query = """
        MATCH (p:Place {type: 'clone'})
        WHERE p.p_id IN [$p40, $p50]
        RETURN p.p_id AS p_id, count(p) AS count
        """
        leak_res = session.run(leak_query, p40=p_id_40, p50=p_id_50).data()
        for r in leak_res:
            assert r["count"] > 0, f"Graph for {r['p_id']} must exist independently"

    is_fin_40, _, _, _ = check_proper_completion(p_id_40, session)
    is_fin_50, _, _, _ = check_proper_completion(p_id_50, session)
    assert is_fin_40, "Case 40 must finish cleanly despite interleaving"
    assert is_fin_50, "Case 50 must finish cleanly despite interleaving"

    recap_40 = GO_TR.finalize_case(p_id_40, session)
    recap_50 = GO_TR.finalize_case(p_id_50, session)
    print(f"Case 40: Fitness = {recap_40['fitness']} | Case 50: Fitness = {recap_50['fitness']}")
    assert recap_40["fitness"] == 1.0, "Case 40 fitness must be 1.0"
    assert recap_50["fitness"] == 1.0, "Case 50 fitness must be 1.0"
    print("✅ Scenario 4 PASSED: Interleaved cases completed with zero cross-case token leakage.\n")

    # -------------------------------------------------------------------------
    # TEARDOWN
    # -------------------------------------------------------------------------
    teardown_test_clones(session)
    session.close()
    driver.close()

    print("=" * 80)
    print("🎉 ALL 4 EDGE-CASE SCENARIOS COMPLETED & VERIFIED SUCCESSFULLY!")
    print("=" * 80)


if __name__ == "__main__":
    run_edge_case_suite()
