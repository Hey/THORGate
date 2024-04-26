export const formatNumber = (num: number) => {
  return num.toLocaleString("en-US", {
    style: "decimal",
    maximumFractionDigits: 0,
  });
};

export const formatNumberPrice = (num: number) => {
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
};

export function formatBalanceWithUSD(
  amount: bigint,
  usdAmount: bigint | null,
  denom: string,
) {
  const formattedAmount = formatNumber(Number(amount));
  if (usdAmount !== null) {
    const formattedUSD = `$${usdAmount.toLocaleString()}`;
    return `${formattedUSD} (${formattedAmount} ${denom.toUpperCase()})`;
  }
  return `${formattedAmount} ${denom.toUpperCase()}`;
}

export const DEFAULT_COMPARE_TIMES = [1, 10, 30, 60];
