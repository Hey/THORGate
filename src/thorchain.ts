export interface Coin {
  asset: string;
  amount: string;
}

export interface Vault {
  block_height: number;
  pub_key: string;
  coins: Coin[];
}

export const fetchVaults = async (blockHeight?: number): Promise<Vault[]> => {
  const url = `https://thornode.ninerealms.com/thorchain/vaults/asgard${blockHeight ? `?block_height=${blockHeight}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", "x-client-id": "thorswap-be" },
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  return response.json();
};
