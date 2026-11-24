// Seed data for Neon Coast (spec.md §2). All names are fictional.
// Frozen contract shared by every worker: change only via the orchestrator.

export const CREWS = Object.freeze(['Harbor Crew', 'Lantern Row', 'Static Choir']);

export const MISSIONS = Object.freeze([
  { mission_id: 'M-10', title: 'Fog Line Delivery', crew: 'Harbor Crew',
    description: 'Move a sealed crate from the north pier to a waiting trawler before the fog lifts.' },
  { mission_id: 'M-11', title: 'Dockside Ledger', crew: 'Harbor Crew',
    description: 'Recover a stolen shipping ledger from a customs shed.' },
  { mission_id: 'M-12', title: 'Tidewater Run', crew: 'Harbor Crew',
    description: 'Escort a cargo boat through the channel past rival spotters.' },
  { mission_id: 'M-20', title: 'Paper Lanterns', crew: 'Lantern Row',
    description: 'Deliver festival permits across the market district before dawn.' },
  { mission_id: 'M-21', title: 'Night Market Audit', crew: 'Lantern Row',
    description: "Count the night market's takings without tipping off the stallholders." },
  { mission_id: 'M-30', title: 'Signal Ghost', crew: 'Static Choir',
    description: 'Plant a relay on a rooftop antenna to boost a pirate radio broadcast.' },
  { mission_id: 'M-31', title: 'Dead Air', crew: 'Static Choir',
    description: "Silence a rival station's transmitter for one broadcast hour." },
].map(Object.freeze));

export const PLAYERS = Object.freeze([
  { player_id: 'P-01', name: 'Nova Reyes' },
  { player_id: 'P-02', name: 'Kit Marlow' },
  { player_id: 'P-03', name: 'Juno Vance' },
  { player_id: 'P-04', name: 'Ash Okafor' },
  { player_id: 'P-05', name: 'Remy Sol' },
].map(Object.freeze));
