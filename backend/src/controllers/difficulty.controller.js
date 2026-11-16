export function createDifficultyController({ difficultyService }) {
  return {
    async list(req, res) {
      res.json(await difficultyService.listar());
    },
  };
}
