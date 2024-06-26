export interface Coin {
  asset: string;
  amount: string;
}

export interface Vault {
  block_height: number;
  pub_key: string;
  coins: Coin[];
}

export interface BasePool {
  asset: string;
  balance_asset: string;
  balance_rune: string;
}

export interface Pool extends BasePool {
  pool_units: string;
  LP_units: string;
  synth_units: string;
  [key: string]: string;
}

export interface DerivedPool extends BasePool {
  status: string;
  derived_depth_bps: string;
}

export interface Balance {
  denom: string;
  amount: string;
}

export interface Network {
  bond_reward_rune: string;
  total_reserve: string;
  rune_price_in_tor: string;
  tor_price_in_rune: string;
}

export interface POL {
  rune_deposited: string;
  rune_withdrawn: string;
  value: string;
  pnl: string;
  current_deposit: string;
}

async function fetchFromAPI<T>(
  path: string,
  queryParams?: Record<string, string>,
): Promise<T> {
  const baseUrl = "https://thornode.ninerealms.com";
  const queryString = queryParams
    ? "?" + new URLSearchParams(queryParams).toString()
    : "";
  const url = `${baseUrl}${path}${queryString}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", "x-client-id": "thorgate" },
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  return response.json() as Promise<T>;
}

export const fetchVaults = async (blockHeight?: number): Promise<Vault[]> => {
  const queryParams = blockHeight
    ? { block_height: blockHeight.toString() }
    : undefined;
  return fetchFromAPI<Vault[]>("/thorchain/vaults/asgard", queryParams);
};

export const fetchBalances = async (address: string): Promise<Balance[]> => {
  const path = `/cosmos/bank/v1beta1/balances/${address}`;
  const data = await fetchFromAPI<{ balances: Balance[] }>(path);
  return data.balances;
};

export const fetchNetwork = async (): Promise<Network> => {
  return fetchFromAPI<Network>("/thorchain/network");
};

export const fetchPOL = async (): Promise<POL> => {
  return fetchFromAPI<POL>("/thorchain/pol");
};
export const fetchPools = async (): Promise<Pool[]> => {
  return fetchFromAPI("/thorchain/pools");
};

export const fetchDerivedPools = async (): Promise<DerivedPool[]> => {
  return fetchFromAPI("/thorchain/dpools");
};

export const calculatePriceInUSD = (pool: BasePool, runePriceInUsd: number) => {
  const balanceRune = parseFloat(pool.balance_rune);
  const balanceAsset = parseFloat(pool.balance_asset);

  if (isNaN(balanceRune) || isNaN(balanceAsset) || balanceAsset === 0) {
    console.error(
      `Invalid pool balances: ${pool.balance_rune}, ${pool.balance_asset}`,
    );
    return null; // return null if data is invalid
  }

  const priceInRune = balanceRune / balanceAsset;
  return priceInRune * runePriceInUsd;
};

export const fetchRuneUSDPrice = async (pools: Pool[]) => {
  const pool = pools.find(
    (p) => p.asset === "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
  );
  if (!pool) {
    throw new Error(
      "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48 pool not found",
    );
  }

  const balanceRune = parseFloat(pool.balance_rune);
  const balanceAsset = parseFloat(pool.balance_asset);

  if (isNaN(balanceRune) || isNaN(balanceAsset) || balanceAsset === 0) {
    throw new Error(
      `Invalid balances for price calculation: ${pool.balance_rune}, ${pool.balance_asset}`,
    );
  }

  return balanceAsset / balanceRune;
};
