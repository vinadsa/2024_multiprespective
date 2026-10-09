# consumer.py
import sys
from pathlib import Path

# Ensure Backend root is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import settings

from kafka import KafkaConsumer
import json
import time
from datetime import datetime
import pandas as pd
import pm4py
from neo4j import GraphDatabase

# Import separation algorithm file
import Algorithm.GO_TR as GO_TR
import Algorithm.Neo4jFunc as neo4j_func


from pm4py.objects.petri_net.utils import reachability_graph
import threading
from collections import defaultdict
import queue

# New Import for FastAPI
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from threading import Thread
from typing import List, Dict
import uuid
from queue import Queue
from collections import deque
# Connection of Kafka
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.connection_ids: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        connection_id = str(uuid.uuid4())
        self.active_connections.append(websocket)
        self.connection_ids[websocket] = connection_id
        print(f"Client {connection_id} connected")
        return connection_id

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            connection_id = self.connection_ids.get(websocket, "Unknown")
            self.active_connections.remove(websocket)
            del self.connection_ids[websocket]
            print(f"Client {connection_id} disconnected")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error sending message: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)


class GOTRKafkaConsumer:
    def __init__(self, kafka_config=None, neo4j_config=None):
        # Kafka configuration
        self.kafka_config = kafka_config or {
            'bootstrap_servers': settings.kafka_brokers,
            'group_id': settings.kafka_group_id,
            'value_deserializer': lambda m: json.loads(m.decode('utf-8')),
            'key_deserializer': lambda m: m.decode('utf-8') if m else None
        }
        
        # Neo4j configuration
        self.neo4j_config = neo4j_config or {
            'uri': settings.neo4j_uri,
            'user': settings.neo4j_user,
            'password': settings.neo4j_password
        }

        # FastAPI and WebSocket components
        self.manager = ConnectionManager()
        self.alert_queue = Queue()  # Thread-safe queue for alerts
        
        self.recent_alerts = deque(maxlen=200)  # Store last 200 alerts
        self.recent_alerts_lock = threading.Lock()
        
        self.app = self.create_app()
        self.websocket_thread = None
      
        # Event buffering for processing
        self.event_buffer = defaultdict(list)
        self.processing_queue = queue.Queue()
        self.is_running = False

        self.consumer = None
        self.driver = None
        self.session = None

        # --- Global Model Properties (loaded once) ---
        self.trans_name = []
        self.states = []
        self.places = []
        
        # -- Check the Case Set Up --
        self.check = None  # Will be set via API before starting
        self.is_configured = False
        self.configuration_event = threading.Event()  # To signal when config is ready
        self.consumer_thread = None
        self.stop_event = threading.Event()

        # -- Add Theread Lock
        self.consumer_lock = threading.Lock()
        self.config_lock = threading.Lock()
        self.state_lock = threading.Lock()
        self.neo4j_lock = threading.Lock()
        # ✅ STATE MANAGEMENT: This is what was extracted from tokenBasedReplay
        # These variables now live here to track state across all events.
        self.active_cases = set()
        self.finished_cases = set()
        self.case_metadata = {}
        self.anomaly_scores = defaultdict(float)
        self.case_event_history = defaultdict(list)
        self.unknown_activities = defaultdict(list)

    #-------------- Web Socket Fast API func ------------------ 
    def create_app(self):
        """Create and configure FastAPI app"""
        app = FastAPI()

        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        manager = self.manager
        alert_queue = self.alert_queue
        recent_alerts = self.recent_alerts
        recent_alerts_lock = self.recent_alerts_lock
        get_active_cases = lambda: len(self.active_cases)

        consumer_instance = self

        @app.post("/api/configure")
        async def configure_consumer(config: dict):
            """
            Configure the consumer before starting
            Expected JSON: {
                "mode": "online" or "multi",
                "conformance": "continue" or "reset"
            }
            """
            if 'mode' not in config:
                return {
                    "status": "error",
                    "message": "Missing 'mode' field in configuration"
                }

            mode = config['mode']
            conformance = config['conformance']

            if mode not in ['online', 'multi']:
                return {
                    "status": "error",
                    "message": f"Invalid mode '{mode}'. Must be 'online' or 'multi'"
                }
            if conformance not in ['continue', 'reset']:
                return {
                    "status": "error",
                    "message": f"Invalid conformance '{conformance}'. Must be 'continue' or 'reset'"
                }

            # Set the configuration
            consumer_instance.check = mode

            # Handle conformance mode
            if conformance == 'reset':
                print("Reset mode detected - reinitializing Kafka consumer...")
                consumer_instance.stop_consumer_thread()

                # Stop current consumer if running
                with consumer_instance.consumer_lock:
                    if consumer_instance.consumer:
                        try:
                            consumer_instance.consumer.close()
                            consumer_instance.consumer = None
                        except Exception as e:
                            print(f"Error closing Kafka consumer: {e}")

                #reinitialize neo4j
                consumer_instance.initialize_neo4j_session()

                # Clear neo4j database data
                consumer_instance.clear_neo4j_case_data()

                # Clear state
                with consumer_instance.state_lock:  # ✅ PROTECTED
                    consumer_instance.active_cases.clear()
                    consumer_instance.finished_cases.clear()
                    consumer_instance.case_metadata.clear()
                    consumer_instance.anomaly_scores.clear()
                    consumer_instance.case_event_history.clear()
                    consumer_instance.unknown_activities.clear()
                    consumer_instance.event_buffer.clear()
                
                with recent_alerts_lock:
                    recent_alerts.clear()

                # ✅ CLEAR ALERT QUEUE (drain any pending alerts)
                while not alert_queue.empty():
                    try:
                        alert_queue.get_nowait()
                    except:
                        break
                # Reinitialize consumer
                consumer_instance.initialize_kafka_consumer(conformance)

                consumer_instance.is_configured = True
                consumer_instance.configuration_event.set()
                
                # 3. Start a new, clean thread
                consumer_instance.start_consumer_thread()
            else:
                print('Continue mode detected - resume from last offset')
                consumer_instance.stop_consumer_thread()
                print('Stop Threading for Continue')
                with consumer_instance.consumer_lock:
                    if consumer_instance.consumer:
                        try:
                            consumer_instance.consumer.close()
                            consumer_instance.consumer = None
                        except Exception as e:
                            print(f"Error closing Kafka consumer: {e}")
                
                # Reinitialize neo4j
                consumer_instance.initialize_neo4j_session()
                # Reinitialize kafka
                consumer_instance.initialize_kafka_consumer(conformance)
                consumer_instance.is_configured = True
                consumer_instance.configuration_event.set()
                consumer_instance.start_consumer_thread()

                print(f"Consumer configured with mode: {mode} and conformance: {conformance}")

            # Notify connected clients
            await manager.broadcast({
                "type": "configured",
                "timestamp": datetime.now().isoformat(),
                "mode": mode,
                "conformance": conformance,
                "message": f"Consumer configured in {mode} mode with {conformance} conformance",
                "active_cases_count": 0,
                "active_cases": []
            })

            return {
                "status": "success",
                "mode": mode,
                "conformance": conformance,
                "timestamp": datetime.now().isoformat(),
                "message": "Consumer configured successfully. Ready to start processing."
            }
    
        @app.get("/api/configuration")
        async def get_configuration():
            """Get current configuration status"""
            return {
                "is_configured": consumer_instance.is_configured,
                "mode": consumer_instance.check,
                "timestamp": datetime.now().isoformat()
            }
    
        @app.post("/api/start")
        async def start_processing():
            """Manually trigger the start of processing (if needed)"""
            if not consumer_instance.is_configured:
                return {
                    "status": "error",
                    "message": "Consumer not configured. Please configure first using /api/configure"
                }

            return {
                "status": "success",
                "message": "Processing started",
                "mode": consumer_instance.check
            }
    
        @app.get("/api/status")
        async def get_status():
            """Get overall system status"""
            with recent_alerts_lock:
                alert_count = len(recent_alerts)

            active_list = consumer_instance.get_active_cases_snapshot()

            return {
                "is_configured": consumer_instance.is_configured,
                "mode": consumer_instance.check,
                "is_running": consumer_instance.is_running,
                "active_cases": len(active_list),
                "active_cases_list": active_list,
                "active_connections": len(manager.active_connections),
                "total_alerts": alert_count,
                "timestamp": datetime.now().isoformat()
            }

        @app.get("/api/cases/active")
        async def get_active_cases():
            """Get detailed list of active cases"""
            active_list = consumer_instance.get_active_cases_snapshot()
            return {
                "active_cases_count": len(active_list),
                "cases": active_list,
                "timestamp": datetime.now().isoformat()
            }

        async def process_alert_queue():
            """Background task to process alerts and lifecycle events from the queue"""
            while True:
                try:
                    if not alert_queue.empty():
                        msg_data = alert_queue.get_nowait()
                        msg_type = msg_data.get('type')

                        # Only store deviation/critical alerts in recent_alerts history
                        if msg_type in ('deviation_alert', 'critical_alert'):
                            if 'alert_id' not in msg_data:
                                msg_data['alert_id'] = f"{msg_data.get('timestamp')}_{msg_data.get('case_id')}"
                            with recent_alerts_lock:
                                recent_alerts.append(msg_data)

                        # Broadcast to connected clients
                        await manager.broadcast(msg_data)
                    else:
                        await asyncio.sleep(0.05)
                except Exception as e:
                    print(f"Error processing alert/message: {e}")

        async def check_inactivity_timeouts():
            """Sliding Inactivity Window: Checks for abandoned cases without events for > 30s."""
            while True:
                try:
                    await asyncio.sleep(2.0)
                    now = time.time()
                    timeout_sec = float(settings.case_idle_timeout_sec)
                    timed_out_cases = []
                    with consumer_instance.state_lock:
                        for p_id, meta in list(consumer_instance.case_metadata.items()):
                            if now - meta.get("last_event_time", now) > timeout_sec:
                                timed_out_cases.append(p_id)

                    for p_id in timed_out_cases:
                        with consumer_instance.state_lock:
                            consumer_instance.active_cases.discard(p_id)
                            consumer_instance.finished_cases.add(p_id)
                            meta = consumer_instance.case_metadata.pop(p_id, {})

                        with consumer_instance.neo4j_lock:
                            fitness_summary = GO_TR.finalize_case(p_id, consumer_instance.session)

                        print(f"⏱️ Case {p_id} timed out after {int(timeout_sec)}s inactivity (Fitness: {fitness_summary.get('fitness')})")
                        consumer_instance.broadcast_case_lifecycle(p_id, "timeout", {
                            "fitness": fitness_summary.get("fitness", 0.0),
                            "recap": fitness_summary,
                            "total_missing_tokens": fitness_summary.get("missing", 0) if fitness_summary else 0,
                            "total_active_tokens": 0,
                            "reason": f"inactivity_timeout_{int(timeout_sec)}s",
                            "current_marking": [],
                            "enabled_transitions": []
                        })
                except Exception as e:
                    print(f"Error checking inactivity timeouts: {e}")
        
        

        @app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            connection_id = await manager.connect(websocket)

            # Create a heartbeat task
            async def heartbeat():
                try:
                    while True:
                        await asyncio.sleep(30)  # Send heartbeat every 30 seconds
                        await websocket.send_json({"type": "heartbeat", "timestamp": datetime.now().isoformat()})
                except:
                    pass  # Connection closed
                
            # Start heartbeat
            heartbeat_task = asyncio.create_task(heartbeat())

            try:
                await manager.send_personal_message({
                    "type": "connection",
                    "message": "Connected to GO-TR monitoring",
                    "connection_id": connection_id
                }, websocket)

                while True:
                    # Add timeout to prevent hanging
                    try:
                        data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
                        if data == "ping":
                            await websocket.send_json({"type": "pong"})
                    except asyncio.TimeoutError:
                        # Send a ping to check if connection is alive
                        await websocket.send_json({"type": "ping"})
                        continue       
            except WebSocketDisconnect:
                manager.disconnect(websocket)
            finally:
                heartbeat_task.cancel()

        @app.get("/api/alerts/recent")
        async def get_recent_alerts(limit: int = 100, since_timestamp: str = None):
            """Get recent alerts with optional timestamp filter"""
            try:
                with recent_alerts_lock:
                    all_alerts = list(recent_alerts)
        
                # Filter by timestamp if provided
                if since_timestamp:
                    try:
                        since_dt = datetime.fromisoformat(since_timestamp.replace('Z', '+00:00'))
                        
                        # Validate timestamp is not in the future
                        if since_dt > datetime.now(since_dt.tzinfo):
                            print(f"Warning: Future timestamp provided: {since_timestamp}")
                            since_dt = datetime.now(since_dt.tzinfo)
                        
                        filtered_alerts = [
                            alert for alert in all_alerts 
                            if datetime.fromisoformat(alert['timestamp']) > since_dt
                        ]
                        all_alerts = filtered_alerts
                    except Exception as e:
                        print(f"Error parsing timestamp: {e}")
                        # Don't filter if timestamp is invalid
                    
                # Return most recent alerts up to limit
                alerts_to_return = all_alerts[-limit:]
        
                return {
                    "alerts": alerts_to_return,
                    "count": len(alerts_to_return),
                    "total_stored": len(recent_alerts)
                }
            except Exception as e:
                print(f"Error in get_recent_alerts: {e}")
                return {
                    "alerts": [],
                    "count": 0,
                    "total_stored": 0,
                    "error": str(e)
                }

        @app.get("/api/stats")
        async def get_stats():
            """Get current statistics"""
            with recent_alerts_lock:
                all_alerts = list(recent_alerts)

            critical_count = sum(1 for a in all_alerts if a.get('severity') == 'critical')
            case_ids = set(a.get('case_id') for a in all_alerts if a.get('case_id'))

            return {
                "total_alerts": len(all_alerts),
                "critical_count": critical_count,
                "unique_cases": len(case_ids),
                "active_connections": len(manager.active_connections)
            }

        @app.get("/api/model/master")
        async def get_master_model():
            """Retrieve the SOP Master Petri Net model (Places, Transitions, and Arcs) from Neo4j"""
            try:
                driver = consumer_instance.driver
                created_driver = False
                if not driver:
                    driver = GraphDatabase.driver(
                        uri=consumer_instance.neo4j_config['uri'],
                        auth=(consumer_instance.neo4j_config['user'], consumer_instance.neo4j_config['password'])
                    )
                    created_driver = True

                try:
                    with driver.session() as session:
                        places_res = session.run("""
                            MATCH (p:Place {type: 'master'})
                            RETURN p.name AS name, p.label AS label, p.im AS im, p.is_final AS is_final, p.token AS token
                        """).data()

                        transitions_res = session.run("""
                            MATCH (t:Transition {type: 'master'})
                            RETURN t.name AS name, t.label AS label, t.req_role AS req_role, t.req_team AS req_team, t.team_var AS team_var, t.writes AS writes
                        """).data()

                        arcs_res = session.run("""
                            MATCH (s {type: 'master'})-[r:Arc {type: 'master'}]->(tg {type: 'master'})
                            RETURN r.name AS name, s.name AS source, labels(s)[0] AS source_type, tg.name AS target, labels(tg)[0] AS target_type
                        """).data()
                finally:
                    if created_driver:
                        driver.close()

                nodes = []
                for p in places_res:
                    is_source = bool(p.get("im") or p.get("name") == "source")
                    is_sink = bool(p.get("is_final") or p.get("name") == "sink")
                    nodes.append({
                        "id": p["name"],
                        "name": p["name"],
                        "label": p["name"],
                        "type": "place",
                        "is_source": is_source,
                        "is_sink": is_sink,
                        "token": p.get("token") or 0,
                    })

                for t in transitions_res:
                    nodes.append({
                        "id": t["name"],
                        "name": t["name"],
                        "label": t.get("label") or t["name"],
                        "type": "transition",
                        "is_source": False,
                        "is_sink": False,
                        "role": t.get("req_role"),
                        "team": t.get("req_team"),
                        "team_var": t.get("team_var"),
                    })

                edges = []
                for a in arcs_res:
                    edges.append({
                        "id": a.get("name") or f"{a['source']}_{a['target']}",
                        "source": a["source"],
                        "target": a["target"],
                        "source_type": a["source_type"].lower(),
                        "target_type": a["target_type"].lower(),
                    })

                return {
                    "status": "success",
                    "data": {
                        "nodes": nodes,
                        "edges": edges,
                        "stats": {
                            "places_count": len(places_res),
                            "transitions_count": len(transitions_res),
                            "arcs_count": len(arcs_res)
                        }
                    }
                }
            except Exception as e:
                return {
                    "status": "error",
                    "message": f"Failed to fetch master model: {str(e)}"
                }

        @app.get("/api/cases/{case_id}/marking")
        async def get_case_marking(case_id: str):
            """Retrieve current Petri Net marking, token stats, and enabled transitions for a specific case."""
            try:
                driver = consumer_instance.driver
                created_driver = False
                if not driver:
                    driver = GraphDatabase.driver(
                        uri=consumer_instance.neo4j_config['uri'],
                        auth=(consumer_instance.neo4j_config['user'], consumer_instance.neo4j_config['password'])
                    )
                    created_driver = True

                try:
                    with driver.session() as session:
                        places_res = session.run("""
                            MATCH (p:Place)
                            WHERE p.p_id = $p_id OR toString(p.p_id) = $p_id
                            RETURN p.name AS name, p.token AS token, p.m AS missing, p.c AS consumed, p.p AS produced, p.is_final AS is_final
                        """, p_id=str(case_id)).data()

                        enabled_res = session.run("""
                            MATCH (p:Place)-[:Arc]->(t:Transition)
                            WHERE (p.p_id = $p_id OR toString(p.p_id) = $p_id) AND t.p_id = p.p_id
                            WITH t, collect(p.token) AS tokens
                            WHERE all(tok IN tokens WHERE tok > 0)
                            RETURN t.name AS name, t.label AS label
                        """, p_id=str(case_id)).data()
                finally:
                    if created_driver:
                        driver.close()

                if not places_res:
                    return {
                        "status": "error",
                        "message": f"Case {case_id} not found or no clone graph exists in Neo4j",
                        "case_id": case_id
                    }

                marking_map = {}
                total_tokens = 0
                total_missing = 0
                total_c = 0
                total_p = 0
                for p in places_res:
                    token = p.get("token") or 0
                    missing = p.get("missing") or 0
                    c_val = p.get("consumed") or 0
                    p_val = p.get("produced") or 0
                    total_tokens += token
                    total_missing += missing
                    total_c += c_val
                    total_p += p_val
                    marking_map[p["name"]] = {
                        "token": token,
                        "missing": missing,
                        "consumed": c_val,
                        "produced": p_val,
                        "is_final": bool(p.get("is_final"))
                    }

                enabled_transitions = [t["name"] for t in enabled_res]

                with consumer_instance.state_lock:
                    is_active = str(case_id) in consumer_instance.active_cases
                    meta = consumer_instance.case_metadata.get(str(case_id), {})
                    anomaly_score = consumer_instance.anomaly_scores.get(str(case_id), 0.0)

                calc_fitness = 1.0
                if total_c > 0:
                    if is_active:
                        # Mid-stream running fitness: do not penalize valid in-flight tokens
                        raw_fit = 1.0 - (total_missing / total_c)
                    else:
                        # Completed/timed-out case: penalize leftover tokens
                        raw_fit = (0.5 * (1 - (total_missing / total_c))) + (0.5 * (1 - (total_tokens / total_p))) if total_p > 0 else 0.0
                    calc_fitness = max(0.0, min(1.0, round(raw_fit, 4)))

                return {
                    "status": "success",
                    "case_id": case_id,
                    "data": {
                        "marking": marking_map,
                        "enabled_transitions": enabled_transitions,
                        "total_active_tokens": total_tokens,
                        "total_missing_tokens": total_missing,
                        "fitness": calc_fitness,
                        "is_active": is_active,
                        "last_activity": meta.get("last_activity"),
                        "anomaly_score": round(anomaly_score, 2),
                        "has_deviations": meta.get("has_deviations", total_missing > 0)
                    }
                }
            except Exception as e:
                return {
                    "status": "error",
                    "message": f"Failed to fetch marking for case {case_id}: {str(e)}"
                }


        @app.get("/health")
        async def health_check():
            return {
                "status": "healthy",
                "active_connections": len(manager.active_connections),
                "active_cases": get_active_cases()
            }

        @app.on_event("startup")
        async def startup_event():
            asyncio.create_task(process_alert_queue())
            asyncio.create_task(check_inactivity_timeouts())

        return app
    
    def start_websocket_server(self):
        """Start the WebSocket server in a separate thread"""
        def run_server():
            uvicorn.run(self.app, host=settings.consumer_host, port=settings.consumer_port)

        self.websocket_thread = Thread(target=run_server, daemon=True)
        self.websocket_thread.start()
        print(f"WebSocket server started on http://{settings.consumer_host}:{settings.consumer_port}")

    def send_deviation_alert(self, alert_data):
        """Send deviation alert through WebSocket"""
        self.alert_queue.put(alert_data)
        print("data out sended")

    def get_active_cases_snapshot(self):
        """Returns a list of dicts describing each currently active case."""
        snapshot = []
        now = time.time()
        with self.state_lock:
            for p_id in sorted(list(self.active_cases)):
                meta = self.case_metadata.get(p_id, {})
                started_ts = meta.get("started_at")
                last_event_time = meta.get("last_event_time", now)
                duration_sec = max(0, int(now - meta.get("start_epoch", last_event_time)))
                snapshot.append({
                    "case_id": str(p_id),
                    "started_at": started_ts or datetime.now().isoformat(),
                    "last_activity": meta.get("last_activity", "Processing"),
                    "event_count": meta.get("event_count", 0),
                    "anomaly_score": round(self.anomaly_scores.get(p_id, 0.0), 2),
                    "has_deviations": meta.get("has_deviations", False),
                    "missing_tokens": meta.get("missing_tokens", 0),
                    "duration_seconds": duration_sec,
                    "idle_seconds": max(0, int(now - last_event_time))
                })
        return snapshot

    def broadcast_case_lifecycle(self, case_id: str, action: str, details: dict = None):
        """Enqueues a case lifecycle mutation event to WebSocket clients."""
        active_list = self.get_active_cases_snapshot()
        payload = {
            "type": "case_lifecycle",
            "action": action,
            "case_id": str(case_id),
            "timestamp": datetime.now().isoformat(),
            "active_cases_count": len(self.active_cases),
            "active_cases": active_list,
            **(details or {})
        }
        self.alert_queue.put(payload)
    #-------------- Web Socket Fast API end -------------------

    # ------------- Neo4j Initialization ----------------------
    def initialize_neo4j_session(self):
        """Initialize or reinitialize Neo4j session"""
        print("Initializing Neo4j session...")
        
        # Close existing session/driver if they exist
        if self.session:
            try:
                self.session.close()
            except:
                pass
            
        if self.driver:
            try:
                self.driver.close()
            except Exception as e:
                print(f"Error closing Neo4j driver: {e}")
            
        # Create fresh connections
        self.driver = GraphDatabase.driver(
            uri=self.neo4j_config['uri'], 
            auth=(self.neo4j_config['user'], self.neo4j_config['password'])
        )
        self.session = self.driver.session()
        print("Neo4j session initialized successfully!")
        
    def clear_neo4j_case_data(self):
        """Clear case executions while preserving master model"""
        print("Clearing Neo4j case execution data...")

        try:
            with self.neo4j_lock:
                if not self.session:
                    print("⚠️ No active Neo4j session")
                    return

                # ✅ DELETE ONLY CLONED NODES (type='clone')
                queries = [
                    ("Deleting cloned Places", 
                     "MATCH (p:Place {type:'clone'}) DETACH DELETE p"),

                    ("Deleting cloned Transitions", 
                     "MATCH (t:Transition {type:'clone'}) DETACH DELETE t"),

                    ("Deleting cloned Variables", 
                     "MATCH (v:Variable {type:'clone'}) DETACH DELETE v"),

                    ("Deleting Case nodes", 
                     "MATCH (c:Case) DETACH DELETE c"),

                    ("Deleting cloned Arcs", 
                     "MATCH ()-[a:Arc {type:'clone'}]-() DELETE a"),

                    # ✅ KEEP: States (Reachability Graph)
                    # ✅ KEEP: Master Petri Net (type='master')
                    # ✅ KEEP: Organizational Model (Entity, Resource, etc.)
                ]

                for description, query in queries:
                    print(f"  - {description}...")
                    result = self.session.run(query)
                    counters = result.consume().counters
                    print(f"    ✅ Deleted: {counters.nodes_deleted} nodes, {counters.relationships_deleted} rels")

                print("✅ Neo4j case data cleared successfully!")
        except Exception as e:
            print(f"❌ Error clearing Neo4j data: {e}")
            import traceback
            traceback.print_exc()
    
    # Initialize master model
    def initialize_master_model(self):
        """Initialize the master model components"""
        print("Initializing master model...")
        
        # Get the path to the current script (Main.py)
        file_dir = Path(__file__).resolve().parent

        # Navigate to the target CSV path from settings or default fallback
        if settings.model_source_path and settings.model_source_path.exists():
            csv_path = settings.model_source_path
        else:
            csv_path = (file_dir / '../../../process_mining/media/datacsv_repair.csv').resolve()

        print(f"Resolved CSV path: {csv_path}")
        dataframe = pd.read_csv(csv_path, sep=';')
        
        # Format dataframe
        start_time = datetime.now()
        dataframe['timestamp'] = pd.date_range(start=start_time, periods=len(dataframe), freq='15S')
        dataframe = pm4py.format_dataframe(
            dataframe,
            case_id=settings.model_case_col,
            activity_key=settings.model_activity_col,
            timestamp_key=settings.model_timestamp_col
        )
        
        # Create event log and discover process model
        event_log = pm4py.convert_to_event_log(dataframe)
        net, initial_marking, final_marking = pm4py.discover_petri_net_inductive(event_log)
        ts = reachability_graph.construct_reachability_graph(net, initial_marking)
        
        # Get transaction names
        self.trans_name = []
        for t in net.transitions:
            self.trans_name.append(t.label)
        self.trans_name.extend(['START', 'END'])
        
        # Get states and places
        self.states, self.places = GO_TR.reachabilityGraphProperties(ts, net)
        
        # Initialize Neo4j connection
        self.initialize_neo4j_session()
        
        # Initialize Neo4j environment
        neo4j_func.start_environtmen(net, ts, self.trans_name, initial_marking, final_marking, self.session)
        neo4j_func.generate_organizational_model(self.session)
        
        print("Master model initialized successfully!")
        
    # File that remembers which consumer group is currently "active".
    # Reset creates a fresh group; Continue must reuse THAT group, otherwise it
    # falls back to the base group whose committed offset predates the reset and
    # re-consumes events that were already replayed (duplicate/critical alerts).
    GROUP_STATE_FILE = Path(__file__).with_name('.kafka_group_state.json')

    def _load_active_group_id(self):
        try:
            group_id = json.loads(self.GROUP_STATE_FILE.read_text()).get('group_id')
            if group_id:
                return group_id
        except (FileNotFoundError, ValueError, OSError):
            pass
        return self.kafka_config['group_id']

    def _save_active_group_id(self, group_id):
        try:
            self.GROUP_STATE_FILE.write_text(json.dumps({
                'group_id': group_id,
                'updated_at': datetime.now().isoformat(),
            }))
        except OSError as e:
            print(f"Warning: could not persist active consumer group: {e}")

    def initialize_kafka_consumer(self,status):
        """Initialize Kafka consumer"""
        print(f"Initializing Kafka consumer with {status}")
        
        current_kafka_config = self.kafka_config.copy()
        
        if status == 'reset':
            # Create a completely new consumer group to ensure we don't pick up
            # old committed offsets or buffered messages from the past run.
            new_group = f"{self.kafka_config['group_id']}_reset_{uuid.uuid4().hex[:8]}"
            current_kafka_config['group_id'] = new_group
            self._save_active_group_id(new_group)
            print(f"Reset mode: Using new unique group_id: {new_group}")
        else:
            # Continue: resume the group used by the last run (incl. the last reset).
            current_kafka_config['group_id'] = self._load_active_group_id()
            print(f"Continue mode: Resuming group_id: {current_kafka_config['group_id']}")

        self.consumer = KafkaConsumer(
            settings.kafka_topic_events,
            **current_kafka_config,
            auto_offset_reset='latest',
            enable_auto_commit=True
        )
        
        if status == 'reset':
            # By using a new group_id and auto_offset_reset='latest', Kafka naturally 
            # ignores all existing messages and waits for new ones.
            # We just poll once to join the group and assign partitions.
            print("Waiting for partition assignment...")
            while not self.consumer.assignment():
                self.consumer.poll(timeout_ms=100)

            print(f"Assigned partitions: {self.consumer.assignment()}")
            print('Kafka Consumer resetted to a completely CLEAN SLATE!')
        else:
            print("Kafka consumer continue/initialized successfully!")
        
    def convert_kafka_event_to_gotr_format(self, kafka_event):
        """Convert Kafka event message to GO-TR expected format"""
        # GO-TR expects: [case_id, activity, resource, product_type_value]
        return [
            kafka_event['trace_id'],
            kafka_event['activity'],
            kafka_event['resource'],
            kafka_event.get('product_type', 'unknown')
        ]
        
    def process_event_stream(self, event_streams):
        """Process events using GO-TR algorithm"""
        print(f"Processing {len(event_streams)} events with GO-TR...")
        
        try:
            # Call the modified tokenBasedReplay function
            activate_activities, activities_coming, unknownActivities = GO_TR.tokenBasedReplay(
                event_streams, 
                self.trans_name, 
                self.states, 
                self.places, 
                self.session
            )
            
            return {
                'activate_activities': activate_activities,
                'activities_coming': activities_coming,
                'unknownActivities': unknownActivities
            }
            
        except Exception as e:
            print(f"Error processing event stream: {e}")
            return None
            
    def buffer_events_by_case(self, event, buffer_size=10, timeout_seconds=30):
        """Buffer events by case ID for batch processing"""
        case_id = event[0]  # case_id is first element
        self.event_buffer[case_id].append(event)
        
        # Check if we should process this case's events
        should_process = (
            len(self.event_buffer[case_id]) >= buffer_size or
            self._is_case_timeout(case_id, timeout_seconds)
        )
        
        if should_process:
            events_to_process = self.event_buffer[case_id].copy()
            self.event_buffer[case_id].clear()
            return events_to_process
        
        return None
        
    def _is_case_timeout(self, case_id, timeout_seconds):
        """Check if case has timed out (simplified implementation)"""
        # You might want to implement more sophisticated timeout logic
        return len(self.event_buffer[case_id]) > 0 and time.time() % timeout_seconds < 1
        
    def process_single_event(self, kafka_event):
        """Process a single event immediately"""
        gotr_event = self.convert_kafka_event_to_gotr_format(kafka_event)
        result = self.process_event_stream([gotr_event])
        
        if result:
            self.log_conformance_results(kafka_event['case_id'], result)
            
    def log_conformance_results(self, case_id, results):
        """Log conformance checking results"""
        print(f"\n=== Conformance Results for Case {case_id} ===")
        
        if results['unknownActivities'].get(case_id):
            print(f"Unknown Activities: {results['unknownActivities'][case_id]}")
            
        if results['activate_activities'].get(case_id):
            activities = results['activate_activities'][case_id]
            for activity_info in activities:
                if len(activity_info) >= 3 and activity_info[1] == 'MISSING_TOKEN':
                    print(f"ANOMALY DETECTED: Missing token for activity {activity_info[0]}")
                elif len(activity_info) >= 4 and 'wrong' in str(activity_info[2]):
                    print(f"ANOMALY DETECTED: Organizational issue for activity {activity_info[0]}: {activity_info[2]}")
                    
        print("=" * 50)
    
    def stop_consumer_thread(self):
        """Signals the consumer thread to stop and waits for it to exit."""
        if self.consumer_thread and self.consumer_thread.is_alive():
            print("Stopping consumer thread...")
            self.stop_event.set()  # Signal the thread to stop
            self.consumer_thread.join(timeout=5) # Wait for the thread to finish
            if self.consumer_thread.is_alive():
                print("Warning: Consumer thread did not stop in time.")
            else:
                print("Consumer thread stopped successfully.")
        self.consumer_thread = None

    def start_consumer_thread(self):
        """Starts a new consumer thread."""
        with self.consumer_lock:  # ✅ ATOMIC CHECK AND CREATE
            if self.consumer_thread and self.consumer_thread.is_alive():
                print("Consumer thread is already running.")
                return
                
            print("Starting new consumer thread...")
            self.stop_event.clear()
            self.consumer_thread = Thread(target=self.run_consumer, daemon=True)
            self.consumer_thread.start()
            print("Consumer thread started successfully!")
            
    # def run_consumer(self):
    #     """
    #     The main consumer loop that manages case state and calls the GO-TR logic.
    #     """
    #     print("Waiting for configuration from frontend...")

    #     # Wait until configured via API
    #     self.configuration_event.wait()

    #     print(f"Configuration received! Starting GO-TR Kafka consumer in '{self.check}' mode...")
    #     self.is_running = True

    #     print("Starting stateful GO-TR Kafka consumer...")

    #     try:
    #         # Use poll() instead of iterator to keep running even without messages
    #         while not self.stop_event.is_set():
    #             # Poll for messages with a timeout
    #             with self.consumer_lock:
    #                 if self.consumer is None:
    #                     break
    #                 records = self.consumer.poll(timeout_ms=1000)  # 1 second timeout

    #             if not records:
    #                 # No messages, but keep running
    #                 continue

    #             # Process messages
    #             for topic_partition, messages in records.items():
    #                 for message in messages:
    #                     kafka_event = message.value

    #                     # Use the corrected schema mapping
    #                     p_id = kafka_event.get('trace_id')
    #                     activity = kafka_event.get('activity')
    #                     if not p_id or not activity:
    #                         print(f"Skipping malformed message: {kafka_event}")
    #                         continue

    #                     print(f"Received event: Case {p_id} - Activity '{activity}'")

    #                     # --- Rest of your processing logic stays the same ---
    #                     with self.state_lock:
    #                         if p_id not in self.active_cases:
    #                             with self.neo4j_lock:
    #                                 GO_TR.initialize_case_in_db(p_id, self.session)
    #                                 self.active_cases.add(p_id)

    #                         gotr_event = self.convert_kafka_event_to_gotr_format(kafka_event)
    #                         with self.neo4j_lock:
    #                             result = GO_TR.process_single_event(
    #                                 p_id,
    #                                 gotr_event,
    #                                 self.trans_name,
    #                                 self.states,
    #                                 self.places,
    #                                 self.check,
    #                                 self.session
    #                             )

    #                         self.case_event_history[p_id].append(activity)
    #                         if result['status'] == 'deviation':
    #                             self.handle_deviation(p_id, result)

    #                         if activity == 'Return the item':
    #                             print(f"Detected end of case for {p_id}. Finalizing...")
    #                             final_stats = GO_TR.finalize_case(p_id, self.session)
    #                             if p_id in self.active_cases:
    #                                 self.active_cases.remove(p_id)

    #     except KeyboardInterrupt:
    #         print("\nShutting down consumer...")
    #     except Exception as e:
    #         print(f"Error in consumer: {e}")
    #         import traceback
    #         traceback.print_exc()
    #     finally:
    #         print("Consumer thread exiting, cleaning up...")
    #         self.cleanup()

    def _update_anomaly_scores(self, p_id, deviation_details):
        """Update scores - MUST be called with state_lock held"""
        violations = deviation_details.get('violations', [])
        if not violations and deviation_details.get('type'):
             violations = [deviation_details]
             
        for v in violations:
            v_type = v.get('type')
            if v_type == 'missing_token':
                self.anomaly_scores[p_id] += 1.0
            elif v_type == 'organizational':
                if 'wrong_structure' in v.get('org_issues', []):
                    self.anomaly_scores[p_id] += 0.8
                if 'wrong_team' in v.get('org_issues', []):
                    self.anomaly_scores[p_id] += 0.5
            elif v_type == 'unknown_activity':
                self.unknown_activities[p_id].append(v.get('activity'))

    def _send_deviation_alert_async(self, p_id, deviation_details, marking_snapshot=None, fitness=None, enabled_transitions=None, actor=None, raw_event=None):
        """Send alert - call OUTSIDE locks"""
        # Read current scores with lock
        with self.state_lock:
            current_score = self.anomaly_scores[p_id]
            full_history = list(self.case_event_history.get(p_id, []))

        culprit_act = (
            deviation_details.get('activity')
            or (deviation_details.get('violations', [{}])[0].get('activity') if deviation_details.get('violations') else None)
        )
        culprit_actor = (
            actor
            or deviation_details.get('actor')
            or deviation_details.get('resource')
            or (deviation_details.get('violations', [{}])[0].get('actor') if deviation_details.get('violations') else None)
        )

        # Prepare and send without lock
        alert_data = {
            "type": "deviation_alert",
            "timestamp": datetime.now().isoformat(),
            "case_id": p_id,
            "deviation_type": deviation_details.get('type'),
            "violations": deviation_details.get('violations', []),
            "details": deviation_details,
            "cumulative_score": current_score,
            "event_history": full_history,
            "message": f"Deviation detected in case {p_id}",
            "marking_snapshot": marking_snapshot or {},
            "fitness": fitness,
            "enabled_transitions": enabled_transitions or [],
            "culprit_activity": culprit_act,
            "actor": culprit_actor,
            "raw_event": raw_event
        }

        if current_score >= 1.5:
            alert_data["type"] = "critical_alert"

        self.send_deviation_alert(alert_data)

    def run_consumer(self):
        self.configuration_event.wait()
        self.is_running = True

        try:
            while not self.stop_event.is_set():
                records = None

                # ✅ STEP 1: Get records with consumer lock
                with self.consumer_lock:
                    if self.consumer is None:
                        break
                    records = self.consumer.poll(timeout_ms=1000)

                if not records:
                    continue

                # ✅ STEP 2: Process WITHOUT holding global locks
                for topic_partition, messages in records.items():
                    for message in messages:
                        kafka_event = message.value
                        p_id = kafka_event.get('trace_id')
                        activity = kafka_event.get('activity')
                        event_index = kafka_event.get('event_index', None)

                        if not p_id or not activity:
                            continue

                        p_id = str(p_id)
                        now_epoch = time.time()
                        now_iso = datetime.now().isoformat()

                        # ✅ STEP 3: Case Initialization (Deterministic & Replay-Safe)
                        case_is_new = False
                        with self.state_lock:
                            # Replay detection:
                            # A case is new ONLY if:
                            # 1. event_index == 0 (explicit start of trace or replay simulation)
                            # 2. Case has never been seen before (not in active_cases and not in finished_cases)
                            if event_index == 0:
                                case_is_new = True
                            elif p_id not in self.active_cases and p_id not in self.finished_cases:
                                case_is_new = True
                            else:
                                case_is_new = False

                            if case_is_new:
                                self.active_cases.add(p_id)
                                self.finished_cases.discard(p_id)
                                self.anomaly_scores[p_id] = 0.0
                                self.case_event_history[p_id] = []
                                self.case_metadata[p_id] = {
                                    "case_id": p_id,
                                    "started_at": now_iso,
                                    "start_epoch": now_epoch,
                                    "last_activity": activity,
                                    "last_event_time": now_epoch,
                                    "event_count": 1,
                                    "has_deviations": False
                                }
                            else:
                                if p_id in self.finished_cases:
                                    self.finished_cases.discard(p_id)
                                    self.active_cases.add(p_id)

                                meta = self.case_metadata.setdefault(p_id, {
                                    "case_id": p_id,
                                    "started_at": now_iso,
                                    "start_epoch": now_epoch,
                                    "event_count": 0,
                                    "has_deviations": False
                                })
                                meta["last_activity"] = activity
                                meta["last_event_time"] = now_epoch
                                meta["event_count"] = meta.get("event_count", 0) + 1

                        # ✅ STEP 4: DB init outside state lock
                        if case_is_new:
                            with self.neo4j_lock:
                                GO_TR.initialize_case_in_db(p_id, self.session)
                            self.broadcast_case_lifecycle(p_id, "started", {
                                "activity": activity,
                                "started_at": now_iso,
                                "current_marking": ["source"],
                                "marking": {"source": {"token": 1, "missing": 0, "consumed": 0, "produced": 1, "is_final": False}},
                                "total_active_tokens": 1,
                                "total_missing_tokens": 0,
                                "enabled_transitions": []
                            })

                        # ✅ STEP 5: Process event (Token Replay)
                        gotr_event = self.convert_kafka_event_to_gotr_format(kafka_event)

                        with self.neo4j_lock:
                            result = GO_TR.process_single_event(
                                p_id, gotr_event, self.trans_name,
                                self.states, self.places, self.check, self.session
                            )

                        # ✅ STEP 6: Update state
                        with self.state_lock:
                            self.case_event_history[p_id].append(activity)

                            if result['status'] == 'deviation':
                                self._update_anomaly_scores(p_id, result)
                                if p_id in self.case_metadata:
                                    self.case_metadata[p_id]["has_deviations"] = True

                        # ✅ STEP 7 & 8: MUTLAK Process Termination via Petri Net Marking (NO CHEATING!)
                        is_finished = False
                        fitness_summary = None
                        with self.neo4j_lock:
                            if GO_TR.is_case_finished(p_id, self.session):
                                is_finished = True
                                fitness_summary = GO_TR.finalize_case(p_id, self.session)

                        if is_finished:
                            with self.state_lock:
                                self.active_cases.discard(p_id)
                                self.finished_cases.add(p_id)
                                meta = self.case_metadata.pop(p_id, {})

                            total_miss = fitness_summary.get("missing", 0) if fitness_summary else 0
                            fin_fitness = fitness_summary.get("fitness", 1.0) if fitness_summary else 1.0

                            # Send alert with terminal marking snapshot
                            if result['status'] == 'deviation':
                                self._send_deviation_alert_async(
                                    p_id, result,
                                    marking_snapshot={"sink": {"token": 0, "missing": total_miss, "consumed": 1, "produced": 1, "is_final": True}},
                                    fitness=fin_fitness,
                                    enabled_transitions=[],
                                    actor=kafka_event.get('resource'),
                                    raw_event=kafka_event
                                )

                            self.broadcast_case_lifecycle(p_id, "completed", {
                                "fitness": fin_fitness,
                                "last_activity": activity,
                                "recap": fitness_summary,
                                "total_missing_tokens": total_miss,
                                "total_active_tokens": 0,
                                "current_marking": ["sink"],
                                "enabled_transitions": []
                            })
                        else:
                            current_marking = []
                            enabled_transitions = []
                            marking_map = {}
                            total_active = 0
                            total_missing = 0
                            current_fitness = None
                            try:
                                with self.neo4j_lock:
                                    q_places = """
                                        MATCH (p:Place)
                                        WHERE p.p_id = $p_id OR toString(p.p_id) = $p_id
                                        RETURN p.name AS name, p.token AS token, p.m AS missing, p.c AS consumed, p.p AS produced, p.is_final AS is_final
                                    """
                                    places_res = self.session.run(q_places, p_id=str(p_id)).data()
                                    
                                    total_c = 0
                                    total_p = 0
                                    for p in places_res:
                                        p_name = p.get("name")
                                        tok = p.get("token") or 0
                                        miss = p.get("missing") or 0
                                        c_val = p.get("consumed") or 0
                                        p_val = p.get("produced") or 0
                                        total_active += tok
                                        total_missing += miss
                                        total_c += c_val
                                        total_p += p_val
                                        marking_map[p_name] = {
                                            "token": tok,
                                            "missing": miss,
                                            "consumed": c_val,
                                            "produced": p_val,
                                            "is_final": bool(p.get("is_final"))
                                        }

                                    current_marking = [k for k, v in marking_map.items() if v["token"] > 0]

                                    if total_c > 0:
                                        # In-flight running fitness: evaluate observed transitions without penalizing valid in-flight tokens
                                        raw_fit = 1.0 - (total_missing / total_c)
                                        current_fitness = max(0.0, min(1.0, round(raw_fit, 4)))

                                    q_enabled = """
                                        MATCH (p:Place)-[:Arc]->(t:Transition)
                                        WHERE (p.p_id = $p_id OR toString(p.p_id) = $p_id) AND t.p_id = p.p_id
                                        WITH t, collect(p.token) AS tokens
                                        WHERE all(tok IN tokens WHERE tok > 0)
                                        RETURN t.name AS name
                                    """
                                    res_en = self.session.run(q_enabled, p_id=str(p_id)).data()
                                    enabled_transitions = [r["name"] for r in res_en]
                            except Exception as e:
                                print(f"Error fetching marking/enabled for case {p_id}: {e}")

                            with self.state_lock:
                                if p_id in self.case_metadata:
                                    self.case_metadata[p_id]["missing_tokens"] = total_missing

                            # Send alert with active marking snapshot
                            if result['status'] == 'deviation':
                                self._send_deviation_alert_async(
                                    p_id, result,
                                    marking_snapshot=marking_map,
                                    fitness=current_fitness,
                                    enabled_transitions=enabled_transitions,
                                    actor=kafka_event.get('resource'),
                                    raw_event=kafka_event
                                )

                            self.broadcast_case_lifecycle(p_id, "progress", {
                                "activity": activity,
                                "score": round(self.anomaly_scores.get(p_id, 0.0), 2),
                                "has_deviations": self.case_metadata.get(p_id, {}).get("has_deviations", total_missing > 0),
                                "current_marking": current_marking,
                                "marking": marking_map,
                                "total_active_tokens": total_active,
                                "total_missing_tokens": total_missing,
                                "enabled_transitions": enabled_transitions,
                                "fitness": current_fitness
                            })
        except KeyboardInterrupt:
            print("\nShutting down consumer...")
        except Exception as e:
            print(f"Error in consumer: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.cleanup()


    # def handle_deviation(self, p_id, deviation_details):
    #     """
    #     Handles the logic for when a deviation is detected.
    #     Updates anomaly scores and sends alerts.
    #     """
    #     deviation_type = deviation_details.get('type')
    #     activity_did = deviation_details.get('activity')
    #     if deviation_type == 'missing_token':
    #         self.anomaly_scores[p_id] += 1.0
    #     elif deviation_type == 'organizational':
    #         if 'wrong_structure' in deviation_details.get('org_issues', []):
    #             self.anomaly_scores[p_id] += 0.8
    #         if 'wrong_team' in deviation_details.get('org_issues', []):
    #             self.anomaly_scores[p_id] += 0.5
    #     elif deviation_type == 'unknown_activity':
    #         self.unknown_activities[p_id].append(deviation_details.get('activity'))

    #     print(f"Anomaly score for case {p_id} is now: {self.anomaly_scores[p_id]}")

    #     # Prepare alert data
    #     alert_data = {
    #         "type": "deviation_alert",
    #         "timestamp": datetime.now().isoformat(),
    #         "case_id": p_id,
    #         "deviation_type": deviation_type,
    #         "details": deviation_details,
    #         "cumulative_score": self.anomaly_scores[p_id],
    #         "event_history": self.case_event_history[p_id][-5:],  # Last 5 events
    #         "message": f"Deviation detected in case {p_id}: {deviation_type} {activity_did}"
    #     }
    
    #     if self.anomaly_scores[p_id] >= 1.5:
    #         print(f"🔥 WARNING! Inspection needed on Case ID: {p_id}")
    #         # THIS IS WHERE YOU WOULD SEND A WEBSOCKET/API ALERT TO THE FRONTEND
    #         critical_alert = {
    #             **alert_data,
    #             "type": "critical_alert",
    #             "message": f"CRITICAL: Case {p_id} requires immediate inspection! with activity {activity_did} {deviation_type}"
    #         }
    #         self.send_deviation_alert(critical_alert)
    #     else:
    #         # Send WebSocket alert
    #         self.send_deviation_alert(alert_data)
            
    def cleanup(self):
        """Clean up resources"""
        self.is_running = False
        
        if self.consumer:
            self.consumer.close()
            print("Kafka consumer closed.")
            
        if self.session:
            self.session.close()
            print("Neo4j session closed.")
            
        if self.driver:
            self.driver.close()
            print("Neo4j driver closed.")


def main():
    """Main function to run the consumer"""
    consumer = GOTRKafkaConsumer()
    
    try:
        # Initialize master model and Kafka consumer
        consumer.initialize_master_model()
        # Start WebSocket server
        consumer.start_websocket_server()
        time.sleep(2)  # Give server time to start
        print("System ready. Press Ctrl+C to exit.")
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nShutting down...")
    except Exception as e:
        print(f"Error running consumer: {e}")
    finally:
        consumer.cleanup()


if __name__ == "__main__":
    main()