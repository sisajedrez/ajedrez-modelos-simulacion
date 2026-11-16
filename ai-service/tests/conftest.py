import random

import numpy as np
import pytest

from app.nn import PolicyNet, uci_to_index


def forced_net(logits: dict, hidden=(8,)) -> PolicyNet:
    """Red de prueba cuya salida NO depende de la entrada: softmax de los logits indicados
    (el resto queda en -20). Sirve para controlar exactamente qué 'sabe' la red."""
    net = PolicyNet(hidden=hidden)
    for w in net.W:
        w[:] = 0.0
    for b in net.b:
        b[:] = 0.0
    net.b[-1][:] = -20.0
    for uci, value in logits.items():
        net.b[-1][uci_to_index(uci)] = value
    return net


@pytest.fixture
def rng():
    return random.Random(1234)
