import chess
import numpy as np

from app.nn import (
    N_FEATURES, N_INPUT, N_MOVES, PolicyNet, elo_features, encode_samples, legal_move_map, load_net,
    make_input, predict_probs, save_net, train_net, uci_to_index,
)

START = chess.Board()


def test_move_index_and_legal_map():
    assert uci_to_index("e2e4") == chess.E2 * 64 + chess.E4
    legal = legal_move_map(START)
    assert len(legal) == 20 and legal[uci_to_index("g1f3")] == "g1f3"


def test_promotion_maps_to_queen_only():
    board = chess.Board("8/4P3/8/8/8/8/k7/4K3 w - - 0 1")
    legal = legal_move_map(board)
    assert legal[uci_to_index("e7e8q")] == "e7e8q"
    assert "e7e8n" not in legal.values()


def test_encode_samples_skips_invalid_rows():
    fens = [chess.STARTING_FEN, "basura", chess.STARTING_FEN, chess.STARTING_FEN]
    moves = ["e2e4", "e2e4", "0000", "d2d4"]
    X, E, Y, invalid = encode_samples(fens, moves, [1000, 1100, 1200, 1300])
    assert X.shape == (2, N_FEATURES) and X.dtype == np.uint8
    assert list(Y) == [uci_to_index("e2e4"), uci_to_index("d2d4")]
    assert list(E) == [1000, 1300] and invalid == 2


def test_elo_features_are_smooth_and_clipped():
    f = elo_features([1000, 1100, 2000, 99999, 0])
    assert f.shape == (5, 16) and f.max() <= 1.0
    # ELO cercanos => codificaciones parecidas; lejanos => distintas
    assert np.abs(f[0] - f[1]).sum() < np.abs(f[0] - f[2]).sum()
    assert np.allclose(f[3], elo_features([2800])[0]) and np.allclose(f[4], elo_features([600])[0])
    assert make_input(np.zeros((2, N_FEATURES), np.uint8), [1000, 1500]).shape == (2, N_INPUT)


def test_gradients_match_numerical_gradients():
    """Verifica la retropropagación escrita a mano contra diferencias finitas (en float64)."""
    rng = np.random.default_rng(0)
    net = PolicyNet(hidden=(6, 5), seed=1)
    net.W = [w.astype(np.float64) for w in net.W]
    net.b = [b.astype(np.float64) + rng.normal(0, 0.1, b.shape) for b in net.b]
    x = rng.normal(size=(7, N_INPUT))
    y = rng.integers(0, N_MOVES, size=7)
    _, gW, gb = net.loss_and_grads(x, y)

    def loss_with(params, idx, pos, delta):
        params[idx][pos] += delta
        value, _, _ = net.loss_and_grads(x, y)
        params[idx][pos] -= delta
        return value

    for params, grads in ((net.W, gW), (net.b, gb)):
        for layer in range(len(params)):
            for _ in range(6):
                pos = tuple(rng.integers(0, s) for s in params[layer].shape)
                eps = 1e-6
                num = (loss_with(params, layer, pos, eps) - loss_with(params, layer, pos, -eps)) / (2 * eps)
                assert abs(num - grads[layer][pos]) < 1e-6 + 1e-4 * abs(num), (layer, pos, num, grads[layer][pos])


def test_save_and_load_roundtrip(tmp_path):
    net = PolicyNet(hidden=(16, 8), seed=3)
    path = tmp_path / "m" / "policy_net.npz"
    save_net(net, path, {"top1": 0.5})
    assert path.exists() and not list(path.parent.glob("*.tmp"))
    loaded, metrics = load_net(path)
    assert metrics == {"top1": 0.5} and loaded.config == net.config
    a = predict_probs(net, START, 1500)
    b = predict_probs(loaded, START, 1500)
    assert np.allclose(a, b) and a.shape == (N_MOVES,) and abs(a.sum() - 1) < 1e-4


def test_network_learns_and_is_conditioned_by_elo():
    """En la misma posición, ELO bajo juega e2e4 y ELO alto juega d2d4: la red debe aprender ambos."""
    rng = np.random.default_rng(0)
    n = 400
    elos = rng.integers(800, 2300, size=n)
    moves = ["e2e4" if e < 1500 else "d2d4" for e in elos]
    X, E, Y, _ = encode_samples([chess.STARTING_FEN] * n, moves, elos)
    net, metrics = train_net(
        X, E, Y, config={"hidden": [64]}, epochs=40, batch_size=64, lr=3e-3, patience=40,
        logger=lambda m: None,
    )
    assert predict_probs(net, START, 1000).argmax() == uci_to_index("e2e4")
    assert predict_probs(net, START, 2000).argmax() == uci_to_index("d2d4")
    assert metrics["top1"] > 0.85


def test_warm_start_continues_from_previous_weights():
    X, E, Y, _ = encode_samples([chess.STARTING_FEN] * 200, ["e2e4"] * 200, [1500] * 200)
    cfg = {"hidden": [32]}
    net1, m1 = train_net(X, E, Y, config=cfg, epochs=40, batch_size=32, lr=3e-3, patience=40, logger=lambda m: None)
    assert m1["top1"] > 0.9
    # una época con paso diminuto: solo puede dar buen resultado si arrancó desde los pesos de net1
    _, scratch = train_net(X, E, Y, config=cfg, epochs=1, batch_size=32, lr=1e-4, logger=lambda m: None)
    _, warm = train_net(
        X, E, Y, config=cfg, init_state=net1.get_state(), epochs=1, batch_size=32, lr=1e-4,
        logger=lambda m: None,
    )
    assert warm["top1"] > 0.9 and warm["val_loss"] < scratch["val_loss"]
