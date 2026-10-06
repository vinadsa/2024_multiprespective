# GO-TR Project TODO

## 1. Master Model (Petri Net) Visualization Feature
**Status:** Completed ✅ (Phase 1 & Phase 2 Fully Realized)  
**Description:** Implement a visual representation of the Master Model (Petri Net) in the React dashboard to help users understand the standard operating procedure (SOP) and see the context of deviations visually.

### Challenges
- **Data Representation:** The model is currently stored in Neo4j as a directed graph. We need a way to extract and interpret this graph specifically as a Petri Net (differentiating Places and Transitions).
- **Auto-Layouting (Graph Drawing):** Programmatically drawing a complex, cyclic process graph without edge-crossings or visual clutter is computationally difficult.
- **State Synchronization (For Live Replay):** If we want to show active tokens, we must query the exact current marking from Neo4j in real-time and overlay it on the static model.

### Implementation Approach
1. **Backend (Neo4j Extraction API):**
   - [x] Create a FastAPI endpoint (`GET /api/model/master`).
   - [x] Create a case marking endpoint (`GET /api/cases/{case_id}/marking`).
   - [x] Enrich WebSocket `case_lifecycle` telemetry with `current_marking` and `enabled_transitions`.
   - [x] Execute Cypher queries to retrieve master nodes/arcs, clone markings, and enabled transitions.
2. **Frontend (React Graph Rendering & Dynamic Overlay):**
   - [x] Integrate `@xyflow/react` and `@dagrejs/dagre` (React 19 compatible).
   - [x] Build auto-layout algorithm (`petriLayout.js`) to arrange nodes cleanly in Left-to-Right (`LR`) orientation.
   - [x] **Styling Rules (Apple HIG / Cupertino Native):**
     - `:Place` nodes rendered as Circles ⚪ with distinct Start (green), Final Sink (red double-ring), active red tokens 🔴 with halo pulse, and warning badges ⚠️ for missing tokens.
     - `:Transition` nodes rendered as rounded Activity Cards 🟦 with organizational role/team badges, System Blue borders with `▶ READY` status badges for enabled activities, and `LAST FIRED` indicators.
     - Floating Cupertino Case Selector bar (SOP Master / Live Follow / Active Cases dropdown).
     - Floating Case Inspector HUD card displaying real-time metrics (tokens, fitness, anomaly score, ready activities).
     - Animated flow edges originating from active places to enabled transitions.
     - Cross-tab navigation: "Inspect" button on Active Cases Tracker cards.
     - Full Light & Dark mode OLED support bound to CSS design tokens.
3. **Phased Rollout:**
   - [x] *Phase 1 (Static):* Render the master model structure purely as a reference diagram on a new "Process Model" dashboard tab.
   - [x] *Phase 2 (Dynamic):* Integrate live state overlay (highlighting active Places with dynamic tokens 🔴, enabled transitions, and Inspector HUD based on selected Case ID or real-time streaming).

