
import logging
import random
import threading
from pathlib import Path
from typing import Dict, Optional, Tuple

import chess

from .nn import MODEL_FILENAME, PolicyNet, legal_move_map, load_net, predict_probs
from .openings import opening_candidates
from .policies import choose_move, effective_elo

log = logging.getLogger("ai.predictor")

SOURCE_HISTORY = "history"
SOURCE_OPENINGS = "openings"
SOURCE_NONE = "none"


def model_path(models_dir) -> Path:
    return Path(models_dir) / MODEL_FILENAME


class Predictor:
    def __init__(self, models_dir, min_legal_prob: float = 0.05, rng: Optional[random.Random] = None):
        self.models_dir = Path(models_dir)
        self.min_legal_prob = min_legal_prob
        self.rng = rng or random.Random()
        self.net: Optional[PolicyNet] = None
        self.net_info: dict = {}
        self._lock = threading.Lock()

    # carga 
    def load(self) -> None:
        path = model_path(self.models_dir)
        net, info = None, {}
        if path.exists():
            net, info = load_net(path)
            log.info("Red cargada desde %s (%s)", path, info)
        else:
            log.warning("No existe %s: se usará la tabla de aperturas hasta entrenar la red", path)
        with self._lock:
            self.net, self.net_info = net, info

    def status(self) -> Dict[str, bool]:
        return {"policy_net": self.net is not None}

    # predicción 
    def legal_probs(self, board: chess.Board, level: str, elo: Optional[int] = None) -> Dict[str, float]:
      
        net = self.net  
        if net is None:
            return {}
        legal = legal_move_map(board)
        if not legal:
            return {}
        probs = predict_probs(net, board, effective_elo(level, elo))
        mass = float(sum(probs[i] for i in legal))
        if mass < self.min_legal_prob:
            return {}
        return {uci: float(probs[i]) / mass for i, uci in legal.items()}

    def predict(self, board: chess.Board, level: str, elo: Optional[int] = None) -> Tuple[Optional[str], str]:
        probs = self.legal_probs(board, level, elo)
        if probs:
            return choose_move(probs, level, self.rng), SOURCE_HISTORY

        candidates = opening_candidates(board)
        if candidates:
            return self.rng.choice(candidates), SOURCE_OPENINGS

        return None, SOURCE_NONE
