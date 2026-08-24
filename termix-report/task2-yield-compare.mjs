// Task 2 (yield) — "What's the best real stablecoin yield right now,
// Venus lending vs a Beefy auto-compounding vault?" Both sources are live
// public APIs, no key required.
const t0 = performance.now();

const [venusRes, beefyApyRes, beefyVaultsRes] = await Promise.all([
  fetch('https://api.venus.io/markets?chainId=56&limit=100'),
  fetch('https://api.beefy.finance/apy'),
  fetch('https://api.beefy.finance/vaults'),
]);
const [venusData, beefyApy, beefyVaults] = await Promise.all([
  venusRes.json(), beefyApyRes.json(), beefyVaultsRes.json(),
]);

const vUsdt = venusData.result.find((m) => m.symbol === 'vUSDT' && m.borrowerCount > 1000);
const venusSupplyApy = Number(vUsdt.supplyApyDecimal);

const beefyVault = beefyVaults.find((v) => v.id === 'pancake-cow-bsc-usdt-usdc-vault');
const beefyVaultApy = beefyApy[beefyVault.id];

const t1 = performance.now();

const candidates = [
  { source: 'Venus (USDT supply)', apy: venusSupplyApy },
  { source: `Beefy (${beefyVault.name} auto-compound)`, apy: beefyVaultApy },
];
candidates.sort((a, b) => b.apy - a.apy);

const output = {
  task: 'Best real stablecoin yield right now: Venus lending vs Beefy vault',
  data_sources: [
    'https://api.venus.io/markets?chainId=56 (live)',
    'https://api.beefy.finance/apy + /vaults (live)',
  ],
  candidates,
  winner: candidates[0].source,
  elapsed_ms: Math.round(t1 - t0),
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(output, null, 2));
