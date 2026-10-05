# GO-TR Project TODO

## 1. Master Model (Petri Net) Visualization Feature
**Status:** Planned  
**Description:** Implement a visual representation of the Master Model (Petri Net) in the React dashboard to help users understand the standard operating procedure (SOP) and see the context of deviations visually.

### Challenges
- **Data Representation:** The model is currently stored in Neo4j as a directed graph. We need a way to extract and interpret this graph specifically as a Petri Net (differentiating Places and Transitions).
- **Auto-Layouting (Graph Drawing):** Programmatically drawing a complex, cyclic process graph without edge-crossings or visual clutter is computationally difficult.
- **State Synchronization (For Live Replay):** If we want to show active tokens, we must query the exact current marking from Neo4j in real-time and overlay it on the static model.

### Implementation Approach
1. **Backend (Neo4j Extraction API):**
   - Create a FastAPI endpoint (e.g., `GET /api/model/master`).
   - Execute a Cypher query to retrieve all `:Place` nodes, `:Transition` nodes, and their relationship arcs.
   - Format and return the graph as standard JSON (nodes and edges).
2. **Frontend (React Graph Rendering):**
   - Integrate a robust graph visualization library like **React Flow** (or Cytoscape.js).
   - Use an auto-layout algorithm like **Dagre** to automatically arrange nodes left-to-right or top-to-bottom.
   - **Styling Rules:** 
     - Render `:Place` nodes as Circles ⚪.
     - Render `:Transition` nodes as Rectangles 🟦.
3. **Phased Rollout:**
   - *Phase 1 (Static):* Render the master model structure purely as a reference diagram on a new dashboard tab.
   - *Phase 2 (Dynamic):* Integrate live state overlay (highlighting active Places with a red token 🔴 based on a specific Case ID).
