const PRODUCTION_STAGES = [
  { id: 'producao_inicial', label: 'Producao inicial' },
  { id: 'embalamento', label: 'Embalamento' },
  { id: 'empacotamento', label: 'Empacotamento' },
  { id: 'estocada', label: 'Estocada' }
];

const STAGE_IDS = PRODUCTION_STAGES.map((stage) => stage.id);

module.exports = {
  PRODUCTION_STAGES,
  STAGE_IDS
};
