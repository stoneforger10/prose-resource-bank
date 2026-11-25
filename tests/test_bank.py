import hashlib
import json
import re
import sys
from itertools import permutations, product
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
COORDINATE = "stoneforger10/prose-resource-bank/" + "a" * 40 + "/fixtures/bank.json"
BODY = (ROOT / "fixtures/bank.json").read_bytes()
SHA = hashlib.sha256(BODY).hexdigest()
READY = {"status": "READY", "capacity": [3, 2], "maximum": [[3, 2], [2, 2]]}
UNKNOWN = {"status": "UNKNOWN", "capacity": [], "maximum": []}


@pytest.fixture
def bank(direct_deploy):
    instance = direct_deploy(str(ROOT / "contracts/ProseResourceBank.py"))
    return instance, sys.modules[type(instance._instance).__module__]


def mock(vm, result, body=BODY, status=200):
    vm.clear_mocks()
    vm.mock_web(re.escape("https://raw.githubusercontent.com/" + COORDINATE) + "$", {
        "method": "GET", "response": {"status": status, "headers": {}, "body": body},
    })
    vm.mock_llm(r".*PROSE RESOURCE BANK EXTRACTION.*", json.dumps(result))


def controllers(mod):
    a = str(mod.gl.message.sender_address).lower()
    b = "0x" + ("2" if a != "0x" + "2" * 40 else "3") * 40
    return [a, b]


def test_validator_recomputes_exact_interpretation(bank, direct_vm):
    contract, mod = bank
    mock(direct_vm, READY)
    key = contract.open_bank(COORDINATE, SHA, json.dumps(controllers(mod)))
    assert direct_vm.run_validator()
    state = contract.get_bank(key)
    record = contract.get_specification(state["specification"])
    assert record["text"] == BODY.decode()
    assert record["claims"] == READY
    mock(direct_vm, {**READY, "capacity": [4, 2]})
    assert not direct_vm.run_validator()
    mock(direct_vm, READY, BODY + b" ")
    assert not direct_vm.run_validator()


def test_controller_request_finish_and_idempotence(bank, direct_vm):
    contract, mod = bank
    roster = controllers(mod)
    mock(direct_vm, READY)
    key = contract.open_bank(COORDINATE, SHA, json.dumps(roster))
    assert contract.request(key, "[1,1]") == [0, 1]
    before = contract.get_bank(key)
    assert before["held"] == [[1, 1], [0, 0]]
    assert before["available"] == [2, 1]
    with direct_vm.expect_revert("Request exceeds the job maximum claim"):
        contract.request(key, "[3,0]")
    assert contract.get_bank(key) == before
    assert contract.open_bank(COORDINATE, SHA, json.dumps(roster)) == key
    other = contract.open_bank(COORDINATE, SHA, json.dumps([roster[1], "0x" + "9" * 40]))
    with direct_vm.expect_revert("Sender controls no job"):
        contract.request(other, "[1,1]")
    assert contract.finish(key) == [1, 1]
    assert contract.get_bank(key)["available"] == [3, 2]
    assert contract.get_bank(key)["safe_order"] == [1]
    with direct_vm.expect_revert("Job has finished"):
        contract.request(key, "[1,1]")


def test_unknown_and_source_failure(bank, direct_vm):
    contract, mod = bank
    args = (COORDINATE, SHA, json.dumps(controllers(mod)))
    mock(direct_vm, READY, status=404)
    with direct_vm.expect_revert("Specification acquisition or interpretation failed"):
        contract.open_bank(*args)
    mock(direct_vm, UNKNOWN)
    key = contract.open_bank(*args)
    assert direct_vm.run_validator()
    assert contract.get_bank(key)["status"] == "UNKNOWN"
    with direct_vm.expect_revert("Resource claims are unresolved"):
        contract.request(key, "[1,1]")


def test_greedy_witness_matches_exhaustive_ordering(bank):
    _, mod = bank
    checked = 0
    for caps in product(range(3), repeat=4):
        maximum = (caps[:2], caps[2:])
        for alloc in product(*(range(cap + 1) for cap in caps)):
            if alloc[0] + alloc[2] > 2 or alloc[1] + alloc[3] > 2:
                continue
            held = (alloc[:2], alloc[2:])
            free = (2 - alloc[0] - alloc[2], 2 - alloc[1] - alloc[3])
            valid = []
            for first, second in permutations(range(2)):
                if all(maximum[first][i] - held[first][i] <= free[i] for i in range(2)) and all(
                    maximum[second][i] - held[second][i] <= free[i] + held[first][i]
                    for i in range(2)
                ):
                    valid.append([first, second])
            actual = mod.safe_order([2, 2], maximum, held, [False, False])
            assert actual == (valid[0] if valid else None)
            checked += 1
    assert checked == 31 ** 2
    assert mod.safe_order([3, 2], READY["maximum"], [[1, 1], [1, 1]], [False, False]) is None
