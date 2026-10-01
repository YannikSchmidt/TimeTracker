// Feste Zeitzone, damit Tests mit Mitternacht/Zeitumstellung überall gleich laufen.
module.exports = () => {
  process.env.TZ = 'Europe/Berlin';
};
