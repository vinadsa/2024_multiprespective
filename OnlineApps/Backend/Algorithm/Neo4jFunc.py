# AFTER FIX
def createState(tx, state):
    tx.run("CREATE (:State {name: $state})", state=state)
    return None
def createRelationship(tx, state_source, transition_name, transition_label, state_target):
    tx.run('''
    MATCH (x:State),(y:State)
    WHERE x.name = $state_source AND y.name = $state_target
    MERGE (x)-[:Transition {name: $transition_name, label:$transition_label}]->(y)
    ''', state_source=state_source, transition_name=transition_name, transition_label=transition_label, state_target=state_target)
    return None

# Generate REACHABILITY GRAPH di neo4j dari objek model Petrinet
def generate_rg_on_neo4j(net,ts,trans_name,session):
    #session.run("MATCH (N) detach delete (N)")

    for s in ts.states:
        sname = s.name
        createState(session, sname)
    
    for t in ts.transitions:
        a = (t.name[1:-1].split(','))
        print(a[0],a[1][2:-1])
        tlabel = a[1][2:-1]
        tname = a[0]
        if tlabel not in trans_name:
            tlabel = 'Invisible'
        else:
            tlabel = a[1][2:-1]

        source = t.from_state
        target = t.to_state
        print(source,target)

        createRelationship(session, source.name, tname, tlabel, target.name)
    return None

# Cipher untuk membuat petrinet di Neo4J
def createTransition(tx, tname, tlabel):
    tx.run("CREATE (:Transition {type:'master', name: $tname, label: $tlabel })", tname=tname, tlabel=tlabel)
    return None
def createPlace(tx, place):
    tx.run("CREATE (:Place {type:'master', label: 'Invisible', name: $place, token:0, c:0, p:0, m:0, fm:0, inv_incoming: false})", place=place)
    return None
def createRelationship_place_to_transition(tx, place_name, transition_name):
    tx.run('''
    MATCH (x:Place), (y:Transition)
    WHERE x.name = $place_name AND y.name = $transition_name
    MERGE (x)-[:Arc {type:'master', name: $place_name+'_'+$transition_name, f:0, c:0}]->(y)
    ''', place_name=place_name, transition_name=transition_name)
    return None
def createRelationship_transition_to_place(tx, transition_name, place_name):
    tx.run('''
    MATCH (x:Transition), (y:Place)
    WHERE x.name = $transition_name AND y.name = $place_name
    MERGE (x)-[:Arc {type:'master', name: $transition_name+'_'+$place_name, f:0, p:0}]->(y)
    ''', place_name=place_name, transition_name=transition_name)
    return None
def setMasterInitialMarking(tx, im_name):
    tx.run('''
    MATCH (im:Place {name:$im_name})
    SET im.type = 'master', im.im = True, im.token = 1, im.p = 1
    ''', im_name=im_name)
    return None
def setMasterFinalMarking(tx, fm_name):
    # NOTE: `fm` is a numeric counter mutated by the replay queries (op.fm = 1, ip.fm - 1),
    # so the final place is flagged with a dedicated boolean `is_final` instead of fm=True.
    tx.run('''
    MATCH (x:Place {name:$fm_name})
    SET x.is_final = true
    ''', fm_name=fm_name)
    return None

def start_environtmen(net,ts,trans_name,initial_marking,final_marking,session):
    # Reset Database
    session.run("MATCH (N) detach delete (N)")

    # buat reacability graph
    generate_rg_on_neo4j(net,ts,trans_name,session)

    #Apabila transistion tidak ditemukan, set sebagai invisible
    for t in net.transitions:
        if t.label == None:
            tlabel = 'Invisible'
        else:
            tlabel = t.label
        tname = t.name
        createTransition(session, tname, tlabel)
        
    # Create Places?
    for p in net.places:
        createPlace(session, p.name)

    for arc in net.arcs:
        source = arc.source
        target = arc.target
        source_class = source.__class__.__name__
        target_class = target.__class__.__name__

        if source_class == 'Place':
            place_name = source.name
            transition_name = target.name
            createRelationship_place_to_transition(session, place_name, transition_name)
        else: # transition
            transition_name = source.name
            place_name = target.name
            createRelationship_transition_to_place(session, transition_name, place_name)

    # Initial
    im_name = [im for im in initial_marking][0].name
    setMasterInitialMarking(session, im_name)

    # Final (a final marking may consist of more than one place)
    for fm in final_marking:
        setMasterFinalMarking(session, fm.name)
    return None

# Cypher to create organizational model
# Entities, resources and activity rules are no longer hardcoded here:
# they are defined in an org model file (YAML/JSON, see models/org_model.repair.yaml)
# and materialized through Algorithm/OrgModel.py using the functions below.

# contoh entity
# entity_name = team, entity

def createEntity(tx, eName, kind=None):
    tx.run("CREATE (:Entity {eName:$eName, kind:$kind})", eName=eName, kind=kind)
    return None

# def createOrgUnit(tx):
#     createEntity(tx, 'orgUnit')
#     return None
# def createTeam(tx):
#     createEntity(tx, 'team')
#     return None
# def createRole(tx):
#     createEntity(tx, 'role')
    return None

def createResource(tx, rName):
    tx.run("CREATE (:Resource {rName: $rName})", rName=rName)
    return None

def createVariable(tx, name, value='', attribute=None, source='any', default=None):
    """Create a master case variable. `attribute`/`source` tell GO-TR where to read its value from."""
    tx.run('''
    CREATE (:Variable {type:'master', name:$name, team:$value, attribute:$attribute, source:$source, default:$default})
    ''', name=name, value=value, attribute=attribute or name, source=source, default=default)
    return None

def createProductTypeVariable(tx, name, prodType):
    # Backward-compatible alias (the variable used to be hardcoded as 'product_type')
    return createVariable(tx, name, prodType)

# fungsi relasi
def createRelationship_team_to_ou(tx):
    tx.run('''
    MATCH (x:Team), (y:OrgUnit)
    MERGE (x)-[:isA]->(y)
    ''')
    return None
def createRelationship_role_to_ou(tx):
    tx.run('''
    MATCH (x:Role), (y:OrgUnit)
    MERGE (x)-[:isA]->(y)
    ''')
    return None

def createRelationship_resource_to_Entity(tx, rName, eName ):
    tx.run('''
    MATCH (x:Resource {rName:$rName}), (y:Entity {eName:$eName})
    MERGE (x)<-[:ROLE]-(y)
    ''', rName=rName, eName=eName)


def createRelationship_resource_to_Role(tx, rName, eName ):
    tx.run('''
    MATCH (x:Resource {rName:$rName}), (y:Role {eName:$eName})
    MERGE (x)<-[:ROLE]-(y)
    ''', rName=rName, eName=eName)
    return None
def createRelationship_resource_to_Team(tx, rName, tName ):
    tx.run('''
    MATCH (x:Resource {rName:$rName}), (y:Team {tName:$tName})
    MERGE (x)<-[:TEAM]-(y)
    ''', rName=rName, tName=tName)
    return None

def createRelationship_entity_supervise_entity(tx, eName1, eName2 ):
    tx.run('''
    MATCH (x:Entity {eName:$eName1}), (y:Entity {eName:$eName2})
    MERGE (x)-[:SUPERVISED_BY]->(y)
    ''', eName1=eName1, eName2=eName2)

def createRelationship_entity_to_root(tx, eName, rootName ):
    tx.run('''
    MATCH (x:Entity {eName:$eName}), (y:Entity {eName:$rootName})
    MERGE (x)-[:TO_ROOT]->(y)
    ''', eName=eName, rootName=rootName)


def createRelationship_task_to_entity(tx, label, eName ):
    tx.run('''
    MATCH (x:Transition {type:'master', label:$label}), (y:Entity {eName:$eName})
    MERGE (x)-[:EXECUTED_BY]->(y)
    ''', label=label, eName=eName)

def createRelationship_task_to_role(tx, label, eName ):
    tx.run('''
    MATCH (x:Transition {label:$label}), (y:Role {eName:$eName})
    MERGE (x)-[:EXECUTED_BY]->(y)
    ''', label=label, eName=eName)
    return None
def createRelationship_task_to_team(tx, label, tName ):
    tx.run('''
    MATCH (x:Transition {label:$label}), (y:Team {tName:$tName})
    MERGE (x)-[:EXECUTED_BY]->(y)
    ''', label=label, tName=tName)
    return None

# write variable
def createRelationship_task_to_variable(tx, label, name ):
    tx.run('''
    MATCH (x:Transition {type:'master', label:$label}), (y:Variable {type:'master', name:$name})
    MERGE (x)-[:WRITE]->(y)
    ''', label=label, name=name)
    return None

# read variable
def createRelationship_variable_to_task(tx, var_name, label):
    tx.run('''
    MATCH (y:Variable {type:'master', name:$var_name}),(x:Transition {type:'master', label:$label})
    MERGE (y)-[:READ]->(x)
    ''', label=label, var_name=var_name)
    return None

def generate_organizational_model(session, org_model=None):
    """
    Materialize the organizational model in Neo4j.

    The hardcoded "Repair Request" org model that used to live here was migrated to
    ``models/org_model.repair.yaml``. ``org_model`` may be an ``OrgModel`` instance or a
    path to a YAML/JSON file; when omitted the Repair baseline file is used.
    """
    from pathlib import Path
    from .OrgModel import OrgModel, load_org_model

    if org_model is None:
        org_model = Path(__file__).resolve().parent.parent / "models" / "org_model.repair.yaml"
    if not isinstance(org_model, OrgModel):
        org_model = load_org_model(org_model)
    return org_model.apply_to_neo4j(session)


def clear_organizational_model(session):
    """Remove every org-model artefact (entities, resources, variables, activity rules)."""
    session.run("MATCH (n) WHERE n:Entity OR n:Resource OR n:Variable DETACH DELETE n")
    session.run('''
    MATCH (t:Transition)
    REMOVE t.org_modeled, t.req_role, t.req_team, t.team_var, t.writes
    ''')
    return None


def set_transition_org_rule(session, label, role=None, team=None, team_var=None, writes=None):
    """Store the organizational rule of an activity on its master Transition node(s)."""
    session.run('''
    MATCH (t:Transition {type:'master', label:$label})
    SET t.org_modeled = true, t.req_role = $role, t.req_team = $team,
        t.team_var = $team_var, t.writes = $writes
    ''', label=label, role=role, team=team, team_var=team_var, writes=list(writes or []))
    return None


def wipe_database(session):
    """Delete everything (master model, reachability graph, org model and cases)."""
    session.run("MATCH (n) DETACH DELETE n")
    return None

# cloning diidentifikasikan dari type di source place
# tiap cloning bisa dibuat dengan p_id baru
# p_id pada master diabaikan saja, krn hanya untuk diduplikasi oleh cloning nya

#https://neo4j.com/labs/apoc/4.2/overview/apoc.refactor/apoc.refactor.cloneSubgraph/

# Clone berbasis koleksi node master (Place, Transition, Variable). Semua relasi di antara
# node tersebut (Arc, WRITE, READ) ikut ter-clone; EXECUTED_BY ke Entity tetap hanya di master.
# Menggantikan query lama `MATCH path = (rootA)-[*]->(node)` yang jumlah path-nya tumbuh
# eksponensial pada model besar / banyak loop (hasil discovery dari log acak).
Q_CLONE_SUBGRAPH = '''
    MATCH (n {type:'master'})
    WHERE n:Place OR n:Transition OR n:Variable
    WITH collect(n) AS nodes
    CALL apoc.refactor.cloneSubgraph(nodes, [], {})
    YIELD input, output, error
    WITH collect(output) AS clones
    UNWIND clones AS node
    SET node.type = 'clone', node.p_id = $p_id
    RETURN count(DISTINCT node) AS cloned
'''

Q_TAG_CLONE_RELS = '''
    MATCH (a {p_id: $p_id, type:'clone'})-[r]->(b {p_id: $p_id, type:'clone'})
    SET r.type = 'clone', r.p_id = $p_id
'''

# Query lama (fallback bila apoc.refactor.cloneSubgraph tidak tersedia)
Q_CLONE_FROM_PATHS = '''
    MaTCH (rootA:Place {type:'master', im:True}) // initial marking
    WITH distinct rootA
    CALL apoc.refactor.cloneNodes([rootA])
    YIELD input, output
    WITH rootA, input, output AS rootB
    SET rootB.type='clone', rootB.p_id = $p_id

    WITH rootA, rootB
    MATCH path = (rootA)-[*]->(node)
    WHERE node.type = 'master'
    WITH rootA, rootB, collect(distinct path) as paths
    CALL apoc.refactor.cloneSubgraphFromPaths(paths, {
        standinNodes:[[rootA, rootB]]
    })
    YIELD input, output, error
    WITH collect(DISTINCT output) AS nodes
    UNWIND nodes as node
    SET node.type = 'clone', node.p_id = $p_id

    RETURN node //input, output, error
'''

_clone_strategy = {"use_subgraph": True}

# Ini adalah cloning dari Source (Master) untuk dijalankan GO-TR pada situasi yang baru
def createCloneFromModelRef(p_id,session):
    print(p_id)
    if _clone_strategy["use_subgraph"]:
        try:
            session.run(Q_CLONE_SUBGRAPH, p_id=p_id).consume()
            session.run(Q_TAG_CLONE_RELS, p_id=p_id).consume()
            return None
        except Exception as e:  # e.g. older APOC without cloneSubgraph
            print(f"apoc.refactor.cloneSubgraph unavailable ({e}); falling back to path-based clone")
            _clone_strategy["use_subgraph"] = False
    session.run(Q_CLONE_FROM_PATHS, p_id=p_id).consume()
    return None
