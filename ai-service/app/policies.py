"""Políticas de selección por dificultad (RN-02) y normalización del nivel."""
import random
import unicodedata
from typing import Dict, Optional

FACIL, MEDIO, DIFICIL = "FACIL", "MEDIO", "DIFICIL"
LEVELS = (FACIL, MEDIO, DIFICIL)


REP_ELO = {FACIL: 1000, MEDIO: 1500, DIFICIL: 1900}


SAMPLING = {
    FACIL: {"temperature": 1.4, "top_k": 10},
    MEDIO: {"temperature": 1.0, "top_k": 6},
    DIFICIL: None,
}


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.strip().lower())
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def level_from_name(name: Optional[str]) -> Optional[str]:
    """'Fácil', 'FACIL', 'easy', 'IA Difícil'... -> FACIL | MEDIO | DIFICIL | None."""
    if not name:
        return None
    n = _plain(name)
    if "fac" in n or "easy" in n:
        return FACIL
    if "med" in n:
        return MEDIO
    if "dif" in n or "hard" in n:
        return DIFICIL
    return None


def level_from_elo(elo: Optional[int]) -> Optional[str]:
    if elo is None:
        return None
    if elo <= 1250:
        return FACIL
    if elo <= 1750:
        return MEDIO
    return DIFICIL


def normalize_level(difficulty: Optional[str], elo: Optional[int]) -> str:
    """Prioriza el nombre de dificultad; si no es reconocible usa el ELO."""
    level = level_from_name(difficulty) or level_from_elo(elo)
    if level is None:
        raise ValueError("Se requiere 'difficulty' (Fácil/Medio/Difícil) o 'elo'")
    return level


def effective_elo(level: str, elo: Optional[int]) -> int:
    if elo is not None and level_from_elo(elo) == level:
        return int(min(max(elo, 600), 2900))
    return REP_ELO[level]


def choose_move(probs: Dict[str, float], level: str, rng: random.Random) -> str:

    ranked = sorted(((m, p) for m, p in probs.items() if p > 0), key=lambda mp: (-mp[1], mp[0]))
    if not ranked:
        raise ValueError("No hay candidatas")
    if level not in SAMPLING:
        raise ValueError(f"Nivel desconocido: {level}")
    cfg = SAMPLING[level]
    if cfg is None:
        return ranked[0][0]
    ranked = ranked[: cfg["top_k"]]
    weights = [p ** (1.0 / cfg["temperature"]) for _, p in ranked]
    return rng.choices([m for m, _ in ranked], weights=weights, k=1)[0]
