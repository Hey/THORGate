export interface Coin {
  asset: string;
  amount: string;
}

export interface Vault {
  block_height: number;
  pub_key: string;
  coins: Coin[];
}

export interface Pool {
  asset: string;
  status: string;
  balance_asset: string;
  balance_rune: string;
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
    headers: { accept: "application/json" },
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

export const fetchPools = async (): Promise<Pool[]> => {
  return fetchFromAPI<Pool[]>("/thorchain/pools");
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
