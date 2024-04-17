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

export const DEFAULT_COMPARE_TIMES = [1, 10, 30, 60];
