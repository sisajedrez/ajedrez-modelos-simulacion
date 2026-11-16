export class DifficultyService {
  constructor({ difficultyRepo }) {
    this.difficultyRepo = difficultyRepo;
  }

  listar() {
    return this.difficultyRepo.findAll();
  }
}
