import pytest

from app.policies import (
    DIFICIL, FACIL, MEDIO, REP_ELO, choose_move, effective_elo, level_from_name, normalize_level,
)


@pytest.mark.parametrize("name,expected", [
    ("Fácil", FACIL), ("FACIL", FACIL), ("easy", FACIL),
    ("Medio", MEDIO), ("Difícil", DIFICIL), ("IA Dificil", DIFICIL), ("???", None), (None, None),
])
def test_level_from_name(name, expected):
    assert level_from_name(name) == expected


def test_normalize_prefers_name_then_elo():
    assert normalize_level("Fácil", 2000) == FACIL
    assert normalize_level(None, 900) == FACIL
    assert normalize_level(None, 1500) == MEDIO
    assert normalize_level(None, 1900) == DIFICIL
    with pytest.raises(ValueError):
        normalize_level(None, None)


def test_effective_elo():
    assert effective_elo(FACIL, 1100) == 1100          # coherente con el nivel: se respeta
    assert effective_elo(FACIL, 2000) == REP_ELO[FACIL]  # incoherente: gana el nivel
    assert effective_elo(MEDIO, None) == REP_ELO[MEDIO]
    assert effective_elo(DIFICIL, 99999) == 2900  # coherente con el nivel, pero se limita al rango de la red


PROBS = {"e2e4": 0.5, "d2d4": 0.3, "g1f3": 0.15, "c2c4": 0.05}


def test_dificil_is_deterministic_argmax(rng):
    assert {choose_move(PROBS, DIFICIL, rng) for _ in range(50)} == {"e2e4"}


def test_medio_follows_weights(rng):
    probs = {"e2e4": 0.8, "d2d4": 0.2}
    picks = [choose_move(probs, MEDIO, rng) for _ in range(3000)]
    assert 0.75 < picks.count("e2e4") / len(picks) < 0.85


def test_facil_plays_more_secondary_moves_than_medio(rng):
    easy = [choose_move(PROBS, FACIL, rng) for _ in range(4000)]
    mid = [choose_move(PROBS, MEDIO, rng) for _ in range(4000)]
    assert easy.count("e2e4") < mid.count("e2e4")


def test_top_k_discards_improbable_moves(rng):
    probs = {f"m{i}": 1 / 40 for i in range(40)}
    assert len({choose_move(probs, FACIL, rng) for _ in range(2000)}) <= 10
    assert len({choose_move(probs, MEDIO, rng) for _ in range(2000)}) <= 6


def test_zero_probability_moves_are_never_chosen(rng):
    probs = {"e2e4": 1.0, "d2d4": 0.0}
    assert {choose_move(probs, FACIL, rng) for _ in range(50)} == {"e2e4"}


def test_errors(rng):
    with pytest.raises(ValueError):
        choose_move({}, FACIL, rng)
    with pytest.raises(ValueError):
        choose_move(PROBS, "OTRO", rng)
