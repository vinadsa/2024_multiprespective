import sys
from unittest.mock import MagicMock
from Algorithm.GO_TR import process_single_event, tokenBasedReplay, normalize_event

def test_process_single_event():
    print("Testing process_single_event...")
    session_mock = MagicMock()
    
    # Mocking single return values for queries
    # For example, getCurrentMarking returning 'p_0'
    # and getActivityOrgRule returning a mock rule
    def mock_run(query, **kwargs):
        result_mock = MagicMock()
        # For getCurrentMarking
        if "MATCH (cm:Place" in query:
            result_mock.single.return_value = ["p_0"]
            result_mock.__iter__.return_value = [["p_0"]]
        # For getAllEmptyInputPlaces
        elif "MATCH (ip_mt: Place" in query:
            result_mock.__iter__.return_value = [] # No missing tokens
        # For replayAndMarkFM
        elif "MATCH (ip: Place {p_id: $p_id})-[r]->(t:Transition {label:$activity})" in query:
            result_mock.__iter__.return_value = [("p_0", "activity_name")]
        # For getActivityOrgRule
        elif "MATCH (t:Transition {type:'master', label:$activity})" in query:
            record_dict = {
                "role": "Engineer",
                "team": None,
                "team_var": "product_type",
                "writes": [{"name": "product_type", "attribute": "product_type", "source": "any", "default": "unknown"}]
            }
            result_mock.single.return_value = record_dict
        # For readVariable
        elif "MATCH (a:Transition {p_id:$p_id, label:$activity})<--(v:Variable" in query:
            result_mock.__iter__.return_value = [["Laptop Team"]]
        # For checkOrgStructurePattern
        elif "MATCH (e:Entity {eName:" in query:
            result_mock.single.return_value = {"cnt": 1} # Conform
        return result_mock

    session_mock.run.side_effect = mock_run

    event = ["case_1", "Analyze Defect", "John", "Laptop"]
    
    res = process_single_event("case_1", event, ["Analyze Defect"], ["state_1"], ["p_0"], "multi", session_mock)
    print("Result:", res)
    assert res["status"] == "conforming"

if __name__ == "__main__":
    test_process_single_event()
    print("Independent testing completed successfully!")
