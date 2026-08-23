-- Fase 4: real ERC-8004 registration.
-- Existing 'user'-source demo/seed rows have synthetic erc8004_id values
-- (sha256 mocks) — null them out first so the new UNIQUE constraint doesn't
-- choke on duplicates, and so the app can tell "really registered onchain"
-- apart from "never registered" going forward.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS onchain_tx_hash TEXT;

UPDATE agents SET erc8004_id = NULL, erc8004_data = NULL
WHERE source = 'user' AND erc8004_id IS NOT NULL;

ALTER TABLE agents ADD CONSTRAINT agents_erc8004_id_key UNIQUE (erc8004_id);
